import type { AppStateView } from '@server/app/dto';
import type { Guardrails } from '@server/core/types';
import { useCallback, useEffect, useState } from 'react';
import { api, toApiError, type ApiError } from '../../shared/api';
import { Alert, Badge } from '../../shared/ui';
import { ActivityFeed } from '../../widgets/activity/ActivityFeed';
import { AgentRun } from '../../widgets/agent-run/AgentRun';
import { AttackLab } from '../../widgets/attack-lab/AttackLab';
import { GuardrailsPanel } from '../../widgets/guardrails/GuardrailsPanel';
import { Intro } from '../../widgets/intro/Intro';

type Tab = 'activity' | 'agent' | 'attacks';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'activity', label: 'Activity' },
  { id: 'agent', label: 'Try the agent here' },
  { id: 'attacks', label: 'Attack Lab' },
];

export const ConsolePage = () => {
  const [state, setState] = useState<AppStateView | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [tab, setTab] = useState<Tab>('activity');
  const [autoRunAttacks, setAutoRunAttacks] = useState(false);

  const refresh = useCallback(() => {
    api.getState().then(setState, (e: unknown) => setError(toApiError(e)));
  }, []);
  useEffect(refresh, [refresh]);
  // Payments are approved in a PayPal tab; refresh limits and spend when the user comes back.
  useEffect(() => {
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);

  if (error) {
    return (
      <div className="page">
        <Alert title="Can't reach the firewall server">
          <p>{error.detail}</p>
          <p className="muted">Start it with start.command (or npm start) and reload this page.</p>
        </Alert>
      </div>
    );
  }
  if (!state) return <p className="muted page">Loading…</p>;

  const saveGuardrails = async (g: Guardrails): Promise<void> => {
    await api.saveGuardrails(g);
    refresh();
  };
  const resetDay = async (): Promise<void> => {
    await api.resetDay();
    refresh();
  };

  const openTab = (next: Tab): void => {
    setTab(next);
    document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="page">
      <header className="top">
        <div>
          <h1>Agent Payment Firewall</h1>
          <p className="muted">AI agents can shop. They cannot overspend, get phished, or pay the wrong merchant.</p>
        </div>
        <div className="top__badges">
          <Badge tone={state.gatewayMode === 'paypal-sandbox' ? 'ok' : 'warn'}>
            {state.gatewayMode === 'paypal-sandbox' ? 'PayPal: sandbox' : 'PayPal: simulated'}
          </Badge>
          <Badge tone={state.llmAvailable ? 'ok' : 'warn'}>{state.llmAvailable ? 'AI agent: on' : 'AI agent: off'}</Badge>
        </div>
      </header>

      <Intro
        onTryAttacks={() => {
          openTab('attacks');
          setAutoRunAttacks(true);
        }}
        onTryAgent={() => openTab('agent')}
      />

      <div className="layout" id="workspace">
        <aside>
          <GuardrailsPanel
            guardrails={state.guardrails}
            merchants={state.merchants}
            spentTodayCents={state.spentTodayCents}
            onSave={saveGuardrails}
            onResetDay={resetDay}
          />
        </aside>
        <main>
          <nav className="tabs">
            {TABS.map((t) => (
              <button key={t.id} type="button" className={tab === t.id ? 'tab tab--on' : 'tab'} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          {tab === 'activity' && <ActivityFeed products={state.products} onChange={refresh} />}
          {tab === 'agent' && (
            <AgentRun
              llmAvailable={state.llmAvailable}
              merchants={state.merchants}
              products={state.products}
              onStateChanged={refresh}
            />
          )}
          {tab === 'attacks' && (
            <AttackLab
              attacks={state.attacks}
              products={state.products}
              autoRun={autoRunAttacks}
              onAutoRunStarted={() => setAutoRunAttacks(false)}
            />
          )}
        </main>
      </div>
    </div>
  );
};
