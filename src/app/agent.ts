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
  'Finish with a short summary of what was bought.',
].join('\n');

const describeOutcome = (o: CheckoutOutcome): string => {
  switch (o.status) {
    case 'approved':
      return `APPROVED. PayPal order ${o.receipt.orderId} (${o.receipt.status}).`;
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
      execute: async ({ query }) =>
        searchProducts(query).map((p) => ({
          productId: p.id,
          name: p.name,
          merchantId: p.merchantId,
          price: formatCents(p.priceCents),
        })),
    }),
    view_product: tool({
      description: 'Open a product page to read its details',
      parameters: z.object({ productId: z.string() }),
      execute: async ({ productId }) => findProduct(productId)?.page ?? 'Product not found',
    }),
    checkout: tool({
      description: 'Buy a product with PayPal. One product per call.',
      parameters: CheckoutRequestSchema,
      execute: async (request) => {
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
      if (step.text.trim()) emit({ type: 'thought', text: step.text });
      step.toolCalls.forEach((call) => emit({ type: 'tool_call', tool: call.toolName, args: call.args }));
    },
  });
  emit({ type: 'done', summary: text });
};
