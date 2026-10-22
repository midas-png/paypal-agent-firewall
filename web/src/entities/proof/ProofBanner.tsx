import { formatCents } from '@server/core/money';
import type { ProofResult, Suggestion } from '@server/core/types';

interface Props {
  readonly proof: ProofResult;
  readonly suggestions?: readonly Suggestion[];
  /** Omit to show suggestions read-only. */
  readonly onApply?: (s: Suggestion) => void;
  readonly busy?: boolean;
}

const SUGGESTION_TITLE: Record<Suggestion['kind'], string> = {
  'narrow-mandate': 'Narrow the mandate',
  'relax-guardrails': 'Add slack to your limits',
};

export const ProofBanner = ({ proof, suggestions = [], onApply, busy = false }: Props) => {
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
      <p>
        <strong>Counterexample found.</strong> This mandate would allow{' '}
        <span className="mono">
          {formatCents(payment.amountCents)} · {payment.category} · {payment.merchantId} · {payment.itemCount} item(s)
        </span>{' '}
        after {formatCents(state.spentInTaskCents)} already spent on the task, which breaks:
      </p>
      <ul>
        {violated.map((c) => (
          <li key={c.constraintId}>{c.description}</li>
        ))}
      </ul>
      <p>Payments are disabled until the conflict is resolved.</p>

      {suggestions.length > 0 && (
        <div className="suggestions">
          {suggestions.map((s) => (
            <div key={s.kind} className="suggestion">
              <div>
                <strong>{SUGGESTION_TITLE[s.kind]}</strong> <span className="muted mono">· verified by Z3</span>
                <ul>
                  {s.changes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
              {onApply && (
                <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => onApply(s)}>
                  Apply
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
