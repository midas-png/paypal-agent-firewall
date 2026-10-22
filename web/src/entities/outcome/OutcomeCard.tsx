import type { CheckoutOutcome } from '@server/app/dto';
import { formatCents } from '@server/core/money';
import type { Product } from '@server/infra/catalog';
import { Badge } from '../../shared/ui';

const TONE = { approved: 'ok', blocked: 'bad', failed: 'warn', rejected: 'warn' } as const;

export const OutcomeCard = ({ outcome, products }: { outcome: CheckoutOutcome; products: readonly Product[] }) => {
  const product = products.find((p) => p.id === outcome.request.productId);
  const title = `${outcome.request.quantity} × ${product?.name ?? outcome.request.productId}`;

  return (
    <article className={`outcome outcome--${outcome.status}`}>
      <header className="outcome__head">
        <div>
          <strong>{title}</strong>
          {product && (
            <span className="muted mono">
              {' '}
              · {product.merchantId} · {product.category}
            </span>
          )}
        </div>
        <div className="outcome__right">
          {'decision' in outcome && <span className="mono">{formatCents(outcome.decision.payment.amountCents)}</span>}
          <Badge tone={TONE[outcome.status]}>{outcome.status}</Badge>
        </div>
      </header>

      {outcome.status === 'rejected' && <p className="muted">{outcome.reason}</p>}
      {outcome.status === 'failed' && <p className="muted">{outcome.error}</p>}

      {'decision' in outcome && (
        <ul className="checks">
          {outcome.decision.checks.map((c) => (
            <li key={c.constraintId} className={c.passed ? 'check--ok' : 'check--bad'}>
              <span className="mono">{c.passed ? '✓' : '✗'}</span>
              <span className="mono muted">{c.source}</span>
              {c.description}
            </li>
          ))}
        </ul>
      )}

      {outcome.status === 'approved' && (
        <p className="receipt mono">
          {outcome.receipt.mode === 'paypal-sandbox' ? 'PayPal order' : 'Dry-run order'} {outcome.receipt.orderId} ·{' '}
          {outcome.receipt.status}
          {outcome.receipt.approveUrl && (
            <>
              {' '}
              ·{' '}
              <a href={outcome.receipt.approveUrl} target="_blank" rel="noreferrer">
                approve in PayPal ↗
              </a>
            </>
          )}
        </p>
      )}
    </article>
  );
};
