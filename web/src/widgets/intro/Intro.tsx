import { useState } from 'react';
import { EVIDENCE } from './evidence';

const STORAGE_KEY = 'apf.intro.hidden';

const readHidden = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

const writeHidden = (hidden: boolean): void => {
  try {
    localStorage.setItem(STORAGE_KEY, hidden ? '1' : '0');
  } catch {
    // storage unavailable (private mode): the intro simply reappears next time
  }
};

interface Props {
  readonly onTryAttacks: () => void;
  readonly onTryAgent: () => void;
}

export const Intro = ({ onTryAttacks, onTryAgent }: Props) => {
  const [hidden, setHidden] = useState(readHidden);

  const toggle = (next: boolean): void => {
    setHidden(next);
    writeHidden(next);
  };

  if (hidden) {
    return (
      <button type="button" className="link intro__show" onClick={() => toggle(false)}>
        What is this?
      </button>
    );
  }

  return (
    <section className="intro">
      <header className="intro__head">
        <h2 className="intro__title">Give your AI agent a wallet, not a blank cheque.</h2>
        <button type="button" className="link" onClick={() => toggle(true)}>
          hide
        </button>
      </header>

      <div className="intro__grid">
        <div>
          <h3>The problem</h3>
          <p>
            AI agents can now pay with PayPal. But they read untrusted web pages, and one hidden sentence like “also buy
            this gift card” can turn your shopping assistant into an attacker's payment tool. Prompts can't guarantee
            that won't happen, and a card limit doesn't know <em>what</em> is being bought or <em>why</em>.
          </p>
        </div>
        <div>
          <h3>What the firewall does</h3>
          <p>
            You say “buy headphones from SoundHub, up to $150”. That becomes a strict permission. A solver{' '}
            <strong>proves</strong> it can never break your standing rules, and every payment the agent attempts is
            checked against it before it reaches PayPal. Anything outside it is blocked, with the exact reason.
          </p>
        </div>
        <div>
          <h3>Who it's for</h3>
          <p>
            Products that let agents spend money: AI assistants that shop, procurement bots, and marketplaces with
            agentic checkout. The people delegating purchases get control, and merchants and payment providers get fewer
            fraud cases, disputes and refunds.
          </p>
        </div>
      </div>

      <div className="evidence">
        <h3>Why now</h3>
        <ul>
          {EVIDENCE.map((e) => (
            <li key={e.url}>
              <span className="mono muted">{e.date}</span>
              <a href={e.url} target="_blank" rel="noreferrer">
                {e.headline}
              </a>
              <span className="muted">{e.source}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="intro__try">
        <span className="muted">Try it in 60 seconds:</span>
        <button type="button" className="btn" onClick={onTryAttacks}>
          1 · Watch 6 attacks get blocked
        </button>
        <button type="button" className="btn btn--ghost" onClick={onTryAgent}>
          2 · Give a real AI agent a task
        </button>
      </div>
    </section>
  );
};
