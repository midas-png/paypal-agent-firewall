import type { AgentEvent, AppStateView, AttackRunView, TaskView } from '@server/app/dto';
import type { Guardrails, Mandate } from '@server/core/types';

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body: unknown = await res.json();
  if (!res.ok) {
    const message = typeof body === 'object' && body !== null && 'error' in body ? String(body.error) : res.statusText;
    throw new Error(message);
  }
  return body as T; // trusted: same-origin server returning typed DTOs
};

const send = <T>(method: 'POST' | 'PUT', path: string, body?: unknown): Promise<T> =>
  request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  getState: () => request<AppStateView>('/api/state'),
  saveGuardrails: (g: Guardrails) => send<Guardrails>('PUT', '/api/guardrails', g),
  resetDay: () => send<{ spentTodayCents: number }>('POST', '/api/day/reset'),
  createTask: (prompt: string, mandate?: Mandate) => send<TaskView>('POST', '/api/tasks', { prompt, mandate }),
  updateMandate: (taskId: string, mandate: Mandate) => send<TaskView>('PUT', `/api/tasks/${taskId}/mandate`, mandate),
  runAttack: (id: string) => send<AttackRunView>('POST', `/api/attacks/${id}`),
};

/** Streams agent events. Closes on completion so EventSource does not auto-reconnect and re-run the agent. */
export const streamAgent = (taskId: string, onEvent: (e: AgentEvent) => void): (() => void) => {
  const source = new EventSource(`/api/tasks/${taskId}/run`);
  source.onmessage = (msg: MessageEvent<string>) => {
    const event = JSON.parse(msg.data) as AgentEvent;
    onEvent(event);
    if (event.type === 'done' || event.type === 'error') source.close();
  };
  source.onerror = () => source.close();
  return () => source.close();
};
