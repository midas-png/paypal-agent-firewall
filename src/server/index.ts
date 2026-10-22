import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { runShoppingAgent } from '../app/agent';
import { listAttacks, runAttack } from '../app/attacks';
import type { AgentEvent, AppStateView } from '../app/dto';
import { createFirewallService } from '../app/firewallService';
import { extractMandate } from '../app/mandate';
import { CreateTaskSchema, GuardrailsSchema, MandateSchema } from '../app/schemas';
import { MERCHANTS, PRODUCTS } from '../infra/catalog';
import { createModel, describeLlmError, type UserFacingError } from '../infra/llm';
import { createPaymentGateway } from '../infra/paymentGateway';

const gateway = createPaymentGateway(process.env);
const model = createModel(process.env);
const service = createFirewallService({ gateway });

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const fail = (title: string, detail: string): UserFacingError => ({ title, detail });

const app = new Hono();

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: fail('Request failed', errorMessage(err)) }, 400);
});

app.get('/api/state', (c) =>
  c.json<AppStateView>({
    guardrails: service.getGuardrails(),
    spentTodayCents: service.getSpentTodayCents(),
    merchants: MERCHANTS,
    products: PRODUCTS,
    llmAvailable: model !== null,
    gatewayMode: gateway.mode,
    attacks: listAttacks(),
  }),
);

app.put('/api/guardrails', async (c) => {
  service.setGuardrails(GuardrailsSchema.parse(await c.req.json()));
  return c.json(service.getGuardrails());
});

app.post('/api/day/reset', (c) => {
  service.resetDay();
  return c.json({ spentTodayCents: 0 });
});

app.post('/api/tasks', async (c) => {
  const { prompt, mandate } = CreateTaskSchema.parse(await c.req.json());
  if (mandate) return c.json(await service.createTask(prompt, mandate));
  if (!model) {
    return c.json({ error: fail('No AI model configured', 'Add ANTHROPIC_API_KEY or OPENAI_API_KEY to .env, or use the preset mandate.') }, 400);
  }
  try {
    return c.json(await service.createTask(prompt, await extractMandate(model, prompt)));
  } catch (e) {
    console.error(e);
    return c.json({ error: describeLlmError(e, model) }, 502);
  }
});

app.put('/api/tasks/:id/mandate', async (c) =>
  c.json(await service.updateMandate(c.req.param('id'), MandateSchema.parse(await c.req.json()))),
);

app.get('/api/tasks/:id', (c) => c.json(service.getTask(c.req.param('id'))));

app.get('/api/tasks/:id/run', (c) => {
  const taskId = c.req.param('id');
  return streamSSE(c, async (stream) => {
    const send = (event: AgentEvent): void => {
      void stream.writeSSE({ data: JSON.stringify(event) });
    };
    if (!model) {
      send({ type: 'error', ...fail('No AI model configured', 'Add ANTHROPIC_API_KEY or OPENAI_API_KEY to .env and restart.') });
      return;
    }
    if (service.getTask(taskId).proof.status !== 'proven') {
      send({ type: 'error', ...fail('Mandate is not verified', 'Resolve the conflict in step 2 first.') });
      return;
    }
    try {
      await runShoppingAgent({ model, service, taskId, emit: send });
    } catch (e) {
      console.error(e);
      send({ type: 'error', ...describeLlmError(e, model) });
    }
  });
});

app.post('/api/attacks/:id', async (c) =>
  c.json(
    await runAttack(c.req.param('id'), {
      guardrails: service.getGuardrails(),
      spentTodayCents: service.getSpentTodayCents(),
    }),
  ),
);

app.use('/*', serveStatic({ root: './dist/web' }));
app.get('/*', serveStatic({ path: './dist/web/index.html' }));

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`Agent Payment Firewall on http://localhost:${port}`);
  console.log(`  payments: ${gateway.mode} | llm: ${model ? 'on' : 'off (Attack Lab only)'}`);
});
