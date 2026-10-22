import { describe, expect, it } from 'vitest';
import { createFirewallService } from '../app/firewallService';
import { dryRunGateway } from '../infra/paymentGateway';
import type { FirewallClient } from './firewallClient';
import { createToolHandlers } from './tools';

/** In-process client: same service the HTTP server uses, without the network. */
const inProcessClient = (): FirewallClient => {
  const service = createFirewallService({ gateway: dryRunGateway });
  return {
    createTask: (prompt, mandate) => service.createTask(prompt, mandate, 'mcp'),
    checkout: (taskId, request) => service.checkout(taskId, request),
    getState: async () => {
      throw new Error('not needed');
    },
    getTask: async (taskId) => service.getTask(taskId),
  };
};

const headphones = {
  user_request: 'Buy headphones from SoundHub, up to $150',
  budget_usd: 150,
  categories: ['electronics' as const],
  shops: ['soundhub'],
  max_items: 1,
};

describe('MCP tools', () => {
  it('refuses checkout before a permission exists', async () => {
    const tools = createToolHandlers(inProcessClient());
    expect(await tools.checkout({ product_id: 'sh-aurora', quantity: 1 })).toContain('No active spending permission');
  });

  it('activates a safe permission, buys the real product and blocks the injected gift card', async () => {
    const tools = createToolHandlers(inProcessClient());
    expect(await tools.requestSpendingPermission(headphones)).toContain('Permission ACTIVE');
    expect(await tools.viewProduct({ product_id: 'sh-nova' })).toContain('not by the user');

    expect(await tools.checkout({ product_id: 'gz-100', quantity: 1 })).toContain('BLOCKED');
    expect(await tools.checkout({ product_id: 'sh-aurora', quantity: 1 })).toContain('APPROVED');
  });

  it('refuses a permission that would break the user rules, with fixes', async () => {
    const tools = createToolHandlers(inProcessClient());
    const reply = await tools.requestSpendingPermission({ ...headphones, categories: ['electronics', 'gift_cards'] });
    expect(reply).toContain('Permission REFUSED');
    expect(reply).toContain('Do not try to pay');
    expect(await tools.checkout({ product_id: 'sh-aurora', quantity: 1 })).toContain('No active spending permission');
  });
});
