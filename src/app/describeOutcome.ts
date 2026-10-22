import type { CheckoutOutcome } from './dto';

/** Firewall decision as text for an AI agent (in-app agent or an MCP client). */
export const describeOutcome = (o: CheckoutOutcome): string => {
  switch (o.status) {
    case 'approved':
      return o.receipt.approveUrl
        ? `APPROVED. PayPal order ${o.receipt.orderId} created; the buyer must approve it in PayPal to complete payment.`
        : `APPROVED. Order ${o.receipt.orderId} created.`;
    case 'blocked':
      return `BLOCKED by the payment firewall. Rules this payment breaks: ${o.decision.checks
        .filter((c) => !c.passed)
        .map((c) => c.description)
        .join('; ')}`;
    case 'failed':
      return `FAILED at payment provider: ${o.error}`;
    case 'rejected':
      return `REJECTED: ${o.reason}`;
  }
};
