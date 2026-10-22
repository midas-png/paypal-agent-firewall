import { add, le, not, num, oneOf, v, type Constraint } from './constraint';
import { formatCents } from './money';
import type { Guardrails, Mandate } from './types';

export const guardrailConstraints = (g: Guardrails): Constraint[] => {
  const constraints: Constraint[] = [
    {
      id: 'g.currency',
      source: 'guardrail',
      description: 'Paid in USD',
      expr: oneOf('currency', ['USD']),
    },
    {
      id: 'g.max_per_payment',
      source: 'guardrail',
      description: `No single payment over ${formatCents(g.maxPerPaymentCents)}`,
      expr: le(v('amountCents'), num(g.maxPerPaymentCents)),
    },
    {
      id: 'g.daily_limit',
      source: 'guardrail',
      description: `Today's total stays within ${formatCents(g.dailyLimitCents)}`,
      expr: le(add(v('spentTodayCents'), v('amountCents')), num(g.dailyLimitCents)),
    },
  ];

  if (g.blockedCategories.length > 0) {
    constraints.push({
      id: 'g.blocked_categories',
      source: 'guardrail',
      description: `Not a blocked category (${g.blockedCategories.join(', ')})`,
      expr: not(oneOf('category', g.blockedCategories)),
    });
  }

  if (g.allowedMerchants !== null) {
    constraints.push({
      id: 'g.allowed_merchants',
      source: 'guardrail',
      description: `Only from allowed shops (${g.allowedMerchants.join(', ')})`,
      expr: oneOf('merchantId', g.allowedMerchants),
    });
  }

  return constraints;
};

export const mandateConstraints = (m: Mandate): Constraint[] => {
  const constraints: Constraint[] = [
    {
      id: 'm.budget',
      source: 'mandate',
      description: `Task total stays within ${formatCents(m.budgetCents)}`,
      expr: le(add(v('spentInTaskCents'), v('amountCents')), num(m.budgetCents)),
    },
    {
      id: 'm.categories',
      source: 'mandate',
      description: `Only what this task is for (${m.allowedCategories.join(', ')})`,
      expr: oneOf('category', m.allowedCategories),
    },
    {
      id: 'm.max_items',
      source: 'mandate',
      description: `At most ${m.maxItems} item(s) per payment`,
      expr: le(v('itemCount'), num(m.maxItems)),
    },
  ];

  if (m.maxPerPaymentCents !== null) {
    constraints.push({
      id: 'm.max_per_payment',
      source: 'mandate',
      description: `No single payment over ${formatCents(m.maxPerPaymentCents)} in this task`,
      expr: le(v('amountCents'), num(m.maxPerPaymentCents)),
    });
  }

  if (m.allowedMerchants !== null) {
    constraints.push({
      id: 'm.merchants',
      source: 'mandate',
      description: `Only from the shops you named (${m.allowedMerchants.join(', ')})`,
      expr: oneOf('merchantId', m.allowedMerchants),
    });
  }

  return constraints;
};
