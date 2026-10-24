// CHALLENGES-2: referral Lab Credits for both players (owner, 2026-10-22), paid when the invited friend finishes week 1.
//
// WHO REFERRED WHOM. The existing referral record, ReferralConversion (one row per referred account, unique
// referredUserId; lib/marketing/referral.ts). A signup through ?ref= already writes one. A challenge writes one here,
// from evidence the database already holds: the friend's guest rows were migrated to their new account
// (GuestSession.migratedUserId, set by app/api/signup) and carry a result on a challenge someone else minted, played
// BEFORE the account existed. The challenge's owner is the referrer. No schema change; the signup route is not edited.
// A challenge referral pays no signup shards (REFERRAL_BONUS is the ?ref= flow's, unchanged): it pays at week one.
//
// FINISHES WEEK 1. assumption: (new) the friend played or trained on WEEK_ONE_ACTIVE_DAYS different days inside the 7
// days after signing up, and those 7 days are over. "Played or trained" = a saved GameSession or MirrorSession; days are
// America/Los_Angeles calendar days, the wallet's day (lib/wallet/dailyKey.ts ptDay). Nothing is paid before the 7th
// day ends, and a week with fewer active days never pays (it does not roll over).
//
// EXACTLY ONCE. Both players' credits are two ledger rows written in ONE transaction, each under an idempotency key that
// names only the referred account (referral-week1:<friendId>:referrer / :friend). WalletLedgerEntry.idempotencyKey is
// unique, so two requests at the same moment cannot both commit: the loser's insert fails, its whole transaction rolls
// back (the balance moves with it), and it answers 'already'. Same shape as the streak-claim fix (#277/#292): the claim
// is made inside the paying transaction, and only the winner pays. The amount is the REFERRAL_WEEK_ONE reward rule
// (lib/wallet/reward-rules.ts, editable live), each player.

import { applyLc, resolveRule, type ApplyLcArgs } from '@/lib/wallet/wallet-service';
import { DEFAULT_REWARD_RULES, REASON, computeGrant } from '@/lib/wallet/reward-rules';
import { ptDay } from '@/lib/wallet/dailyKey';
import { ensureReferralCode } from '@/lib/marketing/referral';
import { recordServerEvent } from '@/lib/analytics-server';
import { carriedResults } from './challenge-guest';

/** The first week, from the account's creation. */
export const WEEK_ONE_MS = 7 * 24 * 60 * 60 * 1000;
/** (new) Active days inside week one that count as finishing it. assumption: 3. Owner's number. */
export const WEEK_ONE_ACTIVE_DAYS = 3;
/** Rows read per table for the week's activity (a week, not a history). */
const ACTIVITY_CAP = 300;
/** How many of a referrer's friends one call checks (most recent first). */
export const REFERRER_CHECK_CAP = 20;
/** (new) How far back a referrer's check looks for their challenges a friend played as a guest and then signed up from. */
export const REFERRER_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
/** Challenges a referrer's check reads at most. */
const REFERRER_LINKS_CAP = 30;

export type ReferralSide = 'referrer' | 'friend';
export const weekOneKey = (referredUserId: string, side: ReferralSide) => `referral-week1:${referredUserId}:${side}`;

export type WeekOneVerdict = 'not_yet' | 'qualified' | 'missed';

/** Distinct PT days among `stamps` inside week one of an account created at `createdAt`. Pure. */
export function weekOneDays(stamps: Date[], createdAt: Date): number {
  const from = createdAt.getTime();
  const to = from + WEEK_ONE_MS;
  const days = new Set<string>();
  for (const s of stamps) {
    const at = s.getTime();
    if (at >= from && at < to) days.add(ptDay(s));
  }
  return days.size;
}

/** Pure: has the friend finished week one? Not before the 7 days are over, whatever the count. */
export function weekOneVerdict(createdAt: Date, activeDays: number, now: Date): WeekOneVerdict {
  if (now.getTime() < createdAt.getTime() + WEEK_ONE_MS) return 'not_yet';
  return activeDays >= WEEK_ONE_ACTIVE_DAYS ? 'qualified' : 'missed';
}

type Row = Record<string, any>;
/** Structural: only the calls this file makes, so the route's prisma and a test's stand-in both fit. */
export interface ReferralDb {
  user: { findUnique(a: unknown): Promise<Row | null> };
  referralCode: { findUnique(a: unknown): Promise<Row | null>; create(a: unknown): Promise<Row>; update(a: unknown): Promise<Row> };
  referralConversion: { findUnique(a: unknown): Promise<Row | null>; findMany(a: unknown): Promise<Row[]>; create(a: unknown): Promise<Row> };
  challengeLink: { findUnique(a: unknown): Promise<Row | null>; findMany(a: unknown): Promise<Row[]>; update(a: unknown): Promise<Row> };
  guestSession: { findMany(a: unknown): Promise<any[]> };
  gameSession: { findMany(a: unknown): Promise<Row[]> };
  mirrorSession: { findMany(a: unknown): Promise<Row[]> };
  walletLedgerEntry: { findUnique(a: unknown): Promise<Row | null> };
  rewardRule: { findUnique(a: unknown): Promise<Row | null> };
  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
}

export interface ReferralDeps {
  /** The Lab Credits mover (wallet-service applyLc); a test may stand in for it. */
  applyLc: (tx: any, a: ApplyLcArgs) => Promise<{ replayed: boolean; delta: number }>;
  now: () => Date;
}
const DEFAULT_DEPS: ReferralDeps = { applyLc: (tx, a) => applyLc(tx, a), now: () => new Date() };

const isUnique = (e: unknown) => (e as { code?: string } | null)?.code === 'P2002';

/**
 * The account's referrer, attributing a challenge referral first if there is none yet. Returns null when nobody
 * referred them. Never throws on a lost race: the unique referredUserId makes the first writer the record.
 */
export async function attributeChallengeReferral(db: ReferralDb, userId: string): Promise<{ referrerId: string; via: 'existing' | 'challenge'; code?: string } | null> {
  const existing = await db.referralConversion.findUnique({ where: { referredUserId: userId } });
  if (existing) return { referrerId: existing.referrerId, via: 'existing' };
  const user = await db.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
  if (!user?.createdAt) return null;
  const joined = new Date(user.createdAt).getTime();
  // played as a guest, on a guest row that existed before the account, before the account existed: the invite came first
  const before = (await carriedResults(db as never, userId))
    .filter((r) => r.at < joined && r.guestSince < joined)
    .sort((a, b) => a.at - b.at);
  for (const r of before) {
    const link = await db.challengeLink.findUnique({ where: { code: r.code }, select: { ownerUserId: true } });
    const referrerId = link?.ownerUserId;
    if (!referrerId || referrerId === userId) continue;
    await ensureReferralCode(db as never, referrerId);
    const rc = await db.referralCode.findUnique({ where: { userId: referrerId } });
    if (!rc) continue;
    try {
      await db.referralConversion.create({ data: { codeId: rc.id, referrerId, referredUserId: userId, shardsAwarded: 0 } });
    } catch (e) {
      if (!isUnique(e)) throw e;
      const won = await db.referralConversion.findUnique({ where: { referredUserId: userId } });
      return won ? { referrerId: won.referrerId, via: 'existing' } : null;
    }
    await db.referralCode.update({ where: { id: rc.id }, data: { signups: { increment: 1 } } }).catch(() => {});
    await db.challengeLink.update({ where: { code: r.code }, data: { signups: { increment: 1 } } }).catch(() => {});
    await recordServerEvent({ name: 'challenge_referral_attributed', userId, props: { code: r.code } });
    return { referrerId, via: 'challenge', code: r.code };
  }
  return null;
}

async function activeStamps(db: ReferralDb, userId: string, from: Date, to: Date): Promise<Date[]> {
  const where = { userId, createdAt: { gte: from, lt: to } };
  const [games, mirror] = await Promise.all([
    db.gameSession.findMany({ where, select: { createdAt: true }, orderBy: { createdAt: 'asc' }, take: ACTIVITY_CAP }).catch(() => [] as Row[]),
    db.mirrorSession.findMany({ where, select: { createdAt: true }, orderBy: { createdAt: 'asc' }, take: ACTIVITY_CAP }).catch(() => [] as Row[]),
  ]);
  return [...games, ...mirror].map((r) => new Date(r.createdAt));
}

/** What a check did for one referred account. Amounts are each player's, in Lab Credits. */
export type WeekOneResult =
  | { status: 'no_referral' }
  | { status: 'not_yet'; activeDays: number; endsAt: number }
  | { status: 'missed'; activeDays: number }
  | { status: 'already' }
  | { status: 'granted'; amount: number; referrerId: string };

async function bothPaid(db: ReferralDb, referredUserId: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    db.walletLedgerEntry.findUnique({ where: { idempotencyKey: weekOneKey(referredUserId, 'referrer') } }),
    db.walletLedgerEntry.findUnique({ where: { idempotencyKey: weekOneKey(referredUserId, 'friend') } }),
  ]);
  return !!a && !!b;
}

/**
 * Pay the week-one referral credits for one referred account, if they are owed. Exactly once: see the header. Safe to
 * call as often as anyone likes, from any request, concurrently.
 */
export async function grantWeekOne(db: ReferralDb, referredUserId: string, deps: Partial<ReferralDeps> = {}): Promise<WeekOneResult> {
  const d = { ...DEFAULT_DEPS, ...deps };
  const ref = await attributeChallengeReferral(db, referredUserId);
  if (!ref) return { status: 'no_referral' };
  const user = await db.user.findUnique({ where: { id: referredUserId }, select: { createdAt: true } });
  if (!user?.createdAt) return { status: 'no_referral' };
  const createdAt = new Date(user.createdAt);
  const now = d.now();
  const activeDays = weekOneDays(await activeStamps(db, referredUserId, createdAt, new Date(createdAt.getTime() + WEEK_ONE_MS)), createdAt);
  const verdict = weekOneVerdict(createdAt, activeDays, now);
  if (verdict === 'not_yet') return { status: 'not_yet', activeDays, endsAt: createdAt.getTime() + WEEK_ONE_MS };
  if (await bothPaid(db, referredUserId)) return { status: 'already' };
  if (verdict === 'missed') return { status: 'missed', activeDays };

  const rule = (await resolveRule(db as never, REASON.REFERRAL_WEEK_ONE).catch(() => null)) ?? DEFAULT_REWARD_RULES[REASON.REFERRAL_WEEK_ONE];
  if (!rule || !rule.active || rule.currency !== 'lc') return { status: 'missed', activeDays };
  const amount = computeGrant(rule, {});
  if (amount <= 0) return { status: 'missed', activeDays };
  const metadata = { referredUserId, referrerId: ref.referrerId, via: ref.via, activeDays };
  try {
    await db.$transaction(async (tx) => {
      // rejectReplay: a key already on the ledger aborts the whole transaction, so neither side is paid twice
      for (const [playerId, side] of [[ref.referrerId, 'referrer'], [referredUserId, 'friend']] as const) {
        const paid = await d.applyLc(tx, {
          playerId, delta: amount, reasonCode: REASON.REFERRAL_WEEK_ONE, source: 'milestone',
          idempotencyKey: weekOneKey(referredUserId, side), metadata: { ...metadata, side }, rejectReplay: true,
        });
        // applyLc answers a key that another writer committed DURING this transaction (its insert lost the unique race)
        // as a replay, after this transaction already moved the balance. Never commit that: abort, and roll it back.
        if (paid.replayed) throw new Error('referral_week1_replayed');
      }
    });
  } catch (e) {
    // lost the race (or a retry): the winner's rows are the record
    if (await bothPaid(db, referredUserId)) return { status: 'already' };
    throw e;
  }
  // telemetry carries no amounts (lib/analytics.ts rule)
  await recordServerEvent({ name: 'referral_week_one_paid', userId: referredUserId, props: { via: ref.via } });
  return { status: 'granted', amount, referrerId: ref.referrerId };
}

/**
 * The checks one signed-in account may run: their own week one (as the friend), and their friends' (as the referrer,
 * the REFERRER_CHECK_CAP most recent). Either player opening the app is enough to settle what is owed to both.
 */
export async function checkReferrals(db: ReferralDb, userId: string, deps: Partial<ReferralDeps> = {}): Promise<{ asFriend: WeekOneResult; asReferrer: WeekOneResult[] }> {
  const now = (deps.now ?? DEFAULT_DEPS.now)();
  const asFriend = await grantWeekOne(db, userId, deps);
  const friends = new Set<string>(
    (await db.referralConversion.findMany({
      where: { referrerId: userId }, orderBy: { createdAt: 'desc' }, take: REFERRER_CHECK_CAP, select: { referredUserId: true },
    })).map((f) => f.referredUserId as string),
  );
  // friends not attributed yet (they have not opened the app since signing up): accounts whose guest rows carried a
  // result on one of this player's recent challenges. One query: jsonb containment on GuestSession.data.challenges.
  if (friends.size < REFERRER_CHECK_CAP) {
    const codes = (await db.challengeLink.findMany({
      where: { ownerUserId: userId, createdAt: { gte: new Date(now.getTime() - REFERRER_LOOKBACK_MS) } },
      orderBy: { createdAt: 'desc' }, take: REFERRER_LINKS_CAP, select: { code: true },
    }).catch(() => [] as Row[])).map((l) => l.code as string);
    if (codes.length) {
      const migrated = await db.guestSession.findMany({
        where: { migratedUserId: { not: null }, OR: codes.map((code) => ({ data: { path: ['challenges'], array_contains: [{ code }] } })) },
        select: { migratedUserId: true }, take: REFERRER_CHECK_CAP,
      }).catch(() => [] as Row[]);
      for (const g of migrated) {
        if (friends.size >= REFERRER_CHECK_CAP) break;
        const friendId = g.migratedUserId as string;
        if (!friendId || friendId === userId || friends.has(friendId)) continue;
        // attribute first: an earlier referrer (a ?ref= sign-up, another challenge) keeps the friend
        const ref = await attributeChallengeReferral(db, friendId);
        if (ref?.referrerId === userId) friends.add(friendId);
      }
    }
  }
  const asReferrer: WeekOneResult[] = [];
  for (const f of friends) asReferrer.push(await grantWeekOne(db, f, deps));
  return { asFriend, asReferrer };
}
