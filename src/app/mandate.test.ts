import type { LanguageModelV1CallOptions } from '@ai-sdk/provider';
import { MockLanguageModelV1 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { extractMandate } from './mandate';

const respond = (toolArgs: object | null) =>
  new MockLanguageModelV1({
    doGenerate: async (options: LanguageModelV1CallOptions) => {
      // Guard against forced tool choice: newer Claude models reject it.
      if (options.mode.type === 'regular') expect(options.mode.toolChoice?.type ?? 'auto').toBe('auto');
      return {
        text: toolArgs ? undefined : 'Sure, here is your mandate!',
        toolCalls: toolArgs
          ? [{ toolCallType: 'function' as const, toolCallId: '1', toolName: 'submit_mandate', args: JSON.stringify(toolArgs) }]
          : [],
        finishReason: toolArgs ? ('tool-calls' as const) : ('stop' as const),
        usage: { promptTokens: 0, completionTokens: 0 },
        rawCall: { rawPrompt: null, rawSettings: {} },
      };
    },
  });

describe('extractMandate', () => {
  it('converts the model answer into a mandate in cents', async () => {
    const model = respond({
      goal: 'Buy headphones',
      budgetUsd: 300,
      maxPerPaymentUsd: 149.99,
      allowedCategories: ['electronics'],
      allowedMerchants: ['soundhub'],
      maxItems: 2,
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

  it('fails clearly when the model answers in text instead', async () => {
    await expect(extractMandate(respond(null), 'Buy headphones')).rejects.toThrow('did not return a mandate');
  });
});
