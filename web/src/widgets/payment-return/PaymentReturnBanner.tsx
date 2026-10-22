import { useEffect, useState } from 'react';
import { Alert } from '../../shared/ui';

type Result = { kind: 'paid' | 'cancelled' | 'failed'; order: string; reason: string };

/** Reads the result PayPal's redirect left in the URL, then removes it so a reload doesn't repeat it. */
const readResult = (): Result | null => {
  const params = new URLSearchParams(window.location.search);
  const kind = params.get('paypal');
  if (kind !== 'paid' && kind !== 'cancelled' && kind !== 'failed') return null;
  return { kind, order: params.get('order') ?? '', reason: params.get('reason') ?? '' };
};

const COPY: Record<Result['kind'], { tone: 'ok' | 'warn' | 'bad'; title: string; body: (r: Result) => string }> = {
  paid: {
    tone: 'ok',
    title: 'Payment completed',
    body: (r) => `PayPal (sandbox) captured order ${r.order}. You can close this tab and go back to the agent.`,
  },
  cancelled: {
    tone: 'warn',
    title: 'Payment cancelled',
    body: (r) => `You cancelled order ${r.order} in PayPal. Nothing was charged.`,
  },
  failed: {
    tone: 'bad',
    title: 'PayPal could not complete the payment',
    body: (r) => `${r.reason || 'Unknown error'} (order ${r.order}).`,
  },
};

export const PaymentReturnBanner = () => {
  const [result, setResult] = useState<Result | null>(readResult);

  useEffect(() => {
    if (result) window.history.replaceState(null, '', window.location.pathname);
  }, [result]);

  if (!result) return null;
  const copy = COPY[result.kind];
  return (
    <div className="return-banner">
      <Alert tone={copy.tone} title={copy.title}>
        <p>{copy.body(result)}</p>
        <button type="button" className="link" onClick={() => setResult(null)}>
          dismiss
        </button>
      </Alert>
    </div>
  );
};
