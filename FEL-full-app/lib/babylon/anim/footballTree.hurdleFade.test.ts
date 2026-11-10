// OWNER CALL (2026-11-10, delegated): the hurdle's blend-in. The tree's choice (pure), and the measurement behind the number:
// carry -> jump_up on the real hero, headless, at 60 fps, over 24 carry phases. Each render() is 16 ms of clip time.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { Skeleton } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { CharacterAnimator } from './CharacterAnimator';
import { registerAuthoredClips } from './authored';
import { sanitizeImportedGroups } from './importSanitizer';
import { boneNode } from './boneLookup';
import { SPORT_CLIP } from './clipRegistry';
import { FOOTBALL_HURDLE_CLIP, FOOTBALL_HURDLE_FADE_SEC, chooseFootballClip, type FootballAnimInput } from './footballTree';

const LEGS = ['LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'];
const ang = (a: Quaternion, b: Quaternion) => (2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(a, b)))) * 180) / Math.PI;
let scene: Scene, sk: Skeleton, animator: CharacterAnimator, engine: NullEngine;
beforeAll(async () => {
  engine = new NullEngine(); scene = new Scene(engine); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync('public/models/fel-hero.glb').toString('base64'), scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0];
  sanitizeImportedGroups(r.animationGroups);
  animator = new CharacterAnimator(scene, r.animationGroups);
  registerAuthoredClips(animator, scene, sk);
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 16;
  scene.useConstantAnimationDeltaTime = true;   // every render() is 16 ms of clip time (the default reads the wall clock: a tight loop would not advance the clips)
}, 120_000);

const pose = () => LEGS.map((b) => (boneNode(sk, b)?.rotationQuaternion ?? Quaternion.Identity()).clone());
/** Peak one-frame turn (deg) of thighs / knees over the hurdle's entry, for one carry phase and one fade. */
function peak(phaseFrames: number, fadeSec: number, carryRate: number): { thigh: number; knee: number } {
  animator.play('idle_stand', { loop: true, fadeSec: 0, restart: true }); scene.render();
  animator.play('football_carry_run', { loop: true, fadeSec: 0, restart: true, speedRatio: carryRate });
  for (let i = 0; i < 30 + phaseFrames; i++) scene.render();
  let prev = pose(), thigh = 0, knee = 0;
  animator.play('jump_up', { loop: false, fadeSec });
  for (let i = 0; i < 24; i++) {
    scene.render(); const now = pose();
    thigh = Math.max(thigh, ang(now[0], prev[0]), ang(now[1], prev[1]));
    knee = Math.max(knee, ang(now[2], prev[2]), ang(now[3], prev[3]));
    prev = now;
  }
  return { thigh, knee };
}

const worst = (fadeSec: number, rate: number) => { let t = 0, k = 0; for (let p = 0; p < 24; p++) { const r = peak(p * 2, fadeSec, rate); t = Math.max(t, r.thigh); k = Math.max(k, r.knee); } return { thigh: t, knee: k }; };

describe('the tree gives the hurdle its own fade, and nothing else changes', () => {
  const base = { carrying: true } as FootballAnimInput;
  it('the hurdle (the stiff-arm slot playing the hurdle clip) blends in over FOOTBALL_HURDLE_FADE_SEC', () => {
    const c = chooseFootballClip({ ...base, move: 'stiffArm', moveClip: FOOTBALL_HURDLE_CLIP });
    expect(c).toMatchObject({ state: 'stiff_arm', clip: FOOTBALL_HURDLE_CLIP, loop: false, fadeSec: FOOTBALL_HURDLE_FADE_SEC });
    expect(SPORT_CLIP.footballHurdle).toBe(FOOTBALL_HURDLE_CLIP);   // the mode's gesture IS this clip
  });
  it('the stiff arm itself, the juke and the spin keep their 0.06 s', () => {
    expect(chooseFootballClip({ ...base, move: 'stiffArm', moveClip: 'football_stiff_arm' }).fadeSec).toBe(0.06);
    expect(chooseFootballClip({ ...base, move: 'stiffArm' }).fadeSec).toBe(0.06);
    expect(chooseFootballClip({ ...base, move: 'juke', moveClip: 'football_juke_right' }).fadeSec).toBe(0.06);
    expect(chooseFootballClip({ ...base, move: 'spin', moveClip: 'football_spin_move' }).fadeSec).toBe(0.06);
    // a catch plays the same jump clip through its own state: untouched
    expect(chooseFootballClip({ ...base, catching: 'clean' })).toMatchObject({ clip: 'jump_up', fadeSec: 0.08 });
  });
});

describe('the hurdle entry, measured on the hero (24 carry phases, 60 fps)', () => {
  it('control: the clips really play (the carry strides; the old 0.06 s blend is the hard snap the rig read)', () => {
    animator.play('idle_stand', { loop: true, fadeSec: 0, restart: true }); scene.render();
    animator.play('football_carry_run', { loop: true, fadeSec: 0, restart: true }); for (let i = 0; i < 30; i++) scene.render();
    let prev = pose(), own = 0; for (let i = 0; i < 60; i++) { scene.render(); const now = pose(); own = Math.max(own, ...now.map((q, k) => ang(q, prev[k]))); prev = now; }
    expect(own).toBeGreaterThan(4); expect(own).toBeLessThan(9);          // the carry's own stride: about 6 deg a frame
    const old = worst(0.06, 1);
    expect(old.thigh).toBeGreaterThan(22);                                // 24.3 measured; the rig read 26 in play
  }, 300_000);
  it('at the default the worst one-frame thigh turn is under 18 deg and at least 30 % below the old blend, at both carry rates', () => {
    for (const rate of [1, 1.4]) {
      const old = worst(0.06, rate), now = worst(FOOTBALL_HURDLE_FADE_SEC, rate);
      expect(now.thigh, `rate ${rate}`).toBeLessThan(18);
      expect(now.thigh, `rate ${rate}`).toBeLessThan(old.thigh * 0.7);
      expect(now.knee, `rate ${rate}`).toBeLessThan(old.knee);
    }
  }, 300_000);
});
