// lane/hoops-builder (owner 2026-11-12): the five hoops ratings → the game numbers. Rating 50 is today exactly; the bands are the
// stated ones; a rating-free run is today whatever the athlete; the restated "today" numbers are the real ones.
import { describe, expect, it } from 'vitest';
import {
  HOOPS_RATING_IDS, HOOPS_POSITIONS, NEUTRAL_ATHLETE, NEUTRAL_RATINGS, POSITION_LEAN, HEIGHT_LEAN_PER_IN, TODAY_TUNING, RATING_MIN, RATING_MAX,
  HEIGHT_DEFAULT_IN, HEIGHT_MIN_IN, HEIGHT_MAX_IN, TODAY_HANDLE, CHAIN_WINDOW_SEC_PER_HANDLE, TODAY_TOP_SPEED_MPS, TODAY_STRIP_REACH_M,
  bands, clampHeight, effectLine, heightLabel, heightLine, lift, ratingFreeRun, runContextOf, sameAsToday, startingRatings, tuningFor,
  type HoopsAthlete, type RatingBands,
} from './ratings';
import { BASELINE_HANDLE, chainWindowSec } from '../core/HandleSystem';
import { DEFAULT_MOVEMENT } from '../core/CourtMovement';
import { STRIP_REACH_M } from './steals';
import { MOVE_LEAN_MPS } from './rulebook';
import { COMPETITIVE_PARAMS } from '../core/playFrame';
import { STAKED_RUN_PARAMS } from '../core/Difficulty';

const CASUAL = { ratingFree: false };
const at = (r: Partial<Record<(typeof HOOPS_RATING_IDS)[number], number>>, heightIn = HEIGHT_DEFAULT_IN): HoopsAthlete =>
  ({ ratings: { ...NEUTRAL_RATINGS, ...r }, position: 'wing', heightIn });

describe('rating 50 is today, exactly', () => {
  it('the default athlete (a wing at 6\'4", every rating 50) plays today\'s numbers, to the bit', () => {
    const t = tuningFor(NEUTRAL_ATHLETE, CASUAL);
    expect(t).toEqual(TODAY_TUNING);
    for (const k of Object.keys(TODAY_TUNING) as (keyof typeof TODAY_TUNING)[]) expect(Object.is(t[k], TODAY_TUNING[k]), k).toBe(true);
    expect(t.rated).toBe(false);
    expect(sameAsToday(t)).toBe(true);
  });

  it('today is every scale 1, every add 0, and the handle HandleSystem.BASELINE_HANDLE', () => {
    expect(TODAY_TUNING).toEqual({
      rated: false, topSpeedScale: 1, accelScale: 1, handle: BASELINE_HANDLE, moveLeanScale: 1, greenScale: 1, finishContestScale: 1,
      slideSpeedScale: 1, stealReachScale: 1, blockReachAddM: 0, reachAddM: 0,
    });
  });

  it('a wing at 6\'4" starts on all 50; every position and every inch is a trade that adds up to 0', () => {
    expect(startingRatings('wing', HEIGHT_DEFAULT_IN)).toEqual(NEUTRAL_RATINGS);
    for (const p of HOOPS_POSITIONS) expect(HOOPS_RATING_IDS.reduce((s, id) => s + POSITION_LEAN[p][id], 0), p).toBe(0);
    expect(HOOPS_RATING_IDS.reduce((s, id) => s + HEIGHT_LEAN_PER_IN[id], 0)).toBe(0);
  });

  it('no athlete, or the ratings switched off, is today', () => {
    expect(tuningFor(null, CASUAL)).toEqual(TODAY_TUNING);
    expect(tuningFor(at({ speed: 90 }), CASUAL, zeroBands())).toEqual({ ...TODAY_TUNING, rated: false });
  });
});

const zeroBands = (): RatingBands => ({ speed: 0, handle: 0, read: 0, green: 0, finish: 0, slide: 0, stealReach: 0, blockReachM: 0, heightReachMPerIn: 0 });

describe('the stated bands (at 90, and a quarter of it the other way at 40)', () => {
  it('lift: 0 at 50, 1 at 90, −0.25 at 40; clamped outside', () => {
    expect(lift(50)).toBe(0); expect(lift(90)).toBe(1); expect(lift(40)).toBe(-0.25); expect(lift(70)).toBe(0.5);
    expect(lift(120)).toBe(1); expect(lift(0)).toBe(-0.25); expect(lift(Number.NaN)).toBe(0);
    expect([RATING_MIN, RATING_MAX]).toEqual([40, 90]);
  });

  it('speed: top speed and first step ×1.06 at 90 (6.4 → 6.784 m/s), ×0.985 at 40', () => {
    const hi = tuningFor(at({ speed: 90 }), CASUAL), lo = tuningFor(at({ speed: 40 }), CASUAL);
    expect(hi.topSpeedScale).toBeCloseTo(1.06, 12); expect(hi.accelScale).toBeCloseTo(1.06, 12);
    expect(TODAY_TOP_SPEED_MPS * hi.topSpeedScale).toBeCloseTo(6.784, 9);
    expect(lo.topSpeedScale).toBeCloseTo(0.985, 12);
  });

  it('handle: the handle the moves read 50 → 70 at 90 (combo window 0.44 → 0.544 s), 45 at 40; the lean line ×0.85 at 90', () => {
    const hi = tuningFor(at({ handle: 90 }), CASUAL), lo = tuningFor(at({ handle: 40 }), CASUAL);
    expect(hi.handle).toBe(70); expect(lo.handle).toBe(45);
    expect(chainWindowSec(hi.handle) - chainWindowSec(TODAY_HANDLE)).toBeCloseTo(20 * CHAIN_WINDOW_SEC_PER_HANDLE, 12);
    expect(chainWindowSec(hi.handle)).toBeCloseTo(0.544, 12);
    expect(hi.moveLeanScale).toBeCloseTo(0.85, 12);
    expect(MOVE_LEAN_MPS * hi.moveLeanScale).toBeCloseTo(0.51, 12);
    expect(lo.moveLeanScale).toBeCloseTo(1.0375, 12);
  });

  it('shooting: the green ×1.10 at 90, ×0.975 at 40', () => {
    expect(tuningFor(at({ shooting: 90 }), CASUAL).greenScale).toBeCloseTo(1.1, 12);
    expect(tuningFor(at({ shooting: 40 }), CASUAL).greenScale).toBeCloseTo(0.975, 12);
  });

  it('finishing: the contest on a finish ×0.85 at 90, ×1.0375 at 40', () => {
    expect(tuningFor(at({ finishing: 90 }), CASUAL).finishContestScale).toBeCloseTo(0.85, 12);
    expect(tuningFor(at({ finishing: 40 }), CASUAL).finishContestScale).toBeCloseTo(1.0375, 12);
  });

  it('defense: slide ×1.06, steal reach ×1.05 (1.2 → 1.26 m), block reach +0.04 m at 90', () => {
    const d = tuningFor(at({ defense: 90 }), CASUAL);
    expect(d.slideSpeedScale).toBeCloseTo(1.06, 12);
    expect(d.stealReachScale).toBeCloseTo(1.05, 12);
    expect(STRIP_REACH_M * d.stealReachScale).toBeCloseTo(1.26, 12);
    expect(d.blockReachAddM).toBeCloseTo(0.04, 12);
  });

  it('height: reach +0.015 m an inch over 6\'4" (6\'8" +0.06 m, 6\'0" −0.06 m)', () => {
    expect(tuningFor(at({}, 80), CASUAL).reachAddM).toBeCloseTo(0.06, 12);
    expect(tuningFor(at({}, 72), CASUAL).reachAddM).toBeCloseTo(-0.06, 12);
    expect(tuningFor(at({}, 80), CASUAL).rated).toBe(true);
  });

  it('one rating moves only its own numbers', () => {
    const t = tuningFor(at({ shooting: 90 }), CASUAL);
    expect({ ...t, greenScale: 1, rated: false }).toEqual(TODAY_TUNING);
  });

  it('a band at 0 takes that rating out of play', () => {
    const b = { ...bands(), green: 0 };
    expect(tuningFor(at({ shooting: 90 }), CASUAL, b).greenScale).toBe(1);
  });
});

describe('rating-free where others compare', () => {
  it('a ranked, staked, arena, challenge, online or party run is today, whatever the athlete', () => {
    const maxed: HoopsAthlete = { ratings: { speed: 90, handle: 90, shooting: 90, finishing: 90, defense: 90 }, position: 'big', heightIn: 80 };
    for (const k of COMPETITIVE_PARAMS) {
      expect(ratingFreeRun(`?${k}=x`), k).toBe(true);
      expect(ratingFreeRun(`?${k}=`), `${k} (empty: fails closed)`).toBe(true);
      expect(tuningFor(maxed, { ratingFree: ratingFreeRun(`?${k}=1`) }), k).toEqual(TODAY_TUNING);
    }
    // every staked run (the ones that play PRO) is in the list
    for (const k of STAKED_RUN_PARAMS) expect(ratingFreeRun(`?${k}=1`), k).toBe(true);
    expect(ratingFreeRun('?arena=abc&tier=elite')).toBe(true);
  });

  it('a casual run (no key, a tier pick, a playtest) is rated', () => {
    for (const q of ['', '?tier=rookie', '?playtest=1', null, undefined]) expect(ratingFreeRun(q as string), String(q)).toBe(false);
    expect(tuningFor(at({ speed: 90 }), { ratingFree: ratingFreeRun('?tier=pro') }).rated).toBe(true);
  });

  it('the harness stamp reads the same way', () => {
    expect(runContextOf({ felCompetitive: true })).toEqual({ ratingFree: true });
    expect(runContextOf({ felRanked: true })).toEqual({ ratingFree: true });
    expect(runContextOf({})).toEqual({ ratingFree: false });
    expect(runContextOf(undefined)).toEqual({ ratingFree: false });
  });
});

describe('the restated numbers are today\'s', () => {
  it('handle, chain window, top speed, steal reach', () => {
    expect(TODAY_HANDLE).toBe(BASELINE_HANDLE);
    expect(chainWindowSec(51) - chainWindowSec(50)).toBeCloseTo(CHAIN_WINDOW_SEC_PER_HANDLE, 12);
    expect(TODAY_TOP_SPEED_MPS).toBe(DEFAULT_MOVEMENT.maxSpeed);
    expect(TODAY_STRIP_REACH_M).toBe(STRIP_REACH_M);
  });
});

describe('the words', () => {
  it('50 reads Standard; the lines carry the same numbers as the tuning', () => {
    for (const id of HOOPS_RATING_IDS) expect(effectLine(id, 50)).toBe('Standard');
    expect(effectLine('speed', 90)).toBe('Top speed and first step +6%');
    expect(effectLine('speed', 40)).toBe('Top speed and first step −1.5%');
    expect(effectLine('shooting', 70)).toBe('Green window +5%');
    expect(effectLine('handle', 90)).toBe('Combo window +0.10 s, moves beat a defender more easily');
    expect(effectLine('finishing', 90)).toBe('Defenders bother your finishes 15% less');
    expect(effectLine('finishing', 40)).toBe('Defenders bother your finishes 3.8% more');
    expect(effectLine('defense', 90)).toBe('Slide +6%, steal reach +6 cm, block reach +4 cm');
  });

  it('heights', () => {
    expect(heightLabel(76)).toBe('6\'4"'); expect(heightLabel(72)).toBe('6\'0"'); expect(heightLabel(80)).toBe('6\'8"');
    expect(heightLine(76)).toBe('Standard reach'); expect(heightLine(80)).toBe('Reach +6 cm'); expect(heightLine(72)).toBe('Reach −6 cm');
    expect(clampHeight(99)).toBe(HEIGHT_MAX_IN); expect(clampHeight(10)).toBe(HEIGHT_MIN_IN); expect(clampHeight('x')).toBe(HEIGHT_DEFAULT_IN);
  });
});
