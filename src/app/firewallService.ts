import { randomUUID } from 'node:crypto';
import { decide } from '../core/firewall';
import { guardrailConstraints, mandateConstraints } from '../core/policy';
import { proveMandate, suggestFixes } from '../core/suggest';
import type { Guardrails, Mandate, Payment } from '../core/types';
import { findMerchant, findProduct } from '../infra/catalog';
import type { PaymentGateway } from '../infra/paymentGateway';
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
}

export type FirewallService = ReturnType<typeof createFirewallService>;

/**
 * Application service: owns spend state and tasks, and is the ONLY path to the payment gateway.
 * State is in-memory; a real deployment would persist it.
 */
export const createFirewallService = (deps: FirewallServiceDeps) => {
  let guardrails = deps.guardrails ?? DEFAULT_GUARDRAILS;
  let spentTodayCents = deps.spentTodayCents ?? 0;
  const tasks = new Map<string, TaskView>();
  /** Which guardrails each task's proof was made against; a change invalidates the proof. */
  const provenAgainst = new Map<string, Guardrails>();

  const save = (task: TaskView): TaskView => {
    tasks.set(task.id, task);
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
    const spentBeforeTask = spentTodayCents - task.spentInTaskCents;
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
      { spentInTaskCents: task.spentInTaskCents, spentTodayCents },
      [...guardrailConstraints(guardrails), ...mandateConstraints(task.mandate)],
    );
    if (decision.verdict === 'block') return record(taskId, { status: 'blocked', request, decision });

    // Reserve before the network call so concurrent checkouts cannot both pass the limits.
    spentTodayCents += payment.amountCents;
    save({ ...task, spentInTaskCents: task.spentInTaskCents + payment.amountCents });
    try {
      const receipt = await deps.gateway.createOrder(merchant.name, [
        { name: product.name, quantity: request.quantity, unitPriceCents: product.priceCents },
      ]);
      return record(taskId, { status: 'approved', request, decision, receipt });
    } catch (error) {
      spentTodayCents -= payment.amountCents;
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
    },
    getSpentTodayCents: (): number => spentTodayCents,
    resetDay: (): void => {
      spentTodayCents = 0;
    },
    getTask: requireTask,
    createTask: (prompt: string, mandate: Mandate): Promise<TaskView> => verify(emptyTask(prompt, mandate), mandate),
    updateMandate: (taskId: string, mandate: Mandate): Promise<TaskView> => verify(requireTask(taskId), mandate),
    checkout,
  };
};
