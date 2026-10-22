import { formatCents } from './money';
import type { Guardrails, Mandate, Suggestion } from './types';

/**
 * Candidate fixes for a mandate that conflicts with guardrails.
 * Pure and deterministic; the caller must re-verify each candidate with Z3 before offering it.
 */

export interface RepairInput {
  readonly mandate: Mandate;
  readonly guardrails: Guardrails;
  readonly spentTodayCents: number;
  /** Guardrail ids the counterexample violated. */
  readonly violatedIds: readonly string[];
}

/** Guardrails that are plain money limits: the only ones we ever offer to loosen. */
const NUMERIC_GUARDRAILS: ReadonlySet<string> = new Set(['g.max_per_payment', 'g.daily_limit']);

/** Tighten the mandate until it fits inside the guardrails. Returns null if nothing useful is left. */
export const narrowMandate = ({ mandate, guardrails, spentTodayCents }: RepairInput): Suggestion | null => {
  const changes: string[] = [];

  const blocked = new Set(guardrails.blockedCategories);
  const allowedCategories = mandate.allowedCategories.filter((c) => !blocked.has(c));
  if (allowedCategories.length === 0) return null;
  if (allowedCategories.length < mandate.allowedCategories.length) {
    changes.push(`Drop blocked categories: ${mandate.allowedCategories.filter((c) => blocked.has(c)).join(', ')}`);
  }

  let allowedMerchants = mandate.allowedMerchants;
  if (guardrails.allowedMerchants !== null) {
    const allowlist = new Set(guardrails.allowedMerchants);
    const next = mandate.allowedMerchants === null ? [...allowlist] : mandate.allowedMerchants.filter((m) => allowlist.has(m));
    if (next.length === 0) return null;
    if (mandate.allowedMerchants === null || next.length < mandate.allowedMerchants.length) {
      changes.push(`Limit merchants to: ${next.join(', ')}`);
    }
    allowedMerchants = next;
  }

  const remainingTodayCents = guardrails.dailyLimitCents - spentTodayCents;
  if (remainingTodayCents <= 0) return null;
  let budgetCents = mandate.budgetCents;
  if (budgetCents > remainingTodayCents) {
    budgetCents = remainingTodayCents;
    changes.push(`Cap task budget at today's remaining ${formatCents(remainingTodayCents)}`);
  }

  // Keep the total budget, cap each payment: the usual intent behind "up to $300" with a $200 limit.
  let maxPerPaymentCents = mandate.maxPerPaymentCents;
  const effectivePerPayment = Math.min(maxPerPaymentCents ?? budgetCents, budgetCents);
  if (effectivePerPayment > guardrails.maxPerPaymentCents) {
    maxPerPaymentCents = guardrails.maxPerPaymentCents;
    changes.push(`Keep ${formatCents(budgetCents)} total, max ${formatCents(maxPerPaymentCents)} per payment`);
  }

  if (changes.length === 0) return null;
  return {
    kind: 'narrow-mandate',
    mandate: { ...mandate, allowedCategories, allowedMerchants, budgetCents, maxPerPaymentCents },
    changes,
  };
};

/**
 * Offer slack on money limits only. Never unblocks categories or merchants:
 * those conflicts are exactly what an injected or misread request looks like.
 */
export const relaxGuardrails = ({ mandate, guardrails, spentTodayCents, violatedIds }: RepairInput): Suggestion | null => {
  if (violatedIds.length === 0 || !violatedIds.every((id) => NUMERIC_GUARDRAILS.has(id))) return null;

  const changes: string[] = [];
  const neededPerPayment = Math.min(mandate.maxPerPaymentCents ?? mandate.budgetCents, mandate.budgetCents);
  const maxPerPaymentCents = Math.max(guardrails.maxPerPaymentCents, neededPerPayment);
  if (maxPerPaymentCents > guardrails.maxPerPaymentCents) {
    changes.push(`Raise max per payment ${formatCents(guardrails.maxPerPaymentCents)} → ${formatCents(maxPerPaymentCents)}`);
  }
  const dailyLimitCents = Math.max(guardrails.dailyLimitCents, spentTodayCents + mandate.budgetCents);
  if (dailyLimitCents > guardrails.dailyLimitCents) {
    changes.push(`Raise daily limit ${formatCents(guardrails.dailyLimitCents)} → ${formatCents(dailyLimitCents)}`);
  }

  if (changes.length === 0) return null;
  return { kind: 'relax-guardrails', guardrails: { ...guardrails, maxPerPaymentCents, dailyLimitCents }, changes };
};
