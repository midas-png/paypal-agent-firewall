import { randomUUID } from 'node:crypto';
import { PayPalAgentToolkit } from '@paypal/agent-toolkit/ai-sdk';
import type { Tool } from 'ai';
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

export interface CaptureResult {
  readonly orderId: string;
  readonly status: string;
}

export type GatewayMode = 'paypal-sandbox' | 'dry-run';

export interface PaymentGateway {
  readonly mode: GatewayMode;
  createOrder(merchantName: string, lines: readonly OrderLine[]): Promise<OrderReceipt>;
  /** Collects the money once the buyer has approved the order in PayPal. */
  captureOrder(orderId: string): Promise<CaptureResult>;
}

export interface GatewayConfig {
  readonly clientId?: string;
  readonly clientSecret?: string;
  /** Where PayPal sends the buyer after approving / cancelling. Must point at this server. */
  readonly returnUrl: string;
  readonly cancelUrl: string;
}

const toDollars = (cents: number): number => cents / 100;

const PayPalOrderSchema = z.object({
  id: z.string(),
  status: z.string(),
  links: z.array(z.object({ href: z.string(), rel: z.string() })).default([]),
});
const PayPalErrorSchema = z.object({ error: z.object({ message: z.string() }) });

/** Toolkit tools return JSON strings; errors come back as `{ error }` rather than throwing. */
const runTool = async (tool: Tool | undefined, args: object): Promise<unknown> => {
  if (!tool?.execute) throw new Error('PayPal toolkit tool is not enabled');
  const raw: unknown = await tool.execute(args, { toolCallId: randomUUID(), messages: [] });
  const json: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const failure = PayPalErrorSchema.safeParse(json);
  if (failure.success) throw new Error(`PayPal: ${failure.data.error.message}`);
  return json;
};

/** Executes payments through the PayPal Agent Toolkit (`create_order`, `pay_order`) in the sandbox. */
const createPayPalGateway = (clientId: string, clientSecret: string, config: GatewayConfig): PaymentGateway => {
  const toolkit = new PayPalAgentToolkit({
    clientId,
    clientSecret,
    configuration: { actions: { orders: { create: true, capture: true } }, context: { sandbox: true } },
  });
  const tools = toolkit.getTools();

  return {
    mode: 'paypal-sandbox',
    async createOrder(merchantName, lines) {
      const json = await runTool(tools['create_order'], {
        currencyCode: 'USD',
        notes: `Agent purchase from ${merchantName}, approved by Agent Payment Firewall`,
        returnUrl: config.returnUrl,
        cancelUrl: config.cancelUrl,
        items: lines.map((l) => ({
          name: l.name,
          quantity: l.quantity,
          itemCost: toDollars(l.unitPriceCents),
          itemTotal: toDollars(l.unitPriceCents * l.quantity),
          taxPercent: 0,
        })),
      });
      const order = PayPalOrderSchema.parse(json);
      const approve = order.links.find((l) => l.rel === 'approve' || l.rel === 'payer-action');
      return { orderId: order.id, status: order.status, approveUrl: approve?.href ?? null, mode: 'paypal-sandbox' };
    },
    async captureOrder(orderId) {
      const capture = PayPalOrderSchema.parse(await runTool(tools['pay_order'], { id: orderId }));
      return { orderId: capture.id, status: capture.status };
    },
  };
};

/** No network: used without PayPal credentials, and by the isolated Attack Lab sandbox. */
export const dryRunGateway: PaymentGateway = {
  mode: 'dry-run',
  async createOrder() {
    return { orderId: `DRYRUN-${randomUUID().slice(0, 8).toUpperCase()}`, status: 'CREATED', approveUrl: null, mode: 'dry-run' };
  },
  async captureOrder(orderId) {
    return { orderId, status: 'COMPLETED' };
  },
};

export const createPaymentGateway = (config: GatewayConfig): PaymentGateway =>
  config.clientId && config.clientSecret
    ? createPayPalGateway(config.clientId, config.clientSecret, config)
    : dryRunGateway;
