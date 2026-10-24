// DAILY-DRILL — the claim: once per day under concurrent claims, the streak day by the play path's own claim, and only
// for today's drill. The table behaviours the race safety stands on (the row lock, the unique ledger key) are modelled
// in tests/helpers/fakeDailyDrillDb.ts; the same race against real Postgres is the lane's probe.
import { describe, expect, it } from 'vitest';
import { claimDailyDrill, isTodaysKey, parseDailyKey } from './claim';
import { dailyDrillKey, viewFrom } from './load';
import { claimPlayStreak } from '@/lib/streak/claim';
import { streakStep, STREAK_LC_PER_DAY } from '@/lib/session-payout';
import { DEFAULT_REWARD_RULES, REASON, EVENT_REASON, computeGrant } from '@/lib/wallet/reward-rules';
import { reasonLabel } from '@/lib/wallet/reason-labels';
import { fakeDailyDrillDb, type FakeProfile } from '@/tests/helpers/fakeDailyDrillDb';
import { NOW, OPEN, STOPPED, ago, hooper, jumper } from '@/tests/helpers/dailyDrillRows';

const U = 'user_claim_1';
const KEY = dailyDrillKey(U, '2026-10-24');
const view = (rows = hooper(), access = OPEN) => viewFrom(U, rows, access, NOW);

function setup(profile: Partial<FakeProfile> = {}) {
  const p: FakeProfile = { streakDays: 3, lastStreakAt: ago(1.2), lastActiveAt: ago(1.2), ...profile };
  const f = fakeDailyDrillDb({ [U]: p });
  const deps = { now: () => NOW, readProfile: async () => ({ ...f.profiles[U] }), applyLc: f.applyLc as never };
  return { ...f, deps };
}

describe('the reward is the wallet\'s rule', () => {
  it('DAILY_DRILL_COMPLETE: a flat (new) 10 LC, server-granted only (no client event names it), labelled', () => {
    const r = DEFAULT_REWARD_RULES[REASON.DAILY_DRILL_COMPLETE];
    expect(r.currency).toBe('lc');
    expect(computeGrant(r, { score: 1e9 })).toBe(10);
    expect(Object.values(EVENT_REASON)).not.toContain(REASON.DAILY_DRILL_COMPLETE);
    expect(reasonLabel(REASON.DAILY_DRILL_COMPLETE).label).toBe("Today's drill done");
  });
});

describe('the key', () => {
  it('names a focus and one of that focus\'s drills; anything else is refused', () => {
    expect(parseDailyKey('shot:safe-landing')).toEqual({ focus: 'shot', drillId: 'safe-landing' });
    expect(parseDailyKey('shot:countermovement-geometry')).toEqual({ focus: 'shot', drillId: 'countermovement-geometry' });
    for (const bad of ['shot:pogo-bilateral', 'shot', 'nope:wake-up', 'shot:safe-landing:x', 42, null, 'x'.repeat(200)]) expect(parseDailyKey(bad)).toBeNull();
  });

  it('today\'s key: today\'s focus, either side of the gate (a gate that moves mid-day never voids a drill already run)', () => {
    const v = view();
    expect(isTodaysKey(v, 'shot:safe-landing')).toBe(true);
    expect(isTodaysKey(v, 'shot:countermovement-geometry')).toBe(true);
    expect(isTodaysKey(v, 'jump:pogo-bilateral')).toBe(false);
  });
});

describe('claiming today\'s drill', () => {
  it('pays the drill credit plus the streak day it opens, on one ledger row, and continues the streak (3 → 4)', async () => {
    const s = setup();
    const r = await claimDailyDrill(s.db, U, view(), 'shot:safe-landing', s.deps);
    expect(r).toEqual({ status: 'granted', amount: 10 + STREAK_LC_PER_DAY * 4, streakBonus: 20, streakDays: 4 });
    expect(s.profiles[U].streakDays).toBe(4);
    expect(s.profiles[U].lastStreakAt.getTime()).toBe(NOW.getTime());
    expect(s.profiles[U].lastActiveAt.getTime()).toBe(NOW.getTime());
    expect([...s.ledger.keys()]).toEqual([KEY]);
    expect(s.ledger.get(KEY)!.metadata).toMatchObject({ day: '2026-10-24', focus: 'shot', drillId: 'safe-landing', drillCredit: 10, streakBonus: 20, streakDays: 4 });
  });

  it('a day a game already opened: the drill credit alone, the streak untouched (lastActiveAt moves forward)', async () => {
    const s = setup({ streakDays: 5, lastStreakAt: ago(0.2), lastActiveAt: ago(0.2) });
    const r = await claimDailyDrill(s.db, U, view(), 'shot:safe-landing', s.deps);
    expect(r).toEqual({ status: 'granted', amount: 10, streakBonus: 0, streakDays: 5 });
    expect(s.profiles[U].streakDays).toBe(5);
    expect(s.profiles[U].lastActiveAt.getTime()).toBe(NOW.getTime());
  });

  it('a gap of two days restarts the streak at day 1, as a game does', async () => {
    const s = setup({ streakDays: 6, lastStreakAt: ago(3), lastActiveAt: ago(3) });
    const r = await claimDailyDrill(s.db, U, view(), 'shot:safe-landing', s.deps);
    expect(r.streakDays).toBe(1);
    expect(r.amount).toBe(10 + STREAK_LC_PER_DAY);
  });

  it('a second claim the same day: already, with what the first paid; nothing more is written', async () => {
    const s = setup();
    await claimDailyDrill(s.db, U, view(), 'shot:safe-landing', s.deps);
    const again = await claimDailyDrill(s.db, U, view(), 'shot:safe-landing', s.deps);
    expect(again).toEqual({ status: 'already', amount: 30, streakBonus: 0, streakDays: 4 });
    expect(s.ledger.size).toBe(1);
  });

  it('EIGHT CONCURRENT CLAIMS, five rounds: exactly one granted, seven already; one row, one streak day', async () => {
    for (let round = 0; round < 5; round++) {
      const s = setup();
      const out = await Promise.all(Array.from({ length: 8 }, () => claimDailyDrill(s.db, U, view(), 'shot:safe-landing', s.deps)));
      const st = out.map((o) => o.status).sort();
      expect(st.filter((x) => x === 'granted')).toHaveLength(1);
      expect(st.filter((x) => x === 'already')).toHaveLength(7);
      expect(s.ledger.size).toBe(1);
      expect([...s.ledger.values()].reduce((t, e) => t + e.delta, 0)).toBe(30);
      expect(s.profiles[U].streakDays).toBe(4);
      expect(s.log.filter((l) => l.startsWith('streak:') && l.includes('streakDays'))).toHaveLength(1);
    }
  });

  it('a drill and a game run finishing at once pay the day\'s streak LC once (the play path\'s own conditional claim)', async () => {
    const s = setup();
    const seen = { ...s.profiles[U] };
    const step = streakStep(seen, NOW.getTime(), 'play');
    const [drill, game] = await Promise.all([
      claimDailyDrill(s.db, U, view(), 'shot:safe-landing', s.deps),
      s.db.$transaction(async (tx) => claimPlayStreak(tx as never, U, seen, step, new Date(NOW.getTime() + 1))),
    ]);
    const streakPaid = (drill.streakBonus > 0 ? 1 : 0) + (game ? 1 : 0);
    expect(streakPaid).toBe(1);
    expect(s.profiles[U].streakDays).toBe(4);
    expect(drill.status).toBe('granted');
  });

  it('a claim that loses the unique-key race inside its transaction rolls back whole (its streak write too)', async () => {
    const s = setup();
    // another writer files today's key between this claim's first look and its insert
    let first = true;
    const racing = {
      ...s.deps,
      applyLc: (async (tx: unknown, a: never) => {
        if (first) { first = false; s.ledger.set(KEY, { key: KEY, playerId: U, delta: 30, metadata: { streakDays: 4 } }); }
        return s.applyLc(tx, a);
      }) as never,
    };
    const r = await claimDailyDrill(s.db, U, view(), 'shot:safe-landing', racing);
    expect(r.status).toBe('already');
    // the streak write this claim made was undone with its transaction: the profile is as it was read
    expect(s.profiles[U].streakDays).toBe(3);
  });

  it('a drill that is not today\'s (another focus) pays nothing', async () => {
    const s = setup();
    expect(await claimDailyDrill(s.db, U, view(), 'jump:pogo-bilateral', s.deps)).toMatchObject({ status: 'not_today', amount: 0 });
    expect(await claimDailyDrill(s.db, U, view(jumper()), 'shot:safe-landing', s.deps)).toMatchObject({ status: 'not_today' });
    expect(s.ledger.size).toBe(0);
    expect(s.profiles[U].streakDays).toBe(3);
  });

  it('a standing red flag: no drill, no claim', async () => {
    const s = setup();
    expect(await claimDailyDrill(s.db, U, view(hooper(), STOPPED), 'shot:safe-landing', s.deps)).toMatchObject({ status: 'stopped' });
    expect(s.ledger.size).toBe(0);
  });

  it('the rule switched off and no streak day due: nothing is filed, nothing thrown', async () => {
    const s = setup({ lastStreakAt: ago(0.2), lastActiveAt: ago(0.2) });
    const r = await claimDailyDrill(s.db, U, { ...view(), credit: 0 }, 'shot:safe-landing', s.deps);
    expect(r).toMatchObject({ status: 'granted', amount: 0 });
    expect(s.ledger.size).toBe(0);
  });
});
