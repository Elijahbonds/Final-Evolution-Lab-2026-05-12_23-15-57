// JUMP-TESTS, velocity and power (owner scope addition 2026-10-25): v0 from the take-off-velocity height, the push-off
// and RSI-mod on the bench, Sayers and Samozino power for adults with a body weight only, and the force-velocity profile
// against a line with known F0 and V0. Every number is an estimate; the bench says how each reads, it claims nothing.
import { describe, expect, it } from 'vitest';
import { protocolTake } from '@/lib/jump/protocolBench';
import { readProtocolClip } from '@/lib/jump/protocols';
import { fvProfile, jumpKinematics, jumpPower, relativeMeanPower, takeoffVelocity, G } from '@/lib/jump/velocity';
import { posed } from '@/lib/jump/ballistic';

describe('take-off velocity', () => {
  it('v0 = √(2·g·h), and its ± from the height\'s', () => {
    expect(takeoffVelocity(40).v0Mps).toBeCloseTo(Math.sqrt(2 * G * 0.4), 2);
    const v = takeoffVelocity(40, 1);
    expect(v.v0SdMps!).toBeCloseTo((G * 0.01) / Math.sqrt(2 * G * 0.4), 3);
    expect(takeoffVelocity(40).v0SdMps).toBeNull();
  });
  it('the live check (no frames) gets v0 only: no push-off, no RSI-mod', () => {
    const k = jumpKinematics({ takeoffT: 1000, heightCm: 40 }, { countermovement: true });
    expect(k.pushOffCm).toBeNull();
    expect(k.rsiMod).toBeNull();
    expect(k.meanVelMps).toBeCloseTo(k.v0Mps / 2, 2);
  });
});

describe.each([60, 240])('on the bench at %i fps', (fps) => {
  const hpoTruth = (posed({ d: 0, toeDeg: 25 }).LeftUpLeg[1] - posed({ d: 0.55, toeDeg: 0 }).LeftUpLeg[1]) * 100;
  const kin = (id: 'cmjHips' | 'sj') => {
    const { frames, truth } = protocolTake(id, { fps, seed: 3 });
    const r = readProtocolClip(frames, 4 / 3, id);
    if (!r.ok) throw new Error(r.why);
    return r.t5.jumps.filter((j) => j.valid).map((j) => ({
      j, k: jumpKinematics(j, { frames: r.frames, front: r.front, countermovement: id !== 'sj' }),
      v0True: Math.sqrt((2 * G * truth.find((x) => Math.abs(x.takeoffT - j.takeoffT) < 100)!.heightV0Cm) / 100),
    }));
  };
  it('CMJ: v0 within 0.1 m/s of the truth; the push-off within 5 cm of the hips\' true rise; time to take-off a little under the true 650 ms', () => {
    for (const { j, k, v0True } of kin('cmjHips')) {
      expect(Math.abs(k.v0Mps - Math.sqrt(2 * G * j.heightCm / 100))).toBeLessThan(0.02);
      expect(Math.abs(k.v0Mps - v0True)).toBeLessThan(0.1);
      expect(k.pushOffCm).not.toBeNull();
      expect(Math.abs(k.pushOffCm! - hpoTruth)).toBeLessThan(5);
      // onset read at 1.5 cm into the dip: 20–80 ms after the true start of the movement
      expect(k.timeToTakeoffMs!).toBeGreaterThan(570);
      expect(k.timeToTakeoffMs!).toBeLessThan(650);
      expect(k.rsiMod!).toBeCloseTo(j.heightCm / 100 / (k.timeToTakeoffMs! / 1000), 1);
    }
  });
  it('squat jump: a push-off, and no RSI-mod (it has no countermovement)', () => {
    for (const { k } of kin('sj')) {
      expect(k.pushOffCm).not.toBeNull();
      expect(k.rsiMod).toBeNull();
    }
  });
});

describe('power: adults with a typed weight only', () => {
  it('refused for anyone not an adult before the weight is read; no weight, no power', () => {
    expect(jumpPower({ adult: false, massKg: 80, heightCm: 40, pushOffCm: 35, kind: 'cmj' })).toEqual({ ok: false, why: 'notAdult' });
    expect(jumpPower({ adult: true, massKg: null, heightCm: 40, pushOffCm: 35, kind: 'cmj' })).toEqual({ ok: false, why: 'noMass' });
    expect(jumpPower({ adult: true, massKg: 20, heightCm: 40, pushOffCm: 35, kind: 'cmj' })).toEqual({ ok: false, why: 'massOutOfRange' });
    expect(fvProfile({ adult: false, massKg: 80, points: [] })).toEqual({ ok: false, why: 'notAdult' });
  });
  it('Sayers peak (power.ts) and Samozino mean force and power, by hand', () => {
    const p = jumpPower({ adult: true, massKg: 80, heightCm: 40, pushOffCm: 35, kind: 'cmj' });
    if (!p.ok || !p.p || !p.mean) throw new Error('no power');
    expect(p.p.peakW).toBe(Math.round(60.7 * 40 + 45.3 * 80 - 2055));
    const F = 80 * G * (0.4 / 0.35 + 1), v = Math.sqrt((G * 0.4) / 2);
    expect(p.mean.forceN).toBe(Math.round(F));
    expect(p.mean.powerW).toBe(Math.round(F * v));
    expect(relativeMeanPower(40, 35)).toBeCloseTo((F * v) / 80, 1);
  });
  it('a loaded or non-CMJ jump gets Samozino only (Sayers was fitted on unloaded CMJs); the load is in the mass moved', () => {
    const p = jumpPower({ adult: true, massKg: 80, loadKg: 20, heightCm: 30, pushOffCm: 35, kind: 'cmj' });
    if (!p.ok) throw new Error('refused');
    expect(p.p).toBeNull();
    expect(p.mean!.forceN).toBe(Math.round(100 * G * (0.3 / 0.35 + 1)));
    expect(jumpPower({ adult: true, massKg: 80, heightCm: 30, pushOffCm: null, kind: 'other' })).toEqual({ ok: true, p: null, mean: null });
  });
});

describe('the force-velocity profile (Samozino)', () => {
  // jumps built from a known line F = F0·(1 − v/V0): for each load, the height whose mean force and velocity sit on it
  const F0 = 2400, V0 = 3.2, m = 80, hpo = 0.35;
  const onLine = (load: number) => {
    // v = √(g·h/2), F = (m + load)·g·(h/hpo + 1); solve F(h) = F0·(1 − v/V0) for h by bisection
    let lo = 0.01, hi = 0.8;
    for (let k = 0; k < 80; k++) {
      const h = (lo + hi) / 2, v = Math.sqrt((G * h) / 2), F = (m + load) * G * (h / hpo + 1);
      if (F < F0 * (1 - v / V0)) lo = h; else hi = h;
    }
    return { loadKg: load, heightCm: ((lo + hi) / 2) * 100, pushOffCm: hpo * 100 };
  };
  it('three loads on a known line give back F0, V0 and Pmax = F0·V0/4', () => {
    const r = fvProfile({ adult: true, massKg: m, points: [0, 20, 40].map(onLine) });
    if (!r.ok) throw new Error(r.why);
    expect(Math.abs(r.fv.f0N - F0)).toBeLessThan(5);
    expect(r.fv.v0Mps).toBeCloseTo(V0, 1);
    expect(Math.abs(r.fv.pmaxW - (F0 * V0) / 4)).toBeLessThan(10);
    expect(r.fv.r2).toBeCloseTo(1, 2);
    expect(r.fv.loads).toBe(3);
  });
  it('one load, too few jumps, or a line that does not fall: refused with a reason', () => {
    expect(fvProfile({ adult: true, massKg: m, points: [onLine(0)] })).toEqual({ ok: false, why: 'tooFew' });
    expect(fvProfile({ adult: true, massKg: m, points: [onLine(0), onLine(0)] })).toEqual({ ok: false, why: 'oneLoad' });
    expect(fvProfile({ adult: true, massKg: m, points: [{ loadKg: 0, heightCm: 20, pushOffCm: 35 }, { loadKg: 30, heightCm: 40, pushOffCm: 35 }] })).toEqual({ ok: false, why: 'notFv' });
  });
});
