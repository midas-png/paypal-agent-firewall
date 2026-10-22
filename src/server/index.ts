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
import { createModel } from '../infra/llm';
import { createPaymentGateway } from '../infra/paymentGateway';

const gateway = createPaymentGateway(process.env);
const model = createModel(process.env);
const service = createFirewallService({ gateway });

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const app = new Hono();

app.onError((err, c) => c.json({ error: errorMessage(err) }, 400));

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
  if (!model) throw new Error('No LLM configured: provide a mandate manually');
  return c.json(await service.createTask(prompt, await extractMandate(model, prompt)));
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
    try {
      if (!model) throw new Error('No LLM configured: set ANTHROPIC_API_KEY or OPENAI_API_KEY');
      if (service.getTask(taskId).proof.status !== 'proven') throw new Error('Mandate is not proven safe');
      await runShoppingAgent({ model, service, taskId, emit: send });
    } catch (e) {
      send({ type: 'error', message: errorMessage(e) });
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
