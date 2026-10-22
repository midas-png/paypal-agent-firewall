/**
 * Domain types shared by the server and the web UI.
 * All money is integer cents to keep arithmetic exact (and Z3-friendly).
 */

export const CATEGORIES = [
  'electronics',
  'books',
  'groceries',
  'software',
  'travel',
  'gift_cards',
  'crypto',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Currency = 'USD';

/** A payment the agent wants to make, resolved from trusted catalog data. */
export interface Payment {
  readonly merchantId: string;
  readonly category: Category;
  readonly currency: Currency;
  readonly amountCents: number;
  readonly itemCount: number;
}

/** Spending state at the moment a payment is evaluated. */
export interface SpendState {
  readonly spentInTaskCents: number;
  readonly spentTodayCents: number;
}

/** Standing user rules. Configured by the human, never by the agent. */
export interface Guardrails {
  readonly maxPerPaymentCents: number;
  readonly dailyLimitCents: number;
  readonly blockedCategories: readonly Category[];
  /** null = any merchant allowed */
  readonly allowedMerchants: readonly string[] | null;
}

/** Per-task permission, extracted from the user's own prompt (trusted channel only). */
export interface Mandate {
  readonly goal: string;
  readonly budgetCents: number;
  readonly allowedCategories: readonly Category[];
  /** null = any merchant allowed by guardrails */
  readonly allowedMerchants: readonly string[] | null;
  readonly maxItems: number;
}

export type ConstraintSource = 'guardrail' | 'mandate';

export interface CheckResult {
  readonly constraintId: string;
  readonly source: ConstraintSource;
  readonly description: string;
  readonly passed: boolean;
}

export interface Decision {
  readonly verdict: 'allow' | 'block';
  readonly payment: Payment;
  readonly state: SpendState;
  readonly checks: readonly CheckResult[];
}

export type ProofResult =
  | { readonly status: 'proven'; readonly durationMs: number }
  | {
      readonly status: 'counterexample';
      readonly durationMs: number;
      readonly payment: Payment;
      readonly state: SpendState;
      readonly violated: readonly CheckResult[];
    };
