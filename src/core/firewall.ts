import type { Constraint } from './constraint';
import { check } from './evaluate';
import type { Decision, Payment, SpendState } from './types';

/** Pure decision: every guardrail and mandate constraint must hold. */
export const decide = (
  payment: Payment,
  state: SpendState,
  constraints: readonly Constraint[],
): Decision => {
  const checks = check(constraints, { ...payment, ...state });
  return {
    verdict: checks.every((c) => c.passed) ? 'allow' : 'block',
    payment,
    state,
    checks,
  };
};
