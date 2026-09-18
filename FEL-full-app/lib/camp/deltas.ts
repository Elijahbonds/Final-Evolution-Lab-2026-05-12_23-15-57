// Pure delta helpers for the Camp's Shared Profile and session records —
// PRQ deltas between two points in time, numeric-leaf deltas between two
// movement analyses, and the game-session → resiliency outcome mapping. Kept
// free of Prisma so they are unit-tested; profile.ts re-exports them.
import type { SessionOutcome } from './resiliency';

/** Latest value per attribute at or before `at` (null → all time). */
export function latestPerAttribute(entries: { attribute: string; value: number; measuredAt: Date }[], at: Date | null): Record<string, number> {
  const out: Record<string, number> = {};
  const sorted = [...entries].filter((e) => !at || e.measuredAt <= at).sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
  for (const e of sorted) out[e.attribute] = e.value;
  return out;
}

export function prqDelta(before: Record<string, number>, after: Record<string, number>): Record<string, number> {
  const d: Record<string, number> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (k in before && k in after) d[k] = Math.round((after[k] - before[k]) * 100) / 100;
  }
  return d;
}

/** Numeric-leaf delta between two analyses (nested objects walked, flags ignored). */
export function numericDelta(a: unknown, b: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return out;
  const walk = (x: Record<string, unknown>, y: Record<string, unknown>, prefix: string) => {
    for (const k of Object.keys(y)) {
      const va = x[k], vb = y[k];
      if (typeof va === 'number' && typeof vb === 'number') out[prefix + k] = Math.round((vb - va) * 100) / 100;
      else if (va && vb && typeof va === 'object' && typeof vb === 'object') walk(va as Record<string, unknown>, vb as Record<string, unknown>, `${prefix}${k}.`);
    }
  };
  walk(a as Record<string, unknown>, b as Record<string, unknown>, '');
  return out;
}

export function toOutcomes(sessions: { mode: string; won: boolean; createdAt: Date }[]): SessionOutcome[] {
  return sessions.map((s) => ({ at: s.createdAt.getTime(), modeKey: s.mode, outcome: s.won ? 'win' : 'loss' }));
}
