import { APICallError, RetryError } from 'ai';
import { describe, expect, it } from 'vitest';
import { createModel, describeLlmError } from './llm';

const apiError = (statusCode: number, responseBody = '') =>
  new APICallError({ message: 'x', url: 'u', requestBodyValues: {}, statusCode, responseBody, isRetryable: false });

describe('describeLlmError', () => {
  const model = createModel({ ANTHROPIC_API_KEY: 'k', LLM_MODEL: 'old-model' });

  it('explains an unknown model and how to fix it', () => {
    expect(describeLlmError(apiError(404), model)).toEqual({
      title: 'Model not available: old-model',
      detail: 'Set LLM_MODEL in .env to a model your API key can use, then restart.',
    });
  });

  it('explains a bad key', () => {
    expect(describeLlmError(apiError(401), model).title).toBe('The AI provider rejected the API key');
  });

  it('detects exhausted credits', () => {
    expect(describeLlmError(apiError(400, '{"error":"credit balance is too low"}'), model).title).toBe('Not enough API credits');
  });

  it('unwraps retry errors', () => {
    const retry = new RetryError({ message: 'r', reason: 'maxRetriesExceeded', errors: [apiError(429)] });
    expect(describeLlmError(retry, model).title).toBe('The AI provider is rate-limiting requests');
  });
});
