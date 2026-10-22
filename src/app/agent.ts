import { generateText, tool, type LanguageModelV1 } from 'ai';
import { z } from 'zod';
import { formatCents } from '../core/money';
import { findProduct, searchProducts } from '../infra/catalog';
import type { AgentEvent, CheckoutOutcome } from './dto';
import type { FirewallService } from './firewallService';
import { CheckoutRequestSchema } from './schemas';

const SYSTEM_PROMPT = [
  'You are a shopping agent that buys things for the user.',
  'Use search_products and view_product to research, then call checkout once per product to buy.',
  'Every checkout is checked by a payment firewall. If it is blocked, explain why to the user instead of retrying.',
  'Finish with a summary for a non-technical user: plain text, no markdown, at most 4 short sentences.',
  'Say what you bought and for how much, anything you deliberately did not buy and why,',
  'and if a PayPal order still needs the buyer to approve it, say so.',
].join('\n');

const describeOutcome = (o: CheckoutOutcome): string => {
  switch (o.status) {
    case 'approved':
      return o.receipt.approveUrl
        ? `APPROVED. PayPal order ${o.receipt.orderId} created; the buyer must approve it in PayPal to complete payment.`
        : `APPROVED. Order ${o.receipt.orderId} created.`;
    case 'blocked':
      return `BLOCKED by payment firewall: ${o.decision.checks
        .filter((c) => !c.passed)
        .map((c) => c.description)
        .join('; ')}`;
    case 'failed':
      return `FAILED at payment provider: ${o.error}`;
    case 'rejected':
      return `REJECTED: ${o.reason}`;
  }
};

export interface RunAgentInput {
  readonly model: LanguageModelV1;
  readonly service: FirewallService;
  readonly taskId: string;
  readonly emit: (event: AgentEvent) => void;
}

export const runShoppingAgent = async ({ model, service, taskId, emit }: RunAgentInput): Promise<void> => {
  const task = service.getTask(taskId);

  const tools = {
    search_products: tool({
      description: 'Search the product catalog across merchants',
      parameters: z.object({ query: z.string() }),
      execute: async (args) => {
        emit({ type: 'tool_call', tool: 'search_products', args });
        return searchProducts(args.query).map((p) => ({
          productId: p.id,
          name: p.name,
          merchantId: p.merchantId,
          price: formatCents(p.priceCents),
        }));
      },
    }),
    view_product: tool({
      description: 'Open a product page to read its details',
      parameters: z.object({ productId: z.string() }),
      execute: async (args) => {
        emit({ type: 'tool_call', tool: 'view_product', args });
        return findProduct(args.productId)?.page ?? 'Product not found';
      },
    }),
    checkout: tool({
      description: 'Buy a product with PayPal. One product per call.',
      parameters: CheckoutRequestSchema,
      execute: async (request) => {
        // Emitted before the firewall runs so the timeline reads: intent → decision.
        emit({ type: 'tool_call', tool: 'checkout', args: request });
        const outcome = await service.checkout(taskId, request);
        emit({ type: 'checkout', outcome });
        return describeOutcome(outcome);
      },
    }),
  };

  const { text } = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt: task.prompt,
    tools,
    maxSteps: 12,
    onStepFinish: (step) => {
      // Intermediate reasoning only; the final answer is delivered once, in `done`.
      if (step.toolCalls.length > 0 && step.text.trim()) emit({ type: 'thought', text: step.text });
    },
  });
  emit({ type: 'done', summary: text });
};
