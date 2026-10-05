// REACH-FREEZE (2026-09-29): the pure play frame — the clamp, the standard-frame list, and the map back to 1.0.
import { describe, expect, it } from 'vitest';
import {
  COSMETIC_CLAMP, STANDARD_FRAME_MODES, clampCosmetic, isStandardFrame, playContextOf, playScales, rootMultiplier, toPlayFrame,
} from './playFrame';

const OLD_SAVE = { heightScale: 1.14, buildScale: 1.18, reachScale: 1.12 };   // the old creator's top of every row

describe('B5 ranked spawns and the standard-frame modes are always 1.0 / 1.0 / 1.0', () => {
  it('B5 ranked forces 1.0 on any body, in any mode', () => {
    for (const modeId of [null, 'freerun', 'skate', 'dunk', 'onevone']) {
      for (const p of [OLD_SAVE, { heightScale: 0.88, buildScale: 0.88, reachScale: 0.92 }, { heightScale: 1.02, buildScale: 0.97 }]) {
        expect(playScales(p, { modeId, ranked: true })).toEqual({ heightScale: 1, buildScale: 1, reachScale: 1 });
      }
    }
  });

  it('B5 the dunk and the dunk duel spawn at 1.0 until the Venice dunk passes (spec Decision 5)', () => {
    for (const modeId of ['dunk', 'dunkduel']) {
      expect(playScales(OLD_SAVE, { modeId })).toEqual({ heightScale: 1, buildScale: 1, reachScale: 1 });
      expect(isStandardFrame({ modeId })).toBe(true);
    }
  });

  it('B5 every standard-frame mode spawns at 1.0, and each entry names what takes it off', () => {
    expect(Object.keys(STANDARD_FRAME_MODES).sort()).toEqual(['dunk', 'dunkduel', 'onevone', 'threepoint', 'threevthree']);
    for (const [modeId, e] of Object.entries(STANDARD_FRAME_MODES)) {
      expect(playScales(OLD_SAVE, { modeId }), modeId).toEqual({ heightScale: 1, buildScale: 1, reachScale: 1 });
      expect(e.until.length, modeId).toBeGreaterThan(20);
      expect(e.routed, modeId).toMatch(/^R\d$/);
    }
  });

  it('reads the ranked stamp only when it is literally true', () => {
    expect(playContextOf({ felModeId: 'freerun', felRanked: true })).toEqual({ modeId: 'freerun', ranked: true });
    expect(playContextOf({ felModeId: 'freerun', felRanked: 'yes' })).toEqual({ modeId: 'freerun', ranked: false });
    expect(playContextOf(undefined)).toEqual({ modeId: null, ranked: false });
    expect(playContextOf({ felModeId: 7 })).toEqual({ modeId: null, ranked: false });
  });
});

describe('casual keeps a small, clamped cosmetic difference', () => {
  it('clamps height to 96–104 % and build to 94–108 % (TUNE-EJ)', () => {
    expect(COSMETIC_CLAMP).toEqual({ height: [0.96, 1.04], build: [0.94, 1.08] });
    expect(playScales(OLD_SAVE, { modeId: 'freerun' })).toEqual({ heightScale: 1.04, buildScale: 1.08, reachScale: 1 });
    expect(playScales({ heightScale: 0.88, buildScale: 0.88 }, {})).toEqual({ heightScale: 0.96, buildScale: 0.94, reachScale: 1 });
    expect(playScales({ heightScale: 1.02, buildScale: 0.97 }, {})).toEqual({ heightScale: 1.02, buildScale: 0.97, reachScale: 1 });
  });

  it('never lets reach through, whatever a save carries', () => {
    for (const r of [0.92, 1, 1.12, 5, NaN]) expect(playScales({ reachScale: r }).reachScale).toBe(1);
  });

  it('reads a missing, zero or junk scale as the standard frame', () => {
    for (const v of [undefined, null, 0, -1, NaN, Infinity, '1.1']) {
      expect(clampCosmetic(v, 'height')).toBe(1);
      expect(clampCosmetic(v, 'build')).toBe(1);
    }
    expect(playScales(null)).toEqual({ heightScale: 1, buildScale: 1, reachScale: 1 });
  });
});

describe('toPlayFrame — a point on the scaled body back on the standard one', () => {
  it('undoes exactly what the scale did to the root (height everywhere, build on the girth)', () => {
    const s = { heightScale: 1.04, buildScale: 1.08 };
    expect(rootMultiplier(s)).toEqual({ x: 1.04 * 1.08, y: 1.04, z: 1.04 * 1.08 });
    const root = { x: 2, y: 0.5, z: -3 };
    const onStandard = { x: 2.31, y: 2.9, z: -2.7 };
    const m = rootMultiplier(s);
    const onScaled = { x: root.x + (onStandard.x - root.x) * m.x, y: root.y + (onStandard.y - root.y) * m.y, z: root.z + (onStandard.z - root.z) * m.z };
    const back = toPlayFrame(onScaled, root, s);
    expect(back.x).toBeCloseTo(onStandard.x, 12); expect(back.y).toBeCloseTo(onStandard.y, 12); expect(back.z).toBeCloseTo(onStandard.z, 12);
  });

  it('is the identity on a standard body', () => {
    const p = { x: 0.3, y: 2.1, z: 0.4 };
    expect(toPlayFrame(p, { x: 0, y: 0, z: 0 }, { heightScale: 1, buildScale: 1 })).toEqual(p);
  });
});
