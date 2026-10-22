import type { TaskView } from '@server/app/dto';
import { categoryList } from '@server/core/labels';
import { formatCents } from '@server/core/money';
import type { Product } from '@server/infra/catalog';
import { useEffect, useState } from 'react';
import { OutcomeCard } from '../../entities/outcome/OutcomeCard';
import { api, toApiError, type ApiError } from '../../shared/api';
import { Alert, Badge, Panel } from '../../shared/ui';

const POLL_MS = 3000;

const ORIGIN_LABEL: Record<TaskView['origin'], string> = { mcp: 'AI assistant (MCP)', console: 'this console' };

const permissionSummary = (t: TaskView): string => {
  const m = t.mandate;
  return [
    `up to ${formatCents(m.budgetCents)}`,
    categoryList(m.allowedCategories),
    m.allowedMerchants === null ? 'any shop' : m.allowedMerchants.join(', '),
  ].join(' · ');
};

const time = (iso: string): string => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Live feed of what agents asked for and what the firewall decided. Polls while the tab is visible. */
export const ActivityFeed = ({ products, onChange }: { products: readonly Product[]; onChange: () => void }) => {
  const [tasks, setTasks] = useState<readonly TaskView[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let lastSnapshot = '';
    const load = () => {
      if (document.hidden) return;
      api.listTasks().then(
        (next) => {
          const snapshot = JSON.stringify(next);
          if (snapshot === lastSnapshot) return; // avoid re-rendering an unchanged feed
          lastSnapshot = snapshot;
          setTasks(next);
          setError(null);
          onChange();
        },
        (e: unknown) => setError(toApiError(e)),
      );
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(timer);
  }, [onChange]);

  return (
    <Panel title="Activity" aside={<span className="muted">updates live</span>}>
      {error && (
        <Alert title={error.title}>
          <p>{error.detail}</p>
        </Alert>
      )}
      {tasks?.length === 0 && <ConnectHint />}
      <div className="activity">
        {tasks?.map((t) => (
          <article key={t.id} className="activity__task">
            <header className="activity__head">
              <div>
                <strong>“{t.prompt}”</strong>
                <p className="muted">
                  {time(t.createdAt)} · from {ORIGIN_LABEL[t.origin]} · {permissionSummary(t)}
                </p>
              </div>
              <Badge tone={t.proof.status === 'proven' ? 'ok' : 'bad'}>
                {t.proof.status === 'proven' ? 'permission safe' : 'permission refused'}
              </Badge>
            </header>
            {t.outcomes.length === 0 && <p className="muted">No payments attempted yet.</p>}
            {t.outcomes.map((o, i) => (
              <OutcomeCard key={i} outcome={o} products={products} />
            ))}
          </article>
        ))}
      </div>
      {tasks !== null && tasks.length > 0 && <ConnectHint compact />}
    </Panel>
  );
};

const ConnectHint = ({ compact = false }: { compact?: boolean }) => (
  <div className={compact ? 'connect connect--compact' : 'connect'}>
    <strong>Use it from Claude Desktop</strong>
    <p className="muted">
      Shop by chatting with your usual assistant; every payment it tries shows up here. In the project folder run{' '}
      <code>npm run mcp:config</code>, paste the printed entry into Claude Desktop → Settings → Developer → Edit Config,
      and restart Claude.
    </p>
  </div>
);
