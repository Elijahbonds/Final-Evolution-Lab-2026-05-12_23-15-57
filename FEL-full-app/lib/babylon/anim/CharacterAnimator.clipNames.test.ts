// PHONE-PERF (2026-10-14): CharacterAnimator.clipNames is built once per change, not once per read. Every play() resolves its
// clip through it (and the opponent / style wrappers read it again), several times per body per frame; a fresh Set on each read
// was 13 % of what the dunk allocated in play on the phone profile.
import { describe, expect, it } from 'vitest';
import { AnimationGroup, FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { CharacterAnimator } from './CharacterAnimator';

function rig(names: string[]) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new FreeCamera('cam', new Vector3(0, 0, -5), scene);
  const groups = names.map((n) => new AnimationGroup(n, scene));
  return { scene, engine, animator: new CharacterAnimator(scene, groups) };
}

describe('CharacterAnimator.clipNames', () => {
  it('is the same set on every read while the clips are unchanged — no allocation per play()', () => {
    const { animator, scene, engine } = rig(['idle_stand', 'run', 'jump']);
    const a = animator.clipNames;
    expect([...a].sort()).toEqual(['idle_stand', 'jump', 'run']);
    expect(animator.clipNames).toBe(a);
    for (let i = 0; i < 5; i++) { animator.play('run'); animator.durationOf('jump'); }
    expect(animator.clipNames).toBe(a);
    scene.dispose(); engine.dispose();
  });

  it('a clip registered later is in it at once (the cache is dropped on every register)', () => {
    const { animator, scene, engine } = rig(['idle_stand']);
    const before = animator.clipNames;
    expect(before.has('dunk_tomahawk')).toBe(false);
    animator.register(new AnimationGroup('dunk_tomahawk', scene));
    expect(animator.clipNames.has('dunk_tomahawk')).toBe(true);
    expect(animator.clipNames).not.toBe(before);
    expect(before.has('dunk_tomahawk')).toBe(false);   // a set handed out earlier is a snapshot, never edited under its reader
    // a re-registered name (same clip replaced) keeps the set correct too
    animator.register(new AnimationGroup('idle_stand', scene));
    expect([...animator.clipNames].sort()).toEqual(['dunk_tomahawk', 'idle_stand']);
    scene.dispose(); engine.dispose();
  });
});
