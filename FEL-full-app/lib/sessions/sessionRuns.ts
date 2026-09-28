/**
 * lib/sessions/sessionRuns.ts — ECONOMY-SESSIONS-HARDEN (2026-09-28): the server-issued run behind every paying session.
 *
 *   start   POST /api/sessions/start → startRun(): a SessionRun row, status 'open', the server's startedAt, an expiry of
 *           the mode's maxDurationMs + RUN_GRACE_MS, and payoutEligible decided there (lib/sessions/runEligibility.ts).
 *   finish  POST /api/sessions { runId, … } → the route validates the result against the run (openRun()) and closes it
 *           exactly once: claimRun() is the first write of the paying transaction, a conditional update from 'open' —
 *           a second finish of the same run (a retry, a second tab) waits on the row lock, finds it closed and gets the
 *           stored result back (closeRun()/storedResult()). A closed or expired run never pays again.
 *   ledger  every payout of a run is one SessionGrant row, unique on (userId, runId, grantType), inserted before any
 *           balance moves (fileGrants()), so even a path around the claim cannot write the same grant twice.
 *
 * The run id is the one idempotency key: the wallet rows the run writes are keyed run:<runId>:<grant>.
 */

import type { Prisma, PrismaClient } from '@/public/_prisma/client';
import { canonicalModeKey } from '@/lib/game-data';
import { MAX_DURATION_FLOOR_MS, RUN_GRACE_MS, ruleFor } from './modeScoreRules';
import type { Eligibility } from './runEligibility';

type Db = PrismaClient | Prisma.TransactionClient;

export const RUN_STATUS = { open: 'open', paid: 'paid', recorded: 'recorded', rejected: 'rejected', expired: 'expired' } as const;
export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS];

/** Why a finish was refused before any rule of the mode was read. */
export type RunRefusal = 'RUN_MISSING' | 'RUN_UNKNOWN' | 'RUN_MODE_MISMATCH' | 'RUN_EXPIRED';

/** Every payout a run can make, one ledger row each. */
export const GRANT_TYPES = ['xp', 'shards', 'wallet_lc', 'wallet_coins', 'wallet_shards', 'season_xp', 'mastery', 'prq'] as const;
export type GrantType = (typeof GRANT_TYPES)[number];

/** The wallet idempotency key of one of a run's grants. */
export const runWalletKey = (runId: string, grant: 'lc' | 'coins' | 'won'): string => `run:${runId}:${grant}`;

/** A run id as a client may send it: a short opaque string. Anything else is no run id at all. */
export function readRunId(v: unknown): string | null {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
}

export interface StartedRun {
  runId: string;
  modeSlug: string;
  startedAt: string;
  expiresAt: string;
  payoutEligible: boolean;
  reason: Eligibility['reason'];
}

/** How long an open run of `mode` stays finishable: its maxDurationMs (the floor for a mode with no rule) + the grace. */
export function runLifetimeMs(mode: string): number {
  return (ruleFor(mode)?.maxDurationMs ?? MAX_DURATION_FLOOR_MS) + RUN_GRACE_MS;
}

export async function startRun(db: Db, a: { userId: string; mode: string; eligibility: Eligibility; now?: Date }): Promise<StartedRun> {
  const now = a.now ?? new Date();
  const modeSlug = canonicalModeKey(a.mode);
  // the player's own runs that ran out while nobody finished them close as expired (a lazy sweep: one indexed update)
  await (db as any).sessionRun.updateMany({
    where: { userId: a.userId, status: RUN_STATUS.open, expiresAt: { lt: now } },
    data: { status: RUN_STATUS.expired },
  });
  const run = await (db as any).sessionRun.create({
    data: {
      userId: a.userId, mode: modeSlug, status: RUN_STATUS.open,
      payoutEligible: a.eligibility.payoutEligible, ineligibleReason: a.eligibility.reason,
      startedAt: now, expiresAt: new Date(now.getTime() + runLifetimeMs(modeSlug)),
    },
  });
  return {
    runId: run.id, modeSlug, startedAt: run.startedAt.toISOString(), expiresAt: run.expiresAt.toISOString(),
    payoutEligible: run.payoutEligible, reason: (run.ineligibleReason ?? null) as Eligibility['reason'],
  };
}

export interface RunRow {
  id: string; userId: string; mode: string; status: string; payoutEligible: boolean; ineligibleReason: string | null;
  startedAt: Date; expiresAt: Date; result: unknown;
}

/** What a closed run answered, to be returned verbatim to any later finish of it. */
export interface StoredResult { status: number; body: Record<string, unknown> }

export function storedResult(run: Pick<RunRow, 'result'> | null | undefined): StoredResult | null {
  const r = run?.result as StoredResult | null | undefined;
  return r && typeof r === 'object' && typeof r.status === 'number' && r.body && typeof r.body === 'object' ? r : null;
}

/** The stored answer as a retry gets it: the same payload, `replayed: true`. */
export function replayOf(r: StoredResult): StoredResult {
  return { status: r.status, body: { ...r.body, replayed: true } };
}

export async function findRun(db: Db, runId: string): Promise<RunRow | null> {
  return (await (db as any).sessionRun.findUnique({ where: { id: runId } })) as RunRow | null;
}

/**
 * Close an OPEN run without paying it (recorded / rejected / expired), storing the answer. Conditional on 'open': if
 * another finish closed it first, nothing is written and that finish's stored answer is returned instead (replayed).
 */
export async function closeRun(
  db: Db, runId: string,
  a: { status: Exclude<RunStatus, 'open' | 'paid'>; result: StoredResult; score?: number | null; durationMs?: number | null; rejectReason?: string | null; now?: Date },
): Promise<StoredResult> {
  const res = await (db as any).sessionRun.updateMany({
    where: { id: runId, status: RUN_STATUS.open },
    data: {
      status: a.status, finishedAt: a.now ?? new Date(), result: a.result as any,
      score: a.score ?? null, durationMs: a.durationMs ?? null, rejectReason: a.rejectReason ?? null,
    },
  });
  if (res.count === 1) return a.result;
  const stored = storedResult(await findRun(db, runId));
  return stored ? replayOf(stored) : a.result;
}

/** Thrown inside the paying transaction when the run is no longer open: the transaction rolls back, nothing is paid. */
export class RunClosedError extends Error {
  constructor(public runId: string) { super(`run ${runId} is not open`); this.name = 'RunClosedError'; }
}

/**
 * The paying transaction's FIRST write: 'open' → 'paid', conditional. A concurrent finish of the same run blocks here on
 * the row lock until the first commits, then matches nothing (RunClosedError) and returns the stored result.
 */
export async function claimRun(tx: Prisma.TransactionClient, runId: string, a: { score: number; durationMs: number; now: Date }): Promise<void> {
  const res = await (tx as any).sessionRun.updateMany({
    where: { id: runId, status: RUN_STATUS.open },
    data: { status: RUN_STATUS.paid, finishedAt: a.now, score: a.score, durationMs: a.durationMs },
  });
  if (res.count !== 1) throw new RunClosedError(runId);
}

/**
 * File a run's grants in the ledger — before any balance moves. `amounts` are what is known now; a grant decided later
 * in the transaction (the wallet caps, the season's first-of-day bonus) is filed at 0 and settled with settleGrant().
 */
export async function fileGrants(tx: Prisma.TransactionClient, a: { userId: string; runId: string; amounts: Partial<Record<GrantType, number>> }): Promise<void> {
  const rows = (Object.entries(a.amounts) as Array<[GrantType, number]>).map(([grantType, amount]) => ({
    userId: a.userId, runId: a.runId, grantType, amount: Number.isFinite(amount) ? amount : 0,
  }));
  if (rows.length) await (tx as any).sessionGrant.createMany({ data: rows });
}

export async function settleGrant(tx: Prisma.TransactionClient, a: { userId: string; runId: string; grantType: GrantType; amount: number; metadata?: Record<string, unknown> }): Promise<void> {
  await (tx as any).sessionGrant.update({
    where: { userId_runId_grantType: { userId: a.userId, runId: a.runId, grantType: a.grantType } },
    data: { amount: a.amount, ...(a.metadata ? { metadata: a.metadata as any } : {}) },
  });
}

/** Store the paid run's answer (inside the paying transaction, so a retry after the commit always finds it). */
export async function storePaidResult(tx: Prisma.TransactionClient, runId: string, a: { result: StoredResult; sessionId: string | null }): Promise<void> {
  await (tx as any).sessionRun.update({ where: { id: runId }, data: { result: a.result as any, sessionId: a.sessionId } });
}
