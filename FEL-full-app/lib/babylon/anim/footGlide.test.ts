// hoops-dip movement pass (owner 2026-10-20: "foot sliding … plant them"): a foot moving over the floor is drawn OFF it (a clearance that
// grows with its world speed), a still one is left where it is drawn, none is drawn under the floor; where the foot goes (x, z) and its
// turn are the layers' before it.
import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from '@babylonjs/core';
import { FootGlide, glideLift, glideAnkleY, stepArc, GLIDE_FROM_MPS, GLIDE_FULL_MPS, GLIDE_LIFT_M, STEP_SEC } from './footGlide';
import { hoopsNodeRig } from '../../../tests/helpers/hoopsNodeRig';

describe('the clearance', () => {
  it('nothing under GLIDE_FROM_MPS, the full lift from GLIDE_FULL_MPS, rising smoothly between', () => {
    expect(glideLift(0)).toBe(0); expect(glideLift(GLIDE_FROM_MPS)).toBe(0); expect(glideLift(GLIDE_FULL_MPS)).toBeCloseTo(GLIDE_LIFT_M, 9); expect(glideLift(9)).toBeCloseTo(GLIDE_LIFT_M, 9);
    let prev = 0; for (let v = 0; v <= 3; v += 0.05) { const l = glideLift(v); expect(l).toBeGreaterThanOrEqual(prev - 1e-12); expect(l - prev).toBeLessThan(0.004); prev = l; }
  });
  it('an ankle is never lowered, never under the floor, at least the floor + the lift while it moves', () => {
    expect(glideAnkleY(0.30, 0.08, 6)).toBe(0.30);                       // a swing foot well up: untouched
    expect(glideAnkleY(0.08, 0.08, 0)).toBe(0.08);                       // planted: untouched
    expect(glideAnkleY(0.09, 0.08, 6)).toBeCloseTo(0.08 + GLIDE_LIFT_M, 9);   // a skim: lifted
    expect(glideAnkleY(0.005, 0.08, 0)).toBeCloseTo(0.08, 9);            // through the floor: on it
  });
  it('a step: 0 lift at both ends, the full lift at its middle', () => {
    expect(stepArc(0)).toBe(0); expect(stepArc(1)).toBe(0); expect(stepArc(0.5)).toBeGreaterThan(0.03);
  });
});

function setup(opts: { bent?: boolean } = {}) {
  let sink = 0, shift = 0; const bent = opts.bent ?? false;
  const r = hoopsNodeRig('right', (n) => { n.Hips.position.y = 0.95 - sink; n.Hips.position.x = shift; if (bent) for (const sd of ['Left', 'Right']) { n[`${sd}UpLeg`].rotationQuaternion = Quaternion.RotationAxis(Vector3.Right(), -0.25); n[`${sd}Leg`].rotationQuaternion = Quaternion.RotationAxis(Vector3.Right(), 0.5); } });   // the stand-in clip: the hips down by `sink` (straight legs: the feet through the floor) / across by `shift` (the feet glide)   // the stand-in clip: the hips (and the straight legs under them) down by `sink`
  (r.scene.getEngine() as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const ank = ['LeftFoot', 'RightFoot'].map((n) => r.nodes[n]);
  const pre: { p: Vector3[]; q: Quaternion[] } = { p: [], q: [] };
  const glide = FootGlide.for(r.scene, r.sk, r.root);
  r.scene.onAfterAnimationsObservable.add(() => { pre.p = ank.map((a) => { a.computeWorldMatrix(true); return a.getAbsolutePosition().clone(); }); pre.q = ank.map((a) => a.absoluteRotationQuaternion.clone()); }, undefined, true);   // what the layers before left
  const frame = () => { r.scene.onBeforeAnimationsObservable.notifyObservers(r.scene); r.scene.onAfterAnimationsObservable.notifyObservers(r.scene); for (const n of Object.values(r.nodes)) n.computeWorldMatrix(true); };
  const h = (i: number) => ank[i].getAbsolutePosition().y - r.root.getAbsolutePosition().y;
  return { r, glide, frame, ank, pre, h, setSink: (v: number) => { sink = v; }, setShift: (v: number) => { shift = v; } };
}
const turnDeg = (a: Quaternion, b: Quaternion) => { const d = Quaternion.Inverse(a).multiply(b); return 2 * Math.acos(Math.min(1, Math.abs(d.w))) * 180 / Math.PI; };

describe('the glide guard on the node rig', () => {
  it('the body still, the clip gliding both feet 1 cm a frame (a stop\'s crossfade): one foot always planted, the other steps; both end where the clip put them', () => {
    const s = setup({ bent: true });   // (knees bent: a stance, with the reach to hold a foot while the hips move off it)
    for (let i = 0; i < 40; i++) s.frame();
    const floor = s.glide.floors.slice();
    const prev = s.ank.map((a) => a.getAbsolutePosition().clone());
    let steps = 0; const wasStepping = [false, false];
    for (let f = 0; f < 50; f++) {
      if (f < 14) s.setShift((f + 1) * 0.01);
      s.frame();
      const planted = s.ank.map((a, i) => { const p = a.getAbsolutePosition(); const still = Math.hypot(p.x - prev[i].x, p.z - prev[i].z) < 0.002 && Math.abs(s.h(i) - floor[i]) < 0.003; prev[i] = p.clone(); return still; });
      expect(planted[0] || planted[1], `a foot on the floor, frame ${f}`).toBe(true);
      s.glide.modes.forEach((m, i) => { if (m === 'step' && !wasStepping[i]) steps++; wasStepping[i] = m === 'step'; });
      expect(s.glide.modes[0] === 'step' && s.glide.modes[1] === 'step', 'never both stepping').toBe(false);
    }
    expect(steps).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < 2; i++) { expect(Vector3.Distance(s.ank[i].getAbsolutePosition(), s.pre.p[i]), `ankle ${i} where the clip put it`).toBeLessThan(0.003); expect(s.glide.modes[i]).toBe('free'); }
    expect(STEP_SEC).toBeLessThan(0.2);
    s.r.dispose();
  });
  it('a short glide (4 cm, under the step trigger) that stops: the held feet settle onto the clip\'s feet with a step each', () => {
    const s = setup({ bent: true });
    for (let i = 0; i < 40; i++) s.frame();
    let stepped = 0; const was = [false, false];
    for (let f = 0; f < 40; f++) { if (f < 4) s.setShift((f + 1) * 0.01); s.frame(); s.glide.modes.forEach((m, i) => { if (m === 'step' && !was[i]) stepped++; was[i] = m === 'step'; }); }
    expect(stepped).toBe(2);
    for (let i = 0; i < 2; i++) expect(Vector3.Distance(s.ank[i].getAbsolutePosition(), s.pre.p[i]), `ankle ${i} settled on the clip's`).toBeLessThan(0.003);
    s.r.dispose();
  });
  it('standing: the floor is learnt and nothing is drawn', () => {
    const s = setup();
    for (let i = 0; i < 30; i++) s.frame();
    for (const f of s.glide.floors) expect(f).toBeCloseTo(0.08, 3);
    for (let i = 0; i < 2; i++) { expect(s.glide.moved[i]).toBe(0); expect(Vector3.Distance(s.ank[i].getAbsolutePosition(), s.pre.p[i])).toBeLessThan(1e-6); }
    s.r.dispose();
  });
  it('feet skating over the floor (the body carried 3 cm a frame, the clip not stepping) are lifted by the clearance; x, z and the turn kept; set down when they stop', () => {
    const s = setup();
    for (let i = 0; i < 30; i++) s.frame();
    for (let f = 0; f < 30; f++) {
      s.r.root.position.x += 0.03; s.frame();
      for (let i = 0; i < 2; i++) {
        const p = s.ank[i].getAbsolutePosition(), was = s.pre.p[i];
        expect(Math.hypot(p.x - was.x, p.z - was.z), `ankle ${i} x, z kept`).toBeLessThan(0.003);
        expect(turnDeg(s.pre.q[i], s.ank[i].absoluteRotationQuaternion), `foot ${i} turn kept`).toBeLessThan(0.5);
        expect(s.h(i)).toBeGreaterThanOrEqual(0.08 - 1e-4);
      }
    }
    const want = 0.08 + glideLift(0.03 * 60);
    for (let i = 0; i < 2; i++) expect(s.h(i), `ankle ${i} lifted by the clearance at 1.8 m/s`).toBeCloseTo(want, 3);
    for (let f = 0; f < 20; f++) s.frame();   // stopped
    for (let i = 0; i < 2; i++) { expect(s.glide.moved[i]).toBeLessThan(1e-3); expect(s.h(i)).toBeCloseTo(0.08, 3); }
    s.r.dispose();
  });
  it('a leg the clip puts through the floor is drawn on it, and the hole is not learnt as the floor', () => {
    const s = setup();
    for (let i = 0; i < 30; i++) s.frame();
    s.setSink(0.06);
    for (let f = 0; f < 60; f++) { s.frame(); for (let i = 0; i < 2; i++) expect(s.h(i), `ankle ${i} on the floor, frame ${f}`).toBeCloseTo(0.08, 3); }
    for (const f of s.glide.floors) expect(f).toBeCloseTo(0.08, 3);
    s.r.dispose();
  });
});
