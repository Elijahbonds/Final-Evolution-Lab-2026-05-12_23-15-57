// lib/coach/formReview/view.ts — COACH-VIDEO-REVIEW (2026-10-24): what the two screens draw from a scored set, kept
// pure so a test reads exactly what the client and the coach are shown. No React here.

import { faultPhrase, type FaultSide, type ReviewMovement } from './movements';
import type { RepFlag, ScoredRep } from './score';

export interface RepChip {
  n: number;
  /** 'clean' (read, no fault), 'flagged', 'minor' (a fault, not flagged), 'unread'. */
  tone: 'clean' | 'flagged' | 'minor' | 'unread';
  score: number | null;
  title: string;
}

/** The rep strip: one chip per counted rep. */
export function repChips(movement: ReviewMovement, reps: readonly ScoredRep[], flags: readonly RepFlag[]): RepChip[] {
  const flagged = new Set(flags.map((f) => f.rep));
  return reps.map((r) => {
    if (r.score === null) return { n: r.n, tone: 'unread', score: null, title: `Rep ${r.n}: not read from this angle` };
    if (!r.faults.length) return { n: r.n, tone: 'clean', score: r.score, title: `Rep ${r.n}: clean` };
    const what = r.faults.map((f) => faultPhrase(movement, f, r.sides[f])).join(', ');
    return { n: r.n, tone: flagged.has(r.n) ? 'flagged' : 'minor', score: r.score, title: `Rep ${r.n}: ${what}` };
  });
}

export interface ReplayPick {
  rep: { n: number; label: string; fault: string | null; side: FaultSide | null };
  best: { n: number; label: string; fault: null; side: null } | null;
}

/**
 * Which rep the replay opens on (the flag asked for, else the worst), and the clean comparison beside it (the best read
 * rep that is not the one shown). Null when nothing was flagged and there is no rep to show.
 */
export function replayPick(reps: readonly ScoredRep[], flags: readonly RepFlag[], focus?: number | null): ReplayPick | null {
  const flag = flags.find((f) => f.rep === focus) ?? flags[0] ?? null;
  const shownN = flag?.rep ?? reps.find((r) => r.score !== null)?.n ?? null;
  if (shownN === null) return null;
  const shown = reps.find((r) => r.n === shownN);
  const best = reps
    .filter((r) => r.score !== null && r.n !== shownN)
    .reduce<ScoredRep | null>((a, b) => (!a || (b.score ?? -1) > (a.score ?? -1) ? b : a), null);
  const fault = flag?.fault ?? null;
  return {
    rep: { n: shownN, label: flag ? `Rep ${shownN} (flagged)` : `Rep ${shownN}`, fault, side: (fault && shown?.sides[fault]) || null },
    best: best ? { n: best.n, label: `Rep ${best.n} (best)`, fault: null, side: null } : null,
  };
}

/** "2 h ago", "3 d ago" — the queue's age line. */
export function ageLabel(iso: string, now: number = Date.now()): string {
  const ms = Math.max(0, now - new Date(iso).getTime());
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}
