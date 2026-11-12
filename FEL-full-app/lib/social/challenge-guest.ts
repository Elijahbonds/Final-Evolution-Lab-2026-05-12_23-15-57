// CHALLENGES-2: a guest's challenge results, kept where a guest's state already lives, and carried into the account
// that guest signs up as.
//
// Play first (owner, 2026-10-22): a guest plays a challenge with no account. An ADULT guest (the /try rule: the year is
// asked first, and only an adult answer starts a guest row; lib/guestSession.ts) has a GuestSession, and its `data`
// column is the taste-run state that "migrates into the account on claim" (prisma/schema.prisma GuestSession). So the
// result goes there, under `challenges`, beside whatever else the row holds. A teen or a blocked browser has no row:
// its result stays on the page and is never sent.
//
// Carry-over needs no new write at signup: app/api/signup already stamps GuestSession.migratedUserId with the new
// account, so carriedResults() reads every row migrated to an account. No schema change, no edit to the signup route.

import { findGuestSession, type GuestDb } from '@/lib/guestSession';

/** At most this many challenge results on one guest row (the row is a guest's scratch space, not a history). */
export const GUEST_RESULTS_CAP = 20;

export interface GuestChallengeResult {
  code: string;
  modeKey: string;
  /** The guest's best attempt on this challenge. */
  score: number;
  /** The challenge's score. */
  target: number;
  /** When that best attempt was resolved, epoch ms. */
  at: number;
}

export interface GuestDataDb extends GuestDb {
  guestSession: GuestDb['guestSession'] & {
    findUnique(args: any): Promise<any>;
    findMany(args: { where: { migratedUserId: string }; select: { data: true; createdAt: true }; orderBy?: unknown; take?: number }): Promise<{ data: unknown; createdAt: Date }[]>;
  };
}

function resultsIn(data: unknown): GuestChallengeResult[] {
  const list = (data && typeof data === 'object' ? (data as { challenges?: unknown }).challenges : null) ?? [];
  if (!Array.isArray(list)) return [];
  return list.filter((r): r is GuestChallengeResult =>
    !!r && typeof r === 'object'
    && typeof (r as GuestChallengeResult).code === 'string'
    && typeof (r as GuestChallengeResult).modeKey === 'string'
    && [(r as GuestChallengeResult).score, (r as GuestChallengeResult).target, (r as GuestChallengeResult).at].every((n) => typeof n === 'number' && Number.isFinite(n)));
}

/** The list with `r` merged in: one entry per code, the better score kept, newest first, capped. Pure. */
export function mergeResult(list: GuestChallengeResult[], r: GuestChallengeResult): GuestChallengeResult[] {
  const prior = list.find((e) => e.code === r.code);
  const keep = prior && prior.score >= r.score ? prior : r;
  return [keep, ...list.filter((e) => e.code !== r.code)].sort((a, b) => b.at - a.at).slice(0, GUEST_RESULTS_CAP);
}

/**
 * Save a guest's result on their GuestSession row. Nothing for a missing row or one already claimed by an account (that
 * guest signed up: their attempts are the account's now). Best effort: a failure here never fails the attempt.
 */
export async function recordGuestResult(db: GuestDataDb, guestHash: string, r: GuestChallengeResult): Promise<boolean> {
  try {
    const found = await findGuestSession(db, guestHash);
    if (!found || found.migratedUserId) return false;
    const row = await db.guestSession.findUnique({ where: { id: found.id }, select: { data: true } });
    const data = row?.data && typeof row.data === 'object' && !Array.isArray(row.data) ? (row.data as Record<string, unknown>) : {};
    const challenges = mergeResult(resultsIn(data), r);
    await db.guestSession.update({ where: { id: found.id }, data: { data: { ...data, challenges }, lastSeenAt: new Date() } });
    return true;
  } catch (e) {
    console.warn('[challenge] guest result not saved', (e as { code?: string })?.code ?? (e as Error)?.name);
    return false;
  }
}

export interface CarriedResult extends GuestChallengeResult {
  /** When the guest row was created: the guest existed before the account did. */
  guestSince: number;
}

/** Every challenge result the guest rows migrated to this account carried, newest first. */
export async function carriedResults(db: Pick<GuestDataDb, 'guestSession'>, userId: string): Promise<CarriedResult[]> {
  let rows: { data: unknown; createdAt: Date }[] = [];
  try {
    rows = await db.guestSession.findMany({ where: { migratedUserId: userId }, select: { data: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 5 });
  } catch {
    return [];
  }
  const out: CarriedResult[] = [];
  for (const row of rows) for (const r of resultsIn(row.data)) out.push({ ...r, guestSince: row.createdAt.getTime() });
  return out.sort((a, b) => b.at - a.at);
}

/** This account's carried result on one challenge, or null. */
export async function carriedResultFor(db: Pick<GuestDataDb, 'guestSession'>, userId: string, code: string): Promise<CarriedResult | null> {
  return (await carriedResults(db, userId)).find((r) => r.code === code) ?? null;
}
