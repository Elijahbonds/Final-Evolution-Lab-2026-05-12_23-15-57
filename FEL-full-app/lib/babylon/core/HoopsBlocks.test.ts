// HOOPS-BLOCK-SET BLK-1: K-BLK1 (selector determinism), K-BLK2 (window bounds), K-BLK3 (catch is the tightest), K-BLK5 (fouls).
import { describe, expect, it } from 'vitest';
import { BODY_HARD_GAP, BODY_STANDOFF } from './BasketballCore';
import {
  BLOCK_WINDOWS, CATCH_METER_FULL_MS, FOUL_BAD_ANGLE_PCT, FOUL_HARD_GAP_PCT, FOUL_LATE_MARGIN_MS, FOUL_LATE_PCT, latePress, FOUL_STANDOFF_PCT, FRAME_MS, HOLD_MS,
  STARTER_GATES, blockFoul, blockFoulChance, catchMeter, inWindow, selectBlock, windowFrames, windowWidth, type BlockGates, type BlockInput,
} from './HoopsBlocks';

const ALL: BlockGates = { chase: true, pin: true, catch: true };
const front = (o: Partial<BlockInput> = {}): BlockInput => ({
  tPressMs: -120, holdMs: 0, angleDeg: 10, dist: 1.0, behind: false, phase: 'rising', glassDist: 3, ballY: 2.6, rimY: 3.05,
  inCylinder: false, shot: 'jumper', reachable: true, handAbove: false, ...o,
});
function seeded(seed: number): () => number { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }

// [name, input, gates, expected]
const TABLE: [string, BlockInput, BlockGates, string][] = [
  ['goaltend: falling above the rim', front({ phase: 'falling', ballY: 3.3 }), ALL, 'goaltend'],
  ['goaltend: in the cylinder above the rim, rising', front({ inCylinder: true, ballY: 3.2 }), ALL, 'goaltend'],
  ['goaltend beats a perfect catch', front({ phase: 'apex', inCylinder: true, ballY: 3.2, tPressMs: -40, holdMs: 300 }), ALL, 'goaltend'],
  ['goaltend beats a perfect pin', front({ shot: 'layup', inCylinder: true, ballY: 3.2, glassDist: 0.5, tPressMs: 120 }), ALL, 'goaltend'],
  ['no goaltend when not reachable', front({ phase: 'falling', ballY: 3.3, reachable: false }), ALL, 'contest'],
  ['falling below the rim is no goaltend', front({ phase: 'falling', ballY: 2.9, tPressMs: -120 }), ALL, 'swat'],
  ['not reachable → contest', front({ reachable: false }), ALL, 'contest'],
  ['outside every window (early) → contest', front({ tPressMs: -451 }), ALL, 'contest'],
  ['outside every window (late) → contest', front({ tPressMs: 151 }), ALL, 'contest'],
  ['catch: held, on time, square, close', front({ tPressMs: -40, holdMs: 220, dist: 1.1, angleDeg: 35 }), ALL, 'catch'],
  ['catch edge −82', front({ tPressMs: -82, holdMs: 300 }), ALL, 'catch'],
  ['catch edge +2', front({ tPressMs: 2, holdMs: 300 }), ALL, 'catch'],
  ['catch locked falls through to spike', front({ tPressMs: -40, holdMs: 300, handAbove: true }), STARTER_GATES, 'spike'],
  ['catch locked falls through to swat', front({ tPressMs: -40, holdMs: 300 }), STARTER_GATES, 'swat'],
  ['short hold never catches (spike)', front({ tPressMs: -40, holdMs: 219, handAbove: true }), ALL, 'spike'],
  ['catch never on a falling ball', front({ tPressMs: -40, holdMs: 300, phase: 'falling', ballY: 2.9 }), ALL, 'swat'],
  ['catch never from too far', front({ tPressMs: -40, holdMs: 300, dist: 1.11 }), ALL, 'swat'],
  ['catch never at a wide angle', front({ tPressMs: -40, holdMs: 300, angleDeg: 36 }), ALL, 'swat'],
  ['pin: layup at the glass', front({ shot: 'layup', glassDist: 0.9, tPressMs: 120 }), ALL, 'pin'],
  ['pin: bank', front({ shot: 'bank', glassDist: 0.4, tPressMs: 60 }), ALL, 'pin'],
  ['pin: floater', front({ shot: 'floater', glassDist: 0.4, tPressMs: 180 }), ALL, 'pin'],
  ['no pin on a jumper', front({ shot: 'jumper', glassDist: 0.4, tPressMs: 120 }), ALL, 'contest'],
  ['no pin off the glass', front({ shot: 'layup', glassDist: 0.91, tPressMs: 120 }), ALL, 'contest'],
  ['pin locked → contest (no other window at +120)', front({ shot: 'layup', glassDist: 0.4, tPressMs: 120 }), STARTER_GATES, 'contest'],
  ['pin locked at +100 falls through to chase? no: front → contest', front({ shot: 'layup', glassDist: 0.4, tPressMs: 100 }), { chase: true, pin: false, catch: true }, 'contest'],
  ['chase-down: behind a layup', front({ behind: true, shot: 'layup', tPressMs: 40 }), ALL, 'chase'],
  ['chase-down: behind a dunk, edge +110', front({ behind: true, shot: 'dunk', tPressMs: 110 }), ALL, 'chase'],
  ['chase-down edge −30', front({ behind: true, shot: 'dunk', tPressMs: -30 }), ALL, 'chase'],
  ['behind a jumper → contest', front({ behind: true, shot: 'jumper', tPressMs: 40 }), ALL, 'contest'],
  ['behind, swat timing → never a swat', front({ behind: true, shot: 'layup', tPressMs: -120 }), ALL, 'contest'],
  ['behind, spike timing → never a spike', front({ behind: true, shot: 'layup', tPressMs: -60, handAbove: true }), ALL, 'contest'],
  ['chase locked behind → contest', front({ behind: true, shot: 'layup', tPressMs: 40 }), STARTER_GATES, 'contest'],
  ['spike: rising, square, hand above', front({ tPressMs: -60, handAbove: true, angleDeg: 30 }), ALL, 'spike'],
  ['spike edge −140', front({ tPressMs: -140, handAbove: true }), ALL, 'spike'],
  ['spike edge +20', front({ tPressMs: 20, handAbove: true }), ALL, 'spike'],
  ['no spike at the apex → swat', front({ tPressMs: -60, handAbove: true, phase: 'apex' }), ALL, 'swat'],
  ['no spike at 31° → swat', front({ tPressMs: -60, handAbove: true, angleDeg: 31 }), ALL, 'swat'],
  ['no spike with the hand under → swat', front({ tPressMs: -60 }), ALL, 'swat'],
  ['swat edge −240', front({ tPressMs: -240 }), ALL, 'swat'],
  ['swat edge 0', front({ tPressMs: 0 }), ALL, 'swat'],
  ['swat out of the jumper range → contest', front({ dist: 1.21 }), ALL, 'contest'],
  ['swat in the layup range', front({ shot: 'layup', dist: 1.5 }), ALL, 'swat'],
  ['swat out of the layup range → contest', front({ shot: 'layup', dist: 1.51 }), ALL, 'contest'],
  ['inside the contest window, no type → contest', front({ tPressMs: -300 }), ALL, 'contest'],
];

describe('K-BLK1: selectBlock is deterministic and follows the §2 order', () => {
  it(`a ${TABLE.length}-row table, twice, identical`, () => {
    expect(TABLE.length).toBeGreaterThanOrEqual(40);
    const a = TABLE.map(([, i, g]) => selectBlock(i, g));
    const b = TABLE.map(([, i, g]) => selectBlock(i, g));
    expect(a).toEqual(b);
    for (const [name, i, g, want] of TABLE) expect(selectBlock(i, g), name).toBe(want);
  });
  it('behind never yields a swat or a spike over a sweep of presses', () => {
    for (let t = -500; t <= 200; t += 5) for (const shot of ['layup', 'dunk', 'jumper'] as const) {
      const k = selectBlock(front({ behind: true, tPressMs: t, shot, handAbove: true }), ALL);
      expect(['chase', 'contest', 'goaltend']).toContain(k);
    }
  });
});

describe('K-BLK2: window bounds', () => {
  for (const [k, w] of Object.entries(BLOCK_WINDOWS)) {
    it(k, () => {
      expect(inWindow(w.t - w.half, w)).toBe(true);
      expect(inWindow(w.t + w.half, w)).toBe(true);
      expect(inWindow(w.t - w.half - 1, w)).toBe(false);
      expect(inWindow(w.t + w.half + 1, w)).toBe(false);
      expect(windowFrames(w)).toBe(Math.round(windowWidth(w) / FRAME_MS));
    });
  }
  it('the §3 numbers', () => {
    expect(BLOCK_WINDOWS).toEqual({
      contest: { t: -150, half: 300 }, swat: { t: -120, half: 120 }, spike: { t: -60, half: 80 },
      chase: { t: 40, half: 70 }, pin: { t: 120, half: 60 }, catch: { t: -40, half: 42 },
    });
    expect([BLOCK_WINDOWS.swat, BLOCK_WINDOWS.spike, BLOCK_WINDOWS.chase, BLOCK_WINDOWS.pin, BLOCK_WINDOWS.catch].map(windowFrames)).toEqual([14, 10, 8, 7, 5]);
  });
});

describe('K-BLK3: the catch is the tightest', () => {
  it('narrowest window; a hold under HOLD_MS never catches; the meter at 220 is the sweet spot start', () => {
    for (const [k, w] of Object.entries(BLOCK_WINDOWS)) if (k !== 'catch') expect(windowWidth(BLOCK_WINDOWS.catch)).toBeLessThan(windowWidth(w));
    for (let h = 0; h < HOLD_MS; h += 5) for (let t = -82; t <= 2; t += 2) expect(selectBlock(front({ tPressMs: t, holdMs: h }), ALL)).not.toBe('catch');
    expect(HOLD_MS).toBe(220);
    expect(catchMeter(HOLD_MS)).toBeCloseTo(HOLD_MS / CATCH_METER_FULL_MS, 9);
    expect(catchMeter(0)).toBe(0);
    expect(catchMeter(CATCH_METER_FULL_MS)).toBe(1);
    expect(catchMeter(900)).toBe(1);
  });
});

describe('K-BLK5: fouls', () => {
  const rate = (i: BlockInput, gap: number) => { const rng = seeded(5); let n = 0; for (let k = 0; k < 10000; k++) if (blockFoul(i, gap, rng)) n += 1; return n / 10000; };
  it('a bad angle in front: 25 % ± 3', () => { expect(Math.abs(rate(front({ angleDeg: 61 }), 1.2) - FOUL_BAD_ANGLE_PCT)).toBeLessThanOrEqual(0.03); });
  it('a body gap under BODY_HARD_GAP: 50 % ± 3; under BODY_STANDOFF: 15 % ± 3', () => {
    expect(Math.abs(rate(front(), BODY_HARD_GAP - 0.01) - FOUL_HARD_GAP_PCT)).toBeLessThanOrEqual(0.03);
    expect(Math.abs(rate(front(), BODY_STANDOFF - 0.01) - FOUL_STANDOFF_PCT)).toBeLessThanOrEqual(0.03);
  });
  it('LATE PRESS (PM reading): after the swat window closes but during the release, making contact: 35 % ± 3', () => {
    expect(Math.abs(rate(front({ tPressMs: 50 }), 1.2) - FOUL_LATE_PCT)).toBeLessThanOrEqual(0.03);
  });
  it('the late margin is one [TUNE] constant: strictly after the swat window, edge FOUL_LATE_MARGIN_MS inside, past it no late foul', () => {
    const end = BLOCK_WINDOWS.swat.t + BLOCK_WINDOWS.swat.half;
    expect(FOUL_LATE_MARGIN_MS).toBe(100);
    expect(latePress(end)).toBe(false);
    expect(latePress(end + 1)).toBe(true);
    expect(latePress(end + FOUL_LATE_MARGIN_MS)).toBe(true);
    expect(latePress(end + FOUL_LATE_MARGIN_MS + 1)).toBe(false);
    expect(rate(front({ tPressMs: end + FOUL_LATE_MARGIN_MS + 1 }), 1.2)).toBe(0);
    expect(rate(front({ tPressMs: end }), 1.2)).toBe(0);
  });
  it('the highest cause is used, not the sum', () => {
    expect(blockFoulChance(front({ angleDeg: 61, tPressMs: 50 }), 'contest', 0.8)).toBe(FOUL_HARD_GAP_PCT);
  });
  it('a clean front press at 1.10 m: never a foul; a goaltend is never a foul', () => {
    expect(rate(front(), BODY_STANDOFF)).toBe(0);
    expect(blockFoulChance(front({ phase: 'falling', ballY: 3.3 }), 'goaltend', 0.5)).toBe(0);
  });
});
