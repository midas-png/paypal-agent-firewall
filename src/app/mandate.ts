import { generateObject, type LanguageModelV1 } from 'ai';
import type { Mandate } from '../core/types';
import { MERCHANTS } from '../infra/catalog';
import { LlmMandateSchema } from './schemas';

/**
 * Turns the user's request into a narrow mandate.
 * Only the user's own words go in here: web pages and tool output never do,
 * so injected text cannot widen what the agent is allowed to pay for.
 */
export const extractMandate = async (model: LanguageModelV1, prompt: string): Promise<Mandate> => {
  const { object } = await generateObject({
    model,
    schema: LlmMandateSchema,
    system: [
      'You convert a shopping request into the narrowest spending mandate that fulfils it.',
      'Never grant categories, merchants or budget the user did not ask for.',
      `Known merchant ids: ${MERCHANTS.map((m) => `${m.id} (${m.name})`).join(', ')}.`,
    ].join('\n'),
    prompt,
  });
  return {
    goal: object.goal,
    budgetCents: Math.round(object.budgetUsd * 100),
    allowedCategories: object.allowedCategories,
    allowedMerchants: object.allowedMerchants,
    maxItems: object.maxItems,
  };
};
