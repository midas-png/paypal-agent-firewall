import { randomUUID } from 'node:crypto';
import { PayPalAgentToolkit } from '@paypal/agent-toolkit/ai-sdk';
import { z } from 'zod';

export interface OrderLine {
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
}

export interface OrderReceipt {
  readonly orderId: string;
  readonly status: string;
  readonly approveUrl: string | null;
  readonly mode: GatewayMode;
}

export type GatewayMode = 'paypal-sandbox' | 'dry-run';

export interface PaymentGateway {
  readonly mode: GatewayMode;
  createOrder(merchantName: string, lines: readonly OrderLine[]): Promise<OrderReceipt>;
}

const toDollars = (cents: number): number => cents / 100;

const PayPalOrderSchema = z.object({
  id: z.string(),
  status: z.string(),
  links: z.array(z.object({ href: z.string(), rel: z.string() })).default([]),
});

const PayPalErrorSchema = z.object({ error: z.object({ message: z.string() }) });

/** Executes payments through the PayPal Agent Toolkit `create_order` tool (sandbox). */
const createPayPalGateway = (clientId: string, clientSecret: string): PaymentGateway => {
  const toolkit = new PayPalAgentToolkit({
    clientId,
    clientSecret,
    configuration: { actions: { orders: { create: true } }, context: { sandbox: true } },
  });
  const createOrderTool = toolkit.getTools()['create_order'];
  if (!createOrderTool?.execute) throw new Error('PayPal toolkit did not expose create_order');
  const execute = createOrderTool.execute;

  return {
    mode: 'paypal-sandbox',
    async createOrder(merchantName, lines) {
      const raw: unknown = await execute(
        {
          currencyCode: 'USD',
          notes: `Agent purchase from ${merchantName}, approved by Agent Payment Firewall`,
          items: lines.map((l) => ({
            name: l.name,
            quantity: l.quantity,
            itemCost: toDollars(l.unitPriceCents),
            itemTotal: toDollars(l.unitPriceCents * l.quantity),
            taxPercent: 0,
          })),
        },
        { toolCallId: randomUUID(), messages: [] },
      );
      const json: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const failure = PayPalErrorSchema.safeParse(json);
      if (failure.success) throw new Error(`PayPal: ${failure.data.error.message}`);

      const order = PayPalOrderSchema.parse(json);
      const approve = order.links.find((l) => l.rel === 'approve' || l.rel === 'payer-action');
      return { orderId: order.id, status: order.status, approveUrl: approve?.href ?? null, mode: 'paypal-sandbox' };
    },
  };
};

const dryRunGateway: PaymentGateway = {
  mode: 'dry-run',
  async createOrder() {
    return { orderId: `DRYRUN-${randomUUID().slice(0, 8).toUpperCase()}`, status: 'CREATED', approveUrl: null, mode: 'dry-run' };
  },
};

export const createPaymentGateway = (env: NodeJS.ProcessEnv): PaymentGateway => {
  const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET } = env;
  return PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET
    ? createPayPalGateway(PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET)
    : dryRunGateway;
};
