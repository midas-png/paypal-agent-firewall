import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { TaskView } from '../app/dto';
import type { Guardrails } from '../core/types';

/**
 * Durable firewall state. Without it, every server restart (including dev hot-reload)
 * forgot today's spend: a firewall that resets its limits on restart is not a firewall.
 */
export interface PersistedState {
  readonly version: 1;
  readonly guardrails: Guardrails;
  /** Local calendar day the spend belongs to (YYYY-MM-DD). A new day starts from zero. */
  readonly spend: { readonly day: string; readonly cents: number };
  readonly tasks: readonly TaskView[];
}

export interface StateStore {
  load(): PersistedState | null;
  save(state: PersistedState): void;
}

const isPersistedState = (value: unknown): value is PersistedState =>
  typeof value === 'object' && value !== null && 'version' in value && value.version === 1;

/** JSON file store. Writes go to a temp file first so a crash mid-write can't corrupt the state. */
export const createFileStateStore = (path: string): StateStore => ({
  load() {
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
      return isPersistedState(parsed) ? parsed : null;
    } catch {
      return null; // first run, or unreadable file: start fresh
    }
  },
  save(state) {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    renameSync(tmp, path);
  },
});
