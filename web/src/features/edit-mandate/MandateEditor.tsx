import { categoryLabel } from '@server/core/labels';
import { CATEGORIES, type Mandate } from '@server/core/types';
import type { Merchant } from '@server/infra/catalog';
import { useEffect, useState } from 'react';
import { Chips, DollarInput, toggle } from '../../shared/ui';

interface Props {
  readonly mandate: Mandate;
  readonly merchants: readonly Merchant[];
  readonly busy: boolean;
  readonly submitLabel: string;
  readonly onSubmit: (m: Mandate) => void;
}

export const MandateEditor = ({ mandate, merchants, busy, submitLabel, onSubmit }: Props) => {
  const [draft, setDraft] = useState(mandate);
  useEffect(() => setDraft(mandate), [mandate]);

  return (
    <div className="mandate">
      <label className="field">
        <span>What to buy</span>
        <input value={draft.goal} onChange={(e) => setDraft({ ...draft, goal: e.target.value })} />
      </label>
      <div className="row">
        <label className="field">
          <span>Task budget</span>
          <DollarInput cents={draft.budgetCents} onChange={(c) => setDraft({ ...draft, budgetCents: c })} />
        </label>
        <div className="field">
          <span>
            Max per payment{' '}
            <button
              type="button"
              className="link"
              onClick={() =>
                setDraft({ ...draft, maxPerPaymentCents: draft.maxPerPaymentCents === null ? draft.budgetCents : null })
              }
            >
              {draft.maxPerPaymentCents === null ? '(no cap — add)' : '(remove cap)'}
            </button>
          </span>
          {draft.maxPerPaymentCents !== null && (
            <DollarInput
              cents={draft.maxPerPaymentCents}
              onChange={(c) => setDraft({ ...draft, maxPerPaymentCents: c })}
            />
          )}
        </div>
        <label className="field">
          <span>Max items / payment</span>
          <input
            type="number"
            min={1}
            value={draft.maxItems}
            onChange={(e) => setDraft({ ...draft, maxItems: Math.max(1, Math.round(Number(e.target.value))) })}
          />
        </label>
      </div>
      <div className="field">
        <span>Can buy only</span>
        <Chips
          options={CATEGORIES}
          format={categoryLabel}
          selected={draft.allowedCategories}
          onToggle={(c) => setDraft({ ...draft, allowedCategories: toggle(draft.allowedCategories, c) })}
        />
      </div>
      <div className="field">
        <span>
          Only from shops{' '}
          <button
            type="button"
            className="link"
            onClick={() => setDraft({ ...draft, allowedMerchants: draft.allowedMerchants === null ? [] : null })}
          >
            {draft.allowedMerchants === null ? '(any shop — restrict)' : '(allow any shop)'}
          </button>
        </span>
        {draft.allowedMerchants !== null && (
          <Chips
            options={merchants.map((m) => m.id)}
            format={(id) => merchants.find((m) => m.id === id)?.name ?? id}
            selected={draft.allowedMerchants}
            onToggle={(id) => setDraft({ ...draft, allowedMerchants: toggle(draft.allowedMerchants ?? [], id) })}
          />
        )}
      </div>
      <button
        type="button"
        className="btn btn--ghost"
        disabled={busy || draft.allowedCategories.length === 0}
        onClick={() => onSubmit(draft)}
      >
        {submitLabel}
      </button>
    </div>
  );
};
