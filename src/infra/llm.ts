import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { APICallError, RetryError, type LanguageModelV1 } from 'ai';

const DEFAULT_MODELS = { anthropic: 'claude-sonnet-5-5', openai: 'gpt-4o-mini' } as const;

/** Picks a model from env. Returns null when no key is configured (Attack Lab still works). */
export const createModel = (env: NodeJS.ProcessEnv): LanguageModelV1 | null => {
  const provider = env.LLM_PROVIDER ?? (env.ANTHROPIC_API_KEY ? 'anthropic' : env.OPENAI_API_KEY ? 'openai' : null);

  if (provider === 'anthropic' && env.ANTHROPIC_API_KEY) {
    return createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(env.LLM_MODEL ?? DEFAULT_MODELS.anthropic);
  }
  if (provider === 'openai' && env.OPENAI_API_KEY) {
    return createOpenAI({ apiKey: env.OPENAI_API_KEY })(env.LLM_MODEL ?? DEFAULT_MODELS.openai);
  }
  return null;
};

export interface UserFacingError {
  readonly title: string;
  readonly detail: string;
}

/** Turns provider errors into something a person can act on, instead of raw API text. */
export const describeLlmError = (error: unknown, model: LanguageModelV1 | null): UserFacingError => {
  const cause = RetryError.isInstance(error) ? error.lastError : error;
  const modelName = model ? model.modelId : 'the configured model';

  if (APICallError.isInstance(cause)) {
    const body = cause.responseBody ?? '';
    switch (cause.statusCode) {
      case 401:
        return { title: 'The AI provider rejected the API key', detail: 'Check ANTHROPIC_API_KEY / OPENAI_API_KEY in .env and restart.' };
      case 403:
        return { title: 'The API key has no access to this model', detail: `Try another model via LLM_MODEL in .env (now: ${modelName}).` };
      case 404:
        return { title: `Model not available: ${modelName}`, detail: 'Set LLM_MODEL in .env to a model your API key can use, then restart.' };
      case 429:
        return { title: 'The AI provider is rate-limiting requests', detail: 'Wait a few seconds and try again.' };
      default:
        if (/credit|balance|billing/i.test(body)) {
          return { title: 'Not enough API credits', detail: 'Top up the balance in your provider console and try again.' };
        }
    }
  }

  const message = cause instanceof Error ? cause.message : String(cause);
  return { title: 'The AI request failed', detail: message };
};
