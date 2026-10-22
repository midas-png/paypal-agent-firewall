import { describe, expect, it } from 'vitest';
import { decide } from './firewall';
import { guardrailConstraints, mandateConstraints } from './policy';
import { proveMandateWithinGuardrails } from './prover';
import type { Guardrails, Mandate, Payment } from './types';

const guardrails: Guardrails = {
  maxPerPaymentCents: 200_00,
  dailyLimitCents: 500_00,
  blockedCategories: ['gift_cards', 'crypto'],
  allowedMerchants: null,
};

const mandate: Mandate = {
  goal: 'Buy headphones',
  budgetCents: 150_00,
  allowedCategories: ['electronics'],
  allowedMerchants: null,
  maxItems: 2,
};

const headphones: Payment = {
  merchantId: 'soundhub',
  category: 'electronics',
  currency: 'USD',
  amountCents: 129_00,
  itemCount: 1,
};

const constraints = [...guardrailConstraints(guardrails), ...mandateConstraints(mandate)];
const fresh = { spentInTaskCents: 0, spentTodayCents: 0 };
const failedIds = (p: Payment, s = fresh): string[] =>
  decide(p, s, constraints)
    .checks.filter((c) => !c.passed)
    .map((c) => c.constraintId);

describe('decide', () => {
  it('allows an in-mandate purchase', () => {
    expect(decide(headphones, fresh, constraints).verdict).toBe('allow');
  });

  it('blocks injected gift card purchase on two independent rules', () => {
    const giftCard: Payment = { ...headphones, merchantId: 'giftzone', category: 'gift_cards', amountCents: 100_00 };
    expect(failedIds(giftCard)).toEqual(['g.blocked_categories', 'm.categories']);
  });

  it('blocks split payments once cumulative task spend exceeds the budget', () => {
    const cable: Payment = { ...headphones, amountCents: 60_00 };
    expect(failedIds(cable, { spentInTaskCents: 120_00, spentTodayCents: 120_00 })).toEqual(['m.budget']);
  });

  it('enforces the daily limit across tasks', () => {
    expect(failedIds(headphones, { spentInTaskCents: 0, spentTodayCents: 450_00 })).toEqual(['g.daily_limit']);
  });
});

describe('proveMandateWithinGuardrails', () => {
  it('proves a narrow mandate is within guardrails', async () => {
    const result = await proveMandateWithinGuardrails({
      mandate: mandateConstraints(mandate),
      guardrails: guardrailConstraints(guardrails),
      spentTodayBeforeTaskCents: 0,
    });
    expect(result.status).toBe('proven');
  });

  it('finds a counterexample when the mandate allows a blocked category', async () => {
    const result = await proveMandateWithinGuardrails({
      mandate: mandateConstraints({ ...mandate, allowedCategories: ['electronics', 'gift_cards'] }),
      guardrails: guardrailConstraints(guardrails),
      spentTodayBeforeTaskCents: 0,
    });
    expect(result.status).toBe('counterexample');
    if (result.status !== 'counterexample') return;
    expect(result.violated.map((c) => c.constraintId)).toContain('g.blocked_categories');
    expect(result.payment.category).toBe('gift_cards');
  });

  it('finds a counterexample when budget exceeds the per-payment limit', async () => {
    const result = await proveMandateWithinGuardrails({
      mandate: mandateConstraints({ ...mandate, budgetCents: 300_00 }),
      guardrails: guardrailConstraints(guardrails),
      spentTodayBeforeTaskCents: 0,
    });
    expect(result.status).toBe('counterexample');
    if (result.status !== 'counterexample') return;
    expect(result.payment.amountCents).toBeGreaterThan(200_00);
  });

  it('accounts for spend made earlier today', async () => {
    const result = await proveMandateWithinGuardrails({
      mandate: mandateConstraints(mandate),
      guardrails: guardrailConstraints(guardrails),
      spentTodayBeforeTaskCents: 400_00,
    });
    expect(result.status).toBe('counterexample');
    if (result.status !== 'counterexample') return;
    expect(result.violated.map((c) => c.constraintId)).toEqual(['g.daily_limit']);
  });

  it('finds a merchant outside the allowlist when mandate has none', async () => {
    const result = await proveMandateWithinGuardrails({
      mandate: mandateConstraints(mandate),
      guardrails: guardrailConstraints({ ...guardrails, allowedMerchants: ['soundhub'] }),
      spentTodayBeforeTaskCents: 0,
    });
    expect(result.status).toBe('counterexample');
    if (result.status !== 'counterexample') return;
    expect(result.payment.merchantId).not.toBe('soundhub');
  });
});
