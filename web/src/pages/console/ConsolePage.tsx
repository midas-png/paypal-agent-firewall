import type { AppStateView } from '@server/app/dto';
import type { Guardrails } from '@server/core/types';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../shared/api';
import { Badge } from '../../shared/ui';
import { AgentRun } from '../../widgets/agent-run/AgentRun';
import { AttackLab } from '../../widgets/attack-lab/AttackLab';
import { GuardrailsPanel } from '../../widgets/guardrails/GuardrailsPanel';

type Tab = 'agent' | 'attacks';

export const ConsolePage = () => {
  const [state, setState] = useState<AppStateView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('agent');

  const refresh = useCallback(() => {
    api.getState().then(setState, (e: unknown) => setError(String(e)));
  }, []);
  useEffect(refresh, [refresh]);

  if (error) return <p className="error page">{error}</p>;
  if (!state) return <p className="muted page">Loading…</p>;

  const saveGuardrails = async (g: Guardrails): Promise<void> => {
    await api.saveGuardrails(g);
    refresh();
  };
  const resetDay = async (): Promise<void> => {
    await api.resetDay();
    refresh();
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
            {state.gatewayMode === 'paypal-sandbox' ? 'PayPal sandbox' : 'PayPal dry-run'}
          </Badge>
          <Badge tone={state.llmAvailable ? 'ok' : 'warn'}>{state.llmAvailable ? 'LLM on' : 'LLM off'}</Badge>
        </div>
      </header>

      <div className="layout">
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
            <button type="button" className={tab === 'agent' ? 'tab tab--on' : 'tab'} onClick={() => setTab('agent')}>
              Live agent
            </button>
            <button type="button" className={tab === 'attacks' ? 'tab tab--on' : 'tab'} onClick={() => setTab('attacks')}>
              Attack Lab
            </button>
          </nav>
          {tab === 'agent' ? (
            <AgentRun
              llmAvailable={state.llmAvailable}
              merchants={state.merchants}
              products={state.products}
              onStateChanged={refresh}
            />
          ) : (
            <AttackLab attacks={state.attacks} products={state.products} />
          )}
        </main>
      </div>
    </div>
  );
};
