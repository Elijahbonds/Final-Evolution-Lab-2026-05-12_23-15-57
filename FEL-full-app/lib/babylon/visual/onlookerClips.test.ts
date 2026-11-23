// lane/improve-hoops phase 3 (2026-11-22): an onlooker built with only the clips it can play plays exactly what it played before —
// the same clip for `idle` and for `cheer` (through every alias and captured stand-in), with the same keys — in every mode that
// stands a crowd; and the knob at 0 builds every clip, as before.
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { NullEngine, Scene, ArcRotateCamera, Vector3, SceneLoader, type AnimationGroup, type AssetContainer, type TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { CharacterAnimator } from '../anim/CharacterAnimator';
import { registerAuthoredClips } from '../anim/authored';
import { installOpponentMotion } from '../anim/opponentMotion';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay } from '../anim/clipRegistry';
import { scopeForMode } from '../anim/clipScope';
import { ONLOOKER_CLIPS_ONLY, onlookerClipFilter, onlookerClipNames } from './onlookerClips';
import { setFeelOverride, setFeelSession, setFeelUser } from '../../feel-panel/feel';

let scene: Scene;
let body: AssetContainer;
beforeAll(async () => {
  scene = new Scene(new NullEngine());
  scene.activeCamera = new ArcRotateCamera('c', -Math.PI / 2, 1.2, 3.2, new Vector3(0, 1, 0), scene);
  body = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync('public/models/rivals/umber.glb').toString('base64')}`, scene, undefined, '.glb');
  setFeelUser(true); setFeelSession(null);
}, 120_000);
afterEach(() => { setFeelOverride('perf.onlookerClipsOnly', ONLOOKER_CLIPS_ONLY); });

let n = 0;
/** An onlooker's body as CharacterLibrary.spawn builds an opponent: the authored clips, the play wrappers, the captures. */
function onlooker(modeId: string, only?: (name: string) => boolean): CharacterAnimator {
  scene.metadata = { felTier: 'mobile', felModeId: modeId };
  const inst = body.instantiateModelsToScene((x) => `${x}_o${++n}`, false, { doNotInstantiate: true });
  for (const g of inst.animationGroups) g.stop();
  (inst.rootNodes[0] as TransformNode).position.set(0, 0, 0);   // the same spot for both builds: a solve at another spot differs by float rounding
  const animator = new CharacterAnimator(scene, inst.animationGroups);
  registerAuthoredClips(animator, scene, inst.skeletons[0], undefined, only);
  neverBindPose(animator, 'idle');
  installSafePlay(animator, 'onlooker-test');
  installOpponentMotion(animator, scene, inst.skeletons[0], undefined, only);
  return animator;
}
const keysOf = (g: AnimationGroup | null) => (g ? g.targetedAnimations.map((t) => [(t.target as { name: string }).name.replace(/_o\d+$/, ''), t.animation.getKeys().map((k) => [k.frame, typeof k.value === 'number' ? k.value : k.value.asArray()])]) : null);

describe('perf.onlookerClipsOnly', () => {
  it('the set follows idle → idle_stand → guard and cheer → jump_up → jumpshot, and the scope\'s resting loop', () => {
    const s = onlookerClipNames(scopeForMode('onevone'));
    for (const k of ['idle', 'idle_stand', 'guard', 'cheer', 'jump_up', 'jumpshot']) expect(s.has(k), k).toBe(true);
    expect(onlookerClipNames(scopeForMode('skateboard')).has('board_ride_idle')).toBe(true);
  });
  for (const mode of ['onevone', 'threevthree', 'threepoint', 'karate-vs', 'dance', 'skateboard']) {
    it(`${mode}: an onlooker plays the same idle and cheer, key for key, with a fraction of the clips`, () => {
      setFeelOverride('perf.onlookerClipsOnly', 0);
      expect(onlookerClipFilter(scopeForMode(mode))).toBeUndefined();
      const full = onlooker(mode);
      setFeelOverride('perf.onlookerClipsOnly', 1);
      const lean = onlooker(mode, onlookerClipFilter(scopeForMode(mode)));
      for (const req of ['idle', 'cheer']) {
        const a = full.play(req, { loop: req === 'idle' }), b = lean.play(req, { loop: req === 'idle' });
        expect(b?.name, `${mode} ${req}`).toBe(a?.name);
        expect(keysOf(b), `${mode} ${req}`).toEqual(keysOf(a));
      }
      expect(lean.clipNames.size).toBeLessThan(full.clipNames.size);
    }, 120_000);
  }
});
