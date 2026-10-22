/**
 * Standalone page shown after PayPal sends the buyer back.
 * Served by the API itself so it works no matter where the buyer came from
 * (this console, Claude Desktop over MCP, or a link opened later).
 */

export type PaymentResult =
  | { readonly kind: 'paid'; readonly orderId: string }
  | { readonly kind: 'cancelled'; readonly orderId: string }
  | { readonly kind: 'failed'; readonly orderId: string; readonly reason: string };

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

const COPY: Record<PaymentResult['kind'], { icon: string; title: string; tone: string }> = {
  paid: { icon: '✓', title: 'Payment completed', tone: 'ok' },
  cancelled: { icon: '↩', title: 'Payment cancelled', tone: 'warn' },
  failed: { icon: '!', title: 'Payment could not be completed', tone: 'bad' },
};

const bodyText = (r: PaymentResult): string => {
  switch (r.kind) {
    case 'paid':
      return 'PayPal (sandbox) has taken the payment. It now shows as paid in the firewall console.';
    case 'cancelled':
      return 'You cancelled in PayPal. Nothing was charged.';
    case 'failed':
      return `PayPal returned an error: ${r.reason}`;
  }
};

export const renderPaymentResult = (r: PaymentResult): string => {
  const copy = COPY[r.kind];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${copy.title} · Agent Payment Firewall</title>
<style>
  :root { --bg:#0d1117; --card:#151b24; --border:#2a3441; --text:#e6edf3; --muted:#8b98a8; --ok:#3fb68b; --warn:#e3a948; --bad:#f0616d; color-scheme: dark; }
  @media (prefers-color-scheme: light) { :root { --bg:#f6f7f9; --card:#fff; --border:#dde1e7; --text:#18202b; --muted:#5d6b7c; --ok:#1a8a62; --warn:#a86b0c; --bad:#cf2f3d; color-scheme: light; } }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:var(--bg); color:var(--text); font:16px/1.5 system-ui, sans-serif; padding:16px; box-sizing:border-box; }
  .card { max-width:440px; width:100%; background:var(--card); border:1px solid var(--border); border-radius:12px; padding:28px; text-align:center; }
  .icon { width:52px; height:52px; border-radius:50%; display:grid; place-items:center; margin:0 auto 14px; font-size:26px; color:var(--${copy.tone}); border:2px solid var(--${copy.tone}); }
  h1 { font-size:20px; margin:0 0 8px; }
  p { margin:0 0 8px; color:var(--muted); }
  code { font-family: ui-monospace, monospace; font-size:13px; color:var(--text); }
</style>
</head>
<body>
  <main class="card">
    <div class="icon" aria-hidden="true">${copy.icon}</div>
    <h1>${copy.title}</h1>
    <p>${escapeHtml(bodyText(r))}</p>
    ${r.orderId ? `<p>Order <code>${escapeHtml(r.orderId)}</code></p>` : ''}
    <p>You can close this tab.</p>
  </main>
</body>
</html>`;
};
