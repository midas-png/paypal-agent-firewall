import { MockLanguageModelV1 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { extractMandate } from './mandate';

describe('extractMandate', () => {
  it('converts the model answer into a mandate in cents', async () => {
    const model = new MockLanguageModelV1({
      defaultObjectGenerationMode: 'json',
      doGenerate: async () => ({
        text: JSON.stringify({
          goal: 'Buy headphones',
          budgetUsd: 300,
          maxPerPaymentUsd: 149.99,
          allowedCategories: ['electronics'],
          allowedMerchants: ['soundhub'],
          maxItems: 2,
        }),
        finishReason: 'stop',
        usage: { promptTokens: 0, completionTokens: 0 },
        rawCall: { rawPrompt: null, rawSettings: {} },
      }),
    });

    expect(await extractMandate(model, 'Buy headphones up to $300, max $149.99 each')).toEqual({
      goal: 'Buy headphones',
      budgetCents: 300_00,
      maxPerPaymentCents: 149_99,
      allowedCategories: ['electronics'],
      allowedMerchants: ['soundhub'],
      maxItems: 2,
    });
  });
});
