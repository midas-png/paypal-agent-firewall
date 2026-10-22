import type { CheckoutOutcome } from '@server/app/dto';
import { formatCents } from '@server/core/money';
import type { CheckResult } from '@server/core/types';
import type { Product } from '@server/infra/catalog';
import { useState } from 'react';
import { Badge } from '../../shared/ui';

type Tone = 'ok' | 'bad' | 'warn';

const SOURCE_LABEL: Record<CheckResult['source'], string> = { guardrail: 'your rule', mandate: 'this task' };

/** One status a person understands, instead of API states like PAYER_ACTION_REQUIRED. */
const statusOf = (o: CheckoutOutcome): { tone: Tone; label: string } => {
  switch (o.status) {
    case 'approved':
      if (o.receipt.status === 'COMPLETED') return { tone: 'ok', label: 'Paid' };
      if (o.receipt.mode === 'dry-run') return { tone: 'ok', label: 'Allowed (simulated)' };
      return { tone: 'warn', label: 'Allowed · awaiting your approval' };
    case 'blocked':
      return { tone: 'bad', label: 'Blocked' };
    case 'failed':
      return { tone: 'warn', label: 'Payment failed' };
    case 'rejected':
      return { tone: 'warn', label: 'Rejected' };
  }
};

const ChecksList = ({ checks }: { checks: readonly CheckResult[] }) => (
  <ul className="checks">
    {checks.map((c) => (
      <li key={c.constraintId} className={c.passed ? 'check--ok' : 'check--bad'}>
        <span className="mono">{c.passed ? '✓' : '✗'}</span>
        <span className="muted">{SOURCE_LABEL[c.source]}</span>
        {c.description}
      </li>
    ))}
  </ul>
);

const ChecksSummary = ({ checks }: { checks: readonly CheckResult[] }) => {
  const [open, setOpen] = useState(false);
  const failed = checks.filter((c) => !c.passed);

  return (
    <div className="outcome__checks">
      {failed.length > 0 ? (
        <>
          <p>
            <strong>Why it was blocked:</strong>
          </p>
          <ChecksList checks={failed} />
        </>
      ) : (
        <p className="check--ok">✓ Passed all {checks.length} checks against your rules and this task.</p>
      )}
      <button type="button" className="link" onClick={() => setOpen(!open)}>
        {open ? 'hide checks' : `show all ${checks.length} checks`}
      </button>
      {open && <ChecksList checks={checks} />}
    </div>
  );
};

const NextStep = ({ outcome }: { outcome: CheckoutOutcome }) => {
  switch (outcome.status) {
    case 'approved': {
      const { receipt } = outcome;
      if (receipt.status === 'COMPLETED') {
        return <p className="outcome__next check--ok">Payment completed in PayPal (sandbox). Order {receipt.orderId}.</p>;
      }
      if (receipt.approveUrl) {
        return (
          <div className="outcome__next">
            <p>
              The firewall allowed this payment and created a PayPal order. Nothing is charged until you approve it.
            </p>
            <a className="btn" href={receipt.approveUrl} target="_blank" rel="noreferrer">
              Approve in PayPal ↗
            </a>
          </div>
        );
      }
      return <p className="outcome__next muted">Simulated order {receipt.orderId}: no money moved.</p>;
    }
    case 'blocked':
      return <p className="outcome__next muted">No order was created and no money moved.</p>;
    case 'failed':
      return <p className="outcome__next">PayPal could not create the order: {outcome.error}</p>;
    case 'rejected':
      return <p className="outcome__next">{outcome.reason}</p>;
  }
};

export const OutcomeCard = ({ outcome, products }: { outcome: CheckoutOutcome; products: readonly Product[] }) => {
  const product = products.find((p) => p.id === outcome.request.productId);
  const status = statusOf(outcome);

  return (
    <article className={`outcome outcome--${status.tone}`}>
      <header className="outcome__head">
        <div>
          <strong>
            {outcome.request.quantity} × {product?.name ?? outcome.request.productId}
          </strong>
          {product && <span className="muted"> · {product.merchantId}</span>}
        </div>
        <div className="outcome__right">
          {'decision' in outcome && <span className="mono">{formatCents(outcome.decision.payment.amountCents)}</span>}
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
      </header>
      {'decision' in outcome && <ChecksSummary checks={outcome.decision.checks} />}
      <NextStep outcome={outcome} />
    </article>
  );
};
