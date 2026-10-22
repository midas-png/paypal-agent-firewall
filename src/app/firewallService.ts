import { randomUUID } from 'node:crypto';
import { decide } from '../core/firewall';
import { guardrailConstraints, mandateConstraints } from '../core/policy';
import { proveMandate, suggestFixes } from '../core/suggest';
import type { Guardrails, Mandate, Payment } from '../core/types';
import { findMerchant, findProduct } from '../infra/catalog';
import type { PaymentGateway } from '../infra/paymentGateway';
import type { StateStore } from '../infra/stateStore';
import type { CheckoutOutcome, CheckoutRequest, TaskView } from './dto';

export const DEFAULT_GUARDRAILS: Guardrails = {
  maxPerPaymentCents: 200_00,
  dailyLimitCents: 500_00,
  blockedCategories: ['gift_cards', 'crypto'],
  allowedMerchants: null,
};

export interface FirewallServiceDeps {
  readonly gateway: PaymentGateway;
  readonly guardrails?: Guardrails;
  readonly spentTodayCents?: number;
  /** Persists guardrails, today's spend and tasks across restarts. Omit for an in-memory sandbox. */
  readonly store?: StateStore;
  /** Injectable clock, for day rollover in tests. */
  readonly now?: () => Date;
}

/** Local calendar day, YYYY-MM-DD. */
const dayOf = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export type FirewallService = ReturnType<typeof createFirewallService>;

/**
 * Application service: owns spend state and tasks, and is the ONLY path to the payment gateway.
 * State survives restarts when a store is given.
 */
export const createFirewallService = (deps: FirewallServiceDeps) => {
  const now = deps.now ?? (() => new Date());
  const snapshot = deps.store?.load() ?? null;

  let guardrails = snapshot?.guardrails ?? deps.guardrails ?? DEFAULT_GUARDRAILS;
  let spend = snapshot?.spend ?? { day: dayOf(now()), cents: deps.spentTodayCents ?? 0 };
  const tasks = new Map<string, TaskView>((snapshot?.tasks ?? []).map((t) => [t.id, t]));
  /** Which guardrails each task's proof was made against; a change (or a restart) forces a re-proof. */
  const provenAgainst = new Map<string, Guardrails>();

  const persist = (): void => deps.store?.save({ version: 1, guardrails, spend, tasks: [...tasks.values()] });

  /** Today's spend; rolls over to zero on a new calendar day. */
  const spentToday = (): number => {
    const today = dayOf(now());
    if (spend.day !== today) spend = { day: today, cents: 0 };
    return spend.cents;
  };
  const addSpend = (deltaCents: number): void => {
    spend = { day: dayOf(now()), cents: spentToday() + deltaCents };
    persist();
  };

  const save = (task: TaskView): TaskView => {
    tasks.set(task.id, task);
    persist();
    return task;
  };

  const requireTask = (id: string): TaskView => {
    const task = tasks.get(id);
    if (!task) throw new Error(`Unknown task ${id}`);
    return task;
  };

  /** Proves the mandate and, on conflict, attaches Z3-verified fixes. */
  const verify = async (task: TaskView, mandate: Mandate): Promise<TaskView> => {
    // Spend made before this task started; the prover adds the task's own spend symbolically.
    const spentBeforeTask = spentToday() - task.spentInTaskCents;
    const proof = await proveMandate(mandate, guardrails, spentBeforeTask);
    const suggestions =
      proof.status === 'proven'
        ? []
        : await suggestFixes({
            mandate,
            guardrails,
            spentTodayCents: spentBeforeTask,
            violatedIds: proof.violated.map((c) => c.constraintId),
          });
    provenAgainst.set(task.id, guardrails);
    return save({ ...task, mandate, proof, suggestions });
  };

  const record = (taskId: string, outcome: CheckoutOutcome, spentDeltaCents = 0): CheckoutOutcome => {
    const task = requireTask(taskId);
    save({ ...task, spentInTaskCents: task.spentInTaskCents + spentDeltaCents, outcomes: [...task.outcomes, outcome] });
    return outcome;
  };

  const checkout = async (taskId: string, request: CheckoutRequest): Promise<CheckoutOutcome> => {
    const current = requireTask(taskId);
    const task = provenAgainst.get(taskId) === guardrails ? current : await verify(current, current.mandate);
    if (task.proof.status !== 'proven') {
      return record(taskId, { status: 'rejected', request, reason: 'Mandate is not proven safe; payments disabled' });
    }

    // Price and category come from the merchant catalog, never from the agent.
    const product = findProduct(request.productId);
    const merchant = product && findMerchant(product.merchantId);
    if (!product || !merchant) {
      return record(taskId, { status: 'rejected', request, reason: `Unknown product ${request.productId}` });
    }

    const payment: Payment = {
      merchantId: product.merchantId,
      category: product.category,
      currency: 'USD',
      amountCents: product.priceCents * request.quantity,
      itemCount: request.quantity,
    };
    const decision = decide(
      payment,
      { spentInTaskCents: task.spentInTaskCents, spentTodayCents: spentToday() },
      [...guardrailConstraints(guardrails), ...mandateConstraints(task.mandate)],
    );
    if (decision.verdict === 'block') return record(taskId, { status: 'blocked', request, decision });

    // Reserve before the network call so concurrent checkouts cannot both pass the limits.
    addSpend(payment.amountCents);
    save({ ...task, spentInTaskCents: task.spentInTaskCents + payment.amountCents });
    try {
      const receipt = await deps.gateway.createOrder(merchant.name, [
        { name: product.name, quantity: request.quantity, unitPriceCents: product.priceCents },
      ]);
      return record(taskId, { status: 'approved', request, decision, receipt });
    } catch (error) {
      addSpend(-payment.amountCents);
      const message = error instanceof Error ? error.message : String(error);
      return record(taskId, { status: 'failed', request, decision, error: message }, -payment.amountCents);
    }
  };

  const emptyTask = (prompt: string, mandate: Mandate): TaskView => ({
    id: randomUUID(),
    prompt,
    mandate,
    proof: { status: 'proven', durationMs: 0 }, // placeholder, replaced by verify()
    suggestions: [],
    spentInTaskCents: 0,
    outcomes: [],
  });

  return {
    getGuardrails: (): Guardrails => guardrails,
    setGuardrails: (next: Guardrails): void => {
      guardrails = next;
      persist();
    },
    getSpentTodayCents: spentToday,
    resetDay: (): void => {
      spend = { day: dayOf(now()), cents: 0 };
      persist();
    },
    getTask: requireTask,
    createTask: (prompt: string, mandate: Mandate): Promise<TaskView> => verify(emptyTask(prompt, mandate), mandate),
    updateMandate: (taskId: string, mandate: Mandate): Promise<TaskView> => verify(requireTask(taskId), mandate),
    checkout,
    /** Reflects a PayPal capture (after buyer approval) in the task that created the order. */
    recordCapture: (orderId: string, status: string): void => {
      for (const task of tasks.values()) {
        if (!task.outcomes.some((o) => o.status === 'approved' && o.receipt.orderId === orderId)) continue;
        save({
          ...task,
          outcomes: task.outcomes.map((o) =>
            o.status === 'approved' && o.receipt.orderId === orderId ? { ...o, receipt: { ...o.receipt, status } } : o,
          ),
        });
      }
    },
  };
};
