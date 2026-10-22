import { formatCents } from '@server/core/money';
import { CATEGORIES, type Guardrails } from '@server/core/types';
import type { Merchant } from '@server/infra/catalog';
import { useEffect, useState } from 'react';
import { Chips, DollarInput, Panel, toggle } from '../../shared/ui';

interface Props {
  readonly guardrails: Guardrails;
  readonly merchants: readonly Merchant[];
  readonly spentTodayCents: number;
  readonly onSave: (g: Guardrails) => Promise<void>;
  readonly onResetDay: () => Promise<void>;
}

export const GuardrailsPanel = ({ guardrails, merchants, spentTodayCents, onSave, onResetDay }: Props) => {
  const [draft, setDraft] = useState(guardrails);
  useEffect(() => setDraft(guardrails), [guardrails]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(guardrails);
  const usedPct = Math.min(100, (spentTodayCents / Math.max(1, guardrails.dailyLimitCents)) * 100);

  return (
    <Panel title="Guardrails" aside={<span className="muted">set by you, never by the agent</span>}>
      <div className="meter">
        <div className="meter__label">
          <span>Spent today</span>
          <span className="mono">
            {formatCents(spentTodayCents)} / {formatCents(guardrails.dailyLimitCents)}
          </span>
        </div>
        <div className="meter__track">
          <div className="meter__fill" style={{ width: `${usedPct}%` }} />
        </div>
        <div className="meter__foot">
          <span className="muted">Counts every payment the firewall allowed, including ones awaiting PayPal approval.</span>
          <button type="button" className="link" onClick={() => void onResetDay()}>
            reset day
          </button>
        </div>
      </div>

      <label className="field">
        <span>Max per payment</span>
        <DollarInput cents={draft.maxPerPaymentCents} onChange={(c) => setDraft({ ...draft, maxPerPaymentCents: c })} />
      </label>
      <label className="field">
        <span>Daily limit</span>
        <DollarInput cents={draft.dailyLimitCents} onChange={(c) => setDraft({ ...draft, dailyLimitCents: c })} />
      </label>

      <div className="field">
        <span>Blocked categories</span>
        <Chips
          tone="bad"
          options={CATEGORIES}
          selected={draft.blockedCategories}
          onToggle={(c) => setDraft({ ...draft, blockedCategories: toggle(draft.blockedCategories, c) })}
        />
      </div>

      <div className="field">
        <span>
          Merchant allowlist{' '}
          <button
            type="button"
            className="link"
            onClick={() => setDraft({ ...draft, allowedMerchants: draft.allowedMerchants === null ? [] : null })}
          >
            {draft.allowedMerchants === null ? '(any — restrict)' : '(allow any)'}
          </button>
        </span>
        {draft.allowedMerchants !== null && (
          <Chips
            options={merchants.map((m) => m.id)}
            selected={draft.allowedMerchants}
            onToggle={(id) => setDraft({ ...draft, allowedMerchants: toggle(draft.allowedMerchants ?? [], id) })}
          />
        )}
      </div>

      <button type="button" className="btn" disabled={!dirty} onClick={() => void onSave(draft)}>
        Save guardrails
      </button>
    </Panel>
  );
};
