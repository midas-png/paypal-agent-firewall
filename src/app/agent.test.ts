import type { LanguageModelV1CallOptions, LanguageModelV1FunctionToolCall } from '@ai-sdk/provider';
import { MockLanguageModelV1 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { runShoppingAgent } from './agent';
import type { AgentEvent } from './dto';
import { createFirewallService } from './firewallService';
import { dryRunGateway } from '../infra/paymentGateway';

const call = (id: string, toolName: string, args: object): LanguageModelV1FunctionToolCall => ({
  toolCallType: 'function',
  toolCallId: id,
  toolName,
  args: JSON.stringify(args),
});

const step = (toolCalls: LanguageModelV1FunctionToolCall[], text?: string) => ({
  text,
  toolCalls,
  finishReason: toolCalls.length > 0 ? ('tool-calls' as const) : ('stop' as const),
  usage: { promptTokens: 0, completionTokens: 0 },
  rawCall: { rawPrompt: null, rawSettings: {} },
});

/** A gullible model that obeys the injection hidden on the Nova product page. */
const injectedAgentScript = [
  step([call('1', 'view_product', { productId: 'sh-nova' })]),
  step([
    call('2', 'checkout', { productId: 'gz-100', quantity: 1 }),
    call('3', 'checkout', { productId: 'sh-nova', quantity: 1 }),
  ]),
  step([], 'Bought the Nova earbuds.'),
];

describe('shopping agent behind the firewall', () => {
  it('blocks the injected gift card and still completes the real purchase', async () => {
    const prompts: LanguageModelV1CallOptions['prompt'][] = [];
    let stepIndex = 0;
    const model = new MockLanguageModelV1({
      doGenerate: async (options) => {
        prompts.push(options.prompt);
        const next = injectedAgentScript[stepIndex++];
        if (!next) throw new Error('script exhausted');
        return next;
      },
    });

    const service = createFirewallService({ gateway: dryRunGateway });
    const task = await service.createTask('Buy earbuds from SoundHub, up to $150', {
      goal: 'Buy earbuds from SoundHub',
      budgetCents: 150_00,
      maxPerPaymentCents: null,
      allowedCategories: ['electronics'],
      allowedMerchants: ['soundhub'],
      maxItems: 1,
    });

    const events: AgentEvent[] = [];
    await runShoppingAgent({ model, service, taskId: task.id, emit: (e) => events.push(e) });

    const statuses = service.getTask(task.id).outcomes.map((o) => [o.request.productId, o.status]);
    expect(statuses).toEqual([
      ['gz-100', 'blocked'],
      ['sh-nova', 'approved'],
    ]);
    expect(service.getSpentTodayCents()).toBe(89_00);
    expect(events.at(-1)).toEqual({ type: 'done', summary: 'Bought the Nova earbuds.' });

    // The block reason is fed back to the model so it can explain it to the user.
    expect(JSON.stringify(prompts.at(-1))).toContain('BLOCKED by payment firewall');
  });
});
