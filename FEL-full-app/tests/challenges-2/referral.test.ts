// CHALLENGES-2: referral Lab Credits for both players when the invited friend finishes week one — exactly once, never
// twice under two requests at the same moment, never before week one is over. Through the real guest, attempt and signup
// routes (so the referral is attributed from a real carried guest result) and the real wallet mover (applyLc), over the
// in-memory Prisma slice whose transactions are all-or-nothing (tests/helpers/challengeDb.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { challengeDb, type ChallengeDb } from '@/tests/helpers/challengeDb';

const h = vi.hoisted(() => ({
  db: null as unknown as ChallengeDb,
  session: null as null | { user: { id: string } },
  cookies: {} as Record<string, string>,
  events: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : (h.db as any)[p as string]) }) }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (name in h.cookies ? { name, value: h.cookies[name] } : undefined),
    set: (name: string, value: string) => { h.cookies[name] = value; },
  }),
}));
vi.mock('@/lib/analytics-server', () => ({
  recordServerEvent: async (e: Record<string, unknown>) => { h.events.push(e); },
  recordServerEvents: async () => 0,
}));
vi.mock('@/lib/ledger', () => ({ postLc: async () => ({ creditLedgerId: 'cl', transactionId: 'tx' }) }));
vi.mock('@/lib/marketing/email', () => ({ sendWelcomeEmail: () => {}, sendReferralRewardEmail: () => {} }));
vi.mock('bcryptjs', () => ({ default: { hash: async () => 'hashed' } }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ ok: true, retryAfterSec: 0 }), clientKeyFromHeaders: () => '203.0.113.9' }));

import { POST as mintPOST } from '@/app/api/challenge/mint/route';
import { POST as attemptPOST } from '@/app/api/challenge/[code]/attempt/route';
import { POST as guestPOST } from '@/app/api/guest/route';
import { POST as signupPOST } from '@/app/api/signup/route';
import { POST as referralPOST } from '@/app/api/challenge/referral/route';
import { CHALLENGE_TTL_FROM_MS } from '@/lib/social/challenge-terms';
import { resetGuestTokenHashProbe } from '@/lib/guestSession';
import {
  WEEK_ONE_ACTIVE_DAYS, WEEK_ONE_MS, checkReferrals, grantWeekOne, weekOneDays, weekOneKey, weekOneVerdict, type ReferralDb,
} from '@/lib/social/challenge-referral';
import { applyLc } from '@/lib/wallet/wallet-service';
import { REASON } from '@/lib/wallet/reward-rules';

const NOW = CHALLENGE_TTL_FROM_MS + 10 * 864e5;
const DAY = 864e5;
const ADULT = new Date(NOW).getFullYear() - 30;
const post = (body: unknown) => new Request('http://fel.test/x', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' }, body: JSON.stringify(body) });
const db = () => h.db as unknown as ReferralDb;
const lc = (userId: string) => Number(h.db.tables.wallet?.find((w) => w.playerId === userId)?.lc ?? 0);
const rows = (key: string) => (h.db.tables.walletLedgerEntry ?? []).filter((r) => r.idempotencyKey === key);

/** Alice sends a challenge; a guest plays it with no account, then signs up as Fern from the same browser. */
async function friendViaChallenge(): Promise<{ fern: string; code: string; joined: number }> {
  h.session = { user: { id: 'alice' } };
  const m = await (await mintPOST(post({ modeKey: 'threePoint', score: 40 }))).json();
  h.session = null;
  h.cookies = {};
  await guestPOST();
  vi.setSystemTime(NOW + 60_000);
  await attemptPOST(post({ attemptScore: 46 }), { params: { code: m.code } });
  vi.setSystemTime(NOW + 120_000);
  expect((await signupPOST(post({ email: 'fern@fel.test', password: 'secret12', name: 'Fern', birthYear: ADULT }))).status).toBe(200);
  const fern = h.db.tables.user.find((u) => u.email === 'fern@fel.test')!;
  return { fern: fern.id, code: m.code, joined: fern.createdAt.getTime() };
}
/** Fern played on these days after signing up (one finished run each). */
function playedOn(userId: string, joined: number, days: number[]) {
  for (const d of days) (h.db.tables.gameSession ??= []).push({ id: `gs_${userId}_${d}`, userId, mode: 'threePoint', score: 10, createdAt: new Date(joined + d * DAY + 3_600_000) });
}

beforeEach(() => {
  h.db = challengeDb();
  h.session = null; h.cookies = {}; h.events = [];
  resetGuestTokenHashProbe();
  vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-challenges-2');
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  (h.db.tables.user ??= []).push(
    { id: 'alice', email: 'alice@fel.test', name: 'Alice', dobYear: ADULT, createdAt: new Date(NOW - 400 * DAY), password: 'x', role: 'player' },
    { id: 'bob', email: 'bob@fel.test', name: 'Bob', dobYear: ADULT, createdAt: new Date(NOW - 400 * DAY), password: 'x', role: 'player' },
  );
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('the week-one rule (pure)', () => {
  it('counts distinct days inside the 7 days after signing up; not finished before the 7th day ends', () => {
    const joined = new Date(NOW);
    const at = (d: number, hh = 1) => new Date(NOW + d * DAY + hh * 3_600_000);
    expect(weekOneDays([at(0), at(0, 5), at(1), at(6), at(7), at(-1)], joined)).toBe(3);
    expect(WEEK_ONE_ACTIVE_DAYS).toBe(3);
    expect(weekOneVerdict(joined, 7, new Date(NOW + WEEK_ONE_MS - 1))).toBe('not_yet');
    expect(weekOneVerdict(joined, 3, new Date(NOW + WEEK_ONE_MS))).toBe('qualified');
    expect(weekOneVerdict(joined, 2, new Date(NOW + WEEK_ONE_MS))).toBe('missed');
  });
});

describe('referral Lab Credits for both players', () => {
  it('the challenge is the referral: a guest who played it, then signed up, is the challenger\'s friend', async () => {
    const { fern, code } = await friendViaChallenge();
    vi.setSystemTime(NOW + DAY);
    expect((await grantWeekOne(db(), fern)).status).toBe('not_yet');
    expect(h.db.tables.referralConversion).toEqual([expect.objectContaining({ referrerId: 'alice', referredUserId: fern, shardsAwarded: 0 })]);
    expect(h.db.tables.challengeLink.find((l) => l.code === code)!.signups).toBe(1);
  });

  it('no grant before week one is over, however busy the week', async () => {
    const { fern, joined } = await friendViaChallenge();
    playedOn(fern, joined, [0, 1, 2, 3, 4, 5, 6]);
    vi.setSystemTime(joined + WEEK_ONE_MS - 1);
    expect(await grantWeekOne(db(), fern)).toMatchObject({ status: 'not_yet', activeDays: 7 });
    expect(rows(weekOneKey(fern, 'referrer'))).toEqual([]);
    expect(lc('alice')).toBe(0);
  });

  it('a week with fewer than 3 active days pays nothing, then or later', async () => {
    const { fern, joined } = await friendViaChallenge();
    playedOn(fern, joined, [0, 6, 7, 8]); // day 7 and 8 are week two
    vi.setSystemTime(joined + WEEK_ONE_MS);
    expect(await grantWeekOne(db(), fern)).toEqual({ status: 'missed', activeDays: 2 });
    vi.setSystemTime(joined + 30 * DAY);
    expect((await grantWeekOne(db(), fern)).status).toBe('missed');
    expect(lc('alice')).toBe(0);
  });

  it('a finished week pays both players once: 100 Lab Credits each (new), and every later call is "already"', async () => {
    const { fern, joined } = await friendViaChallenge();
    const fernBefore = lc(fern); // the 500 welcome grant
    playedOn(fern, joined, [0, 2, 5]);
    vi.setSystemTime(joined + WEEK_ONE_MS);
    expect(await grantWeekOne(db(), fern)).toEqual({ status: 'granted', amount: 100, referrerId: 'alice' });
    expect(lc('alice')).toBe(100);
    expect(lc(fern)).toBe(fernBefore + 100);
    const [a] = rows(weekOneKey(fern, 'referrer'));
    expect(a).toMatchObject({ currency: 'lc', reasonCode: REASON.REFERRAL_WEEK_ONE, delta: BigInt(100) });
    for (let i = 0; i < 3; i++) expect((await grantWeekOne(db(), fern)).status).toBe('already');
    expect([lc('alice'), lc(fern)]).toEqual([100, fernBefore + 100]);
    expect(rows(weekOneKey(fern, 'referrer')).length + rows(weekOneKey(fern, 'friend')).length).toBe(2);
    // telemetry never carries an amount
    expect(h.events.filter((e) => e.name === 'referral_week_one_paid')).toEqual([expect.objectContaining({ props: { via: 'challenge' } })]);
  });

  it('two requests at the same moment: exactly one pays, the other answers "already", the balances move once', async () => {
    const { fern, joined } = await friendViaChallenge();
    const fernBefore = lc(fern);
    playedOn(fern, joined, [0, 1, 2]);
    vi.setSystemTime(joined + WEEK_ONE_MS);
    h.db.barrier(2);
    const out = await Promise.all([grantWeekOne(db(), fern), grantWeekOne(db(), fern)]);
    expect(out.map((o) => o.status).sort()).toEqual(['already', 'granted']);
    expect([lc('alice'), lc(fern)]).toEqual([100, fernBefore + 100]);
    expect(rows(weekOneKey(fern, 'referrer')).length).toBe(1);
    expect(rows(weekOneKey(fern, 'friend')).length).toBe(1);
  });

  it('both players opening the app at the same moment settle it once (the referrer\'s check and the friend\'s)', async () => {
    const { fern, joined } = await friendViaChallenge();
    const fernBefore = lc(fern);
    playedOn(fern, joined, [1, 3, 4]);
    vi.setSystemTime(joined + WEEK_ONE_MS + DAY);
    h.db.barrier(2);
    const [asAlice, asFern] = await Promise.all([checkReferrals(db(), 'alice'), checkReferrals(db(), fern)]);
    const statuses = [...asAlice.asReferrer.map((r) => r.status), asFern.asFriend.status].sort();
    expect(statuses).toEqual(['already', 'granted']);
    expect([lc('alice'), lc(fern)]).toEqual([100, fernBefore + 100]);
  });

  it('CONTROL: the same race without the transaction pays twice — the all-or-nothing write is what holds it', async () => {
    const { fern, joined } = await friendViaChallenge();
    playedOn(fern, joined, [0, 1, 2]);
    vi.setSystemTime(joined + WEEK_ONE_MS);
    // the naive grant: check the ledger, then write, with no transaction around the write
    let arrived = 0; let release: () => void = () => {};
    const both = new Promise<void>((r) => { release = r; });
    const naive = async () => {
      const prior = await h.db.walletLedgerEntry.findUnique({ where: { idempotencyKey: weekOneKey(fern, 'referrer') } });
      if (++arrived === 2) release(); await both;
      if (prior) return;
      await applyLc(h.db as never, { playerId: 'alice', delta: 100, reasonCode: REASON.REFERRAL_WEEK_ONE, source: 'milestone', idempotencyKey: weekOneKey(fern, 'referrer') });
    };
    // (the loser's ledger insert fails on the unique key, but nothing undoes the balance move it already made)
    await Promise.allSettled([naive(), naive()]);
    expect(rows(weekOneKey(fern, 'referrer')).length).toBe(1);
    expect(lc('alice')).toBe(200); // one ledger row, two balance moves: the bug grantWeekOne cannot have
  });

  it('a write that comes back as a replay mid-transaction (its insert lost the race) rolls the whole grant back', async () => {
    const { fern, joined } = await friendViaChallenge();
    const fernBefore = lc(fern);
    playedOn(fern, joined, [0, 1, 2]);
    vi.setSystemTime(joined + WEEK_ONE_MS);
    // the referrer's row is written for real, then the friend's answers "replayed" the way applyLc does after a lost race
    const lying = { applyLc: async (tx: unknown, a: Parameters<typeof applyLc>[1]) => (a.idempotencyKey.endsWith(':friend') ? { replayed: true, delta: 100 } : applyLc(tx as never, a)) };
    await expect(grantWeekOne(db(), fern, lying)).rejects.toThrow('referral_week1_replayed');
    expect(rows(weekOneKey(fern, 'referrer'))).toEqual([]);
    expect([lc('alice'), lc(fern)]).toEqual([0, fernBefore]);
    // and the next honest call pays both, once
    expect((await grantWeekOne(db(), fern)).status).toBe('granted');
    expect([lc('alice'), lc(fern)]).toEqual([100, fernBefore + 100]);
  });

  it('a guest result from after the account existed is no referral; neither is your own challenge', async () => {
    (h.db.tables.user ??= []).push({ id: 'fern', email: 'f@fel.test', name: 'Fern', dobYear: ADULT, createdAt: new Date(NOW), password: 'x', role: 'player' });
    (h.db.tables.challengeLink ??= []).push({ id: 'l1', code: 'ALICE1', ownerUserId: 'alice', signups: 0 }, { id: 'l2', code: 'FERN1', ownerUserId: 'fern', signups: 0 });
    (h.db.tables.guestSession ??= []).push(
      { id: 'g1', token: 'x1', migratedUserId: 'fern', createdAt: new Date(NOW - DAY), data: { challenges: [{ code: 'ALICE1', modeKey: 'threePoint', score: 5, target: 4, at: NOW + 1000 }] } },
      { id: 'g2', token: 'x2', migratedUserId: 'fern', createdAt: new Date(NOW - DAY), data: { challenges: [{ code: 'FERN1', modeKey: 'threePoint', score: 5, target: 4, at: NOW - 1000 }] } },
    );
    playedOn('fern', NOW, [0, 1, 2]);
    vi.setSystemTime(NOW + WEEK_ONE_MS);
    expect(await grantWeekOne(db(), 'fern')).toEqual({ status: 'no_referral' });
    expect(h.db.tables.referralConversion ?? []).toEqual([]);
  });

  it('one referrer per friend: an existing ?ref= referral is the record, and its friend\'s week one pays that referrer', async () => {
    const { fern, joined } = await friendViaChallenge();
    // (a ?ref= signup wrote this first; the challenge attribution must not add a second referrer)
    h.db.tables.referralConversion = [{ id: 'rc0', codeId: 'code_bob', referrerId: 'bob', referredUserId: fern, shardsAwarded: 10, createdAt: new Date(joined) }];
    playedOn(fern, joined, [0, 1, 2]);
    vi.setSystemTime(joined + WEEK_ONE_MS);
    expect(await grantWeekOne(db(), fern)).toMatchObject({ status: 'granted', referrerId: 'bob' });
    expect([lc('alice'), lc('bob')]).toEqual([0, 100]);
    expect(h.db.tables.referralConversion.length).toBe(1);
  });

  it('the route: signed-in only, and it names no other account', async () => {
    expect((await referralPOST()).status).toBe(401);
    const { fern, joined } = await friendViaChallenge();
    playedOn(fern, joined, [0, 1, 2]);
    vi.setSystemTime(joined + WEEK_ONE_MS);
    h.session = { user: { id: 'alice' } };
    const res = await referralPOST();
    const body = await res.json();
    expect(body).toEqual({ asFriend: { status: 'no_referral' }, asReferrer: [{ status: 'granted', amount: 100 }] });
    expect(JSON.stringify(body)).not.toContain(fern);
  });
});
