// AF-1 (ANIM-FEEL-SPEC 2026-10-28): the inertial decay's math — settles, frame-rate independent, never overshoots from rest — and the
// anim.inertial knob's default (off).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ANIM_INERTIAL_HALF_LIFE_K, ANIM_INERTIAL_ON, applyInertialBlend, inertialDt, inertialHalfLife, inertialOn, inertialStep,
  quatFromAxisAngle, quatMul, quatMulConj, quatToAxisAngle, type Quat,
} from './inertialize';
import { animDt } from './motionLayers';
import { FEEL_STORAGE_KEY, resetFeelForTests, setFeelSession, setFeelUser } from '../../feel-panel/feel';
import { feelSessionBlock } from '../../feel-panel/sessionGate';

const run = (x0: number, v0: number, h: number, dt: number, n: number) => {
  let s = { x: x0, v: v0 };
  for (let i = 0; i < n; i++) s = inertialStep(s.x, s.v, h, dt);
  return s;
};

describe('inertialStep: the critically damped decay', () => {
  it('settles: under 1e-2·x0 by 5 half-lives and under 1e-3·x0 by 7 (from rest)', () => {
    const h = 0.075;
    // Holden's y = 2·ln2/halfLife from rest leaves x/x0 = e^(−y·t)·(1 + y·t): 7.8e-3 at 5 half-lives, 6.5e-4 at 7.
    expect(Math.abs(inertialStep(1, 0, h, 5 * h).x)).toBeLessThan(1e-2);
    expect(Math.abs(inertialStep(1, 0, h, 7 * h).x)).toBeLessThan(1e-3);
    expect(Math.abs(run(1, 0, h, 1 / 60, Math.ceil((7 * h) * 60)).x)).toBeLessThan(1e-3);
  });
  it('frame-rate independent: 60 × 1/60 = 30 × 1/30 = 144 × 1/144 (to 1e-9)', () => {
    for (const [x0, v0] of [[1, 0], [0.7, -3], [-1.2, 5]] as const) {
      const a = run(x0, v0, 0.075, 1 / 60, 60), b = run(x0, v0, 0.075, 1 / 30, 30), c = run(x0, v0, 0.075, 1 / 144, 144);
      expect(Math.abs(a.x - b.x)).toBeLessThan(1e-9); expect(Math.abs(a.x - c.x)).toBeLessThan(1e-9);
      expect(Math.abs(a.v - b.v)).toBeLessThan(1e-9); expect(Math.abs(a.v - c.v)).toBeLessThan(1e-9);
    }
  });
  it('never overshoots from rest (v0 = 0): monotone toward 0, never crossing it', () => {
    let s = { x: 1, v: 0 }, prev = 1;
    for (let i = 0; i < 300; i++) {
      s = inertialStep(s.x, s.v, 0.05, 1 / 144);
      expect(s.x).toBeGreaterThanOrEqual(0); expect(s.x).toBeLessThanOrEqual(prev + 1e-15);
      prev = s.x;
    }
  });
  it('dt = 0 (and a bad dt) is a no-op; halfLife 0 snaps to zero', () => {
    expect(inertialStep(0.4, 2, 0.075, 0)).toEqual({ x: 0.4, v: 2 });
    expect(inertialStep(0.4, 2, 0.075, Number.NaN)).toEqual({ x: 0.4, v: 2 });
    expect(inertialStep(0.4, 2, 0, 1 / 60)).toEqual({ x: 0, v: 0 });
  });
});

describe('the animation clock and the half-life', () => {
  it('inertialDt is motionLayers.animDt — except a frozen clock (scale exactly 0) holds the offset', () => {
    for (const raw of [0, 0.008, 1 / 60, 0.05, 0.2]) for (const sc of [1, 0.5, 0.02, 2, -1, Number.NaN]) {
      expect(inertialDt(raw, sc)).toBe(animDt(raw, sc));
    }
    expect(inertialDt(1 / 60, 0)).toBe(0);
  });
  it('half-life = ANIM_INERTIAL_HALF_LIFE_K × fadeSec; a hard cut (fadeSec ≤ 0) stays a cut', () => {
    expect(ANIM_INERTIAL_HALF_LIFE_K).toBe(0.5);
    expect(inertialHalfLife(0.15)).toBeCloseTo(0.075, 12);
    expect(inertialHalfLife(0)).toBe(0); expect(inertialHalfLife(-1)).toBe(0);
  });
});

describe('quaternion helpers', () => {
  it('(a ⊗ b⁻¹) ⊗ b = a, and the axis-angle round-trips on the shortest path', () => {
    const a = quatFromAxisAngle([0, 1, 0], 0.7), b = quatFromAxisAngle([1, 0, 0], 1.2);
    const back = quatMul(quatMulConj(a, b), b);
    for (let i = 0; i < 4; i++) expect(back[i]).toBeCloseTo(a[i], 12);
    const neg: Quat = [-a[0], -a[1], -a[2], -a[3]];
    const r = quatToAxisAngle(neg);
    expect(r.angle).toBeCloseTo(0.7, 12); expect(r.axis[1]).toBeCloseTo(1, 12);
    expect(quatToAxisAngle([0, 0, 0, 1]).angle).toBe(0);
  });
});

describe('the anim.inertial knob', () => {
  class FakeStorage {
    m = new Map<string, string>();
    getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
    setItem(k: string, v: string) { this.m.set(k, v); }
    removeItem(k: string) { this.m.delete(k); }
  }
  const g = globalThis as { window?: unknown };
  let ls: FakeStorage;
  beforeEach(() => { resetFeelForTests(); ls = new FakeStorage(); g.window = { localStorage: ls }; });
  afterEach(() => { resetFeelForTests(); delete g.window; });

  it('default OFF: inertialOn() is false and applyInertialBlend never touches the animator', () => {
    expect(ANIM_INERTIAL_ON).toBe(0);
    expect(inertialOn()).toBe(false);
    const calls: string[] = [];
    expect(applyInertialBlend({ setBlendMode: (m) => { calls.push(m); } })).toBe(false);
    expect(calls).toEqual([]);
  });
  it('on (an override on a playtest the panel is open for): applyInertialBlend switches the body to inertial', () => {
    ls.m.set(FEEL_STORAGE_KEY, JSON.stringify({ 'anim.inertial': 1 }));
    setFeelUser(true); setFeelSession(feelSessionBlock('/play/threevthree', '?playtest=1'));
    expect(inertialOn()).toBe(true);
    const calls: string[] = [];
    expect(applyInertialBlend({ setBlendMode: (m) => { calls.push(m); } })).toBe(true);
    expect(calls).toEqual(['inertial']);
  });
});
