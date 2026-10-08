// The run's own highlights under the score — read from the stats the mode sent with ctx.end (the same keys the proof line
// reads), never computed. Up to three, in the order below; a key the mode did not send is simply absent.

import type { EndRun } from './types';

export interface Highlight { key: string; label: string; value: string }

const ord = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);

/** [stat key, label, how to show it, only when] — first match wins per key. */
const TABLE: readonly [string, string, (n: number, s: Record<string, unknown>) => string, (n: number) => boolean][] = [
  ['place', 'Place', (n, s) => (int(s.field) ? `${ord(n)} of ${int(s.field)}` : ord(n)), (n) => n >= 1],
  ['homers', 'Home runs', (n) => String(n), (n) => n >= 0],
  ['longestFt', 'Longest', (n) => `${n} ft`, (n) => n > 0],
  ['makes', 'Dunks made', (n, s) => (int(s.misses) !== null ? `${n}/${n + int(s.misses)!}` : String(n)), (n) => n >= 0],
  ['bestStreak', 'Best streak', (n) => String(n), (n) => n >= 2],
  ['wave', 'Wave', (n) => String(n), (n) => n >= 1],
  ['kos', 'KOs', (n) => String(n), (n) => n >= 1],
  ['goals', 'Goals', (n) => String(n), (n) => n >= 0],
  ['yards', 'Yards', (n) => String(n), (n) => n > 0],
  ['gatesHit', 'Gates', (n, s) => (int(s.gates) ? `${n}/${int(s.gates)}` : String(n)), (n) => n >= 0],
  ['barrels', 'Barrels', (n) => String(n), (n) => n >= 1],
  ['tricksLanded', 'Tricks', (n) => String(n), (n) => n >= 1],
  ['correct', 'Correct', (n, s) => (int(s.total) ? `${n}/${int(s.total)}` : String(n)), (n) => n >= 0],
  ['perfect', 'Perfects', (n) => String(n), (n) => n >= 1],
  ['bestCombo', 'Best chain', (n) => `×${n}`, (n) => n >= 2],
];

export function highlights(run: Pick<EndRun, 'stats' | 'maxCombo'>, max = 3): Highlight[] {
  const s = (run.stats ?? {}) as Record<string, unknown>;
  const out: Highlight[] = [];
  for (const [key, label, show, when] of TABLE) {
    const n = int(s[key]);
    if (n === null || !when(n)) continue;
    out.push({ key, label, value: show(n, s) });
    if (out.length >= max) return out;
  }
  const combo = int(s.maxCombo) ?? int(run.maxCombo);
  if (combo !== null && combo >= 2 && !out.some((h) => h.key === 'bestCombo')) out.push({ key: 'maxCombo', label: 'Max combo', value: `×${combo}` });
  return out.slice(0, max);
}
