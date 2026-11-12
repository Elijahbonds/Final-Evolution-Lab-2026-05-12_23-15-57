// CHALLENGES-2 (owner, 2026-10-22: "beat my score"): the whole loop through the REAL routes and pages — mint, the
// 48-hour clock, a guest playing first, sign-up carrying the guest's result over, the one-tap rematch, a rep challenge
// on a measured jump, and the name a stranger sees. Stand-ins: the session, the cookie jar, the database (an in-memory
// Prisma slice with unique keys and all-or-nothing transactions, tests/helpers/challengeDb.ts), the analytics writer,
// the double-entry house book (postLc) and the outbound mail. The wallet (applyLc), the signer, the receipt, the guest
// rows and the signup route are the real code.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { challengeDb, type ChallengeDb } from '@/tests/helpers/challengeDb';

const h = vi.hoisted(() => ({
  db: null as unknown as ChallengeDb,
  session: null as null | { user: { id: string } },
  cookies: {} as Record<string, string>,
  set: {} as Record<string, string>,
  events: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : (h.db as any)[p as string]) }) }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (name in h.cookies ? { name, value: h.cookies[name] } : undefined),
    set: (name: string, value: string) => { h.set[name] = value; h.cookies[name] = value; },
  }),
}));
vi.mock('@/lib/analytics-server', () => ({
  recordServerEvent: async (e: Record<string, unknown>) => { h.events.push(e); },
  recordServerEvents: async (es: Array<Record<string, unknown>>) => { h.events.push(...es); },
}));
vi.mock('@/lib/ledger', () => ({ postLc: async () => ({ creditLedgerId: 'cl', transactionId: 'tx' }) }));
vi.mock('@/lib/marketing/email', () => ({ sendWelcomeEmail: () => {}, sendReferralRewardEmail: () => {} }));
vi.mock('bcryptjs', () => ({ default: { hash: async () => 'hashed' } }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ ok: true, retryAfterSec: 0 }), clientKeyFromHeaders: () => '203.0.113.9' }));
vi.mock('@/components/public-chrome', () => ({ PublicTopBar: () => null, PublicLegalFooter: () => null }));
vi.mock('@/components/challenges/guest-challenge-run', () => ({
  GuestChallengeRun: (p: { code: string; targetScore: number; theirName: string }) => createElement('div', { 'data-guest-run': p.code }, `GUEST RUN beat ${p.targetScore} from ${p.theirName}`),
}));

import { POST as mintPOST } from '@/app/api/challenge/mint/route';
import { POST as attemptPOST } from '@/app/api/challenge/[code]/attempt/route';
import { POST as openPOST } from '@/app/api/challenge/[code]/open/route';
import { POST as rematchPOST } from '@/app/api/challenge/[code]/rematch/route';
import { POST as guestPOST } from '@/app/api/guest/route';
import { POST as signupPOST } from '@/app/api/signup/route';
import ChallengePage from '@/app/c/[code]/page';
import ChallengePlayPage from '@/app/c/[code]/play/page';
import { CHALLENGE_TTL_FROM_MS, CHALLENGE_TTL_MS } from '@/lib/social/challenge-terms';
import { resetGuestTokenHashProbe } from '@/lib/guestSession';
import { signReceipt, whoKey } from '@/lib/social/challenge-receipt';

const NOW = CHALLENGE_TTL_FROM_MS + 10 * 864e5;
const HOUR = 3_600_000;
const year = new Date(NOW).getFullYear();
const ADULT = year - 30;
const TEEN = year - 15;

const post = (body: unknown) => new Request('http://fel.test/x', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' }, body: JSON.stringify(body) });
const asUser = (id: string | null) => { h.session = id ? { user: { id } } : null; };
async function call(route: (req: Request, ctx: { params: { code: string } }) => Promise<Response>, code: string, body: unknown = {}) {
  const res = await route(post(body), { params: { code } });
  return { status: res.status, body: await res.json() };
}
async function mint(body: Record<string, unknown>) {
  const res = await mintPOST(post(body));
  return { status: res.status, body: await res.json() };
}
async function page(code: string, r?: string) {
  return renderToStaticMarkup(await ChallengePage({ params: { code }, searchParams: r ? { r } : {} }));
}
async function redirectOf(p: Promise<unknown>): Promise<string | null> {
  try { await p; return null; } catch (e) { const d = String((e as { digest?: string }).digest ?? ''); return d.startsWith('NEXT_REDIRECT') ? d.split(';')[2] : `threw ${String(e)}`; }
}
function user(id: string, dobYear: number | null, name = 'Athlete', createdAt = new Date(NOW - 400 * 864e5)) {
  h.db.tables.user ??= [];
  h.db.tables.user.push({ id, email: `${id}@fel.test`, name, dobYear, createdAt, password: 'x', role: 'player' });
}
function optIn(userId: string) {
  (h.db.tables.scanSaveOptIn ??= []).push({ id: `o_${userId}`, userId, scope: 'jump_numbers', granted: true, revokedAt: null });
}
function jumpScan(userId: string, inches: number, at: number) {
  (h.db.tables.workoutScan ??= []).push({ id: `w_${userId}_${at}`, userId, kind: 'jump', metrics: { reads: { heightCm: inches * 2.54 } }, createdAt: new Date(at) });
}
/** A guest the real /api/guest started (after an adult answer), as this browser's cookie. */
async function startGuest() {
  h.cookies = {};
  await guestPOST();
  expect(h.cookies.fel_guest).toBeTruthy();
}
const lc = (userId: string) => Number(h.db.tables.wallet?.find((w) => w.playerId === userId)?.lc ?? 0);

beforeEach(() => {
  h.db = challengeDb();
  h.session = null; h.cookies = {}; h.set = {}; h.events = [];
  resetGuestTokenHashProbe();
  vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-challenges-2');
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  user('alice', ADULT, 'Alice Moreno');
  user('bo', ADULT, 'Bo');
  user('teen', TEEN, 'Tia');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('48 hours', () => {
  it('open until 47:59:59, then the attempt is 410 and nothing is counted; the page and the open say it ended', async () => {
    asUser('alice');
    const m = await mint({ modeKey: 'threePoint', score: 40 });
    expect(m.status).toBe(200);
    expect(m.body.expiresAt).toBe(NOW + CHALLENGE_TTL_MS);
    asUser('bo');
    vi.setSystemTime(NOW + CHALLENGE_TTL_MS - 1000);
    expect((await call(attemptPOST, m.body.code, { attemptScore: 30 })).status).toBe(200);
    expect(await page(m.body.code)).toContain('1 min left');
    vi.setSystemTime(NOW + CHALLENGE_TTL_MS);
    const late = await call(attemptPOST, m.body.code, { attemptScore: 99 });
    expect(late).toEqual({ status: 410, body: { error: 'expired' } });
    const row = h.db.tables.challengeLink.find((r) => r.code === m.body.code)!;
    expect([row.attempted, row.beaten]).toEqual([1, 0]);
    expect((await call(openPOST, m.body.code)).body).toMatchObject({ ok: true, expired: true });
    const html = await page(m.body.code);
    expect(html).toContain('This challenge ended');
    expect(html).toContain('open for 48 hours');
    expect(html).not.toContain('data-action="accept"');
    asUser(null);
    expect(await redirectOf(ChallengePlayPage({ params: { code: m.body.code } }))).toBe(`/c/${m.body.code}`);
  });

  it('a rematch minted at the last minute gets its own fresh 48 hours', async () => {
    asUser('alice');
    const m = await mint({ modeKey: 'threePoint', score: 40 });
    asUser('bo');
    vi.setSystemTime(NOW + CHALLENGE_TTL_MS - 60_000);
    const a = await call(attemptPOST, m.body.code, { attemptScore: 30 });
    const r = await call(rematchPOST, m.body.code, { receipt: a.body.receipt });
    expect(r.status).toBe(200);
    expect(r.body.expiresAt).toBe(NOW + CHALLENGE_TTL_MS - 60_000 + CHALLENGE_TTL_MS);
  });
});

describe('a guest plays first', () => {
  it('the invite offers play with no account; the play page hosts the guest; a signed-in player goes to /play', async () => {
    asUser('alice');
    const m = await mint({ modeKey: 'threePoint', score: 40 });
    asUser(null);
    const html = await page(m.body.code);
    expect(html).toContain('PLAY NOW — NO ACCOUNT');
    expect(html).toContain(`href="/c/${m.body.code}/play"`);
    expect(html).not.toContain('SIGN UP TO ACCEPT');
    const play = renderToStaticMarkup(await ChallengePlayPage({ params: { code: m.body.code } }) as never);
    expect(play).toContain('GUEST RUN beat 40 from A friend');
    asUser('bo');
    expect(await redirectOf(ChallengePlayPage({ params: { code: m.body.code } }))).toBe(`/play/threepoint?c=${m.body.code}`);
    // Flight Night's guest path is /try, as before
    asUser('alice');
    const dunk = await mint({ modeKey: 'dunkContest', score: 12 });
    asUser(null);
    expect(await page(dunk.body.code)).toContain(`href="/try?c=${dunk.body.code}"`);
  });

  it('opening the invite starts no guest: no row, no cookie (the year comes first, on the play page)', async () => {
    asUser('alice');
    const m = await mint({ modeKey: 'threePoint', score: 40 });
    asUser(null);
    expect((await call(openPOST, m.body.code)).status).toBe(200);
    expect(h.db.tables.guestSession ?? []).toEqual([]);
    expect(h.set).toEqual({});
  });

  it('an adult guest plays: both scores, who won, a receipt; the result waits on the guest row; rematch asks for sign-up', async () => {
    asUser('alice');
    const m = await mint({ modeKey: 'threePoint', score: 40 });
    asUser(null);
    await startGuest();
    const a = await call(attemptPOST, m.body.code, { attemptScore: 46 });
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ outcome: 'won', beat: true, attemptScore: 46, targetScore: 40, rematch: null });
    expect(typeof a.body.receipt).toBe('string');
    const g = h.db.tables.guestSession[0];
    expect(g.data.challenges).toEqual([{ code: m.body.code, modeKey: 'threePoint', score: 46, target: 40, at: NOW }]);
    expect(h.db.tables.user.length).toBe(3); // no account was needed
    // a worse second try keeps the better result
    await call(attemptPOST, m.body.code, { attemptScore: 20 });
    expect(h.db.tables.guestSession[0].data.challenges[0].score).toBe(46);
    // the result card: both scores, who won, sign-up offered only to save or to rematch
    const html = await page(m.body.code, a.body.receipt);
    expect(html).toContain('data-challenge-result="won"');
    expect(html).toMatch(/data-score="mine">46</);
    expect(html).toMatch(/data-score="theirs">40</);
    expect(html).toContain('REMATCH — SIGN UP FIRST');
    expect(html).toContain('SAVE MY RESULT');
    expect(await call(rematchPOST, m.body.code, { receipt: a.body.receipt })).toEqual({ status: 401, body: { error: 'signup', href: `/signup?c=${m.body.code}` } });
  });

  it('a browser with no guest (a teen, or "play without saving") keeps nothing on the server', async () => {
    asUser('alice');
    const m = await mint({ modeKey: 'threePoint', score: 40 });
    asUser(null);
    h.cookies = {};
    expect((await call(attemptPOST, m.body.code, { attemptScore: 46 })).status).toBe(200);
    expect(h.db.tables.guestSession ?? []).toEqual([]);
    h.cookies = { fel_age_gate: '1' };
    const html = await page(m.body.code);
    expect(html).toContain('PLAY NOW — NO ACCOUNT'); // plays locally
  });

  it('someone else\'s receipt on the URL is not this viewer\'s result', async () => {
    asUser('alice');
    const m = await mint({ modeKey: 'threePoint', score: 40 });
    asUser('bo');
    const a = await call(attemptPOST, m.body.code, { attemptScore: 46 });
    asUser('teen');
    expect(await page(m.body.code, a.body.receipt)).not.toContain('data-challenge-result');
    asUser('bo');
    expect(await page(m.body.code, a.body.receipt)).toContain('data-challenge-result="won"');
  });
});

describe('sign-up carries the guest\'s result over', () => {
  it('play as a guest, sign up from the result card, land back on the invite: the result is the account\'s, one tap rematches', async () => {
    asUser('alice');
    const m = await mint({ modeKey: 'threePoint', score: 40 });
    asUser(null);
    await startGuest();
    await call(attemptPOST, m.body.code, { attemptScore: 46 });
    // the real sign-up, with the same browser (the guest cookie rides along)
    const s = await signupPOST(post({ email: 'friend@fel.test', password: 'secret12', name: 'Fern', birthYear: ADULT }));
    expect(s.status).toBe(200);
    const fern = h.db.tables.user.find((u) => u.email === 'friend@fel.test')!;
    expect(h.db.tables.guestSession[0].migratedUserId).toBe(fern.id);
    asUser(fern.id);
    const html = await page(m.body.code);
    expect(html).toContain('Saved to your account from your guest run.');
    expect(html).toMatch(/data-score="mine">46</);
    expect(html).toContain('data-action="rematch"');
    // one tap: no receipt needed, the carried score is the one sent back
    const r = await call(rematchPOST, m.body.code, {});
    expect(r.status).toBe(200);
    const back = h.db.tables.challengeLink.find((l) => l.code === r.body.code)!;
    expect(back).toMatchObject({ ownerUserId: fern.id, score: 46, modeKey: 'threePoint' });
    expect(back.payload.x).toEqual({ re: m.body.code, reScore: 40, reTag: 'ATHLETE' });
  });

  it('nothing to carry: an account with no guest result has no result card and no rematch', async () => {
    asUser('alice');
    const m = await mint({ modeKey: 'threePoint', score: 40 });
    asUser('bo');
    expect(await page(m.body.code)).not.toContain('data-challenge-result');
    expect((await call(rematchPOST, m.body.code, {})).body).toEqual({ error: 'no_result' });
  });
});

describe('the one-tap rematch', () => {
  it('sends a new challenge back on the player\'s own result; its page shows both scores; the score is never re-sent', async () => {
    asUser('alice');
    const m = await mint({ modeKey: 'threePoint', score: 40 });
    asUser('bo');
    const a = await call(attemptPOST, m.body.code, { attemptScore: 35 });
    expect(a.body).toMatchObject({ outcome: 'lost', rematch: null });
    const r = await call(rematchPOST, m.body.code, { receipt: a.body.receipt, score: 9999 });
    expect(r.status).toBe(200);
    const back = h.db.tables.challengeLink.find((l) => l.code === r.body.code)!;
    expect(back).toMatchObject({ ownerUserId: 'bo', score: 35 });
    asUser('alice');
    const html = await page(r.body.code);
    expect(html).toContain('Rematch');
    expect(html).toContain('answered 40 with 35 in');
    expect(h.events.some((e) => e.name === 'challenge_rematch')).toBe(true);
  });

  it('a forged receipt, another player\'s receipt or another challenge\'s receipt sends nothing', async () => {
    asUser('alice');
    const m = await mint({ modeKey: 'threePoint', score: 40 });
    const other = await mint({ modeKey: 'threePoint', score: 10 });
    asUser('bo');
    const a = await call(attemptPOST, m.body.code, { attemptScore: 35 });
    const before = h.db.tables.challengeLink.length;
    const forged = signReceipt({ c: m.body.code, s: 999, ts: 40, at: NOW, w: whoKey('u', 'bo') }).replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
    expect((await call(rematchPOST, m.body.code, { receipt: forged })).status).toBe(409);
    expect((await call(rematchPOST, other.body.code, { receipt: a.body.receipt })).status).toBe(409);
    asUser('teen');
    expect((await call(rematchPOST, m.body.code, { receipt: a.body.receipt })).status).toBe(409);
    expect(h.db.tables.challengeLink.length).toBe(before);
  });

  it('a signed-in winner still gets the rematch link minted on the win, named no one, answering the original', async () => {
    asUser('alice');
    const m = await mint({ modeKey: 'threePoint', score: 40 });
    asUser('bo');
    const a = await call(attemptPOST, m.body.code, { attemptScore: 50, attemptTag: 'BO THE GREAT' });
    const back = h.db.tables.challengeLink.find((l) => l.code === a.body.rematch.code)!;
    expect(back).toMatchObject({ ownerUserId: 'bo', score: 50, tag: 'ATHLETE' });
    expect(back.payload.x).toMatchObject({ re: m.body.code, reScore: 40 });
  });
});

describe('the name a stranger sees', () => {
  it('a teen is never named, even asking; an adult only when they ask; the client\'s own tag never lands', async () => {
    asUser('teen');
    const t = await mint({ modeKey: 'threePoint', score: 40, showName: true, athleteTag: 'Tia R' });
    asUser('alice');
    const quiet = await mint({ modeKey: 'threePoint', score: 41, athleteTag: 'ALICE' });
    const named = await mint({ modeKey: 'threePoint', score: 42, showName: true });
    const tag = (code: string) => h.db.tables.challengeLink.find((l) => l.code === code)!.tag;
    expect(tag(t.body.code)).toBe('ATHLETE');
    expect(tag(quiet.body.code)).toBe('ATHLETE');
    expect(tag(named.body.code)).toBe('Alice');
    asUser(null);
    const teenPage = await page(t.body.code);
    expect(teenPage).toContain('A friend');
    expect(teenPage).not.toContain('Tia');
    expect(teenPage).not.toMatch(/<img/);
    expect(await page(named.body.code)).toContain('Alice');
  });

  it('a guest minting gets no name either', async () => {
    asUser(null);
    const g = await mint({ modeKey: 'threePoint', score: 40, athleteTag: 'MYNAME', showName: true });
    expect(h.db.tables.challengeLink.find((l) => l.code === g.body.code)!.tag).toBe('ATHLETE');
  });
});

describe('a challenge on a real training rep (a measured jump)', () => {
  it('only an adult who saves numbers can send one, and the number is read from their saved jumps, not sent', async () => {
    asUser('teen');
    expect(await mint({ kind: 'rep', metric: 'jump', modeKey: 'mirror:jump', score: 999 })).toMatchObject({ status: 403, body: { error: 'scan_save_adults_only' } });
    asUser('alice');
    expect((await mint({ kind: 'rep', metric: 'jump', modeKey: 'mirror:jump' })).status).toBe(403); // adult, not opted in
    optIn('alice');
    expect(await mint({ kind: 'rep', metric: 'jump', modeKey: 'mirror:jump' })).toMatchObject({ status: 409, body: { error: 'measure_first' } });
    jumpScan('alice', 22, NOW - 8 * 864e5); // older than the week: not her recent best
    jumpScan('alice', 24.5, NOW - 2 * 864e5);
    jumpScan('alice', 23, NOW - HOUR);
    const m = await mint({ kind: 'rep', metric: 'jump', modeKey: 'mirror:jump', score: 999 });
    expect(m.status).toBe(200);
    const row = h.db.tables.challengeLink.find((l) => l.code === m.body.code)!;
    expect(row).toMatchObject({ score: 245, modeKey: 'mirror:jump' });
    expect(row.payload.x).toEqual({ kind: 'rep', metric: 'jump' });
    asUser(null);
    const html = await page(m.body.code);
    expect(html).toContain('24.5 in');
    expect(html).toContain('Jump (Mirror)');
    expect(html).toContain('SIGN UP TO ANSWER');
    expect(html).not.toContain('PLAY NOW');
  });

  it('form is held back (the Mirror\'s rule: a comparison, never a ranking) until the owner opens it', async () => {
    asUser('alice');
    optIn('alice');
    expect(await mint({ kind: 'rep', metric: 'form', modeKey: 'mirror:form' })).toMatchObject({ status: 403, body: { error: 'metric_closed' } });
  });

  it('the answer is the friend\'s best jump measured after the challenge was sent; a typed score is ignored; a guest cannot answer', async () => {
    asUser('alice');
    optIn('alice');
    jumpScan('alice', 24.5, NOW - HOUR);
    const m = await mint({ kind: 'rep', metric: 'jump', modeKey: 'mirror:jump' });
    asUser(null);
    expect((await call(attemptPOST, m.body.code, { attemptScore: 999 })).status).toBe(403);
    asUser('bo');
    optIn('bo');
    jumpScan('bo', 30, NOW - HOUR); // before the challenge: does not answer it
    expect(await call(attemptPOST, m.body.code, { attemptScore: 999 })).toMatchObject({ status: 409, body: { error: 'measure_first' } });
    vi.setSystemTime(NOW + 2 * HOUR);
    jumpScan('bo', 25, NOW + HOUR);
    const a = await call(attemptPOST, m.body.code, { attemptScore: 999 });
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ attemptScore: 250, targetScore: 245, outcome: 'won' });
    const html = await page(m.body.code, a.body.receipt);
    expect(html).toMatch(/data-score="mine">25.0 in</);
    expect(html).toMatch(/data-score="theirs">24.5 in</);
  });
});

describe('staked, ranked and paid play is untouched', () => {
  it('no challenge route moves a balance', async () => {
    asUser('alice');
    const m = await mint({ modeKey: 'threePoint', score: 40 });
    asUser('bo');
    const a = await call(attemptPOST, m.body.code, { attemptScore: 50 });
    await call(rematchPOST, m.body.code, { receipt: a.body.receipt });
    expect(h.db.tables.walletLedgerEntry ?? []).toEqual([]);
    expect(h.db.tables.wallet ?? []).toEqual([]);
    expect(lc('bo')).toBe(0);
  });
});
