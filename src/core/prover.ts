import { init, type Arith, type Bool, type Context } from 'z3-solver';
import type { BoolExpr, Constraint, NumExpr, NumVar, SymVar } from './constraint';
import { check } from './evaluate';
import { CATEGORIES, type Category, type Payment, type ProofResult, type SpendState } from './types';

/**
 * Proves: for EVERY payment the mandate allows, the guardrails also allow it.
 *   unsat( axioms ∧ mandate(p) ∧ ¬guardrails(p) )  ⇒  mandate ⊆ guardrails
 * A sat model is a concrete counterexample payment.
 *
 * Symbolic fields (merchant, category, currency) are encoded as ints over a finite
 * universe: every literal mentioned in the constraints plus one "unmentioned" value.
 * Unmentioned values are indistinguishable to the constraints, so one representative is sound.
 */

type Z3Ctx = Context<'main'>;

const UNKNOWN_MERCHANT = '<any-other-merchant>';

let z3: Promise<Z3Ctx> | null = null;
const getZ3 = (): Promise<Z3Ctx> => {
  z3 ??= init().then(({ Context }) => Context('main'));
  return z3;
};

// z3-solver runs one solver call at a time per context; serialize proofs.
let queue: Promise<unknown> = Promise.resolve();
const serialized = <T>(task: () => Promise<T>): Promise<T> => {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
};

const collectLiterals = (constraints: readonly Constraint[], field: SymVar): string[] => {
  const out = new Set<string>();
  const walk = (e: BoolExpr): void => {
    if (e.kind === 'in' && e.field === field) e.values.forEach((x) => out.add(x));
    if (e.kind === 'not') walk(e.operand);
  };
  constraints.forEach((c) => walk(c.expr));
  return [...out];
};

const buildUniverses = (constraints: readonly Constraint[]): Record<SymVar, readonly string[]> => ({
  category: CATEGORIES,
  currency: ['USD'],
  merchantId: [...collectLiterals(constraints, 'merchantId'), UNKNOWN_MERCHANT],
});

export interface ProveInput {
  readonly mandate: readonly Constraint[];
  readonly guardrails: readonly Constraint[];
  /** Spend already made today before this task started. */
  readonly spentTodayBeforeTaskCents: number;
}

export const proveMandateWithinGuardrails = (input: ProveInput): Promise<ProofResult> =>
  serialized(async () => {
    const started = performance.now();
    const Z3 = await getZ3();
    const universes = buildUniverses([...input.mandate, ...input.guardrails]);

    const numVars: Record<NumVar, Arith<'main'>> = {
      amountCents: Z3.Int.const('amountCents'),
      itemCount: Z3.Int.const('itemCount'),
      spentInTaskCents: Z3.Int.const('spentInTaskCents'),
      spentTodayCents: Z3.Int.const('spentTodayCents'),
    };
    const symVars: Record<SymVar, Arith<'main'>> = {
      merchantId: Z3.Int.const('merchantId'),
      category: Z3.Int.const('category'),
      currency: Z3.Int.const('currency'),
    };

    const toNum = (e: NumExpr): Arith<'main'> => {
      switch (e.kind) {
        case 'num':
          return Z3.Int.val(e.value);
        case 'var':
          return numVars[e.name];
        case 'add':
          return toNum(e.left).add(toNum(e.right));
      }
    };
    const toBool = (e: BoolExpr): Bool<'main'> => {
      switch (e.kind) {
        case 'le':
          return toNum(e.left).le(toNum(e.right));
        case 'not':
          return Z3.Not(toBool(e.operand));
        case 'in': {
          const universe = universes[e.field];
          const options = e.values
            .map((value) => universe.indexOf(value))
            .filter((i) => i >= 0)
            .map((i) => symVars[e.field].eq(i));
          return options.length === 0 ? Z3.Bool.val(false) : Z3.Or(...options);
        }
      }
    };

    const solver = new Z3.Solver();
    // Domain axioms. Assumes this task is the only spender while it runs;
    // the concrete per-payment check still enforces the real daily total.
    solver.add(
      numVars.amountCents.ge(1),
      numVars.itemCount.ge(1),
      numVars.spentInTaskCents.ge(0),
      numVars.spentTodayCents.eq(numVars.spentInTaskCents.add(input.spentTodayBeforeTaskCents)),
      ...(Object.keys(symVars) as SymVar[]).flatMap((k) => [
        symVars[k].ge(0),
        symVars[k].le(universes[k].length - 1),
      ]),
    );
    input.mandate.forEach((c) => solver.add(toBool(c.expr)));
    solver.add(Z3.Not(Z3.And(...input.guardrails.map((c) => toBool(c.expr)))));

    const result = await solver.check();
    const durationMs = Math.round(performance.now() - started);
    if (result === 'unsat') return { status: 'proven', durationMs };
    if (result === 'unknown') throw new Error('Z3 returned unknown');

    const model = solver.model();
    const intOf = (x: Arith<'main'>): number => Number(model.eval(x, true).toString());
    const symOf = (k: SymVar): string => universes[k][intOf(symVars[k])] ?? UNKNOWN_MERCHANT;

    const payment: Payment = {
      merchantId: symOf('merchantId'),
      category: symOf('category') as Category,
      currency: 'USD',
      amountCents: intOf(numVars.amountCents),
      itemCount: intOf(numVars.itemCount),
    };
    const state: SpendState = {
      spentInTaskCents: intOf(numVars.spentInTaskCents),
      spentTodayCents: intOf(numVars.spentTodayCents),
    };
    const violated = check(input.guardrails, { ...payment, ...state }).filter((c) => !c.passed);
    return { status: 'counterexample', durationMs, payment, state, violated };
  });
