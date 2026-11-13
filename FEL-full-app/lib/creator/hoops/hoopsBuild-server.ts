// THE HOOPS BUILD, READ AND WRITTEN (lane/hoops-builder, owner 2026-11-12). The decisions are in hoopsBuild.ts (pure); this file
// only reads the athlete's row and runs, and writes `build.hoops` back.
//
// IT WRITES ONE KEY. `AthleteBuild.build.hoops`, merged into whatever the build already holds, and nothing else: never the prq
// column (a movement snapshot, gated by lib/privacy/scanSaveGate.ts), never `finalizedAt`, never the rest of the build. A player who
// has never opened the Creator gets a row holding only `hoops`, which every reader of the build already tolerates (saveBuild.ts
// fromStorage, the hero-body route, the palette read).
//
// TWO WRITERS, ONE ROW. Points are claimed on a read and spent on a save, and two tabs can do either at once. So a write only lands
// on the row it read (`updatedAt` unchanged), and on a miss it reads again and re-applies — up to WRITE_TRIES times. The points
// ledger is folded from the runs every time, so a retry can never pay a run twice: a run after `through` is either in the ledger
// the retry read, or it is counted now.

import type { PrqAxisId } from '../schema/types';
import {
  HOOPS_POINT_MODES, accrue, applyChoice, countFrom, readHoopsBuild,
  type HoopsBuild, type HoopsChoice, type HoopsIssue, type HoopsRun,
} from './hoopsBuild';

/** The few Prisma calls this needs. Structural, so a test can hand in a fake. */
export interface HoopsDb {
  athleteBuild: {
    findUnique(args: { where: { userId: string }; select: { build: true; updatedAt: true } }): Promise<{ build: unknown; updatedAt: Date } | null>;
    updateMany(args: { where: { userId: string; updatedAt: Date }; data: { build: object } }): Promise<{ count: number }>;
    create(args: { data: { userId: string; build: object } }): Promise<unknown>;
  };
  sessionRun: {
    findMany(args: {
      where: Record<string, unknown>;
      orderBy: { finishedAt: 'asc' };
      take: number;
      select: { finishedAt: true; durationMs: true; result: true };
    }): Promise<Array<{ finishedAt: Date | null; durationMs: number | null; result: unknown }>>;
  };
}

export const WRITE_TRIES = 3;
/** Runs read per claim. A day pays at most POINTS_DAY_CAP, so this is far more than one claim can ever use. */
export const RUNS_PER_CLAIM = 200;

/** Was the run won? The finish stored its own response (SessionRun.result: { status, body: { won } }). */
export function runWon(result: unknown): boolean {
  const body = (result as { body?: { won?: unknown } } | null)?.body;
  return body?.won === true;
}

/** The finished, payout-eligible hoops runs after `from`. */
export async function hoopsRunsSince(db: HoopsDb, userId: string, from: Date): Promise<HoopsRun[]> {
  const rows = await db.sessionRun.findMany({
    where: {
      userId,
      mode: { in: [...HOOPS_POINT_MODES] },
      status: { in: ['paid', 'recorded'] },
      payoutEligible: true,
      agentRun: false,
      finishedAt: { gt: from },
    },
    orderBy: { finishedAt: 'asc' },
    take: RUNS_PER_CLAIM,
    select: { finishedAt: true, durationMs: true, result: true },
  });
  return rows.filter((r) => r.finishedAt).map((r) => ({ finishedAt: r.finishedAt as Date, durationMs: r.durationMs, won: runWon(r.result) }));
}

const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {});

/** Write `hoops` into the row as read. False when somebody else wrote the row first. */
async function writeHoops(db: HoopsDb, userId: string, row: { build: unknown; updatedAt: Date } | null, hoops: HoopsBuild): Promise<boolean> {
  if (row) {
    const r = await db.athleteBuild.updateMany({ where: { userId, updatedAt: row.updatedAt }, data: { build: { ...asObject(row.build), hoops } } });
    return r.count === 1;
  }
  try {
    await db.athleteBuild.create({ data: { userId, build: { hoops } } });
    return true;
  } catch (e) {
    if ((e as { code?: unknown })?.code === 'P2002') return false;   // a row appeared since the read: read again
    throw e;
  }
}

export interface HoopsLoad {
  build: HoopsBuild;
  /** Points claimed by this read. */
  gained: number;
  /** The stored part is from a newer version: shown, never written over. */
  fromFuture: boolean;
}

/** Read the hoops build and claim the points every finished game since the last claim earned. */
export async function loadHoops(db: HoopsDb, userId: string, now: Date = new Date()): Promise<HoopsLoad> {
  for (let i = 0; i < WRITE_TRIES; i++) {
    const row = await db.athleteBuild.findUnique({ where: { userId }, select: { build: true, updatedAt: true } });
    const { build, fromFuture } = readHoopsBuild(asObject(row?.build).hoops);
    const runs = await hoopsRunsSince(db, userId, countFrom(build.points, now));
    const { points, gained } = accrue(build.points, runs, now);
    const next = { ...build, points };
    // nothing new (and a ledger already started): no write, so a plain visit does not touch the row
    if (fromFuture || (gained === 0 && build.points.through !== null && points.through === build.points.through)) return { build: next, gained: 0, fromFuture };
    if (await writeHoops(db, userId, row, next)) return { build: next, gained, fromFuture };
  }
  throw new Error('hoops_build_busy');
}

export type SaveResult =
  | { ok: true; build: HoopsBuild }
  | { ok: false; status: 409 | 422; issues: HoopsIssue[] };

/** Claim what is owed, then apply the player's choice (position, height, steps) if the server agrees it is legal. */
export async function saveHoops(db: HoopsDb, userId: string, choice: HoopsChoice, prq: Partial<Record<PrqAxisId, number>> | null, now: Date = new Date()): Promise<SaveResult> {
  for (let i = 0; i < WRITE_TRIES; i++) {
    const row = await db.athleteBuild.findUnique({ where: { userId }, select: { build: true, updatedAt: true } });
    const { build, fromFuture } = readHoopsBuild(asObject(row?.build).hoops);
    if (fromFuture) return { ok: false, status: 409, issues: [{ field: 'points', message: 'Your ratings were saved by a newer version of the app. Reload to change them.' }] };
    const runs = await hoopsRunsSince(db, userId, countFrom(build.points, now));
    const claimed = { ...build, points: accrue(build.points, runs, now).points };
    const r = applyChoice(claimed, choice, prq);
    if (!r.ok) return { ok: false, status: 422, issues: r.issues };
    if (await writeHoops(db, userId, row, r.build)) return { ok: true, build: r.build };
  }
  throw new Error('hoops_build_busy');
}
