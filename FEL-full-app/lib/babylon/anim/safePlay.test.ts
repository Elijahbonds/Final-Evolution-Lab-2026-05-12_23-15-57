import { describe, expect, it, vi } from 'vitest';
import { AnimationGroup, NullEngine, Scene } from '@babylonjs/core';
import { CharacterAnimator } from './CharacterAnimator';
import { installSafePlay } from './clipRegistry';

describe('installSafePlay', () => {
  it('lets a registered authored clip through even without a static alias', () => {
    const scene = new Scene(new NullEngine());
    const guard = new AnimationGroup('guard', scene);
    const anim = new CharacterAnimator(scene, [guard]);
    anim.register(new AnimationGroup('keeper_set', scene));
    installSafePlay(anim, 'test');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    anim.play('keeper_set', { loop: true });
    expect(err.mock.calls.map((c) => String(c[0])).filter((m) => /MISSING CLIP/.test(m))).toEqual([]);
    anim.play('definitely_not_a_clip');
    expect(err.mock.calls.some((c) => /MISSING CLIP "definitely_not_a_clip"/.test(String(c[0])))).toBe(true);
    err.mockRestore();
  });
});
