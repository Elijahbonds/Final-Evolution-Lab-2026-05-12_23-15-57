// AF-1 (ANIM-FEEL-SPEC 2026-10-28): CharacterAnimator's inertial blend on a keyed 3-bone chain (Hips → LeftUpLeg → LeftLeg), and the
// default linear crossfade left exactly as it was.
import { describe, expect, it } from 'vitest';
import { Animation, AnimationGroup, FreeCamera, NullEngine, Quaternion, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { CharacterAnimator } from './CharacterAnimator';
import { inertialStep } from './inertialize';

const LEG_B = Quaternion.RotationAxis(new Vector3(1, 0, 0), Math.PI / 2);   // clip B bends the knee 90°
const HIPS_A = new Vector3(0, 1, 0), HIPS_B = new Vector3(0, 0.9, 0.1);

function rig(hipsName = 'Hips') {
  const engine = new NullEngine(); const scene = new Scene(engine);
  new FreeCamera('cam', new Vector3(0, 0, -5), scene);
  const hips = new TransformNode(hipsName, scene), up = new TransformNode('LeftUpLeg', scene), leg = new TransformNode('LeftLeg', scene);
  up.parent = hips; leg.parent = up;
  for (const n of [hips, up, leg]) n.rotationQuaternion = Quaternion.Identity();
  const quat = (name: string, node: TransformNode, q: Quaternion) => {
    const a = new Animation(name, 'rotationQuaternion', 60, Animation.ANIMATIONTYPE_QUATERNION, Animation.ANIMATIONLOOPMODE_CYCLE);
    a.setKeys([{ frame: 0, value: q.clone() }, { frame: 60, value: q.clone() }]);
    return a;
  };
  const pos = (name: string, v: Vector3) => {
    const a = new Animation(name, 'position', 60, Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CYCLE);
    a.setKeys([{ frame: 0, value: v.clone() }, { frame: 60, value: v.clone() }]);
    return a;
  };
  const clip = (name: string, legQ: Quaternion, hipsP: Vector3) => {
    const g = new AnimationGroup(name, scene);
    g.addTargetedAnimation(quat(`${name}_hips`, hips, Quaternion.Identity()), hips);
    g.addTargetedAnimation(pos(`${name}_hipsP`, hipsP), hips);
    g.addTargetedAnimation(quat(`${name}_up`, up, Quaternion.Identity()), up);
    g.addTargetedAnimation(quat(`${name}_leg`, leg, legQ), leg);
    return g;
  };
  const a = clip('stand', Quaternion.Identity(), HIPS_A), b = clip('crouch', LEG_B, HIPS_B);
  const animator = new CharacterAnimator(scene, [a, b]);
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const frames = (n: number) => { for (let i = 0; i < n; i++) scene.render(); };
  /** The knee's angle (rad) away from clip A's (identity). */
  const kneeAngle = () => { const q = leg.rotationQuaternion!; return 2 * Math.acos(Math.min(1, Math.abs(q.w))); };
  return { engine, scene, hips, leg, a, b, animator, frames, kneeAngle };
}

const HL = 0.5 * 0.15;   // halfLife for the default fadeSec 0.15

describe('CharacterAnimator — inertial blend (AF-1)', () => {
  it('the first frame after play() shows the OLD pose (to 1e-6), and the switch stops the old clip at once', () => {
    const r = rig(); r.animator.setBlendMode('inertial');
    r.animator.play('stand', { loop: true, fadeSec: 0 }); r.frames(5);
    r.animator.play('crouch', { loop: true, fadeSec: 0.15 });
    expect(r.a.isPlaying).toBe(false);                               // prev stopped on the switch frame
    expect(CharacterAnimator.weightOf(r.b)).toBe(1);
    r.frames(1);
    expect(r.kneeAngle()).toBeLessThan(1e-6);
    expect(Vector3.Distance(r.hips.position, HIPS_A)).toBeLessThan(1e-6);
    r.engine.dispose();
  });

  it('decays onto the new clip: the curve is the critically damped decay, and after 8 half-lives the pose is the new clip (to 1e-3)', () => {
    const r = rig(); r.animator.setBlendMode('inertial');
    r.animator.play('stand', { loop: true, fadeSec: 0 }); r.frames(5);
    r.animator.play('crouch', { loop: true, fadeSec: 0.15 }); r.frames(1);
    let s = { x: Math.PI / 2, v: 0 };
    for (let i = 0; i < 8; i++) {
      r.frames(1); s = inertialStep(s.x, s.v, HL, 1 / 60);
      expect(Math.abs(r.kneeAngle() - (Math.PI / 2 - s.x))).toBeLessThan(1e-5);
    }
    r.frames(Math.ceil((8 * HL) * 60));
    const q = r.leg.rotationQuaternion!;
    expect(Math.abs(Quaternion.Dot(q, LEG_B))).toBeGreaterThan(1 - 1e-6);
    expect(Math.abs(r.kneeAngle() - Math.PI / 2)).toBeLessThan(1e-3);
    expect(Vector3.Distance(r.hips.position, HIPS_B)).toBeLessThan(1e-3);
    r.engine.dispose();
  });

  it('no linear mid-blend: at fadeSec/2 the knee is on the decay curve, not the 45° a linear crossfade shows', () => {
    const lin = rig();
    lin.animator.play('stand', { loop: true, fadeSec: 0 }); lin.frames(5);
    lin.animator.play('crouch', { loop: true, fadeSec: 0.15 }); lin.frames(5);   // the fade observer ramps from the first frame on
    const linear = lin.kneeAngle();
    const ine = rig(); ine.animator.setBlendMode('inertial');
    ine.animator.play('stand', { loop: true, fadeSec: 0 }); ine.frames(5);
    ine.animator.play('crouch', { loop: true, fadeSec: 0.15 }); ine.frames(5);
    const inertial = ine.kneeAngle();
    let s = { x: Math.PI / 2, v: 0 };
    for (let i = 0; i < 4; i++) s = inertialStep(s.x, s.v, HL, 1 / 60);
    expect(Math.abs(inertial - (Math.PI / 2 - s.x))).toBeLessThan(1e-5);
    expect(Math.abs(inertial - linear)).toBeGreaterThan(5 * Math.PI / 180);
    lin.engine.dispose(); ine.engine.dispose();
  });

  it('animationTimeScale = 0 (hit-stop): the offset holds', () => {
    const r = rig(); r.animator.setBlendMode('inertial');
    r.animator.play('stand', { loop: true, fadeSec: 0 }); r.frames(5);
    r.animator.play('crouch', { loop: true, fadeSec: 0.15 }); r.frames(3);
    const held = r.kneeAngle();
    expect(held).toBeGreaterThan(0.1); expect(held).toBeLessThan(Math.PI / 2 - 0.1);
    r.scene.animationTimeScale = 0;
    r.frames(20);
    expect(Math.abs(r.kneeAngle() - held)).toBeLessThan(1e-9);
    r.scene.animationTimeScale = 1;
    r.frames(60);
    expect(Math.abs(r.kneeAngle() - Math.PI / 2)).toBeLessThan(1e-3);
    r.engine.dispose();
  });

  it('a hard cut (fadeSec 0) stays a cut in inertial mode', () => {
    const r = rig(); r.animator.setBlendMode('inertial');
    r.animator.play('stand', { loop: true, fadeSec: 0 }); r.frames(5);
    r.animator.play('crouch', { loop: true, fadeSec: 0 }); r.frames(1);
    expect(Math.abs(r.kneeAngle() - Math.PI / 2)).toBeLessThan(1e-6);
    r.engine.dispose();
  });

  it('a rig with no Hips: no throw, the rotations still blend, and the unnamed root takes no position offset', () => {
    const r = rig('Root'); r.animator.setBlendMode('inertial');
    expect(() => {
      r.animator.play('stand', { loop: true, fadeSec: 0 }); r.frames(5);
      r.animator.play('crouch', { loop: true, fadeSec: 0.15 }); r.frames(1);
    }).not.toThrow();
    expect(r.kneeAngle()).toBeLessThan(1e-6);
    expect(Vector3.Distance(r.hips.position, HIPS_B)).toBeLessThan(1e-6);
    r.frames(60);
    expect(Math.abs(r.kneeAngle() - Math.PI / 2)).toBeLessThan(1e-3);
    r.engine.dispose();
  });

  it('back to linear: the observer comes off and the next switch crossfades again', () => {
    const r = rig();
    const before = r.scene.onAfterAnimationsObservable.observers.length;
    r.animator.setBlendMode('inertial');
    expect(r.scene.onAfterAnimationsObservable.observers.length).toBe(before + 1);
    r.animator.setBlendMode('linear');
    expect(r.scene.onAfterAnimationsObservable.observers.length).toBe(before);
    expect(r.animator.blendMode).toBe('linear');
    r.engine.dispose();
  });
});

describe('CharacterAnimator — the default stays the linear crossfade (flag off)', () => {
  function posClip(scene: Scene, name: string, node: TransformNode): AnimationGroup {
    const a = new Animation(`${name}_x`, 'position.x', 30, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE);
    a.setKeys([{ frame: 0, value: 0 }, { frame: 60, value: 1 }]);
    const g = new AnimationGroup(name, scene); g.addTargetedAnimation(a, node);
    return g;
  }
  it('a new animator is linear and mounts no inertial observer', () => {
    const r = rig();
    expect(r.animator.blendMode).toBe('linear');
    const engine = new NullEngine(); const scene = new Scene(engine);
    const before = scene.onAfterAnimationsObservable.observers.length;
    const anim = new CharacterAnimator(scene, [posClip(scene, 'run', new TransformNode('bone', scene))]);
    anim.play('run', { loop: true, fadeSec: 0 });
    expect(scene.onAfterAnimationsObservable.observers.length).toBe(before);
    r.engine.dispose(); engine.dispose();
  });
  it('the linear fade weights, exactly as CharacterAnimator.fade.test has them', () => {
    const engine = new NullEngine(); const scene = new Scene(engine);
    const node = new TransformNode('bone', scene); new FreeCamera('cam', new Vector3(0, 0, -5), scene);
    const anim = new CharacterAnimator(scene, [posClip(scene, 'launch', node), posClip(scene, 'hang', node), posClip(scene, 'finish', node)]);
    (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 25;
    anim.play('launch', { loop: true, fadeSec: 0 }); scene.render();
    const hang = anim.play('hang', { loop: true, fadeSec: 0.1 })!; scene.render(); scene.render();
    const before = CharacterAnimator.weightOf(hang);
    expect(before).toBeGreaterThan(0.3); expect(before).toBeLessThan(0.7);
    anim.play('finish', { loop: true, fadeSec: 0.15 }); scene.render();
    expect(CharacterAnimator.weightOf(hang)).toBeLessThanOrEqual(before + 1e-6);
    for (let i = 0; i < 8; i++) scene.render();
    expect(hang.isPlaying).toBe(false);
    const e2 = new NullEngine(); const s2 = new Scene(e2);
    const n2 = new TransformNode('bone', s2); new FreeCamera('cam', new Vector3(0, 0, -5), s2);
    const a2 = new CharacterAnimator(s2, [posClip(s2, 'run', n2), posClip(s2, 'jump', n2)]);
    (e2 as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 25;
    const run = a2.play('run', { loop: true, fadeSec: 0 })!; s2.render();
    expect(CharacterAnimator.weightOf(run)).toBe(1);
    a2.play('jump', { loop: true, fadeSec: 0.1 }); s2.render();
    expect(CharacterAnimator.weightOf(run)).toBeCloseTo(0.75, 5);
    engine.dispose(); e2.dispose();
  });
});
