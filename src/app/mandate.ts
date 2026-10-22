import { generateText, tool, type LanguageModelV1 } from 'ai';
import type { Mandate } from '../core/types';
import { MERCHANTS } from '../infra/catalog';
import { LlmMandateSchema } from './schemas';

/**
 * Turns the user's request into a narrow mandate.
 * Only the user's own words go in here: web pages and tool output never do,
 * so injected text cannot widen what the agent is allowed to pay for.
 *
 * Uses a tool call with toolChoice "auto" instead of generateObject: newer Claude models
 * reject forced tool choice, and the Anthropic provider has no JSON mode. The SDK still
 * validates the arguments against the zod schema.
 */
export const extractMandate = async (model: LanguageModelV1, prompt: string): Promise<Mandate> => {
  const { toolCalls } = await generateText({
    model,
    system: [
      'You convert a shopping request into the narrowest spending mandate that fulfils it.',
      'Never grant categories, merchants or budget the user did not ask for.',
      `Known merchant ids: ${MERCHANTS.map((m) => `${m.id} (${m.name})`).join(', ')}.`,
      'Always answer by calling submit_mandate exactly once.',
    ].join('\n'),
    prompt,
    tools: { submit_mandate: tool({ description: 'Submit the extracted mandate', parameters: LlmMandateSchema }) },
    toolChoice: 'auto',
    maxSteps: 1,
  });

  const call = toolCalls.find((c) => c.toolName === 'submit_mandate');
  if (!call) throw new Error('The model did not return a mandate. Rephrase the request or use the preset mandate.');

  const object = call.args;
  return {
    goal: object.goal,
    budgetCents: Math.round(object.budgetUsd * 100),
    maxPerPaymentCents: object.maxPerPaymentUsd === null ? null : Math.round(object.maxPerPaymentUsd * 100),
    allowedCategories: object.allowedCategories,
    allowedMerchants: object.allowedMerchants,
    maxItems: object.maxItems,
  };
};
