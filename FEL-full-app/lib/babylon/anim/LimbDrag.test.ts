import { describe, it, expect } from 'vitest';
import { NullEngine, Quaternion, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { dragStep, LimbDrag, SNAP_RAD } from './LimbDrag';
import { flexAxisLocal, handFlexAxisFromPoints, WristLayer, wristFor, WRIST, PALM_LOCAL } from './WristLayer';

const deg = (q: Quaternion, r: Quaternion) => (2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(q, r)))) * 180) / Math.PI;

describe('LimbDrag — the limbs follow their clips a beat behind', () => {
  it('a step in the clip (a seam) becomes a smooth S-curve, not a one-frame snap', () => {
    const f = { q: Quaternion.Identity(), v: Vector3.Zero() };
    const target = Quaternion.RotationAxis(new Vector3(1, 0, 0), (60 * Math.PI) / 180);
    const out = new Quaternion(); const path: number[] = [];
    for (let i = 0; i < 30; i++) { dragStep(f, target, 0.05, 1 / 60, out); path.push(deg(out, Quaternion.Identity())); }
    const steps = path.map((a, i) => (i ? a - path[i - 1] : a));
    expect(Math.max(...steps)).toBeLessThan(20);        // never more than a third of the 60° step in one frame
    expect(steps[0]).toBeLessThan(steps[2]);            // it accelerates into the move (the S), a first-order lag would lead with its biggest step
    expect(path[29]).toBeGreaterThan(59);               // and it arrives
    expect(Math.max(...path)).toBeLessThan(60.5);       // critically damped: no overshoot
  });

  it('a teleport (a replay re-flying the root) snaps instead of spinning through the body', () => {
    const f = { q: Quaternion.Identity(), v: Vector3.Zero() };
    const far = Quaternion.RotationAxis(new Vector3(0, 1, 0), SNAP_RAD + 0.2);
    const out = new Quaternion(); dragStep(f, far, 0.05, 1 / 60, out);
    expect(deg(out, far)).toBeLessThan(0.01);
  });

  it('a chain lags more further down it — the forearm trails the upper arm', () => {
    const eng = new NullEngine(); const sc = new Scene(eng);
    const arm = new TransformNode('RightArm', sc), fore = new TransformNode('RightForeArm', sc);
    arm.rotationQuaternion = Quaternion.Identity(); fore.rotationQuaternion = Quaternion.Identity();
    const drag = LimbDrag.forRig((n) => (n === 'RightArm' ? arm : n === 'RightForeArm' ? fore : null));
    drag.apply(1 / 60);   // seeds the followers
    const swing = Quaternion.RotationAxis(new Vector3(0, 0, 1), 1);
    for (let i = 0; i < 4; i++) { arm.rotationQuaternion.copyFrom(swing); fore.rotationQuaternion.copyFrom(swing); drag.apply(1 / 60); }
    expect(deg(fore.rotationQuaternion, swing)).toBeGreaterThan(deg(arm.rotationQuaternion, swing));
    sc.dispose(); eng.dispose();
  });
});

describe('WristLayer — the wrist flexes toward the palm, additively, without compounding', () => {
  it('flexion carries the fingers toward the palm (right and left)', () => {
    for (const side of ['Right', 'Left'] as const) {
      const pos = side === 'Right' ? new Vector3(0.26, 0, 0) : new Vector3(-0.26, 0, 0);
      const axis = flexAxisLocal(pos, Quaternion.Identity(), PALM_LOCAL[side]);
      const fingers = pos.clone().normalize();
      const bent = fingers.applyRotationQuaternion(Quaternion.RotationAxis(axis, 0.5));
      const palm = PALM_LOCAL[side].subtract(fingers.scale(Vector3.Dot(PALM_LOCAL[side], fingers))).normalize();
      expect(Vector3.Dot(bent, palm)).toBeGreaterThan(0.4);
    }
  });

  it('a held hand is rebuilt from its base each frame, never compounded', () => {
    const eng = new NullEngine(); const sc = new Scene(eng);
    const hand = new TransformNode('RightHand', sc); hand.rotationQuaternion = Quaternion.Identity();
    const w = new WristLayer(); w.add('Right', hand, flexAxisLocal(new Vector3(0.26, 0, 0), Quaternion.Identity(), PALM_LOCAL.Right));
    for (let i = 0; i < 200; i++) w.apply(1 / 60, { Right: 30 }, 1);   // nothing re-animates the hand between frames
    expect(deg(hand.rotationQuaternion!, Quaternion.Identity())).toBeCloseTo(30, 0);
    sc.dispose(); eng.dispose();
  });

  it('the axis read off a hand-shaped point cloud bends the fingers toward the ball side (the palm)', () => {
    // a flat hand 18 cm long (+x), 9 cm wide (z), 2 cm thick (y); the ball side is −y here so the palm is −y
    const pts: Vector3[] = [];
    for (let i = 0; i < 12; i++) for (let j = 0; j < 6; j++) for (let k = 0; k < 2; k++) pts.push(new Vector3(0.02 + i * 0.015, (k - 0.5) * 0.02, (j - 2.5) * 0.015));
    const ballSide = new Vector3(0.12, -0.04, -0.08);   // BALL_SIDE.Right: its y is the only component across the palm
    const axis = handFlexAxisFromPoints(pts, 'Right')!;
    const bent = new Vector3(1, 0, 0).applyRotationQuaternion(Quaternion.RotationAxis(axis, 0.6));
    expect(bent.y * Math.sign(ballSide.y)).toBeGreaterThan(0.4);   // the fingers went to the ball's side
    expect(handFlexAxisFromPoints(pts.slice(0, 10), 'Right')).toBeNull();
  });

  it('the dunker\'s wrist: cocked under a ball overhead, snapped through the ring, a loose curl when free', () => {
    expect(wristFor({ holds: true, onBall: false, aboveShoulder: 0.5, sinceContact: null, jamming: false })).toBeLessThan(-35);
    expect(wristFor({ holds: true, onBall: false, aboveShoulder: -0.3, sinceContact: null, jamming: false })).toBeGreaterThan(-15);
    expect(wristFor({ holds: false, onBall: false, aboveShoulder: 0.4, sinceContact: 0.05, jamming: false })).toBe(WRIST.snap);
    expect(wristFor({ holds: false, onBall: false, aboveShoulder: 0, sinceContact: null, jamming: false })).toBe(WRIST.relaxed);
    // DUNK MOTION phase 9: the jam rolls the wrist OVER the ball (flexed) before the iron — it was still cocked back at contact
    expect(wristFor({ holds: true, onBall: false, aboveShoulder: 0.5, sinceContact: null, jamming: true })).toBeGreaterThan(0);
  });
});
