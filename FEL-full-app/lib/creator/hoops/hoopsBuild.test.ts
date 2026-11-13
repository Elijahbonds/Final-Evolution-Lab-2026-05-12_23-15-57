// lane/hoops-builder (owner 2026-11-12): the hoops part of the athlete — what it starts on, what a step costs, what a game pays, the
// Creator's ceilings, and the server's check of a player's choice.
import { describe, expect, it } from 'vitest';
import {
  CHEAP_STEPS, HOOPS_BUILD_VERSION, MIN_GAME_MS, POINTS_DAY_CAP, POINTS_PER_GAME, POINTS_PER_WIN, STEP_COST_HIGH,
  accrue, applyChoice, athleteOf, ceilingAxis, costOfSteps, countFrom, defaultHoopsBuild, pointsLeft, pointsSpent, ratingCeilings,
  ratingsOf, readHoopsBuild, stepCost, utcMidnight, viewOf, type HoopsBuild, type HoopsRun,
} from './hoopsBuild';
import { NEUTRAL_RATINGS, RATING_MAX, TODAY_TUNING, tuningFor } from '../../babylon/hoops/ratings';
import { ceilingFor, MIN_CEILING } from '../schema/ceilings';
import { ATTRIBUTES } from '../schema/attributes';

const NOW = new Date('2026-11-12T18:00:00.000Z');
const run = (iso: string, won = false, durationMs = 120_000): HoopsRun => ({ finishedAt: new Date(iso), won, durationMs });
const withPoints = (earned: number): HoopsBuild => ({ ...defaultHoopsBuild(), points: { earned, through: NOW.toISOString(), day: '2026-11-12', dayEarned: 0 } });
const steps = (s: Partial<HoopsBuild['steps']>) => ({ ...NEUTRAL_RATINGS, speed: 0, handle: 0, shooting: 0, finishing: 0, defense: 0, ...s });

describe('the default athlete is today', () => {
  it('a wing at 6\'4", no steps, every rating 50 — and its tuning is today\'s numbers', () => {
    const b = defaultHoopsBuild();
    expect(b).toMatchObject({ v: HOOPS_BUILD_VERSION, position: 'wing', heightIn: 76, steps: { speed: 0, handle: 0, shooting: 0, finishing: 0, defense: 0 } });
    expect(ratingsOf(b, null)).toEqual(NEUTRAL_RATINGS);
    expect(tuningFor(athleteOf(b, null), { ratingFree: false })).toEqual(TODAY_TUNING);
  });

  it('a guard and a big start where their trade puts them', () => {
    expect(ratingsOf({ ...defaultHoopsBuild(), position: 'guard', heightIn: 72 }, null)).toEqual({ speed: 57, handle: 58, shooting: 51, finishing: 42, defense: 42 });
    expect(ratingsOf({ ...defaultHoopsBuild(), position: 'big', heightIn: 80 }, null)).toEqual({ speed: 42, handle: 42, shooting: 48, finishing: 59, defense: 59 });
  });
});

describe('what a step costs', () => {
  it('the first 15 steps on a rating cost 1 each, every step after 2', () => {
    expect(CHEAP_STEPS).toBe(15); expect(STEP_COST_HIGH).toBe(2);
    expect(stepCost(1)).toBe(1); expect(stepCost(15)).toBe(1); expect(stepCost(16)).toBe(2);
    expect(costOfSteps(0)).toBe(0); expect(costOfSteps(15)).toBe(15); expect(costOfSteps(16)).toBe(17); expect(costOfSteps(40)).toBe(65);
    for (let n = 1; n <= 40; n++) expect(costOfSteps(n) - costOfSteps(n - 1)).toBe(stepCost(n));
  });

  it('raising all five from 50 to 90 costs 325 points (about a month at the day cap)', () => {
    expect(pointsSpent(steps({ speed: 40, handle: 40, shooting: 40, finishing: 40, defense: 40 }))).toBe(325);
    expect(Math.ceil(325 / POINTS_DAY_CAP)).toBe(33);
  });
});

describe('what a game pays', () => {
  it('2 a finished game, 3 a win, up to 10 a UTC day', () => {
    expect([POINTS_PER_GAME, POINTS_PER_WIN, POINTS_DAY_CAP, MIN_GAME_MS]).toEqual([2, 1, 10, 30_000]);
    const p = withPoints(0).points;
    const r = accrue({ ...p, through: '2026-11-12T00:00:00.000Z', day: null }, [run('2026-11-12T10:00:00Z'), run('2026-11-12T11:00:00Z', true)], NOW);
    expect(r.gained).toBe(5);
    expect(r.points).toMatchObject({ earned: 5, day: '2026-11-12', dayEarned: 5, through: '2026-11-12T11:00:00.000Z' });
  });

  it('the day cap holds however many games are played, and a new UTC day starts again', () => {
    const many = Array.from({ length: 12 }, (_, i) => run(`2026-11-11T${String(8 + i).padStart(2, '0')}:00:00Z`, true));
    const p = { earned: 0, through: '2026-11-11T00:00:00.000Z', day: null, dayEarned: 0 };
    const r = accrue(p, [...many, run('2026-11-12T01:00:00Z', true)], NOW);
    expect(r.points.earned).toBe(POINTS_DAY_CAP + 3);
    expect(r.points.day).toBe('2026-11-12');
    expect(r.points.dayEarned).toBe(3);
  });

  it('a run counts once: a second claim over the same runs pays nothing', () => {
    const runs = [run('2026-11-12T10:00:00Z', true)];
    const first = accrue({ earned: 0, through: '2026-11-12T00:00:00.000Z', day: null, dayEarned: 0 }, runs, NOW);
    const again = accrue(first.points, runs, NOW);
    expect(first.gained).toBe(3);
    expect(again.gained).toBe(0);
    expect(again.points).toEqual(first.points);
  });

  it('a start-and-quit (under 30 s) pays nothing but is passed over; a run in the future is not counted', () => {
    const r = accrue({ earned: 0, through: '2026-11-12T00:00:00.000Z', day: null, dayEarned: 0 },
      [run('2026-11-12T09:00:00Z', true, 29_999), run('2026-11-13T09:00:00Z', true)], NOW);
    expect(r.gained).toBe(0);
    expect(r.points.through).toBe('2026-11-12T09:00:00.000Z');
  });

  it('a first visit counts from the start of today, never further back', () => {
    const fresh = defaultHoopsBuild().points;
    expect(countFrom(fresh, NOW).toISOString()).toBe('2026-11-12T00:00:00.000Z');
    const r = accrue(fresh, [run('2026-11-11T23:00:00Z', true), run('2026-11-12T09:00:00Z')], NOW);
    expect(r.gained).toBe(POINTS_PER_GAME);
    expect(utcMidnight(NOW).toISOString()).toBe('2026-11-12T00:00:00.000Z');
  });
});

describe('the ceilings are the Creator\'s', () => {
  const row = (id: string) => ATTRIBUTES.rows.find((r) => r.id === id)!;

  it('no body scan: no ceiling under 90 (the Creator\'s rule: absence is never a penalty)', () => {
    expect(ratingCeilings(null)).toEqual({ speed: RATING_MAX, handle: RATING_MAX, shooting: RATING_MAX, finishing: RATING_MAX, defense: RATING_MAX });
  });

  it('a measured speed or agility caps Speed and Defense exactly as the Creator caps its Speed and Perimeter Defense rows', () => {
    const prq = { speed: 20, agility: 40, mental: 10 };
    const c = ratingCeilings(prq);
    expect(c.speed).toBe(Math.min(RATING_MAX, ceilingFor(row('speed'), prq)));
    expect(c.speed).toBe(MIN_CEILING);                    // 20 + 22 headroom is under the Creator's floor of 55
    expect(c.defense).toBe(ceilingFor(row('perimeterD'), prq));   // 40 + 22 = 62
    expect(c.defense).toBe(62);
    expect([c.handle, c.shooting, c.finishing]).toEqual([RATING_MAX, RATING_MAX, RATING_MAX]);   // skill: nothing measured caps it
    expect(ceilingAxis('speed')).toBe('speed'); expect(ceilingAxis('defense')).toBe('agility'); expect(ceilingAxis('shooting')).toBeNull();
  });

  it('a stored rating over a ceiling plays AT the ceiling', () => {
    const b = { ...withPoints(100), steps: steps({ speed: 20 }) };
    expect(ratingsOf(b, { speed: 20 }).speed).toBe(MIN_CEILING);
    expect(ratingsOf(b, null).speed).toBe(70);
  });
});

describe('the server\'s check of a choice', () => {
  const choice = (s: Partial<HoopsBuild['steps']>, position: unknown = 'wing', heightIn: unknown = 76) => ({ position, heightIn, steps: steps(s) });

  it('accepts a legal choice and keeps the stored points (a client cannot send points)', () => {
    const cur = withPoints(20);
    const r = applyChoice(cur, { ...choice({ speed: 5, shooting: 10 }, 'guard', 74), points: { earned: 9999 } } as never, null);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.build).toMatchObject({ position: 'guard', heightIn: 74, steps: { speed: 5, shooting: 10 } });
      expect(r.build.points).toEqual(cur.points);
      expect(pointsLeft(r.build)).toBe(5);
    }
  });

  it('points can never go below zero: a choice that costs more than was earned is refused, not trimmed', () => {
    const r = applyChoice(withPoints(10), choice({ speed: 11 }), null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues).toEqual([{ field: 'points', message: 'That needs 11 points. You have earned 10.' }]);
  });

  it('refuses a rating past its ceiling, and says which body axis raises it', () => {
    const r = applyChoice(withPoints(100), choice({ speed: 6 }), { speed: 20 });   // 50 + 6 = 56 > 55
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]).toEqual({ field: 'speed', message: 'Speed can go to 55. Your body scan sets that ceiling: train speed to raise it.' });
    expect(applyChoice(withPoints(100), choice({ speed: 5 }), { speed: 20 }).ok).toBe(true);
    const over90 = applyChoice(withPoints(500), choice({ shooting: 41 }), null);
    expect(over90.ok).toBe(false);
  });

  it('refuses junk: an unknown position, a height off the list, a negative or fractional step', () => {
    const bad = (c: unknown) => { const r = applyChoice(withPoints(100), c as never, null); return r.ok ? [] : r.issues.map((i) => i.field); };
    expect(bad(choice({}, 'center'))).toEqual(['position']);
    expect(bad(choice({}, 'wing', 81))).toEqual(['heightIn']);
    expect(bad(choice({}, 'wing', 75.5))).toEqual(['heightIn']);
    expect(bad(choice({ speed: -1 }))).toEqual(['speed']);
    expect(bad(choice({ handle: 1.5 }))).toEqual(['handle']);
    expect(bad({ position: 'wing', heightIn: 76, steps: null })).toEqual(['points']);
  });

  it('a minus refunds in full (steps back to 0 costs 0)', () => {
    const cur = { ...withPoints(20), steps: steps({ speed: 10 }) };
    const r = applyChoice(cur, choice({}), null);
    expect(r.ok && pointsLeft(r.build)).toBe(20);
  });
});

describe('reading what is stored', () => {
  it('nothing, junk or a broken part reads as the default — never throws', () => {
    for (const raw of [undefined, null, 'x', 5, [], {}]) expect(readHoopsBuild(raw)).toEqual({ build: defaultHoopsBuild(), fromFuture: false });
    const r = readHoopsBuild({ v: 1, position: 'center', heightIn: 99, steps: { speed: -3, handle: 2.7, shooting: 'x' }, points: { earned: -5, through: 'nope', day: 'today', dayEarned: 4 } });
    expect(r.build).toEqual({ ...defaultHoopsBuild(), steps: { speed: 0, handle: 2, shooting: 0, finishing: 0, defense: 0 } });
  });

  it('a newer version is read and flagged, so the server will not write over it', () => {
    const r = readHoopsBuild({ v: 2, position: 'big', heightIn: 79, steps: { defense: 4 }, points: { earned: 12, through: NOW.toISOString(), day: '2026-11-12', dayEarned: 6 } });
    expect(r.fromFuture).toBe(true);
    expect(r.build).toMatchObject({ position: 'big', heightIn: 79, steps: { defense: 4 }, points: { earned: 12, dayEarned: 6 } });
  });

  it('the view: points earned, spent, left and today', () => {
    const b = { ...withPoints(30), steps: steps({ speed: 16 }), points: { earned: 30, through: NOW.toISOString(), day: '2026-11-12', dayEarned: 7 } };
    expect(viewOf(b, null, NOW).points).toEqual({ earned: 30, spent: 17, left: 13, today: 7, dayCap: POINTS_DAY_CAP });
    expect(viewOf(b, null, new Date('2026-11-13T01:00:00Z')).points.today).toBe(0);
    expect(viewOf(b, null, NOW).ratings.speed).toBe(66);
  });
});
