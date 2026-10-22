import { describe, expect, it } from 'vitest';
import { listAttacks, runAttack } from './attacks';
import { createFirewallService, DEFAULT_GUARDRAILS } from './firewallService';
import type { PaymentGateway } from '../infra/paymentGateway';

const context = { guardrails: DEFAULT_GUARDRAILS, spentTodayCents: 0 };
const statuses = async (id: string): Promise<string[]> =>
  (await runAttack(id, context)).task.outcomes.map((o) => o.status);

describe('attack lab', () => {
  it('lets the legitimate purchase through', async () => {
    expect(await statuses('baseline')).toEqual(['approved']);
  });

  it.each([
    ['prompt-injection', ['approved', 'blocked']],
    ['overspend', ['blocked']],
    ['salami', ['approved', 'approved', 'blocked']],
    ['lookalike', ['blocked']],
    ['quantity', ['blocked']],
  ])('%s', async (id, expected) => {
    expect(await statuses(id)).toEqual(expected);
  });

  it('covers every listed scenario', () => {
    expect(listAttacks()).toHaveLength(6);
  });
});

describe('firewall service', () => {
  const mandate = {
    goal: 'test',
    budgetCents: 150_00,
    maxPerPaymentCents: null,
    allowedCategories: ['electronics'] as const,
    allowedMerchants: null,
    maxItems: 1,
  };

  it('refuses all payments when the mandate is not proven', async () => {
    const service = createFirewallService({ gateway: failingGateway });
    const task = await service.createTask('x', { ...mandate, allowedCategories: ['gift_cards'] });
    expect(task.proof.status).toBe('counterexample');
    expect((await service.checkout(task.id, { productId: 'sh-aurora', quantity: 1 })).status).toBe('rejected');
  });

  it('attaches verified suggestions to a conflicting mandate', async () => {
    const service = createFirewallService({ gateway: slowGateway });
    const task = await service.createTask('x', { ...mandate, budgetCents: 300_00 });
    expect(task.suggestions.map((s) => s.kind)).toEqual(['narrow-mandate', 'relax-guardrails']);
  });

  it('re-proves the mandate when guardrails change after the proof', async () => {
    const service = createFirewallService({ gateway: slowGateway });
    const task = await service.createTask('x', mandate);
    expect(task.proof.status).toBe('proven');

    service.setGuardrails({ ...DEFAULT_GUARDRAILS, blockedCategories: ['electronics'] });
    const outcome = await service.checkout(task.id, { productId: 'sh-aurora', quantity: 1 });
    expect(outcome.status).toBe('rejected');
    expect(service.getTask(task.id).proof.status).toBe('counterexample');
  });

  it('rolls back the reservation when the gateway fails', async () => {
    const service = createFirewallService({ gateway: failingGateway });
    const task = await service.createTask('x', { ...mandate, allowedCategories: ['electronics'] });
    expect((await service.checkout(task.id, { productId: 'sh-aurora', quantity: 1 })).status).toBe('failed');
    expect(service.getSpentTodayCents()).toBe(0);
    expect(service.getTask(task.id).spentInTaskCents).toBe(0);
  });

  it('prevents concurrent checkouts from jointly exceeding the budget', async () => {
    const service = createFirewallService({ gateway: slowGateway });
    const task = await service.createTask('x', { ...mandate, allowedCategories: ['electronics'] });
    const results = await Promise.all([
      service.checkout(task.id, { productId: 'sh-aurora', quantity: 1 }),
      service.checkout(task.id, { productId: 'sh-aurora', quantity: 1 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['approved', 'blocked']);
  });
});

const failingGateway: PaymentGateway = {
  mode: 'dry-run',
  createOrder: async () => {
    throw new Error('network down');
  },
};

const slowGateway: PaymentGateway = {
  mode: 'dry-run',
  createOrder: async () => {
    await new Promise((r) => setTimeout(r, 20));
    return { orderId: 'X', status: 'CREATED', approveUrl: null, mode: 'dry-run' };
  },
};
