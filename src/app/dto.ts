import type { z } from 'zod';
import type { Decision, Guardrails, Mandate, ProofResult, Suggestion } from '../core/types';
import type { Merchant, Product } from '../infra/catalog';
import type { GatewayMode, OrderReceipt } from '../infra/paymentGateway';
import type { CheckoutRequestSchema } from './schemas';

/** Types shared with the web client over HTTP. */

/** Error body returned by every failing endpoint. */
export interface ApiErrorBody {
  readonly error: { readonly title: string; readonly detail: string };
}

export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;

export type CheckoutOutcome =
  | { readonly status: 'rejected'; readonly request: CheckoutRequest; readonly reason: string }
  | { readonly status: 'blocked'; readonly request: CheckoutRequest; readonly decision: Decision }
  | { readonly status: 'failed'; readonly request: CheckoutRequest; readonly decision: Decision; readonly error: string }
  | { readonly status: 'approved'; readonly request: CheckoutRequest; readonly decision: Decision; readonly receipt: OrderReceipt };

/** Where a task came from: this web console or an AI assistant connected over MCP. */
export type TaskOrigin = 'console' | 'mcp';

export interface TaskView {
  readonly id: string;
  readonly origin: TaskOrigin;
  readonly createdAt: string;
  readonly prompt: string;
  readonly mandate: Mandate;
  readonly proof: ProofResult;
  /** Z3-verified fixes, present only when the proof found a counterexample. */
  readonly suggestions: readonly Suggestion[];
  readonly spentInTaskCents: number;
  readonly outcomes: readonly CheckoutOutcome[];
}

export type AgentEvent =
  | { readonly type: 'thought'; readonly text: string }
  | { readonly type: 'tool_call'; readonly tool: string; readonly args: unknown }
  | { readonly type: 'checkout'; readonly outcome: CheckoutOutcome }
  | { readonly type: 'done'; readonly summary: string }
  | { readonly type: 'error'; readonly title: string; readonly detail: string };

export interface AttackScenarioView {
  readonly id: string;
  readonly title: string;
  readonly description: string;
}

export interface AttackRunView {
  readonly scenario: AttackScenarioView;
  readonly task: TaskView;
}

export interface AppStateView {
  readonly guardrails: Guardrails;
  readonly spentTodayCents: number;
  readonly merchants: readonly Merchant[];
  readonly products: readonly Product[];
  readonly llmAvailable: boolean;
  readonly gatewayMode: GatewayMode;
  readonly attacks: readonly AttackScenarioView[];
}
