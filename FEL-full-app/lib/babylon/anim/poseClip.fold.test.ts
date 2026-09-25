// HOTFIX (2026-09-24): no pose clip closes an elbow BETWEEN two keys. rig-joint-tests went red in CI at dunk motion phase 9 on
// the sweep rig: dunk_mocap's ball hand closed to 5° at 0.117 s and dunk_360_eastbay's off arm to 3° at 1.117 s — both keys of each
// segment were legal arms, but the anatomical pole rule put the elbow on far-apart sides of them, and the short way between two
// deep bends about far-apart axes runs the forearm through the upper arm.
import { FreeCamera, NullEngine, Quaternion, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { describe, expect, it } from 'vitest';
import { buildRig } from '../characters/proceduralRig';
import { boneNode } from './boneLookup';
import { buildPoseClip, elbowFoldsBetween, type PoseKey } from './poseClip';
import { buildMocapDunk } from './authored/mocapDunk';
import { buildEastbay } from './authored/eastbay';

/** A T-pose arm along +x: bending the forearm θ about z leaves an interior angle of 180 − θ. */
function arm() {
  const scene = new Scene(new NullEngine());
  const u = new TransformNode('RightArm', scene); u.position.set(0.2, 1.4, 0); u.rotationQuaternion = Quaternion.Identity();
  const f = new TransformNode('RightForeArm', scene); f.parent = u; f.position.set(0.28, 0, 0); f.rotationQuaternion = Quaternion.Identity();
  const h = new TransformNode('RightHand', scene); h.parent = f; h.position.set(0.26, 0, 0); h.rotationQuaternion = Quaternion.Identity();
  return { shoulder: u, elbow: f, hand: h };
}
const bend = (axis: Vector3, deg: number) => Quaternion.RotationAxis(axis, (deg * Math.PI) / 180);
const Z = new Vector3(0, 0, 1);

describe('elbowFoldsBetween', () => {
  it('catches two deep bends on opposite sides: the short way passes through the fold', () => {
    const a = arm(); a.elbow.rotationQuaternion = bend(Z.scale(-1), 130);
    expect(elbowFoldsBetween(a, bend(Z, 130))).toBe(true);
  });
  it('lets a hinge open and close, and two shallow opposite bends pass through straight', () => {
    const a = arm(); a.elbow.rotationQuaternion = bend(Z, 130);
    expect(elbowFoldsBetween(a, bend(Z, 60))).toBe(false);
    a.elbow.rotationQuaternion = bend(Z.scale(-1), 40);
    expect(elbowFoldsBetween(a, bend(Z, 40))).toBe(false);
  });
});

describe('the two clips that folded, on the sweep rig', () => {
  it('keep every elbow above 25° through the whole clip', () => {
    const scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 0, -5), scene);
    const rig = buildRig(scene, 'default');
    const at = (n: string) => { const b = boneNode(rig.skeleton, n)!; b.computeWorldMatrix(true); return b.getAbsolutePosition().clone(); };
    const elbow = (s: 'Left' | 'Right') => {
      const A = at(`${s}Arm`), B = at(`${s}ForeArm`), C = at(`${s}Hand`);
      return (Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(A.subtract(B).normalize(), C.subtract(B).normalize())))) * 180) / Math.PI;
    };
    for (const build of [buildMocapDunk, buildEastbay]) {
      const g = build(scene, rig.skeleton)!; g.start(true); g.pause();
      let worst = 180;
      for (let f = g.from; f <= g.to; f += 0.25) { g.goToFrame(f); scene.render(); worst = Math.min(worst, elbow('Left'), elbow('Right')); }
      g.stop();
      expect(worst, g.name).toBeGreaterThan(25);
    }
    scene.dispose();
  });
});

// HOTFIX (2026-09-24): a key can turn a bent leg's knee (the Spider-Man's back leg: a knee toward the front under a low pelvis goes
// through the court, so it is turned out to the side while the leg is bent).
describe('kneePoles', () => {
  it("turns a bent leg's knee where the key says; without one the knee points to the body's front", () => {
    const scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 0, -5), scene);
    const rig = buildRig(scene, 'default');
    const at = (n: string) => { const b = boneNode(rig.skeleton, n)!; b.computeWorldMatrix(true); return b.getAbsolutePosition().clone(); };
    const kneeFromHip = (kneePoles?: PoseKey['kneePoles']) => {
      const key = (t: number): PoseKey => ({ t, feet: { Right: [0.12, 0.45, -0.3] }, kneePoles });   // the ankle up behind: the knee has to bend
      const g = buildPoseClip(scene, rig.skeleton, `prop_knee_pole_${kneePoles ? 'out' : 'front'}`, 1, [key(0), key(1)])!;
      g.start(false); g.goToFrame(15); scene.render();
      const d = at('RightLeg').subtract(at('RightUpLeg'));
      g.stop(); g.dispose();
      return d;
    };
    const front = kneeFromHip(), out = kneeFromHip({ Right: [1, 0, 0] });
    const right = at('RightUpLeg').subtract(at('LeftUpLeg')); right.y = 0; right.normalize();   // the body's right, as poseClip reads it
    // measured on the sweep rig: default 0.11 m forward and 0.02 m to the side; pole out 0.34 m to the right and 0.15 m back
    expect(front.z, 'default: the knee forward of the hip').toBeGreaterThan(0.08);
    expect(Math.abs(Vector3.Dot(front, right)), 'default: not out to the side').toBeLessThan(0.08);
    expect(Vector3.Dot(out, right), "pole out: the knee out to the body's right").toBeGreaterThan(0.2);
    expect(out.z, 'pole out: no longer forward').toBeLessThan(front.z - 0.15);
    scene.dispose();
  });
});
