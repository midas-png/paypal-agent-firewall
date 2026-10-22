import type { ApiErrorBody, AppStateView, CheckoutOutcome, CheckoutRequest, TaskView } from '../app/dto';
import type { Mandate } from '../core/types';

/** HTTP client for the firewall server. The MCP bridge holds no payment state of its own. */
export interface FirewallClient {
  createTask(prompt: string, mandate: Mandate): Promise<TaskView>;
  checkout(taskId: string, request: CheckoutRequest): Promise<CheckoutOutcome>;
  getState(): Promise<AppStateView>;
  getTask(taskId: string): Promise<TaskView>;
}

export class FirewallUnavailableError extends Error {}

const isApiErrorBody = (body: unknown): body is ApiErrorBody =>
  typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'object' && body.error !== null;

export const createFirewallClient = (baseUrl: string): FirewallClient => {
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, { ...init, headers: { 'Content-Type': 'application/json' } });
    } catch {
      throw new FirewallUnavailableError(
        `The payment firewall is not running at ${baseUrl}. Start it (start.command or npm start) and try again.`,
      );
    }
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(isApiErrorBody(body) ? `${body.error.title}: ${body.error.detail}` : `HTTP ${res.status}`);
    }
    return body as T; // trusted: our own server's typed DTOs
  };
  const post = <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });

  return {
    createTask: (prompt, mandate) => post<TaskView>('/api/tasks', { prompt, mandate, origin: 'mcp' }),
    checkout: (taskId, req) => post<CheckoutOutcome>(`/api/tasks/${taskId}/checkout`, req),
    getState: () => request<AppStateView>('/api/state'),
    getTask: (taskId) => request<TaskView>(`/api/tasks/${taskId}`),
  };
};
