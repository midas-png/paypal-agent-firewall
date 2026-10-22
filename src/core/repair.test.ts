import { describe, expect, it } from 'vitest';
import { decide } from './firewall';
import { guardrailConstraints, mandateConstraints } from './policy';
import { narrowMandate, relaxGuardrails } from './repair';
import { proveMandate, suggestFixes } from './suggest';
import type { Guardrails, Mandate, ProofResult } from './types';

const guardrails: Guardrails = {
  maxPerPaymentCents: 200_00,
  dailyLimitCents: 500_00,
  blockedCategories: ['gift_cards', 'crypto'],
  allowedMerchants: null,
};

const base: Mandate = {
  goal: 'Buy gear',
  budgetCents: 300_00,
  maxPerPaymentCents: null,
  allowedCategories: ['electronics'],
  allowedMerchants: null,
  maxItems: 2,
};

const violatedIds = (proof: ProofResult): string[] =>
  proof.status === 'counterexample' ? proof.violated.map((c) => c.constraintId) : [];

const fixesFor = async (mandate: Mandate, g = guardrails, spentTodayCents = 0) => {
  const proof = await proveMandate(mandate, g, spentTodayCents);
  return suggestFixes({ mandate, guardrails: g, spentTodayCents, violatedIds: violatedIds(proof) });
};

describe('per-payment cap in mandate', () => {
  it('makes a budget above the per-payment limit provable', async () => {
    expect((await proveMandate(base, guardrails, 0)).status).toBe('counterexample');
    expect((await proveMandate({ ...base, maxPerPaymentCents: 200_00 }, guardrails, 0)).status).toBe('proven');
  });

  it('is enforced at runtime', () => {
    const constraints = [...guardrailConstraints(guardrails), ...mandateConstraints({ ...base, maxPerPaymentCents: 100_00 })];
    const payment = { merchantId: 'soundhub', category: 'electronics', currency: 'USD', amountCents: 129_00, itemCount: 1 } as const;
    const failed = decide(payment, { spentInTaskCents: 0, spentTodayCents: 0 }, constraints).checks.filter((c) => !c.passed);
    expect(failed.map((c) => c.constraintId)).toEqual(['m.max_per_payment']);
  });
});

describe('suggestFixes', () => {
  it('offers both a narrower mandate and slack on the money limit', async () => {
    const fixes = await fixesFor(base);
    expect(fixes.map((f) => f.kind)).toEqual(['narrow-mandate', 'relax-guardrails']);
    const [narrow, relax] = fixes;
    expect(narrow?.kind === 'narrow-mandate' && narrow.mandate.maxPerPaymentCents).toBe(200_00);
    expect(narrow?.kind === 'narrow-mandate' && narrow.mandate.budgetCents).toBe(300_00);
    expect(relax?.kind === 'relax-guardrails' && relax.guardrails.maxPerPaymentCents).toBe(300_00);
  });

  it('never offers to unblock a category', async () => {
    const fixes = await fixesFor({ ...base, budgetCents: 100_00, allowedCategories: ['electronics', 'gift_cards'] });
    expect(fixes.map((f) => f.kind)).toEqual(['narrow-mandate']);
    const [narrow] = fixes;
    expect(narrow?.kind === 'narrow-mandate' && narrow.mandate.allowedCategories).toEqual(['electronics']);
  });

  it('caps the budget at what is left of the daily limit', async () => {
    const fixes = await fixesFor({ ...base, budgetCents: 150_00 }, guardrails, 400_00);
    const narrow = fixes.find((f) => f.kind === 'narrow-mandate');
    expect(narrow?.kind === 'narrow-mandate' && narrow.mandate.budgetCents).toBe(100_00);
    const relax = fixes.find((f) => f.kind === 'relax-guardrails');
    expect(relax?.kind === 'relax-guardrails' && relax.guardrails.dailyLimitCents).toBe(550_00);
  });

  it('restricts merchants to the guardrail allowlist', async () => {
    const fixes = await fixesFor({ ...base, budgetCents: 100_00 }, { ...guardrails, allowedMerchants: ['soundhub'] });
    expect(fixes).toHaveLength(1);
    const [narrow] = fixes;
    expect(narrow?.kind === 'narrow-mandate' && narrow.mandate.allowedMerchants).toEqual(['soundhub']);
  });

  it('gives up when only blocked categories were requested', () => {
    expect(
      narrowMandate({ mandate: { ...base, allowedCategories: ['gift_cards'] }, guardrails, spentTodayCents: 0, violatedIds: [] }),
    ).toBeNull();
  });

  it('does not relax when nothing numeric was violated', () => {
    expect(relaxGuardrails({ mandate: base, guardrails, spentTodayCents: 0, violatedIds: ['g.blocked_categories'] })).toBeNull();
  });
});
