// hoops-p04b: the knee pole of the leg re-solves (legSink's sink, footGlide's hold / lift / step). It was the clip's own bend or, under
// 1 cm of it, the body's front: a trail leg reaching back nearly straight read a few millimetres of bend pointing BEHIND, the solve bent
// the knee backward, and the thigh turned 108–123° in a frame (1v1 seed 7, the step-back gather, the rig's stage tracer).
import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { kneePole, KNEE_POLE_BIAS_M } from './legSink';

const FWD = new Vector3(0, 0, 1);
const deg = (a: Vector3, b: Vector3) => Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(a.normalizeToNew(), b.normalizeToNew())))) * 180 / Math.PI;

describe('kneePole (hoops-p04b)', () => {
  it('a clearly bent knee keeps its own plane (within the bias)', () => {
    const bend = new Vector3(0.05, -0.02, 0.12);
    expect(deg(kneePole(bend, FWD), bend)).toBeLessThan(15);
  });
  it('a bend pointing behind the body never makes the pole point behind', () => {
    for (const bz of [-0.001, -0.005, -0.02, -0.08]) {
      const p = kneePole(new Vector3(0.002, 0, bz), FWD);
      expect(Vector3.Dot(p, FWD), `bend z ${bz}`).toBeGreaterThan(0.5);
    }
  });
  it('continuous through straight: the pole turns less than 10° per 2 mm of bend, across the old 1 cm threshold and through zero', () => {
    let prev = kneePole(new Vector3(0.004, 0, 0.03), FWD); let worst = 0;
    for (let z = 0.028; z >= -0.03; z -= 0.002) {
      const p = kneePole(new Vector3(0.004, 0, z), FWD);
      worst = Math.max(worst, deg(p, prev)); prev = p;
    }
    expect(worst).toBeLessThan(10);
  });
  it('no bend at all: the body front', () => {
    expect(deg(kneePole(Vector3.Zero(), FWD), FWD)).toBeLessThan(1e-6);
    expect(KNEE_POLE_BIAS_M).toBeGreaterThan(0.01);
  });
});
