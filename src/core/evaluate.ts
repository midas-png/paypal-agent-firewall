import type { BoolExpr, Constraint, Env, NumExpr } from './constraint';
import type { CheckResult } from './types';

const evalNum = (expr: NumExpr, env: Env): number => {
  switch (expr.kind) {
    case 'num':
      return expr.value;
    case 'var':
      return env[expr.name];
    case 'add':
      return evalNum(expr.left, env) + evalNum(expr.right, env);
  }
};

export const evalBool = (expr: BoolExpr, env: Env): boolean => {
  switch (expr.kind) {
    case 'le':
      return evalNum(expr.left, env) <= evalNum(expr.right, env);
    case 'in':
      return expr.values.includes(env[expr.field]);
    case 'not':
      return !evalBool(expr.operand, env);
  }
};

export const check = (constraints: readonly Constraint[], env: Env): CheckResult[] =>
  constraints.map((c) => ({
    constraintId: c.id,
    source: c.source,
    description: c.description,
    passed: evalBool(c.expr, env),
  }));
