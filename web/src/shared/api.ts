import type { AgentEvent, ApiErrorBody, AppStateView, AttackRunView, TaskView } from '@server/app/dto';
import type { Guardrails, Mandate } from '@server/core/types';

/** A failure the UI can show as-is: a short title plus what to do about it. */
export class ApiError extends Error {
  constructor(
    readonly title: string,
    readonly detail: string,
  ) {
    super(`${title}: ${detail}`);
  }
}

const isApiErrorBody = (body: unknown): body is ApiErrorBody =>
  typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'object' && body.error !== null;

export const toApiError = (e: unknown): ApiError =>
  e instanceof ApiError ? e : new ApiError('Something went wrong', e instanceof Error ? e.message : String(e));

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    if (isApiErrorBody(body)) throw new ApiError(body.error.title, body.error.detail);
    throw new ApiError('Server error', `${res.status} ${res.statusText}. Is the server running?`);
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
  getTask: (taskId: string) => request<TaskView>(`/api/tasks/${taskId}`),
  updateMandate: (taskId: string, mandate: Mandate) => send<TaskView>('PUT', `/api/tasks/${taskId}/mandate`, mandate),
  runAttack: (id: string) => send<AttackRunView>('POST', `/api/attacks/${id}`),
};

/** Streams agent events. Closes on completion so EventSource does not auto-reconnect and re-run the agent. */
export const streamAgent = (taskId: string, onEvent: (e: AgentEvent) => void): (() => void) => {
  const source = new EventSource(`/api/tasks/${taskId}/run`);
  source.onmessage = (msg: MessageEvent<string>) => {
    const event = JSON.parse(msg.data) as AgentEvent;
    onEvent(event);
    if (event.type === 'done' || event.type === 'error') {
      source.onerror = null;
      source.close();
    }
  };
  source.onerror = () => {
    source.close();
    onEvent({ type: 'error', title: 'Lost connection to the server', detail: 'Check that the server is still running and try again.' });
  };
  return () => source.close();
};
