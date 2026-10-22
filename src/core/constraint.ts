import type { ConstraintSource, Payment, SpendState } from './types';

/**
 * A tiny constraint language over one payment + spend state.
 * Written once, interpreted twice: concretely (evaluate.ts) and symbolically (prover.ts).
 */

export type NumVar = 'amountCents' | 'itemCount' | 'spentInTaskCents' | 'spentTodayCents';
export type SymVar = 'merchantId' | 'category' | 'currency';

export type NumExpr =
  | { readonly kind: 'num'; readonly value: number }
  | { readonly kind: 'var'; readonly name: NumVar }
  | { readonly kind: 'add'; readonly left: NumExpr; readonly right: NumExpr };

export type BoolExpr =
  | { readonly kind: 'le'; readonly left: NumExpr; readonly right: NumExpr }
  | { readonly kind: 'in'; readonly field: SymVar; readonly values: readonly string[] }
  | { readonly kind: 'not'; readonly operand: BoolExpr };

export interface Constraint {
  readonly id: string;
  readonly source: ConstraintSource;
  readonly description: string;
  readonly expr: BoolExpr;
}

/** Everything a constraint can reference. */
export type Env = Payment & SpendState;

// Builders keep policy code readable.
export const num = (value: number): NumExpr => ({ kind: 'num', value });
export const v = (name: NumVar): NumExpr => ({ kind: 'var', name });
export const add = (left: NumExpr, right: NumExpr): NumExpr => ({ kind: 'add', left, right });
export const le = (left: NumExpr, right: NumExpr): BoolExpr => ({ kind: 'le', left, right });
export const oneOf = (field: SymVar, values: readonly string[]): BoolExpr => ({ kind: 'in', field, values });
export const not = (operand: BoolExpr): BoolExpr => ({ kind: 'not', operand });
