import type { AgentEvent } from '@server/app/dto';
import type { Product } from '@server/infra/catalog';
import { Alert } from '../../shared/ui';
import { OutcomeCard } from '../outcome/OutcomeCard';

const stringField = (args: unknown, key: string): string | undefined => {
  if (typeof args !== 'object' || args === null || !(key in args)) return undefined;
  const value: unknown = (args as Record<string, unknown>)[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
};

/** Plain-language line for each agent action, instead of raw tool-call JSON. */
const describeToolCall = (tool: string, args: unknown, products: readonly Product[]): { icon: string; text: string } => {
  const productName = (id: string | undefined) => products.find((p) => p.id === id)?.name ?? id ?? 'a product';
  switch (tool) {
    case 'search_products':
      return { icon: '🔍', text: `Searching the catalog for “${stringField(args, 'query') ?? ''}”` };
    case 'view_product':
      return { icon: '📄', text: `Reading the product page: ${productName(stringField(args, 'productId'))}` };
    case 'checkout':
      return {
        icon: '💳',
        text: `Wants to pay for ${stringField(args, 'quantity') ?? 1} × ${productName(stringField(args, 'productId'))}. Asking the firewall…`,
      };
    default:
      return { icon: '⚙️', text: tool };
  }
};

/** Agents often answer in markdown; the summary is shown as plain text. */
const plainText = (text: string): string => text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '');

export const AgentEventView = ({ event, products }: { event: AgentEvent; products: readonly Product[] }) => {
  switch (event.type) {
    case 'thought':
      return <p className="event__thought">{plainText(event.text)}</p>;
    case 'tool_call': {
      const { icon, text } = describeToolCall(event.tool, event.args, products);
      return (
        <p className="event__action">
          <span aria-hidden>{icon}</span> {text}
        </p>
      );
    }
    case 'checkout':
      return <OutcomeCard outcome={event.outcome} products={products} />;
    case 'done':
      return (
        <div className="event__summary">
          <strong>Agent's report</strong>
          <p>{plainText(event.summary)}</p>
        </div>
      );
    case 'error':
      return (
        <Alert title={event.title}>
          <p>{event.detail}</p>
        </Alert>
      );
  }
};
