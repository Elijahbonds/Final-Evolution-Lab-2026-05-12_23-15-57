// hoops-p04b: the knee pole of the leg re-solves (legSink's sink, footGlide's hold / lift / step). It was the clip's own bend or, under
// 1 cm of it, the body's front: a trail leg reaching back nearly straight read a few millimetres of bend pointing BEHIND, the solve bent
// the knee backward, and the thigh turned 108–123° in a frame (1v1 seed 7, the step-back gather, the rig's stage tracer).
import { describe, expect, it } from 'vitest';
import { NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { kneePole, legFront, KNEE_POLE_BIAS_M } from './legSink';

const FWD = new Vector3(0, 0, 1);
const deg = (a: Vector3, b: Vector3) => Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(a.normalizeToNew(), b.normalizeToNew())))) * 180 / Math.PI;

describe('kneePole (hoops-p04b)', () => {
  it('a clearly bent knee keeps its own plane (within the bias)', () => {
    const bend = new Vector3(0.05, -0.02, 0.12);
    expect(deg(kneePole(bend, FWD), bend)).toBeLessThan(15);
  });
  it('a bend pointing behind the leg never makes the pole point behind it', () => {
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

// the front is the LEG's own (foot → toe): a body turned off its root (a spin layup) keeps its knees — with the root's front, the dip
// re-solved the legs 74–178° off the clip on a spin layup (1v1 seed 7, the rig's tracer)
describe('legFront (hoops-p04b)', () => {
  const scene = new Scene(new NullEngine());
  const ankle = new TransformNode('ankle', scene), toe = new TransformNode('toe', scene);
  toe.parent = ankle;
  it('the foot → toe direction, flat', () => {
    toe.position.set(0.12, -0.05, 0.0);
    const f = legFront(ankle, toe, new Vector3(0, 0, 1));
    expect(f.x).toBeCloseTo(1, 6); expect(f.y).toBeCloseTo(0, 6); expect(f.z).toBeCloseTo(0, 6);
  });
  it('a toe pointing straight down, or no toe: the fallback (the root front)', () => {
    toe.position.set(0, -0.1, 0);
    expect(legFront(ankle, toe, new Vector3(0, 0, 1)).z).toBeCloseTo(1, 6);
    expect(legFront(ankle, null, new Vector3(0, 0, 1)).z).toBeCloseTo(1, 6);
  });
  it('a spun body: its knee bent toward its own toes is kept, though that is behind the root', () => {
    const rootFwd = new Vector3(0, 0, 1);
    toe.position.set(0, -0.03, -0.12);   // the foot turned round, facing −z
    const bend = new Vector3(0, 0, -0.08);   // the clip's knee over those toes
    expect(Vector3.Dot(kneePole(bend, legFront(ankle, toe, rootFwd)), new Vector3(0, 0, -1))).toBeGreaterThan(0.99);
  });
});

