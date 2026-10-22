import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV1 } from 'ai';

/** Picks a model from env. Returns null when no key is configured (Attack Lab still works). */
export const createModel = (env: NodeJS.ProcessEnv): LanguageModelV1 | null => {
  const provider = env.LLM_PROVIDER ?? (env.ANTHROPIC_API_KEY ? 'anthropic' : env.OPENAI_API_KEY ? 'openai' : null);

  if (provider === 'anthropic' && env.ANTHROPIC_API_KEY) {
    return createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(env.LLM_MODEL ?? 'claude-sonnet-4-5');
  }
  if (provider === 'openai' && env.OPENAI_API_KEY) {
    return createOpenAI({ apiKey: env.OPENAI_API_KEY })(env.LLM_MODEL ?? 'gpt-4o-mini');
  }
  return null;
};
