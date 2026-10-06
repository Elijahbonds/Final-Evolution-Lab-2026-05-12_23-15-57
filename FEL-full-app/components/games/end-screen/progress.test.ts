// END SCREEN — "next to earn", the callouts and the grade badge: only from data the run or the device actually has.
import { describe, it, expect } from 'vitest';
import { progressLines, calloutChips, STREAK_CAP_DAYS_VIEW, SEASON_TIERS_VIEW } from './progress';
import { gradeBadge } from './grade';
import { STREAK_CAP_DAYS } from '@/lib/session-payout';
import { SeasonPassCore } from '@/lib/season/season-pass-core';
import type { EndRecap } from './types';
import type { RunCallouts } from './records';

const recap = (o: Partial<EndRecap> = {}): EndRecap => ({ xp: 100, shards: 1, credits: 15, prqDelta: 0.5, prqAfter: 61, ...o });
const season = { name: 'Season 1', gained: 300, tier: 4, into: 200, need: 722, hasPro: false, tierUps: [] };
const rec = (o: Partial<RunCallouts> = {}): RunCallouts => ({ newBest: false, firstRun: false, previousBest: 30, best: 30, winRun: 0, shortBy: null, ...o });

describe('the restated constants stay equal to their owners', () => {
  it('the streak cap and the season length', () => {
    expect(STREAK_CAP_DAYS_VIEW).toBe(STREAK_CAP_DAYS);
    expect(SEASON_TIERS_VIEW).toBe(new SeasonPassCore().tiers);
  });
});

describe('next to earn', () => {
  it('the season: XP to the next tier, with its bar', () => {
    const l = progressLines(recap({ season }), null, false);
    expect(l).toContainEqual({ id: 'season', text: '522 season XP to Tier 5', pct: (200 / 722) * 100 });
  });
  it('mastery: the next tier by name, from the server\'s tier index', () => {
    expect(progressLines(recap({ mastery: { mode: 'x', tier: 'Silver', tierIndex: 2, ups: [] } }), null, false)).toContainEqual({ id: 'mastery', text: 'Mastery Silver · next: Gold' });
    expect(progressLines(recap({ mastery: { mode: 'x', tier: 'Venice Legend', tierIndex: 5, ups: [] } }), null, false)[0].text).toMatch(/top tier/);
  });
  it('the streak: the day, and tomorrow — or the top bonus at the cap', () => {
    expect(progressLines(recap({ streakDays: 3 }), null, false)).toContainEqual({ id: 'streak', text: 'Day 3 streak · play tomorrow for day 4' });
    expect(progressLines(recap({ streakDays: STREAK_CAP_DAYS }), null, false)[0].text).toMatch(/top streak bonus/);
  });
  it('the best and the win run, from the device', () => {
    const l = progressLines(null, rec({ shortBy: 7, best: 30, winRun: 2 }), true);
    expect(l.map((x) => x.id)).toEqual(['best', 'winRun']);
    expect(l[0].text).toBe('7 short of your best (30)');
  });
  it('an unpaid or NO PLAY run promises nothing from the server\'s numbers', () => {
    for (const r of [recap({ unpaid: 'AGENT', season, streakDays: 3 }), recap({ noPlay: true, season, streakDays: 3 })]) {
      expect(progressLines(r, null, false)).toEqual([]);
    }
  });
});

describe('callouts', () => {
  it('a new best is gold and says what it was', () => {
    expect(calloutChips(rec({ newBest: true, previousBest: 18, best: 21 }), null, false)[0]).toEqual({ id: 'best', text: 'NEW PERSONAL BEST', sub: 'was 18', gold: true });
  });
  it('a first run is logged, not gold', () => {
    const c = calloutChips(rec({ firstRun: true, previousBest: null, best: 12 }), null, false)[0];
    expect(c.id).toBe('first');
    expect(c.gold).toBeUndefined();
  });
  it('win runs from two, only on a win; the streak only when the server says so', () => {
    expect(calloutChips(rec({ winRun: 3 }), null, true).map((c) => c.text)).toEqual(['3 WINS IN A ROW']);
    expect(calloutChips(rec({ winRun: 1 }), null, true)).toEqual([]);
    expect(calloutChips(null, recap({ streakDays: 4, streakBonus: 20 }), false)).toEqual([{ id: 'streak', text: 'DAY 4 STREAK', sub: '+20 streak LC' }]);
    expect(calloutChips(null, recap({ streakDays: 1, streakBonus: 0 }), false)).toEqual([]);
    expect(calloutChips(null, recap({ unpaid: 'SCORE_INVALID', streakDays: 4, streakBonus: 20 }), false)).toEqual([]);
  });
});

describe('the grade badge: only what the mode reported', () => {
  it('a letter, freerun\'s number, the Cypher\'s accuracy, the kart\'s medal', () => {
    expect(gradeBadge('x', { stats: { grade: 'a' } })).toMatchObject({ label: 'A', kind: 'letter' });
    expect(gradeBadge('freerun', { stats: { grade: 5 } })).toMatchObject({ label: 'S' });
    expect(gradeBadge('freerun', { stats: { grade: 1 } })).toMatchObject({ label: 'D' });
    expect(gradeBadge('dance', { stats: { accuracy: 96 } })).toMatchObject({ label: 'S' });
    expect(gradeBadge('dance', { stats: { accuracy: 72 } })).toMatchObject({ label: 'B' });
    expect(gradeBadge('velocityKart', { stats: { medal: 3 } })).toMatchObject({ label: 'GOLD', kind: 'medal' });
  });
  it('nothing reported, nothing shown', () => {
    expect(gradeBadge('hoops1v1', { stats: { foeScore: 9 } })).toBeNull();
    expect(gradeBadge('velocityKart', { stats: { medal: 0 } })).toBeNull();
    expect(gradeBadge('freerun', { stats: { grade: 0 } })).toBeNull();
    expect(gradeBadge('tennis', { stats: { accuracy: 90 } })).toBeNull();   // accuracy is the Cypher's judge, not every mode's
    expect(gradeBadge('x', {})).toBeNull();
  });
});

describe('highlights: the mode\'s own stats, never computed', () => {
  it('reads the keys the modes send, in order, up to three', async () => {
    const { highlights } = await import('./highlights');
    expect(highlights({ stats: { points: 21, bestStreak: 7, place: 1, field: 8, rivalScore: 17 } })).toEqual([
      { key: 'place', label: 'Place', value: '1st of 8' }, { key: 'bestStreak', label: 'Best streak', value: '7' },
    ]);
    expect(highlights({ stats: { homers: 9, outs: 3, longestFt: 452, rivalHomers: 7 } }).map((h) => h.value)).toEqual(['9', '452 ft']);
    expect(highlights({ stats: { wave: 6, kos: 41, bestFlow: 3 } }).map((h) => h.key)).toEqual(['wave', 'kos']);
    expect(highlights({ stats: {}, maxCombo: 14 })).toEqual([{ key: 'maxCombo', label: 'Max combo', value: '×14' }]);
    expect(highlights({ stats: { foeScore: 9, momentum: 3 } })).toEqual([]);
    expect(highlights({ stats: { a: 1, gatesHit: 12, gates: 14, tricksLanded: 5, bestCombo: 4, place: 2 } })).toHaveLength(3);
  });
});

describe('next to earn fits the screen', () => {
  it('three lines at most, nearest goals first', async () => {
    const { MAX_PROGRESS_LINES } = await import('./progress');
    const l = progressLines(recap({ season, mastery: { mode: 'x', tier: 'Gold', tierIndex: 3, ups: [] }, streakDays: 4 }), rec({ shortBy: 3, winRun: 2 }), true);
    expect(l).toHaveLength(MAX_PROGRESS_LINES);
    expect(l.map((x) => x.id)).toEqual(['season', 'mastery', 'streak']);
  });
});
