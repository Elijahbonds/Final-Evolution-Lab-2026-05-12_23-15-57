// hoops-dip (owner 2026-10-20): THE BODY SINKS INTO THE MOVE. The pure parts (the profile, the floor, the ankle target, the release) and the
// layer on the hoops node rig (tests/helpers/hoopsNodeRig) under a stand-in beat whose clip RAISES the hips 0.15 m (the v2 clips' rise over
// the loops, measured at #375: +15.5 to +31.6 cm in play): the hips go DOWN from where the body was instead, the ankles stay on the floor
// where the clip put them, the knees bend, the feet keep their turn, and the override is gone 0.15 s after the beat.
import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, TransformNode } from '@babylonjs/core';
import { hoopsNodeRig } from '../../../tests/helpers/hoopsNodeRig';
import { MoveDip, dipAt, dipHips, ankleTarget, releaseWeight, dipMoveOf, DIP_DEPTH_M, DIP_MIN_HIPS_OVER_ANKLE, DIP_RELEASE_SEC, DIP_PROFILE } from './moveDip';

describe('the dip, pure', () => {
  it('names the three moves (either hand) and nothing else', () => {
    expect(dipMoveOf('bball_crossover_left')).toBe('crossover');
    expect(dipMoveOf('bball_momentum_cross_right')).toBe('momentum_cross');
    expect(dipMoveOf('bball_behind_back_left')).toBe('behind_back');
    for (const c of ['bball_between_legs_left', 'bball_hesi_v2_right', 'bball_in_and_out_left', 'bball_dribble_jog']) expect(dipMoveOf(c)).toBeNull();
  });
  it('0 at both ends, the full depth from the floor contact through the catch, never negative, smooth', () => {
    for (const m of Object.keys(DIP_PROFILE) as (keyof typeof DIP_PROFILE)[]) {
      expect(dipAt(m, 0)).toBe(0); expect(dipAt(m, 1)).toBe(0);
      const peakK = DIP_PROFILE[m][2][0];
      expect(dipAt(m, peakK)).toBeCloseTo(DIP_DEPTH_M[m], 9);
      let prev = 0;
      for (let k = 0; k <= 1.0001; k += 0.01) { const d = dipAt(m, k); expect(d).toBeGreaterThanOrEqual(0); expect(Math.abs(d - prev)).toBeLessThan(0.01); prev = d; }   // no step over 1 cm a hundredth of the move
    }
  });
  it('the hips: the base less the dip, never under the floor', () => {
    expect(dipHips(0.74, 0.10, 0.07)).toBeCloseTo(0.64, 9);
    expect(dipHips(0.59, 0.10, 0.07)).toBeCloseTo(0.07 + DIP_MIN_HIPS_OVER_ANKLE, 9);   // PROTECT: less room
    expect(dipHips(0.74, -1, 0.07)).toBeCloseTo(0.74, 9);
  });
  it('an ankle: down by the clip\'s rise, never under the floor, never raised', () => {
    expect(ankleTarget(0.23, 0.15, 0.08)).toBeCloseTo(0.08, 9);
    expect(ankleTarget(0.40, 0.15, 0.08)).toBeCloseTo(0.25, 9);   // a swing foot keeps its lift over the base
    expect(ankleTarget(0.08, 0.15, 0.08)).toBeCloseTo(0.08, 9);
    expect(ankleTarget(0.05, 0, 0.08)).toBeCloseTo(0.05, 9);     // a foot the layers put lower is not lifted
  });
  it('the release fades linearly over DIP_RELEASE_SEC', () => {
    expect(releaseWeight(0)).toBe(1); expect(releaseWeight(DIP_RELEASE_SEC / 2)).toBeCloseTo(0.5, 9); expect(releaseWeight(DIP_RELEASE_SEC)).toBe(0);
  });
});

/** A stand-in beat: the group the animator would be playing, its playhead at frame f of 0..30. */
function beatStub() { const st = { name: 'bball_crossover_left', isPlaying: false, from: 0, to: 30, animatables: [{ masterFrame: 0 }] }; return { g: st as unknown as AnimationGroup, st }; }
const RISE = 0.15;

function setup() {
  const stub = beatStub(); let rise = 0;
  // the stand-in clip: the hips up by `rise` (the v2 clip's rise over the loop; the legs, keyed below them, go up too) and the knees a
  // touch bent (a stance)
  const r = hoopsNodeRig('right', (n) => { n.Hips.position.y += rise; for (const sd of ['Left', 'Right']) n[`${sd}Leg`].rotationQuaternion = Quaternion.RotationAxis(Vector3.Right(), -0.15); });
  (r.scene.getEngine() as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  // what the layers before the dip left (read first, inserted ahead of it)
  const pre: { ankles: Vector3[]; turns: Quaternion[] } = { ankles: [], turns: [] };
  const ank = ['LeftFoot', 'RightFoot'].map((n) => r.nodes[n]);
  const dip = MoveDip.for(r.scene, r.sk, r.root, (name) => (name === 'bball_crossover_left' ? stub.g : null));   // (it inserts itself first)
  // …so the read of what the layers before it left is inserted first AFTER it, to run ahead of it
  r.scene.onAfterAnimationsObservable.add(() => { pre.ankles = ank.map((a) => { a.computeWorldMatrix(true); return a.getAbsolutePosition().clone(); }); pre.turns = ank.map((a) => a.absoluteRotationQuaternion.clone()); }, undefined, true);
  const frame = () => { r.scene.onBeforeAnimationsObservable.notifyObservers(r.scene); r.scene.onAfterAnimationsObservable.notifyObservers(r.scene); for (const n of Object.values(r.nodes)) n.computeWorldMatrix(true); };
  const hipsY = () => r.nodes.Hips.getAbsolutePosition().y;
  const knee = (sd: string) => { const u = r.nodes[`${sd}UpLeg`].getAbsolutePosition(), k = r.nodes[`${sd}Leg`].getAbsolutePosition(), a = r.nodes[`${sd}Foot`].getAbsolutePosition();
    return 180 - Math.acos(Vector3.Dot(u.subtract(k).normalize(), a.subtract(k).normalize())) * 180 / Math.PI; };
  return { r, stub, dip, frame, hipsY, knee, pre, ank, setRise: (v: number) => { rise = v; } };
}

describe('the dip layer on the node rig (a beat whose clip raises the hips 0.15 m)', () => {
  it('the hips go DOWN from where the body was by the profile — never up — the ankles stay on the floor, the knees bend, the feet keep their turn', () => {
    const s = setup();
    for (let i = 0; i < 20; i++) s.frame();                       // idle: the base
    const base = s.hipsY(); const floorA = Math.min(...s.ank.map((a) => a.getAbsolutePosition().y)); const knee0 = s.knee('Left');
    s.stub.st.isPlaying = true; s.setRise(RISE);
    let worstAbove = -Infinity, deepest = 0, kneeMax = 0;
    for (let f = 0; f < 30; f++) {
      s.stub.st.animatables[0].masterFrame = f; s.frame();
      const k = f / 30, want = base - dipAt('crossover', k);
      expect(s.hipsY(), `k ${k.toFixed(2)}`).toBeCloseTo(want, 3);
      worstAbove = Math.max(worstAbove, s.hipsY() - base); deepest = Math.max(deepest, base - s.hipsY());
      s.ank.forEach((a, i) => {
        const p = a.getAbsolutePosition(), was = s.pre.ankles[i];
        expect(p.y, `ankle ${i} on the floor, k ${k.toFixed(2)}`).toBeCloseTo(floorA, 2);
        expect(Math.hypot(p.x - was.x, p.z - was.z), `ankle ${i} not moved across the floor`).toBeLessThan(0.003);
        const dq = Quaternion.Inverse(s.pre.turns[i]).multiply(a.absoluteRotationQuaternion); const ang = 2 * Math.acos(Math.min(1, Math.abs(dq.w))) * 180 / Math.PI;
        expect(ang, `foot ${i} turn kept`).toBeLessThan(0.5);
      });
      kneeMax = Math.max(kneeMax, s.knee('Left'));
    }
    expect(worstAbove).toBeLessThanOrEqual(1e-3);                 // no rise into the move (the clip asked for +0.15)
    expect(deepest).toBeCloseTo(DIP_DEPTH_M.crossover, 2);
    expect(kneeMax - knee0).toBeGreaterThan(15);                  // the knees bend into it
    s.r.dispose();
  });
  it('after the beat the override fades out over DIP_RELEASE_SEC, and the body is the clip\'s again', () => {
    const s = setup();
    for (let i = 0; i < 20; i++) s.frame();
    s.stub.st.isPlaying = true; s.setRise(RISE);
    for (let f = 0; f < 30; f++) { s.stub.st.animatables[0].masterFrame = f; s.frame(); }
    s.stub.st.isPlaying = false; s.setRise(0);
    const n = Math.ceil(DIP_RELEASE_SEC * 60) + 1;
    for (let i = 0; i < n; i++) s.frame();
    expect(s.dip.dipNow).toBe(0);
    s.frame(); const clipY = s.hipsY(); s.frame();
    expect(s.hipsY()).toBeCloseTo(clipY, 6);                      // the layer writes nothing once released
    s.r.dispose();
  });
  it('a beat that is not a dip move draws nothing', () => {
    const s = setup();
    for (let i = 0; i < 10; i++) s.frame();
    const y0 = s.hipsY();
    s.setRise(RISE); s.frame();   // the clip rises with no dip beat playing: untouched
    expect(s.hipsY()).toBeCloseTo(y0 + RISE, 6);
    s.r.dispose();
  });
});
