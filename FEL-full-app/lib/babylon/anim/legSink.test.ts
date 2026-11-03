// hoops-p04b: the knee pole of the leg re-solves (legSink's sink, footGlide's hold / lift / step). It was the clip's own bend or, under
// 1 cm of it, the ROOT's front: a leg passing through straight swapped knee planes in one frame and the thigh turned 108–123° (1v1 seed 7,
// the step-back's trail leg, the rig's stage tracer). Now: the clip's bend plus 1 cm of the leg's own pole last frame.
import { describe, expect, it } from 'vitest';
import { NullEngine, Quaternion, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { kneePole, legPole, KNEE_POLE_MEMORY_M } from './legSink';

const FWD = new Vector3(0, 0, 1);
const deg = (a: Vector3, b: Vector3) => Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(a.normalizeToNew(), b.normalizeToNew())))) * 180 / Math.PI;

describe('kneePole (hoops-p04b)', () => {
  it('a bent knee keeps the clip\'s own plane, whichever way it faces (a spin, turned-out feet)', () => {
    for (const bend of [new Vector3(0.05, -0.02, 0.12), new Vector3(0, 0, -0.08), new Vector3(0.09, 0, 0)]) {
      expect(deg(kneePole(bend, FWD, FWD), bend)).toBeLessThan(8);
    }
  });
  it('through straight the leg keeps the plane it had: no swap to the root front', () => {
    const side = new Vector3(1, 0, 0);   // the knee out to the side (turned-out feet)
    let pole = kneePole(side.scale(0.06), null, FWD);
    for (let i = 0; i < 20; i++) pole = kneePole(side.scale(0.06), pole, FWD);   // a bent leg over a few frames: the memory is its own plane
    let worst = 0;
    for (const mag of [0.04, 0.02, 0.01, 0.005, 0.002, 0.0005, 0, 0.0005, 0.002, 0.006, 0.02]) {   // straightens, then bends again
      const next = kneePole(side.scale(mag), pole, FWD);
      worst = Math.max(worst, deg(next, pole)); pole = next;
    }
    expect(worst).toBeLessThan(1);
    expect(deg(pole, side)).toBeLessThan(1);
  });
  it('a tiny bend pointing the other way does not flip a leg that is nearly straight', () => {
    const prev = new Vector3(0, 0, 1);
    expect(deg(kneePole(new Vector3(0, 0, -0.004), prev, FWD), prev)).toBeLessThan(1);   // 4 mm behind, 1 cm of memory ahead
    expect(KNEE_POLE_MEMORY_M).toBeGreaterThan(0.004);
  });
});

describe('legPole keeps its memory in the root frame (hoops-p04b)', () => {
  it('the body turned since the last solve: the remembered plane turns with it', () => {
    const scene = new Scene(new NullEngine());
    const root = new TransformNode('root', scene); root.rotationQuaternion = Quaternion.Identity();
    const leg: { pole?: Vector3 | null } = { pole: null };
    const first = legPole(leg, new Vector3(0.05, 0, 0), root, FWD);   // the knee out to +x, the body facing +z
    root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI / 2);   // the body turns 90°
    const p = legPole(leg, Vector3.Zero(), root, FWD);   // straight now: the memory alone
    const want = first.applyRotationQuaternion(root.rotationQuaternion);   // that plane, turned with the body
    expect(deg(p, want)).toBeLessThan(1);
  });
});
