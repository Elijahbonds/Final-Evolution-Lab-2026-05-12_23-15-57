// lib/results/progressServer — My progress's SAVED numbers, read once on the server (PLAT-P03, 2026-10-28).
//
// READS ONLY. Nothing here writes, and every read fails soft to its empty value (a missing pending table costs its row,
// never the page). The gates are the tools' own, unchanged:
//   · saved jump checks, readiness checks and bar-speed sets: only for an account that may have movement numbers saved
//     (lib/privacy/scanSaveGate.ts canSaveScanNumbers: verified 18+ AND opted in). The jump read also carries the same
//     gate as a relation filter (profile v2's scanSaveUserWhere), so the database returns no row the gate refuses.
//   · combines: the athlete's own rows, exactly as /train/combine reads them (lib/combine/server.ts myCombines; OWN-01:
//     `available: false` until the combine SQL is applied).
// Everyone else gets the empty answer, and their page shows what this phone keeps.
import 'server-only';
import { canSaveScanNumbers, type GateDb } from '@/lib/privacy/scanSaveGate';
import { JUMP_SCAN_KINDS } from '@/lib/profile-v2/load';
import { scanSaveUserWhere } from '@/lib/profile-v2/gate';
import { jumpCmOf } from '@/lib/profile-v2/assemble';
import { checksFor, readinessReady } from '@/lib/coach/readiness/store';
import { setsFor, vbtReady } from '@/lib/vbt/store';
import { myCombines, type CombineDb, type MyCombine } from '@/lib/combine/server';
import type { KeptSet } from '@/lib/vbt/sets';
import type { ReadinessDay } from './progress';

/** How far back the page reads saved rows (days). */
export const PROGRESS_DAYS = 180;
const DAY_MS = 86_400_000;

export interface SavedProgress {
  /** May this account's movement numbers be saved (and so read back)? */
  canSave: boolean;
  jumps: { at: number; cm: number }[];
  readiness: ReadinessDay[];
  sets: KeptSet[];
  combines: { available: boolean; events: MyCombine[] };
}

export const NOTHING_SAVED: SavedProgress = { canSave: false, jumps: [], readiness: [], sets: [], combines: { available: false, events: [] } };

/** The Prisma calls this file makes, structurally (a test's fake fits). */
export type ProgressDb = GateDb & CombineDb & {
  workoutScan: { findMany(a: unknown): Promise<any[]> }; // eslint-disable-line @typescript-eslint/no-explicit-any
};

const soft = <T>(p: Promise<T>, empty: T): Promise<T> => p.catch(() => empty);

export async function loadSavedProgress(db: ProgressDb, userId: string, now: Date = new Date()): Promise<SavedProgress> {
  const nowMs = now.getTime();
  const since = new Date(nowMs - PROGRESS_DAYS * DAY_MS);
  const [canSave, combineRes] = await Promise.all([
    soft(canSaveScanNumbers(db, userId), false),
    soft(myCombines(db, userId, now), { status: 200, body: { available: false, events: [] } }),
  ]);
  const body = combineRes.body as { available?: boolean; events?: MyCombine[] };
  const combines = { available: body.available === true, events: Array.isArray(body.events) ? body.events : [] };
  if (!canSave) return { ...NOTHING_SAVED, combines };

  const [scans, checks, sets] = await Promise.all([
    soft(db.workoutScan.findMany({
      where: { userId, kind: { in: [...JUMP_SCAN_KINDS] }, createdAt: { gte: since }, user: { is: scanSaveUserWhere(now) } },
      orderBy: { createdAt: 'desc' }, take: 300, select: { kind: true, metrics: true, createdAt: true },
    }), [] as { kind: string; metrics: unknown; createdAt: Date }[]),
    soft((async () => ((await readinessReady(db, nowMs)) ? checksFor(db, userId, since, 120, nowMs) : null))(), null),
    soft((async () => ((await vbtReady(db, nowMs)) ? setsFor(db, userId, since, 300, nowMs) : null))(), null),
  ]);
  const jumps = scans.flatMap((s) => {
    const cm = jumpCmOf(s.kind, s.metrics);
    const at = s.createdAt instanceof Date ? s.createdAt.getTime() : Date.parse(String(s.createdAt));
    return cm === null || !Number.isFinite(at) ? [] : [{ at, cm }];
  });
  return {
    canSave, jumps, combines,
    readiness: (checks ?? []).map((c) => ({ day: c.day, bestCm: c.bestCm, band: c.band, belowReal: c.belowReal })),
    sets: (sets ?? []).map(({ id: _i, userId: _u, createdAt: _c, ...s }) => s),
  };
}
