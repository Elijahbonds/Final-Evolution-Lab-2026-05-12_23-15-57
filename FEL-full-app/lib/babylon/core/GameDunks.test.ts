// H2e (owner 2026-10-16, "more dunks"): the family by the stick, the putback, the received alley-oop, the contest's tricks in games.
import { describe, expect, it } from 'vitest';
import { familyFromStick, ONE_HAND, FAMILY_PICK_K, putbackDunkOn, PUTBACK_AI_DUNK, oopCut, contestTricksOn, CONTEST_TRICK, trickPctFor, BREAKAWAY_CLEAR_M } from './GameDunks';
import { STANDING, WINDMILL, CRADLE, SHOWTIME_MOMENTUM } from './HoopsDunks';
import { CLEAN_WINDOW, STICK_TRICK, MISTIME_MAX_PCT, FLICK_MIN, trickPct } from './DunkTrickStick';

describe('the dunk family by the stick at the takeoff', () => {
  it('up one hand, down two, right the windmill, left the cradle; a stick not pushed names nothing', () => {
    expect(familyFromStick(0, -1)).toBe(ONE_HAND); expect(familyFromStick(0, 1)).toBe(STANDING);
    expect(familyFromStick(1, 0)).toBe(WINDMILL); expect(familyFromStick(-1, 0)).toBe(CRADLE);
    expect(familyFromStick(0.2, -FLICK_MIN + 0.1)).toBeNull();
  });
  it('the takeoff window closes before the trick stick\'s opens — one push never means both', () => expect(FAMILY_PICK_K).toBeLessThan(CLEAN_WINDOW.from));
  it('the one-hand flush is a clip the rigs carry (the contest\'s flush)', () => expect(ONE_HAND.clip).toBe('dunk_flush_one'));
});

describe('the putback dunk', () => {
  const r = (o: Partial<Parameters<typeof putbackDunkOn>[0]>) => putbackDunkOn({ offensive: true, atIron: true, who: 'me', sprintHeld: true, roll: () => 0, ...o });
  it('mine: an offensive board at the iron with R2 held', () => {
    expect(r({})).toBe(true); expect(r({ sprintHeld: false })).toBe(false);
    expect(r({ offensive: false })).toBe(false); expect(r({ atIron: false })).toBe(false);
  });
  it('his: PUTBACK_AI_DUNK of the time', () => {
    expect(r({ who: 'foe', sprintHeld: false, roll: () => PUTBACK_AI_DUNK - 0.01 })).toBe(true);
    expect(r({ who: 'foe', sprintHeld: true, roll: () => PUTBACK_AI_DUNK + 0.01 })).toBe(false);
  });
});

describe('the alley-oop, received (oopCut)', () => {
  const rim = { x: 0, z: 0 };
  it('cutting hard at the rim inside the band gets the lob; a drift, a slow walk, or too far does not', () => {
    expect(oopCut({ x: 0, z: 4 }, { x: 0, z: -4 }, rim)).toBe(true);
    expect(oopCut({ x: 0, z: 4 }, { x: 4, z: 0 }, rim)).toBe(false);
    expect(oopCut({ x: 0, z: 4 }, { x: 0, z: -2 }, rim)).toBe(false);
    expect(oopCut({ x: 0, z: 8 }, { x: 0, z: -4 }, rim)).toBe(false);
  });
});

describe('the contest\'s tricks in games', () => {
  it('only on a breakaway (no body in the flight, nobody near) with the game going my way', () => {
    expect(contestTricksOn({ contested: false, nearestDefenderM: BREAKAWAY_CLEAR_M + 1, momentum01: SHOWTIME_MOMENTUM })).toBe(true);
    expect(contestTricksOn({ contested: true, nearestDefenderM: 9, momentum01: 1 })).toBe(false);
    expect(contestTricksOn({ contested: false, nearestDefenderM: BREAKAWAY_CLEAR_M - 0.5, momentum01: 1 })).toBe(false);
    expect(contestTricksOn({ contested: false, nearestDefenderM: 9, momentum01: SHOWTIME_MOMENTUM - 0.05 })).toBe(false);
  });
  it('each is worth more than the game\'s trick on its direction when green, costs more missed — and a miss stays below MISTIME_MAX_PCT', () => {
    for (const t of Object.keys(CONTEST_TRICK) as (keyof typeof CONTEST_TRICK)[]) {
      expect(CONTEST_TRICK[t].pctBonus).toBeGreaterThan(STICK_TRICK[t].pctBonus);
      expect(CONTEST_TRICK[t].pctPenalty).toBeGreaterThan(STICK_TRICK[t].pctPenalty);
      expect(trickPctFor(0.92, CONTEST_TRICK[t], 'late')).toBeLessThanOrEqual(MISTIME_MAX_PCT);
      expect(trickPctFor(0.92, STICK_TRICK[t], 'green')).toBeCloseTo(trickPct(0.92, t, 'green'), 12);   // the same pricing as the game's
    }
  });
});
