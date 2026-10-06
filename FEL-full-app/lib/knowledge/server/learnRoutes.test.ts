import { beforeEach, describe, expect, it, vi } from 'vitest';
import { learnEvent, syncDelete, syncPush, syncStatus, type EventDeps } from './learnRoutes';
import { CARDS } from '../catalog';
import { freshState, recordAnswer, recordView, setTopics, type LearnState } from '../state';
import { GOAL_BONUS_ACCOUNT_XP, LEARN_ACCOUNT_XP_DAILY_CAP } from '../accountXp';
import { DAILY_GOAL } from '../day';
import type { QuizCard } from '../types';

// KNOWLEDGE-FEED v2 (2026-10-06): the /api/learn routes' logic, run for real over an in-memory stand-in for the two new
// tables, User.dobYear and PlayerProfile.xp. Only the database is a stand-in (the lane's database is offline on
// purpose, and the migration is the owner's step). Proves: under-18 and unknown age stay on the device (nothing is
// written), the first sign-in merges the device in exactly once per device, account XP is capped per day, the
// daily-goal bonus pays once per day, and a missing table answers 503 rather than 500.

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const D = 20_000;
const NOW = D * 86_400_000 + 12 * 3_600_000;
// the age rule reads the real clock (verifiedAdult), so birth years are set from it, not from the test's day D
const YEAR = new Date().getFullYear();

function fakeDb(dob: Record<string, number | null>) {
  const profiles = new Map<string, Row>();
  const cards = new Map<string, Row>();
  const xp = new Map<string, number>();
  const writes: string[] = [];
  const state = { missingTables: false };
  const chk = () => { if (state.missingTables) throw Object.assign(new Error('The table `public.LearnProfile` does not exist'), { name: 'PrismaClientKnownRequestError', code: 'P2021' }); };
  const db: Row = {
    user: { findUnique: async (a: Row) => (a.where.id in dob ? { dobYear: dob[a.where.id] } : null) },
    learnProfile: {
      findUnique: async (a: Row) => { chk(); const p = profiles.get(a.where.userId); return p ? structuredClone(p) : null; },
      upsert: async (a: Row) => { chk(); writes.push(`profile:${a.where.userId}`); const cur = profiles.get(a.where.userId); profiles.set(a.where.userId, structuredClone(cur ? { ...cur, ...a.update } : a.create)); },
      deleteMany: async (a: Row) => { chk(); const had = profiles.delete(a.where.userId); return { count: had ? 1 : 0 }; },
    },
    learnCard: {
      findMany: async (a: Row) => { chk(); return [...cards.values()].filter((r) => r.userId === a.where.userId && (!a.where.cardId || r.cardId === a.where.cardId)).map((r) => structuredClone(r)); },
      upsert: async (a: Row) => { chk(); const { userId, cardId } = a.where.userId_cardId; writes.push(`card:${userId}:${cardId}`); const k = `${userId}|${cardId}`; const cur = cards.get(k); cards.set(k, structuredClone(cur ? { ...cur, ...a.update } : a.create)); },
      deleteMany: async (a: Row) => { chk(); let n = 0; for (const [k, r] of cards) if (r.userId === a.where.userId) { cards.delete(k); n++; } return { count: n }; },
    },
    playerProfile: { update: async (a: Row) => { writes.push(`xp:${a.where.userId}`); xp.set(a.where.userId, (xp.get(a.where.userId) ?? 0) + a.data.xp.increment); } },
    $queryRawUnsafe: async () => [],
    $transaction: async (fn: (tx: Row) => Promise<unknown>) => fn(db),
  };
  return { db, profiles, cards, xp, writes, state };
}

const deps = (now = NOW): EventDeps => ({ ensureProfile: async () => undefined, lockPlayer: vi.fn(async () => undefined), now: () => now });
const science = CARDS.filter((c) => c.topic === 'science');
const viewable = science.filter((c) => c.type === 'lesson' || c.type === 'fact');
const quizzes = science.filter((c): c is QuizCard => c.type === 'quiz');

function deviceState(): LearnState {
  let s = setTopics(freshState(), ['science']);
  s = recordView(s, viewable[0], D, NOW - 5000, 4000);
  s = recordAnswer(s, quizzes[0], true, D, NOW - 4000);
  return s;
}

let f: ReturnType<typeof fakeDb>;
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  f = fakeDb({ adult: YEAR - 30, teen: YEAR - 15, unknown: null, exactly18: YEAR - 18 });
});

describe('the age gate: under-18 and unknown age stay on the device', () => {
  for (const who of ['teen', 'unknown', 'exactly18', 'no-such-user']) {
    it(`${who}: GET says not eligible; a push and an event are refused; NOTHING is written`, async () => {
      expect((await syncStatus(f.db, who)).body).toEqual({ eligible: false });
      const push = await syncPush(f.db, who, { deviceId: 'device-aaaa', mode: 'first-link', state: deviceState() });
      expect(push.status).toBe(403);
      expect(push.body.error).toBe('learn_sync_adults_only');
      const ev = await learnEvent(f.db, who, { day: D, event: { kind: 'answer', cardId: quizzes[0].id, choice: quizzes[0].answer } }, deps());
      expect(ev.status).toBe(403);
      expect(f.writes).toEqual([]);
      expect(f.xp.size).toBe(0);
    });
  }

  it('deleting your own learning data needs no age', async () => {
    expect((await syncDelete(f.db, 'teen')).status).toBe(200);
  });
});

describe('device → account on first sign-in', () => {
  it('a verified adult with nothing on the account is eligible, with no state yet', async () => {
    const r = await syncStatus(f.db, 'adult');
    expect(r.body.eligible).toBe(true);
    expect(r.body.state).toBeNull();
  });

  it('the first push merges the device in, and the account then holds it', async () => {
    const d = deviceState();
    const r = await syncPush(f.db, 'adult', { deviceId: 'device-aaaa', mode: 'first-link', state: d });
    expect(r.status).toBe(200);
    expect(r.body.mode).toBe('first-link');
    const got = (await syncStatus(f.db, 'adult')).body.state as LearnState;
    expect(Object.keys(got.cards).sort()).toEqual(Object.keys(d.cards).sort());
    expect(got.cards[quizzes[0].id].quiz).toEqual(d.cards[quizzes[0].id].quiz);
    expect(got.xp).toBe(d.xp);
    expect(got.recent).toEqual([]);   // the near-repeat window never leaves the device
    expect(f.xp.size).toBe(0);        // merged history is learning XP only — no account XP for it
  });

  it('a retried first-link from the same device is a linked push: the XP is not added twice', async () => {
    const d = deviceState();
    await syncPush(f.db, 'adult', { deviceId: 'device-aaaa', mode: 'first-link', state: d });
    const again = await syncPush(f.db, 'adult', { deviceId: 'device-aaaa', mode: 'first-link', state: d });
    expect(again.body.mode).toBe('linked');
    expect((again.body.state as LearnState).xp).toBe(d.xp);
  });

  it('a SECOND device\'s first link adds its own history', async () => {
    const d = deviceState();
    await syncPush(f.db, 'adult', { deviceId: 'device-aaaa', mode: 'first-link', state: d });
    const other = recordView(setTopics(freshState(), ['space']), CARDS.find((c) => c.topic === 'space')!, D, NOW, 4000);
    const r = await syncPush(f.db, 'adult', { deviceId: 'device-bbbb', mode: 'first-link', state: other });
    const s = r.body.state as LearnState;
    expect(s.xp).toBe(d.xp + other.xp);
    expect(s.topics.sort()).toEqual(['science', 'space']);
    expect(f.profiles.get('adult')!.devices).toEqual(['device-aaaa', 'device-bbbb']);
  });

  it('refuses a body without a usable device id or mode', async () => {
    expect((await syncPush(f.db, 'adult', { deviceId: 'x', mode: 'first-link', state: {} })).status).toBe(400);
    expect((await syncPush(f.db, 'adult', { deviceId: 'device-aaaa', mode: 'overwrite', state: {} })).status).toBe(400);
  });
});

describe('learning XP → account XP, on the server', () => {
  it('a right answer credits the first-try XP to PlayerProfile.xp, graded by the server', async () => {
    const q = quizzes[0];
    const r = await learnEvent(f.db, 'adult', { day: D, event: { kind: 'answer', cardId: q.id, choice: q.answer } }, deps());
    expect(r.status).toBe(200);
    expect(r.body.correct).toBe(true);
    expect(f.xp.get('adult')).toBe(5);
  });

  it('locks the player row before reading the cap ledger (the sessions route\'s lock)', async () => {
    const d = deps();
    await learnEvent(f.db, 'adult', { day: D, event: { kind: 'view', cardId: viewable[0].id, dwellMs: 3000 } }, d);
    expect(d.lockPlayer).toHaveBeenCalledTimes(1);
  });

  it('never credits more than the daily cap of card XP, however many events', async () => {
    // every quiz in the catalogue answered right on one day: 5 XP each, far past the cap
    const all = CARDS.filter((c): c is QuizCard => c.type === 'quiz');
    let goal = 0;
    for (const q of all) {
      const r = await learnEvent(f.db, 'adult', { day: D, event: { kind: 'answer', cardId: q.id, choice: q.answer } }, deps());
      goal += Number(r.body.goalBonus);
    }
    expect(goal).toBe(GOAL_BONUS_ACCOUNT_XP);
    expect(f.xp.get('adult')).toBe(LEARN_ACCOUNT_XP_DAILY_CAP + GOAL_BONUS_ACCOUNT_XP);
    // the next day the cap starts again
    await learnEvent(f.db, 'adult', { day: D + 1, event: { kind: 'answer', cardId: all[0].id, choice: all[0].answer } }, deps(NOW + 86_400_000));
    expect(f.xp.get('adult')).toBe(LEARN_ACCOUNT_XP_DAILY_CAP + GOAL_BONUS_ACCOUNT_XP + 3);   // a review right, next day
  });

  it('the daily-goal bonus pays once per day through the route', async () => {
    const bonus = async (day: number, c: (typeof viewable)[number], now: number) =>
      Number((await learnEvent(f.db, 'adult', { day, event: { kind: 'view', cardId: c.id, dwellMs: 3000 } }, deps(now))).body.goalBonus);
    const day1 = [];
    for (const c of viewable.slice(0, DAILY_GOAL + 2)) day1.push(await bonus(D, c, NOW));
    expect(day1.filter((b) => b > 0)).toEqual([GOAL_BONUS_ACCOUNT_XP]);
    const others = CARDS.filter((c) => c.topic === 'space' && (c.type === 'lesson' || c.type === 'fact'));
    const day2 = [];
    for (const c of others.slice(0, DAILY_GOAL + 1)) day2.push(await bonus(D + 1, c, NOW + 86_400_000));
    expect(day2.filter((b) => b > 0)).toEqual([GOAL_BONUS_ACCOUNT_XP]);
  });

  it('refuses an implausible day and a malformed event, and credits nothing', async () => {
    expect((await learnEvent(f.db, 'adult', { day: D + 5, event: { kind: 'view', cardId: viewable[0].id, dwellMs: 3000 } }, deps())).status).toBe(400);
    expect((await learnEvent(f.db, 'adult', { day: D, event: { kind: 'answer', cardId: viewable[0].id, choice: 0 } }, deps())).status).toBe(400);
    expect(f.xp.size).toBe(0);
  });
});

describe('before the migration is applied', () => {
  it('every route answers 503 learn_sync_unavailable, never throws, and credits no XP', async () => {
    f.state.missingTables = true;
    expect((await syncStatus(f.db, 'adult')).status).toBe(503);
    expect((await syncPush(f.db, 'adult', { deviceId: 'device-aaaa', mode: 'first-link', state: deviceState() })).status).toBe(503);
    expect((await learnEvent(f.db, 'adult', { day: D, event: { kind: 'view', cardId: viewable[0].id, dwellMs: 3000 } }, deps())).status).toBe(503);
    expect((await syncDelete(f.db, 'adult')).status).toBe(503);
    expect(f.xp.size).toBe(0);
  });
});
