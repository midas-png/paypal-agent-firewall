import type { AgentEvent, TaskView } from '@server/app/dto';
import type { Mandate, Suggestion } from '@server/core/types';
import type { Merchant, Product } from '@server/infra/catalog';
import { useEffect, useRef, useState } from 'react';
import { AgentEventView } from '../../entities/agent-event/AgentEventView';
import { ProofBanner } from '../../entities/proof/ProofBanner';
import { api, toApiError, type ApiError, streamAgent } from '../../shared/api';
import { MandateEditor } from '../../features/edit-mandate/MandateEditor';
import { Alert, Panel } from '../../shared/ui';

const DEFAULT_PROMPT =
  'Buy me noise-cancelling headphones or earbuds from SoundHub, up to $150. Check the Nova earbuds page too.';

const MANUAL_MANDATE: Mandate = {
  goal: 'Buy noise-cancelling headphones or earbuds from SoundHub',
  budgetCents: 150_00,
  maxPerPaymentCents: null,
  allowedCategories: ['electronics'],
  allowedMerchants: ['soundhub'],
  maxItems: 1,
};

interface Props {
  readonly llmAvailable: boolean;
  readonly merchants: readonly Merchant[];
  readonly products: readonly Product[];
  readonly onStateChanged: () => void;
}

export const AgentRun = ({ llmAvailable, merchants, products, onStateChanged }: Props) => {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [task, setTask] = useState<TaskView | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  // The buyer approves PayPal orders in another tab; pick up the new status when they come back.
  const taskId = task?.id;
  useEffect(() => {
    if (!taskId) return;
    const refresh = () => {
      api.getTask(taskId).then(setTask, () => undefined);
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [taskId]);

  const guard = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(toApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const createTask = (mandate?: Mandate) =>
    guard(async () => {
      setEvents([]);
      setTask(await api.createTask(prompt, mandate));
    });

  const updateMandate = (mandate: Mandate) =>
    guard(async () => {
      if (task) setTask(await api.updateMandate(task.id, mandate));
    });

  const applySuggestion = (s: Suggestion) =>
    guard(async () => {
      if (!task) return;
      if (s.kind === 'narrow-mandate') {
        setTask(await api.updateMandate(task.id, s.mandate));
        return;
      }
      await api.saveGuardrails(s.guardrails);
      onStateChanged();
      setTask(await api.updateMandate(task.id, task.mandate));
    });

  const run = () => {
    if (!task) return;
    setEvents([]);
    setRunning(true);
    stopRef.current = streamAgent(task.id, (event) => {
      setEvents((prev) => [...prev, event]);
      if (event.type === 'checkout') onStateChanged();
      if (event.type === 'done' || event.type === 'error') setRunning(false);
    });
  };

  const canRun = llmAvailable && task?.proof.status === 'proven' && !running;

  return (
    <div className="stack">
      <Panel title="1 · Ask the agent">
        <textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <div className="row">
          <button type="button" className="btn" disabled={busy || !llmAvailable} onClick={() => void createTask()}>
            Extract mandate with LLM
          </button>
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void createTask(MANUAL_MANDATE)}>
            Use preset mandate
          </button>
          {!llmAvailable && <span className="muted">LLM off: set ANTHROPIC_API_KEY or OPENAI_API_KEY</span>}
        </div>
        {error && (
          <Alert title={error.title}>
            <p>{error.detail}</p>
            <p className="muted">You can still continue: “Use preset mandate” works without the AI model.</p>
          </Alert>
        )}
      </Panel>

      {task && (
        <Panel title="2 · Verify the mandate" aside={<span className="muted">only your prompt can grant permissions</span>}>
          <ProofBanner
            proof={task.proof}
            suggestions={task.suggestions}
            busy={busy}
            onApply={(s) => void applySuggestion(s)}
          />
          <MandateEditor
            mandate={task.mandate}
            merchants={merchants}
            busy={busy}
            submitLabel="Re-verify with Z3"
            onSubmit={(m) => void updateMandate(m)}
          />
        </Panel>
      )}

      {task && (
        <Panel
          title="3 · Let the agent shop"
          aside={
            <button type="button" className="btn" disabled={!canRun} onClick={run}>
              {running ? 'Running…' : 'Run agent'}
            </button>
          }
        >
          {events.length === 0 && (
            <p className="muted">
              Press “Run agent”: you will see what the agent does, and every payment it tries with the firewall's decision.
            </p>
          )}
          <ol className="timeline">
            {events.map((e, i) => (
              <li key={i} className={`event event--${e.type}`}>
                <AgentEventView event={latest(e, task)} products={products} />
              </li>
            ))}
          </ol>
        </Panel>
      )}
    </div>
  );
};

/** Checkout events are snapshots; show the task's current state of the same order (e.g. after capture). */
const latest = (event: AgentEvent, task: TaskView | null): AgentEvent => {
  if (event.type !== 'checkout' || event.outcome.status !== 'approved' || !task) return event;
  const { orderId } = event.outcome.receipt;
  const current = task.outcomes.find((o) => o.status === 'approved' && o.receipt.orderId === orderId);
  return current ? { type: 'checkout', outcome: current } : event;
};
