// The ring decides, and the make rate the mode tuned is what the ring delivers.
import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { MAKE_RADIUS, MISS_RADIAL_MAX, drawDirection, drawRadial, scaleFor, shapeFor, rimDecides } from './RimDecides';
import { SWISH_WINDOW, AIRBALL_DISTANCE } from './RimPhysics';
import { SHOT_QUALITY_PCT } from './BasketballCore';

const RIM = new Vector3(0, 3.05, -0.6);
const TO_SHOOTER = new Vector3(0, 0, 1);

/** mulberry32 — a seeded PRNG so a statistical test is the same test every run. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe('the calibration: the ring delivers the pct the mode asked for', () => {
  // Every tuned make rate in the game, 20 000 shots each. The ring must reproduce it — this is the difficulty the
  // owner set, and "the rim decides" is only acceptable if it costs the player nothing they did not earn.
  for (const [name, pct] of Object.entries(SHOT_QUALITY_PCT)) {
    it(`${name} (${pct}) makes at ${pct} ± 0.015 over 20 000 shots`, () => {
      const rand = seeded(7 + pct * 1000);
      let made = 0;
      const N = 20_000;
      for (let i = 0; i < N; i++) if (rimDecides(RIM, TO_SHOOTER, pct, 0.7, {}, rand).made) made++;
      expect(Math.abs(made / N - pct)).toBeLessThan(0.015);
    });
  }

  it('a contested pct is delivered the same way (the contest lives in the pct, not in the ring)', () => {
    const rand = seeded(99);
    let made = 0; const N = 20_000; const pct = 0.8 * (1 - 0.45);   // contestedPct(0.8, 1) shape
    for (let i = 0; i < N; i++) if (rimDecides(RIM, TO_SHOOTER, pct, 0.5, { short: 0.8 }, rand).made) made++;
    expect(Math.abs(made / N - pct)).toBeLessThan(0.015);
  });

  it('the scale is the closed form, at every shape', () => {
    for (const q of [0, 0.5, 1]) expect(drawRadial(0.5, q, 0.5)).toBeCloseTo(MAKE_RADIUS, 9);   // the median IS the make line at pct 0.5
    expect(scaleFor(0.97, 2)).toBeLessThan(scaleFor(0.3, 2));   // a better shot is tighter
    expect(Number.isFinite(scaleFor(1, 1))).toBe(true);
    expect(Number.isFinite(scaleFor(0, 2))).toBe(true);
    expect(shapeFor(1)).toBe(1); expect(shapeFor(0)).toBe(2);
  });

  it('the pct holds at BOTH ends of the shape — a perfect and a brick alike', () => {
    for (const [pct, q] of [[0.97, 1], [0.3, 0], [0.62, 0.5]] as const) {
      const rand = seeded(500 + pct * 100 + q * 10);
      let made = 0; const N = 20_000;
      for (let i = 0; i < N; i++) if (rimDecides(RIM, TO_SHOOTER, pct, q, {}, rand).made) made++;
      expect(Math.abs(made / N - pct), `pct ${pct} q ${q}`).toBeLessThan(0.015);
    }
  });
});

describe('the verdict is GEOMETRY', () => {
  it('made is exactly "the error landed inside the make radius"', () => {
    const rand = seeded(3);
    for (let i = 0; i < 2000; i++) {
      const v = rimDecides(RIM, TO_SHOOTER, 0.6, 0.6, {}, rand);
      expect(v.made).toBe(v.radial <= MAKE_RADIUS);
    }
  });

  it('the dwell never contradicts the verdict', () => {
    const rand = seeded(11);
    for (let i = 0; i < 2000; i++) {
      const v = rimDecides(RIM, TO_SHOOTER, 0.5, 0.5, {}, rand);
      expect(v.play.made).toBe(v.made);
    }
  });

  it('dead centre is a swish; a make on the edge touches iron; a miss just outside is an in-and-out or a roll-off', () => {
    const kinds = new Set<string>();
    const rand = seeded(5);
    for (let i = 0; i < 4000; i++) kinds.add(rimDecides(RIM, TO_SHOOTER, 0.8, 0.8, {}, rand).play.kind);
    for (const k of ['swish', 'rattle_in', 'roll_in', 'in_and_out', 'roll_off']) expect(kinds.has(k), k).toBe(true);
  });

  it('a make can only be an airball never — the ring said yes', () => {
    const rand = seeded(8);
    for (let i = 0; i < 3000; i++) {
      const v = rimDecides(RIM, TO_SHOOTER, 0.3, 0.1, {}, rand);
      if (v.made) expect(v.play.kind).not.toBe('airball');
      if (v.play.kind === 'airball') expect(v.radial).toBeGreaterThan(MAKE_RADIUS);
    }
  });
});

describe('a miss keeps its meaning', () => {
  it('a short bias sends most misses to the FRONT iron (depth negative), never all of them', () => {
    const rand = seeded(21);
    let short = 0, misses = 0;
    for (let i = 0; i < 6000; i++) {
      const v = rimDecides(RIM, TO_SHOOTER, 0.4, 0.4, { short: 0.8 }, rand);
      if (!v.made) { misses++; if (v.profile.depthError < 0) short++; }
    }
    expect(short / misses).toBeGreaterThan(0.75);
    expect(short / misses).toBeLessThan(1);
  });

  it('an unbiased miss goes anywhere', () => {
    const rand = seeded(23);
    const d = { depth: 0, lateral: 0 };
    for (let i = 0; i < 4000; i++) { const x = drawDirection({}, rand); d.depth += x.depth; d.lateral += x.lateral; }
    expect(Math.abs(d.depth / 4000)).toBeLessThan(0.05);
    expect(Math.abs(d.lateral / 4000)).toBeLessThan(0.05);
  });

  it('the airball stays a real miss, well short of the iron', () => {
    const rand = seeded(31);
    let air = 0;
    for (let i = 0; i < 4000; i++) {
      const v = rimDecides(RIM, TO_SHOOTER, 0.04, 0.05, {}, rand);
      if (v.play.kind === 'airball') { air++; expect(Math.hypot(v.profile.depthError, v.profile.lateralError)).toBeGreaterThanOrEqual(AIRBALL_DISTANCE); }
    }
    expect(air).toBeGreaterThan(0);
  });

  it('a GREEN is pure: a perfect shot at 0.97 swishes clean most of the time and still misses its 3 %', () => {
    const rand = seeded(41);
    let swish = 0, made = 0; const N = 6000;
    for (let i = 0; i < N; i++) { const v = rimDecides(RIM, TO_SHOOTER, 0.97, 1, {}, rand); if (v.play.kind === 'swish') swish++; if (v.made) made++; }
    expect(swish / N).toBeGreaterThan(0.7);             // Ray Allen: the crisp green moment
    expect(Math.abs(made / N - 0.97)).toBeLessThan(0.015);
    expect(MAKE_RADIUS).toBeGreaterThan(SWISH_WINDOW);
  });

  it('a GOOD shot touches iron more than a green does — the rattle is earned', () => {
    const swishShare = (pct: number, q: number, seed: number) => {
      const rand = seeded(seed); let s = 0, m = 0;
      for (let i = 0; i < 6000; i++) { const v = rimDecides(RIM, TO_SHOOTER, pct, q, {}, rand); if (v.made) { m++; if (v.play.kind === 'swish') s++; } }
      return s / m;
    };
    expect(swishShare(0.8, 0.8, 43)).toBeLessThan(swishShare(0.97, 1, 44));
  });
});

describe('a brick finds the iron', () => {
  it('no miss lands past MISS_RADIAL_MAX, and the make rate at pct 0.04 is still 0.04', () => {
    let made = 0, far = 0; const N = 4000; const rng = seeded(11);
    for (let i = 0; i < N; i++) { const v = rimDecides(RIM, TO_SHOOTER, 0.04, 0.2, {}, rng); if (v.made) made++; if (v.radial > MISS_RADIAL_MAX + 1e-9) far++; }
    expect(far).toBe(0);
    expect(made / N).toBeGreaterThan(0.02); expect(made / N).toBeLessThan(0.065);
    expect(MISS_RADIAL_MAX).toBeGreaterThan(MAKE_RADIUS);
  });
});
