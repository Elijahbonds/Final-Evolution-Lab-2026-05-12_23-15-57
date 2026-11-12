import { describe, expect, it } from 'vitest';
import type { JumpRecord } from '@/lib/jump/seam';
import {
  boards, buddies, duoGoals, duoKey, friendStreak, LEAGUE_CAPS, LEAGUE_POINTS, rolloverAward, standings, teamRollup, trophyShelf,
  EMPTY_ACTIVITY, type Activity,
} from './activity';
import type { GroupAct, MemberFacts } from './types';

const NOW = Date.parse('2026-10-28T19:00:00Z'); // Wed Oct 28, noon PDT
const WEEK = '2026-10-26';
const LAST = '2026-10-19';
const at = (day: string) => Date.parse(`${day}T19:00:00Z`);

const member = (userId: string, o: Partial<MemberFacts> = {}): MemberFacts => ({
  groupId: 'g1', userId, role: 'member', shareMeasured: false, joinedAt: Date.parse('2026-10-01T00:00:00Z'),
  name: userId.toUpperCase(), band: 'adult', canSaveScan: false, onRoster: true, ...o,
});
const act = (o: Partial<GroupAct>): GroupAct => ({ id: 'x', kind: 'nudge', dedupeKey: 'k', fromUserId: null, toUserId: null, ref: null, preset: null, points: null, createdAt: NOW, ...o });
const jr = (heightCm: number, verified: boolean): JumpRecord => ({ type: 'cmj', heightCm, plusMinusCm: 1, verified, blocks: verified ? [] : ['framesOnly'], source: 'live', fps: 60, trust: null, rsi: null });
const act0 = (a: Partial<Activity>): Activity => ({ ...EMPTY_ACTIVITY, ...a });

describe('training buddies and the friend streak', () => {
  const ms = [member('a'), member('b'), member('c')];
  const a = act0({ drillDays: { a: ['2026-10-28', '2026-10-27', '2026-10-26'], b: ['2026-10-28', '2026-10-27', '2026-10-26'], c: ['2026-10-27', '2026-10-26'] } });

  it('each buddy: today done or not; the viewer can nudge someone who has not, once a day, never themselves', () => {
    const b = buddies(ms, a, 'a', [act({ kind: 'nudge', fromUserId: 'a', toUserId: 'c', ref: '2026-10-27' })], NOW);
    expect(b.map((x) => [x.userId, x.doneToday, x.canNudge])).toEqual([['a', true, false], ['b', true, false], ['c', false, true]]);
    const after = buddies(ms, a, 'a', [act({ kind: 'nudge', fromUserId: 'a', toUserId: 'c', ref: '2026-10-28' })], NOW);
    expect(after.find((x) => x.userId === 'c')).toMatchObject({ nudgedByMe: true, canNudge: false });
  });

  it('the streak counts days everyone did the drill: ends yesterday while someone has not done today', () => {
    expect(friendStreak(ms, a, Date.parse('2026-10-01T00:00:00Z'), NOW)).toEqual({ days: 2, todayAll: false });
    const allToday = act0({ drillDays: { ...a.drillDays, c: ['2026-10-28', '2026-10-27', '2026-10-26'] } });
    expect(friendStreak(ms, allToday, Date.parse('2026-10-01T00:00:00Z'), NOW)).toEqual({ days: 3, todayAll: true });
  });

  it('a member who joined later is not owed the days before; a day with one member is no friend streak; never before the group', () => {
    const late = [member('a'), member('b', { joinedAt: Date.parse('2026-10-27T19:00:00Z') })];
    const d = act0({ drillDays: { a: ['2026-10-28', '2026-10-27', '2026-10-26', '2026-10-25'], b: ['2026-10-28', '2026-10-27'] } });
    expect(friendStreak(late, d, Date.parse('2026-10-01T00:00:00Z'), NOW).days).toBe(2);
    const both = act0({ drillDays: { a: ['2026-10-28', '2026-10-27', '2026-10-26'], b: ['2026-10-28', '2026-10-27', '2026-10-26'] } });
    expect(friendStreak([member('a'), member('b')], both, Date.parse('2026-10-27T10:00:00Z'), NOW).days).toBe(2);
  });
});

describe('duo goals', () => {
  it('days both did the drill this week, against the preset target; unknown targets and non-members are dropped', () => {
    const ms = [member('a'), member('b')];
    const a = act0({ drillDays: { a: ['2026-10-26', '2026-10-27', '2026-10-28'], b: ['2026-10-27', '2026-10-28'] } });
    const goals = duoGoals(ms, a, [
      act({ kind: 'duo', fromUserId: 'a', toUserId: 'b', ref: WEEK, preset: '3', dedupeKey: duoKey(WEEK, 'b', 'a') }),
      act({ kind: 'duo', fromUserId: 'a', toUserId: 'b', ref: WEEK, preset: '4' }),
      act({ kind: 'duo', fromUserId: 'a', toUserId: 'zz', ref: WEEK, preset: '3' }),
      act({ kind: 'duo', fromUserId: 'a', toUserId: 'b', ref: LAST, preset: '3' }),
    ], WEEK);
    expect(goals).toEqual([{ a: 'a', b: 'b', aName: 'A', bName: 'B', target: 3, together: 2, met: false, weekKey: WEEK }]);
    expect(duoKey(WEEK, 'b', 'a')).toBe(duoKey(WEEK, 'a', 'b'));
  });
});

describe('the friends-only leaderboard draws only from real or verified data', () => {
  const ms = [
    member('adult', { canSaveScan: true, shareMeasured: true }),
    member('quiet', { canSaveScan: true, shareMeasured: false }),
    member('teen', { band: 'teen', canSaveScan: true, shareMeasured: true }),
  ];
  const a = act0({
    drillDays: { adult: ['2026-10-26'], quiet: ['2026-10-26', '2026-10-27'], teen: ['2026-10-26', '2026-10-27', '2026-10-28'] },
    reps: [
      { userId: 'adult', id: 'm1', patternId: 'squat', reps: 12, at: at('2026-10-27') },
      { userId: 'adult', id: 'm0', patternId: 'squat', reps: 50, at: at('2026-10-20') }, // last week
      { userId: 'quiet', id: 'm2', patternId: 'squat', reps: 99, at: at('2026-10-27') },
      { userId: 'teen', id: 'm3', patternId: 'lunge', reps: 40, at: at('2026-10-27') },
    ],
    jumps: [
      { userId: 'adult', id: 's1', record: jr(60, false), at: at('2026-10-27') },
      { userId: 'adult', id: 's2', record: jr(48, true), at: at('2026-10-27') },
      { userId: 'quiet', id: 's3', record: jr(70, true), at: at('2026-10-27') },
      { userId: 'teen', id: 's4', record: jr(55, true), at: at('2026-10-27') },
    ],
  });
  const b = boards(ms, a, WEEK);

  it('drill days: every member, from the claim rows', () => {
    expect(b.drill.map((r) => [r.userId, r.value])).toEqual([['teen', 3], ['quiet', 2], ['adult', 1]]);
  });
  it('reps: this week only, sharing adults only (never a teen, never an adult who has not shared)', () => {
    expect(b.reps).toEqual([{ userId: 'adult', name: 'ADULT', value: 12, display: '12 reps' }]);
  });
  it('jump: VERIFIED records only — the higher unverified 60 cm loses to the verified 48 cm', () => {
    expect(b.jump).toEqual([{ userId: 'adult', name: 'ADULT', value: 48, display: '18.9 in' }]);
    expect(b.measuredHidden).toBe(2);
  });
});

describe('the weekly league and its rollover', () => {
  const ms = [member('a', { joinedAt: 1 }), member('b', { joinedAt: 2 }), member('c', { joinedAt: 3 })];
  const runs = (userId: string, n: number, won: number, day: string) => Array.from({ length: n }, (_, i) => ({ userId, at: at(day) + i, won: i < won }));

  it('points: drill days, runs and wins at the table\'s rates, with the caps', () => {
    expect(LEAGUE_POINTS).toEqual({ drillDay: 10, run: 2, win: 3 });
    const a = act0({
      drillDays: { a: ['2026-10-26', '2026-10-27'], b: ['2026-10-26'] },
      runs: [...runs('b', 40, 40, '2026-10-27'), ...runs('c', 1, 0, '2026-10-20')],
    });
    const t = standings(ms, a, WEEK);
    expect(t.map((r) => [r.userId, r.points, r.place])).toEqual([
      ['b', 10 + LEAGUE_CAPS.runs * 2 + LEAGUE_CAPS.wins * 3, 1], ['a', 20, 2], ['c', 0, 3],
    ]);
  });

  it('a tie on points and drill days shares a place', () => {
    const a = act0({ drillDays: { a: ['2026-10-26'], b: ['2026-10-27'] } });
    expect(standings(ms, a, WEEK).map((r) => r.place)).toEqual([1, 1, 3]);
  });

  it('rollover: last week settles once, to its winner; nothing for a group that did not exist; a tie or an empty week shelves nothing', () => {
    const lastWeek = act0({ drillDays: { a: ['2026-10-19', '2026-10-20'], b: ['2026-10-19'] } });
    const award = rolloverAward(Date.parse('2026-10-01T00:00:00Z'), ms, lastWeek, WEEK, []);
    expect(award).toEqual({ dedupeKey: `league:${LAST}`, ref: LAST, toUserId: 'a', points: 20, preset: 'league_winner' });
    expect(rolloverAward(Date.parse('2026-10-01T00:00:00Z'), ms, lastWeek, WEEK, [act({ kind: 'trophy', dedupeKey: `league:${LAST}` })])).toBeNull();
    expect(rolloverAward(Date.parse('2026-10-27T00:00:00Z'), ms, lastWeek, WEEK, [])).toBeNull();
    const tie = act0({ drillDays: { a: ['2026-10-19'], b: ['2026-10-20'] } });
    expect(rolloverAward(0, ms, tie, WEEK, [])).toMatchObject({ toUserId: null, preset: 'none' });
    expect(rolloverAward(0, ms, EMPTY_ACTIVITY, WEEK, [])).toMatchObject({ toUserId: null, preset: 'none' });
    expect(rolloverAward(0, [ms[0]], lastWeek, WEEK, [])).toMatchObject({ toUserId: null, preset: 'none' });
  });

  it('a member who joined after the week does not count in it', () => {
    const lateWinner = [member('a', { joinedAt: 1 }), member('b', { joinedAt: 2 }), member('z', { joinedAt: Date.parse('2026-10-27T00:00:00Z') })];
    const d = act0({ drillDays: { a: ['2026-10-19'], z: ['2026-10-19', '2026-10-20', '2026-10-21'] } });
    expect(rolloverAward(0, lateWinner, d, WEEK, [])).toMatchObject({ toUserId: 'a' });
  });

  it('the trophy shelf: winners still in the group, newest first', () => {
    const shelf = trophyShelf(ms, [
      act({ kind: 'trophy', preset: 'league_winner', toUserId: 'a', ref: '2026-10-12', points: 30 }),
      act({ kind: 'trophy', preset: 'league_winner', toUserId: 'b', ref: '2026-10-19', points: 40 }),
      act({ kind: 'trophy', preset: 'league_winner', toUserId: 'gone', ref: '2026-10-05', points: 50 }),
      act({ kind: 'trophy', preset: 'none', ref: '2026-09-28' }),
    ]);
    expect(shelf.map((t) => [t.weekKey, t.userId])).toEqual([['2026-10-19', 'b'], ['2026-10-12', 'a']]);
  });
});

describe('a team\'s weekly roll-up', () => {
  it('counts only, roster athletes only (not the coach, not an athlete who left the roster), weakest first', () => {
    const ms = [member('coach', { role: 'owner' }), member('a'), member('b', { band: 'teen' }), member('off', { onRoster: false })];
    const a = act0({
      drillDays: { a: ['2026-10-26', '2026-10-27'], b: [], off: ['2026-10-26'] },
      runs: [{ userId: 'b', at: at('2026-10-27'), won: false }, { userId: 'b', at: at('2026-10-20'), won: false }, { userId: 'b', at: at('2026-10-21'), won: true }],
    });
    const r = teamRollup(ms, a, WEEK, true);
    expect(r.rows.map((x) => [x.userId, x.drillDays, x.runsThisWeek, x.runsLastWeek, x.trend, x.minor])).toEqual([
      ['b', 0, 1, 2, 'down', true], ['a', 2, 0, 0, 'up', false],
    ]);
    expect(r.totals).toEqual({ athletes: 2, active: 2, drillDays: 2, runs: 1 });
    expect(r.drillAssigned).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/score|jump|reps/i);
  });
});
