// SWITCH-ON (2026-11-10): the velocity-matched inertial offset (anim.inertialMatchVel, default 1, read only while anim.inertial is on).
// A knee that is MOVING when a clip that also starts FAST takes over: AF-1's offset started at the old motion's speed along its own
// axis and the new clip's own speed came on top of it, so the knee's turn a frame jumped. Matched, the offset starts at the old speed
// minus the new clip's, and the body keeps the speed it had. 0 restores AF-1's offset exactly.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Animation, AnimationGroup, FreeCamera, NullEngine, Quaternion, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { CharacterAnimator } from './CharacterAnimator';
import { ANIM_INERTIAL_MATCH_VEL_ON, inertialMatchVelOn, inertialStep } from './inertialize';
import { FEEL_STORAGE_KEY, resetFeelForTests, setFeelSession, setFeelUser } from '../../feel-panel/feel';
import { feelSessionBlock } from '../../feel-panel/sessionGate';

class FakeStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
const g = globalThis as { window?: unknown };
let ls: FakeStorage;
beforeEach(() => { resetFeelForTests(); ls = new FakeStorage(); g.window = { localStorage: ls, addEventListener() {}, removeEventListener() {} }; });
afterEach(() => { resetFeelForTests(); delete g.window; });
const matchKnob = (v: number) => { ls.m.set(FEEL_STORAGE_KEY, JSON.stringify({ 'anim.inertialMatchVel': v })); setFeelUser(true); setFeelSession(feelSessionBlock('/play/karate', '?playtest=1')); };

const X = new Vector3(1, 0, 0), Z = new Vector3(0, 0, 1);
/** A knee clip: keys (frame, angle about `axis`) at 60 fps. */
function rig() {
  const engine = new NullEngine(); const scene = new Scene(engine);
  scene.useConstantAnimationDeltaTime = true;   // the clips advance 1/60 s a render (the clock the knee's speed is read on)
  new FreeCamera('cam', new Vector3(0, 0, -5), scene);
  const hips = new TransformNode('Hips', scene), leg = new TransformNode('LeftLeg', scene);
  leg.parent = hips;
  for (const n of [hips, leg]) n.rotationQuaternion = Quaternion.Identity();
  const clip = (name: string, axis: Vector3, keys: [number, number][]) => {
    const a = new Animation(`${name}_leg`, 'rotationQuaternion', 60, Animation.ANIMATIONTYPE_QUATERNION, Animation.ANIMATIONLOOPMODE_CONSTANT);
    a.setKeys(keys.map(([frame, ang]) => ({ frame, value: Quaternion.RotationAxis(axis, ang) })));
    const h = new Animation(`${name}_hips`, 'position', 60, Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CONSTANT);
    h.setKeys([{ frame: 0, value: new Vector3(0, 1, 0) }, { frame: 60, value: new Vector3(0, 1, 0) }]);
    const gr = new AnimationGroup(name, scene);
    gr.addTargetedAnimation(a, leg); gr.addTargetedAnimation(h, hips);
    return gr;
  };
  // the old clip swings the knee about X at 4 rad/s (4° a frame); the new one starts FAST about Z (1.2 rad in 6 frames = 11.5° a
  // frame) and then holds — a strike's first frames
  const swing = clip('swing', X, [[0, 0], [60, 4]]);
  const strike = clip('strike', Z, [[0, 0], [6, 1.2], [60, 1.2]]);
  const still = clip('still', X, [[0, 0], [60, 0]]);
  const bend = clip('bend', X, [[0, Math.PI / 2], [60, Math.PI / 2]]);
  const animator = new CharacterAnimator(scene, [swing, strike, still, bend]);
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const frames = (n: number) => { for (let i = 0; i < n; i++) scene.render(); };
  const knee = () => leg.rotationQuaternion!.clone();
  return { engine, animator, frames, knee };
}
const deg = (a: Quaternion, b: Quaternion) => 2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(a, b)))) * 180 / Math.PI;

/** The largest one-frame knee turn over the 20 frames after swing → strike (fade 0.06 s), inertial on, matched or not. */
function worstStep(): { worst: number; first: number } {
  const r = rig(); r.animator.setBlendMode('inertial');
  r.animator.play('swing', { loop: false, fadeSec: 0 }); r.frames(10);
  let prev = r.knee();
  r.animator.play('strike', { loop: false, fadeSec: 0.06 });
  let worst = 0, first = 0;
  for (let i = 0; i < 20; i++) { r.frames(1); const k = r.knee(); const d = deg(prev, k); if (i === 1) first = d; worst = Math.max(worst, d); prev = k; }
  r.engine.dispose();
  return { worst, first };
}

describe('anim.inertialMatchVel', () => {
  it('defaults to 1 (read only while anim.inertial is on)', () => {
    expect(ANIM_INERTIAL_MATCH_VEL_ON).toBe(1);
    expect(inertialMatchVelOn()).toBe(true);
    matchKnob(0); expect(inertialMatchVelOn()).toBe(false);
  });

  it('a fast-starting clip: matched, the frame after the switch keeps the old speed; AF-1 (knob 0) stacks the new clip on it', () => {
    const matched = worstStep();
    matchKnob(0);
    const af1 = worstStep();
    // the old motion turned 3.8° a frame; the new clip turns 11.5° a frame on its own. AF-1's first frame is old + new.
    expect(af1.first).toBeGreaterThan(10);
    expect(matched.first).toBeLessThan(af1.first - 3);
  });

  it('both settle on the new clip', () => {
    for (const v of [1, 0]) {
      resetFeelForTests(); if (v === 0) matchKnob(0);
      const r = rig(); r.animator.setBlendMode('inertial');
      r.animator.play('swing', { loop: false, fadeSec: 0 }); r.frames(10);
      r.animator.play('strike', { loop: false, fadeSec: 0.06 }); r.frames(40);
      expect(deg(r.knee(), Quaternion.RotationAxis(Z, 1.2)), `knob ${v}`).toBeLessThan(0.05);
      r.engine.dispose();
    }
  });

  it('between still clips it is AF-1\'s curve exactly (no velocity to match)', () => {
    const r = rig(); r.animator.setBlendMode('inertial');
    r.animator.play('still', { loop: true, fadeSec: 0 }); r.frames(5);
    r.animator.play('bend', { loop: true, fadeSec: 0.15 }); r.frames(1);
    let s = { x: Math.PI / 2, v: 0 };
    for (let i = 0; i < 8; i++) {
      r.frames(1); s = inertialStep(s.x, s.v, 0.075, 1 / 60);
      const q = r.knee(); const ang = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
      expect(Math.abs(ang - (Math.PI / 2 - s.x))).toBeLessThan(1e-5);
    }
    r.engine.dispose();
  });

  it('anim.inertialMinHalfLifeSec: a short fade no longer drops most of the offset in one frame; 0 is AF-1\'s half-life exactly', () => {
    const worst = (floor: number | null) => {
      resetFeelForTests();
      if (floor !== null) { ls.m.set(FEEL_STORAGE_KEY, JSON.stringify({ 'anim.inertialMinHalfLifeSec': floor })); setFeelUser(true); setFeelSession(feelSessionBlock('/play/karate', '?playtest=1')); }
      const r = rig(); r.animator.setBlendMode('inertial');
      r.animator.play('still', { loop: true, fadeSec: 0 }); r.frames(5);
      r.animator.play('bend', { loop: true, fadeSec: 0.04 }); r.frames(1);
      let prev = r.knee(), w = 0;
      for (let i = 0; i < 30; i++) { r.frames(1); const k = r.knee(); w = Math.max(w, deg(prev, k)); prev = k; }
      r.engine.dispose();
      return w;
    };
    const base = worst(null), zero = worst(0), floored = worst(0.045);
    // AF-1: half-life 0.02 s on a 90° offset — the decay's fastest frame is about a third of it
    let s = { x: 90, v: 0 }, step = 0;
    for (let i = 0; i < 30; i++) { const n = inertialStep(s.x, s.v, 0.02, 1 / 60); step = Math.max(step, s.x - n.x); s = n; }
    expect(Math.abs(base - step)).toBeLessThan(0.05);
    expect(zero).toBeCloseTo(base, 6);
    expect(floored).toBeLessThan(18);
    expect(base).toBeGreaterThan(25);
  });

  it('anim.inertialAllBones: a bone the last clip did not key starts from where it was (0 = AF-1: it jumped)', () => {
    const run = (allBones: number) => {
      resetFeelForTests();
      ls.m.set(FEEL_STORAGE_KEY, JSON.stringify({ 'anim.inertialAllBones': allBones })); setFeelUser(true); setFeelSession(feelSessionBlock('/play/karate', '?playtest=1'));
      const r = rig2(); r.animator.setBlendMode('inertial');
      r.animator.play('upper', { loop: true, fadeSec: 0 }); r.frames(5);      // keys the hips only: the knee rests at identity
      r.animator.play('full', { loop: true, fadeSec: 0.15 }); r.frames(1);      // keys the knee at 90°
      const firstFrame = r.knee(); r.frames(60);
      const settled = r.knee();
      r.animator.play('upper', { loop: true, fadeSec: 0.15 }); r.frames(1);
      const back1 = r.knee(); r.frames(60);
      const back = r.knee();
      r.engine.dispose();
      return { firstFrame: angOf(firstFrame), settled: angOf(settled), back1: angOf(back1), back: angOf(back) };
    };
    const on = run(1), off = run(0);
    expect(on.firstFrame).toBeLessThan(1e-3);                 // the switch frame shows the knee where it was
    expect(off.firstFrame).toBeGreaterThan(89);               // AF-1: the whole 90° in one frame
    expect(on.settled).toBeCloseTo(90, 2); expect(off.settled).toBeCloseTo(90, 2);
    expect(on.back1).toBeGreaterThan(89);                     // the clip after it does not key the knee: it eases from 90°...
    expect(on.back).toBeLessThan(0.1);                        // ...onto its rest (identity), where a linear fade-out leaves it
    expect(off.back).toBeGreaterThan(89);                     // AF-1: frozen at 90°
  });
});

const angOf = (q: Quaternion) => 2 * Math.acos(Math.min(1, Math.abs(q.w))) * 180 / Math.PI;
/** A two-node body: 'upper' keys the hips only, 'full' keys the hips and the knee (90° about X). */
function rig2() {
  const engine = new NullEngine(); const scene = new Scene(engine);
  scene.useConstantAnimationDeltaTime = true;
  new FreeCamera('cam', new Vector3(0, 0, -5), scene);
  const hips = new TransformNode('Hips', scene), leg = new TransformNode('LeftLeg', scene);
  leg.parent = hips;
  for (const n of [hips, leg]) n.rotationQuaternion = Quaternion.Identity();
  const q = (name: string, node: TransformNode, v: Quaternion) => {
    const a = new Animation(name, 'rotationQuaternion', 60, Animation.ANIMATIONTYPE_QUATERNION, Animation.ANIMATIONLOOPMODE_CYCLE);
    a.setKeys([{ frame: 0, value: v.clone() }, { frame: 60, value: v.clone() }]); return a;
  };
  const upper = new AnimationGroup('upper', scene); upper.addTargetedAnimation(q('u_h', hips, Quaternion.Identity()), hips);
  const full = new AnimationGroup('full', scene); full.addTargetedAnimation(q('f_h', hips, Quaternion.Identity()), hips); full.addTargetedAnimation(q('f_l', leg, Quaternion.RotationAxis(X, Math.PI / 2)), leg);
  const animator = new CharacterAnimator(scene, [upper, full]);
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  return { engine, animator, frames: (n: number) => { for (let i = 0; i < n; i++) scene.render(); }, knee: () => leg.rotationQuaternion!.clone() };
}
