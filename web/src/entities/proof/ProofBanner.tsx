import { formatCents } from '@server/core/money';
import type { ProofResult } from '@server/core/types';

export const ProofBanner = ({ proof }: { proof: ProofResult }) => {
  if (proof.status === 'proven') {
    return (
      <div className="proof proof--ok">
        <strong>Proven by Z3</strong> in {proof.durationMs} ms: every payment this mandate allows is also allowed by
        your guardrails.
      </div>
    );
  }

  const { payment, state, violated } = proof;
  return (
    <div className="proof proof--bad">
      <strong>Counterexample found.</strong> This mandate would allow{' '}
      <span className="mono">
        {formatCents(payment.amountCents)} · {payment.category} · {payment.merchantId} · {payment.itemCount} item(s)
      </span>{' '}
      after {formatCents(state.spentInTaskCents)} already spent on the task, which breaks:
      <ul>
        {violated.map((c) => (
          <li key={c.constraintId}>{c.description}</li>
        ))}
      </ul>
      Payments are disabled until the mandate is narrowed.
    </div>
  );
};
