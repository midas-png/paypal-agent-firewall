import type { AttackRunView, AttackScenarioView } from '@server/app/dto';
import type { Product } from '@server/infra/catalog';
import { useState } from 'react';
import { OutcomeCard } from '../../entities/outcome/OutcomeCard';
import { ProofBanner } from '../../entities/proof/ProofBanner';
import { api } from '../../shared/api';
import { Badge, Panel } from '../../shared/ui';

interface Props {
  readonly attacks: readonly AttackScenarioView[];
  readonly products: readonly Product[];
}

const verdictOf = (run: AttackRunView): { tone: 'ok' | 'bad'; label: string } => {
  const statuses = run.task.outcomes.map((o) => o.status);
  const expectAllowed = run.scenario.id === 'baseline';
  if (expectAllowed) return statuses.every((s) => s === 'approved') ? { tone: 'ok', label: 'allowed' } : { tone: 'bad', label: 'false positive' };
  return statuses.some((s) => s !== 'approved') ? { tone: 'ok', label: 'attack stopped' } : { tone: 'bad', label: 'attack passed' };
};

export const AttackLab = ({ attacks, products }: Props) => {
  const [runs, setRuns] = useState<Record<string, AttackRunView>>({});
  const [busy, setBusy] = useState(false);

  const run = async (ids: readonly string[]): Promise<void> => {
    setBusy(true);
    try {
      for (const id of ids) {
        const result = await api.runAttack(id);
        setRuns((prev) => ({ ...prev, [id]: result }));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Attack Lab"
      aside={
        <button type="button" className="btn" disabled={busy} onClick={() => void run(attacks.map((a) => a.id))}>
          Run all
        </button>
      }
    >
      <p className="muted">
        Replays what a compromised agent would try under the mandate “headphones from SoundHub, up to $150”, against your
        current guardrails. Runs in an isolated dry-run sandbox: no money moves.
      </p>
      <div className="attacks">
        {attacks.map((a) => {
          const result = runs[a.id];
          const verdict = result && verdictOf(result);
          return (
            <article key={a.id} className="attack">
              <header className="attack__head">
                <div>
                  <h3>{a.title}</h3>
                  <p className="muted">{a.description}</p>
                </div>
                <div className="attack__actions">
                  {verdict && <Badge tone={verdict.tone}>{verdict.label}</Badge>}
                  <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void run([a.id])}>
                    Run
                  </button>
                </div>
              </header>
              {result && result.task.proof.status !== 'proven' && <ProofBanner proof={result.task.proof} suggestions={result.task.suggestions} />}
              {result?.task.outcomes.map((o, i) => <OutcomeCard key={i} outcome={o} products={products} />)}
            </article>
          );
        })}
      </div>
    </Panel>
  );
};
