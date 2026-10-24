// PROGRESS CARD: the card renders from real rows, and says only what the rows say.
import { describe, expect, it } from 'vitest';
import { buildProgressCard, headlineFor, stateOf, summarizeCard, weekLabel, withTile, modesOf } from './card';
import { formFrom } from '@/lib/profile-v2/tiles';
import { READ_CAP } from '@/lib/profile-v2/load';
import { recordCheckValues } from '@/lib/mirror/baselines';
import {
  NOW, day, adultTwoWeeks, newUser, adultFirstWeek, adultQuietWeek, teenActive, adultNotOptedIn,
} from '@/tests/helpers/progressCardRows';

const build = (rows = adultTwoWeeks(), cap: number = READ_CAP.played) => buildProgressCard('me', rows, NOW, cap);
const tile = (c: ReturnType<typeof build>, key: string) => c.metrics.find((m) => m.key === key)!;

describe('an adult with two weeks of rows', () => {
  const c = build();

  it('jump: the best of each week, in inches, with the arrow and the delta', () => {
    const j = tile(c, 'jump');
    expect(j.value).toBe('26.0');                       // 66 cm
    expect(j.compare?.direction).toBe('up');
    expect(j.compare?.trend).toBe('better');
    expect(j.vsLine).toBe('+1.6 in vs last week');      // 66 cm vs 62 cm
    expect(j.source).toBe('account');
  });

  it('form: the mean clean-rep share of each week, down by more than the noise band', () => {
    const f = tile(c, 'form');
    expect(f.value).toBe('65');
    expect(f.compare?.trend).toBe('worse');
    expect(f.vsLine).toBe('−23 pts vs last week');
  });

  it('reaction: nothing saves one, so the tile is empty and says so (never a number)', () => {
    const r = tile(c, 'reaction');
    expect(r.value).toBeNull();
    expect(r.compare).toBeNull();
    expect(r.empty?.text).toMatch(/Not tracked yet/);
  });

  it('streak: the stored streak, with days played this week vs last', () => {
    const s = tile(c, 'streak');
    expect(s.value).toBe('4');
    expect(s.compare?.thisWeek).toBe(5);
    expect(s.compare?.lastWeek).toBe(4);
    expect(s.compare?.trend).toBe('better');
  });

  it('games: runs this week vs last, and each mode’s best this week vs last, most played first', () => {
    expect(c.games.scope).toBe('account');
    expect(c.games.runs.thisWeek).toBe(5);
    expect(c.games.runs.lastWeek).toBe(4);
    expect(c.games.runsLine).toBe('5 runs this week, 4 runs the week before');
    expect(c.games.modes.map((m) => m.mode)).toEqual(['dunkContest', 'threePoint', 'sprint']);
    const [flight, downtown, sprint] = c.games.modes;
    expect(flight).toMatchObject({ name: 'Flight Night', runsThisWeek: 3, runsLastWeek: 2 });
    expect(flight.compare).toMatchObject({ thisWeek: 9100, lastWeek: 8400, trend: 'better', direction: 'up' });
    expect(flight.vsLine).toBe('+700 vs last week');
    expect(downtown.compare.trend).toBe('same');
    expect(downtown.vsLine).toBe('Same as last week');
    expect(sprint.compare.thisWeek).toBeNull();
    expect(sprint.vsLine).toBe('Not played this week (last week’s best 1,400)');
  });

  it('the headline counts only what has a number in both weeks', () => {
    // jump better, form worse, days played better, Flight Night better, Downtown same; Sprint has no this-week number
    expect(c.tally).toEqual({ better: 3, worse: 1, same: 1, compared: 5 });
    expect(c.state).toBe('compared');
    expect(c.headline).toBe('Better on 3 of 5 against last week.');
  });

  it('carries the adult’s name, the windows, and the clip seam', () => {
    expect(c.name).toBe('Jordan Rig');
    expect(c.minorOrUnknown).toBe(false);
    expect(c.window.to).toBe(NOW.toISOString());
    expect(weekLabel(c)).toBe('Oct 18 – Oct 24');
    expect(c.clips).toBeNull();
  });
});

describe('the honest empty states', () => {
  it('a new user: every tile a dash with a way to measure it, no arrow, no runs line, the new-user headline', () => {
    const c = build(newUser());
    expect(c.state).toBe('new');
    expect(c.metrics.every((m) => m.value === null)).toBe(true);
    expect(c.metrics.every((m) => m.empty?.text && m.compare?.direction == null)).toBe(true);
    expect(c.games.runsLine).toBeNull();
    expect(c.games.modes).toEqual([]);
    expect(c.tally.compared).toBe(0);
    expect(c.headline).toMatch(/^Nothing on your card yet/);
  });

  it('one week only: numbers, but no arrow anywhere and no claim of a change', () => {
    const c = build(adultFirstWeek());
    expect(c.state).toBe('first-week');
    expect(tile(c, 'jump').value).toBe('21.7');
    expect(tile(c, 'jump').vsLine).toBe('Nothing last week to compare');
    expect(tile(c, 'jump').compare?.trend).toBeNull();
    expect(tile(c, 'form').compare?.trend).toBeNull();
    expect(c.games.modes[0].vsLine).toBe('Nothing last week to compare');
    // days played and runs are counts: last week's zero is a real zero (lib/profile-v2/week.ts), so they read as counts
    expect(tile(c, 'streak').vsLine).toBe('2 days played this week · up on last week');
    expect(c.games.runsLine).toBe('2 runs this week, none the week before');
    expect(c.headline).toBe('Your first week on record. Next week’s card shows what changed.');
  });

  it('a quiet week: last week’s rows, nothing this week, the quiet headline, no fake zero', () => {
    const c = build(adultQuietWeek());
    expect(c.state).toBe('quiet-week');
    expect(tile(c, 'jump').value).toBeNull();
    expect(tile(c, 'jump').empty?.text).toBe('No jump this week (best lately 24 in).');
    expect(c.games.modes[0].vsLine).toBe('Not played this week (last week’s best 18)');
    expect(c.headline).toMatch(/^Nothing in the last 7 days yet/);
  });

  it('different things each week: compared state, but nothing to compare, and it says so', () => {
    const rows = { ...newUser(), optIn: { scope: 'jump_numbers', granted: true, revokedAt: null } };
    rows.jumpScans = [{ kind: 'dunk', metrics: { verticalCm: 60 }, createdAt: day(2) }];
    rows.mirrorSessions = [{ patternId: 'squat', reps: 8, faultCounts: recordCheckValues({}, { cleanShare: 0.8 }), createdAt: day(9) }];
    const c = build(rows);
    expect(c.state).toBe('compared');
    expect(c.tally.compared).toBe(0);
    expect(c.headline).toBe('You measured different things each week, so there is nothing to compare yet.');
  });
});

describe('teens are private by default', () => {
  const c = build(teenActive());

  it('no name on a teen card, whatever the stored names say', () => {
    expect(c.minorOrUnknown).toBe(true);
    expect(c.name).toBeNull();
  });

  it('no jump, form or score from the server even when rows slip through the query (the JS gate drops them)', () => {
    expect(tile(c, 'jump').value).toBeNull();
    expect(tile(c, 'jump').compare).toBeNull();
    expect(tile(c, 'form').source).toBe('device');
    expect(tile(c, 'form').value).toBeNull();
    expect(c.games.scope).toBe('device');
    expect(c.games.modes).toEqual([]);
    expect(JSON.stringify(c)).not.toMatch(/9100|8400|Flight Night/);
  });

  it('keeps what teens may have: the streak and the run counts (times only)', () => {
    expect(tile(c, 'streak').value).toBe('4');
    expect(c.games.runs.thisWeek).toBe(5);
    expect(c.state).toBe('compared');
  });

  it('an unknown birth year is treated as under 18', () => {
    const rows = adultTwoWeeks();
    rows.user = { ...rows.user!, dobYear: null };
    const u = build(rows);
    expect(u.name).toBeNull();
    expect(u.games.modes).toEqual([]);
  });

  it('the phone-only form tile, read on the device, re-summarizes the card (the line on top agrees with the tiles)', () => {
    const fresh = build({ ...newUser(), user: { name: 'Kid', dobYear: NOW.getFullYear() - 14, createdAt: day(3) } });
    expect(fresh.state).toBe('new');
    const t = NOW.getTime();
    const phone = formFrom([{ at: t - 2 * 864e5, value: 0.8 }, { at: t - 9 * 864e5, value: 0.5 }], t, 'device');
    const after = withTile(fresh, phone);
    expect(after.state).toBe('compared');
    expect(after.tally).toEqual({ better: 1, worse: 0, same: 0, compared: 1 });
    expect(after.headline).toBe('Better on 1 of 1 against last week.');
    expect(after.name).toBeNull();
  });
});

describe('an adult who has not opted in to saving numbers', () => {
  const c = build(adultNotOptedIn());
  it('games and streak from the account, jump points to the opt-in, form to the phone', () => {
    expect(c.name).toBe('Pat Private');
    expect(c.games.scope).toBe('account');
    expect(c.games.modes.length).toBe(3);
    expect(tile(c, 'jump').value).toBeNull();
    expect(tile(c, 'jump').empty?.href).toBe('/account');
    expect(tile(c, 'form').source).toBe('device');
  });
});

describe('the edges', () => {
  it('a full read says "at least": the counts carry a plus', () => {
    const rows = adultTwoWeeks();
    rows.playedAt = Array.from({ length: 4 }, (_, i) => day(i * 0.5));
    const c = build(rows, 4);
    expect(c.games.runsCapped).toBe(true);
    expect(c.games.runsLine).toBe('4+ runs this week, none the week before');
  });

  it('DERBY-KEY: baseball scores from before the innings cut-over never compare with the new game', () => {
    const now = new Date('2026-10-30T12:00:00Z');
    const modes = modesOf([
      { mode: 'baseball', score: 40, createdAt: new Date('2026-10-23T12:00:00Z') },   // old derby scale
      { mode: 'baseball', score: 7, createdAt: new Date('2026-10-28T12:00:00Z') },
    ], now.getTime());
    expect(modes).toHaveLength(1);
    expect(modes[0].compare).toMatchObject({ thisWeek: 7, lastWeek: null, trend: null });
  });

  it('three modes at most, and a mode only appears when it was played in one of the two weeks', () => {
    const rows = adultTwoWeeks();
    rows.recentScores.push({ mode: 'hoops1v1', score: 21, createdAt: day(30) });
    rows.recentScores.push({ mode: 'hoops1v1', score: 15, createdAt: day(1) }, { mode: 'hoops1v1', score: 11, createdAt: day(1) });
    const c = build(rows);
    expect(c.games.modes).toHaveLength(3);
    // Ones ties Downtown on runs this week (2 each); Downtown was also played last week, so it ranks first; Sprint drops
    expect(c.games.modes.map((m) => m.mode)).toEqual(['dunkContest', 'threePoint', 'hoops1v1']);
  });

  it('every headline is a sentence and none prints a number the tally did not count', () => {
    for (const s of ['new', 'first-week', 'quiet-week', 'compared'] as const) {
      expect(headlineFor(s, { better: 0, worse: 0, same: 0, compared: 0 })).toMatch(/\.$/);
    }
    expect(headlineFor('compared', { better: 0, worse: 2, same: 1, compared: 3 })).toBe('Down on 2 of 3 against last week. One session turns it around.');
    expect(headlineFor('compared', { better: 0, worse: 0, same: 2, compared: 2 })).toBe('Level with last week on both.');
    expect(headlineFor('compared', { better: 0, worse: 0, same: 3, compared: 3 })).toBe('Level with last week on all 3.');
    expect(headlineFor('compared', { better: 0, worse: 0, same: 1, compared: 1 })).toBe('Level with last week.');
  });

  it('summarizeCard and stateOf agree on a hand-built card', () => {
    const c = build();
    const again = summarizeCard({ ...c });
    expect(again.headline).toBe(c.headline);
    expect(stateOf(c.metrics, c.games)).toBe('compared');
  });
});
