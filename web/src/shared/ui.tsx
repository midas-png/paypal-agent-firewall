import type { ReactNode } from 'react';

export const Panel = ({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) => (
  <section className="panel">
    <header className="panel__head">
      <h2>{title}</h2>
      {aside}
    </header>
    {children}
  </section>
);

export const Badge = ({ tone, children }: { tone: 'ok' | 'bad' | 'warn' | 'muted'; children: ReactNode }) => (
  <span className={`badge badge--${tone}`}>{children}</span>
);

interface ChipsProps<T extends string> {
  readonly options: readonly T[];
  readonly selected: readonly T[];
  readonly onToggle: (value: T) => void;
  readonly tone?: 'ok' | 'bad';
}

export const Chips = <T extends string>({ options, selected, onToggle, tone = 'ok' }: ChipsProps<T>) => (
  <div className="chips">
    {options.map((o) => (
      <button
        key={o}
        type="button"
        className={`chip ${selected.includes(o) ? `chip--on chip--${tone}` : ''}`}
        onClick={() => onToggle(o)}
      >
        {o}
      </button>
    ))}
  </div>
);

export const toggle = <T,>(list: readonly T[], value: T): T[] =>
  list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

export const DollarInput = ({ cents, onChange }: { cents: number; onChange: (cents: number) => void }) => (
  <div className="dollar">
    <span>$</span>
    <input
      type="number"
      min={0}
      step={1}
      value={cents / 100}
      onChange={(e) => onChange(Math.round(Number(e.target.value) * 100))}
    />
  </div>
);

export const Alert = ({
  title,
  children,
  tone = 'bad',
}: {
  title: string;
  children: ReactNode;
  tone?: 'ok' | 'bad' | 'warn';
}) => (
  <div className={`alert alert--${tone}`} role="alert">
    <strong>{title}</strong>
    <div className="alert__body">{children}</div>
  </div>
);
