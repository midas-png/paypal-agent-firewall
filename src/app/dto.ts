import type { z } from 'zod';
import type { Decision, Guardrails, Mandate, ProofResult } from '../core/types';
import type { Merchant, Product } from '../infra/catalog';
import type { GatewayMode, OrderReceipt } from '../infra/paymentGateway';
import type { CheckoutRequestSchema } from './schemas';

/** Types shared with the web client over HTTP. */

export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;

export type CheckoutOutcome =
  | { readonly status: 'rejected'; readonly request: CheckoutRequest; readonly reason: string }
  | { readonly status: 'blocked'; readonly request: CheckoutRequest; readonly decision: Decision }
  | { readonly status: 'failed'; readonly request: CheckoutRequest; readonly decision: Decision; readonly error: string }
  | { readonly status: 'approved'; readonly request: CheckoutRequest; readonly decision: Decision; readonly receipt: OrderReceipt };

export interface TaskView {
  readonly id: string;
  readonly prompt: string;
  readonly mandate: Mandate;
  readonly proof: ProofResult;
  readonly spentInTaskCents: number;
  readonly outcomes: readonly CheckoutOutcome[];
}

export type AgentEvent =
  | { readonly type: 'thought'; readonly text: string }
  | { readonly type: 'tool_call'; readonly tool: string; readonly args: unknown }
  | { readonly type: 'checkout'; readonly outcome: CheckoutOutcome }
  | { readonly type: 'done'; readonly summary: string }
  | { readonly type: 'error'; readonly message: string };

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
