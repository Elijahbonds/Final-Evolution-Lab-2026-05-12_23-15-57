// CHALLENGES-2: a challenge on a real training rep, "where it is measured" (owner, 2026-10-22).
//
// The number is never typed and never sent by the page. The SERVER reads it from the player's own saved Mirror rows,
// with the rules that already decide who has saved rows:
//   · Only an account that may have movement numbers saved (lib/privacy/scanSaveGate.ts canSaveScanNumbers: verified
//     18+ AND opted in) has a number on the server. Everyone else (under 18, no birth year, not opted in, a guest) keeps
//     their numbers on the phone (owner decision 1, 2026-10-07), so they cannot mint or settle a rep challenge, and this
//     reads nothing for them.
//   · jump: the best saved jump (WorkoutScan; the same kinds and cm reader as profile v2: lib/profile-v2/load.ts
//     JUMP_SCAN_KINDS, lib/profile-v2/assemble.ts jumpCmOf), in tenths of an inch.
//   · form: the best clean-rep share of a saved Mirror squat or lunge set (lib/mirror/progressReading.ts valueFromRow),
//     in percent. Defined, but NOT open for challenges: progressReading's own rule is "a comparison, never a score:
//     nothing here pays, ranks…", and a head-to-head ranks. REP_CHALLENGE_METRICS holds it back until the owner says.
// The window: to mint, the last 7 days (your recent best); to answer, measured after the challenge was sent and before it
// closed, so an old jump cannot answer a new challenge.

import { canSaveScanNumbers, type GateDb } from '@/lib/privacy/scanSaveGate';
import { JUMP_SCAN_KINDS } from '@/lib/profile-v2/load';
import { jumpCmOf } from '@/lib/profile-v2/assemble';
import { valueFromRow } from '@/lib/mirror/progressReading';
import type { RepMetric } from './challenge-terms';

/** The rep metrics a challenge may be minted on. 'form' is held back (see the header): owner call, one line. */
export const REP_CHALLENGE_METRICS: readonly RepMetric[] = ['jump'];
/** How far back a mint looks for the minter's best (the profile's rolling week). */
export const REP_MINT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Rows read at most per measurement (profile v2 reads 300 for a whole profile). */
const READ_CAP = 100;

export interface RepDb extends GateDb {
  workoutScan: { findMany(a: unknown): Promise<{ kind: string; metrics: unknown; createdAt: Date }[]> };
  mirrorSession: { findMany(a: unknown): Promise<{ patternId: string; reps: number | null; faultCounts: unknown; createdAt: Date }[]> };
}

export type RepReading =
  | { ok: true; score: number; at: number }
  | { ok: false; error: 'adults_only' | 'measure_first' | 'metric_closed' };

/** The jump as a challenge score: tenths of an inch, rounded. */
export const jumpScore = (cm: number) => Math.round((cm / 2.54) * 10);

/**
 * The player's best measured `metric` in [from, to). `ok: false` says why there is none: not someone whose numbers are
 * saved (adults_only), nothing measured in the window (measure_first), or a metric challenges are not open on.
 */
export async function measuredRepScore(db: RepDb, userId: string, metric: RepMetric, from: Date, to: Date): Promise<RepReading> {
  if (!REP_CHALLENGE_METRICS.includes(metric)) return { ok: false, error: 'metric_closed' };
  if (!(await canSaveScanNumbers(db, userId))) return { ok: false, error: 'adults_only' };
  return bestMeasured(db, userId, metric, from, to);
}

/** The best saved reading in [from, to), with no gate: callers gate first (measuredRepScore). */
export async function bestMeasured(db: Pick<RepDb, 'workoutScan' | 'mirrorSession'>, userId: string, metric: RepMetric, from: Date, to: Date): Promise<RepReading> {
  const createdAt = { gte: from, lt: to };
  if (metric === 'jump') {
    const rows = await db.workoutScan.findMany({
      where: { userId, kind: { in: [...JUMP_SCAN_KINDS] }, createdAt },
      orderBy: { createdAt: 'desc' }, take: READ_CAP, select: { kind: true, metrics: true, createdAt: true },
    });
    let best: { score: number; at: number } | null = null;
    for (const r of rows) {
      const cm = jumpCmOf(r.kind, r.metrics);
      if (cm === null) continue;
      const score = jumpScore(cm);
      if (!best || score > best.score) best = { score, at: r.createdAt.getTime() };
    }
    return best ? { ok: true, ...best } : { ok: false, error: 'measure_first' };
  }
  const rows = await db.mirrorSession.findMany({
    where: { userId, patternId: { in: ['squat', 'lunge'] }, createdAt },
    orderBy: { createdAt: 'desc' }, take: READ_CAP, select: { patternId: true, reps: true, faultCounts: true, createdAt: true },
  });
  let best: { score: number; at: number } | null = null;
  for (const r of rows) {
    const v = valueFromRow(r);
    if (v === null) continue;
    const score = Math.round(v * 100);
    if (!best || score > best.score) best = { score, at: r.createdAt.getTime() };
  }
  return best ? { ok: true, ...best } : { ok: false, error: 'measure_first' };
}
