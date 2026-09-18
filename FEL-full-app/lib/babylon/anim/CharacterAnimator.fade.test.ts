// DUNK-BALL-ARMS-RIM (2026-09-14): a clip superseded mid-fade fades out from the weight it had, never from full weight.
import { describe, expect, it } from 'vitest';
import { Animation, AnimationGroup, FreeCamera, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { CharacterAnimator } from './CharacterAnimator';

function clip(scene: Scene, name: string, node: TransformNode): AnimationGroup {
  const a = new Animation(`${name}_x`, 'position.x', 30, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE);
  a.setKeys([{ frame: 0, value: 0 }, { frame: 60, value: 1 }]);
  const g = new AnimationGroup(name, scene); g.addTargetedAnimation(a, node);
  return g;
}

describe('CharacterAnimator crossfade', () => {
  it('a clip superseded while fading in keeps its partial weight as the start of its fade-out (no one-frame snap)', () => {
    const engine = new NullEngine(); const scene = new Scene(engine);
    const node = new TransformNode('bone', scene); new FreeCamera('cam', new Vector3(0, 0, -5), scene);
    const anim = new CharacterAnimator(scene, [clip(scene, 'launch', node), clip(scene, 'hang', node), clip(scene, 'finish', node)]);
    (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 25;   // 25 ms a frame
    const frame = () => scene.render();
    anim.play('launch', { loop: true, fadeSec: 0 }); frame();
    const hang = anim.play('hang', { loop: true, fadeSec: 0.1 })!; frame(); frame();   // 50 ms of a 100 ms fade: hang ≈ 0.5
    const before = CharacterAnimator.weightOf(hang);
    expect(before).toBeGreaterThan(0.3); expect(before).toBeLessThan(0.7);
    anim.play('finish', { loop: true, fadeSec: 0.15 }); frame();
    expect(CharacterAnimator.weightOf(hang)).toBeLessThanOrEqual(before + 1e-6);   // it used to jump to ~0.83 here
    for (let i = 0; i < 8; i++) frame();
    expect(hang.isPlaying).toBe(false);
  });
  it('a clip at full weight fades out exactly as before', () => {
    const engine = new NullEngine(); const scene = new Scene(engine);
    const node = new TransformNode('bone', scene); new FreeCamera('cam', new Vector3(0, 0, -5), scene);
    const anim = new CharacterAnimator(scene, [clip(scene, 'run', node), clip(scene, 'jump', node)]);
    (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 25;
    const run = anim.play('run', { loop: true, fadeSec: 0 })!; scene.render();
    expect(CharacterAnimator.weightOf(run)).toBe(1);
    anim.play('jump', { loop: true, fadeSec: 0.1 }); scene.render();
    expect(CharacterAnimator.weightOf(run)).toBeCloseTo(0.75, 5);
  });
});
