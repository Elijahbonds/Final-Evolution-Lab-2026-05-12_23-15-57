// lane/improve-hoops phase 3 (2026-11-22): the load's clip build made cheaper, with the moves unchanged.
//   perf.poseClipFast   the limb-only recompute: every clip on the shipped kit body and a roster body, BIT FOR BIT the same as before.
//   perf.poseClipShare  a second body with the same rig gets the first body's solved keys: the same tracks, within float rounding of
//                       its own solve; a body with another rig never does; each switch at 0 builds exactly as before.
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { NullEngine, Scene, ArcRotateCamera, Vector3, SceneLoader, type AnimationGroup, type AssetContainer, type TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { CharacterAnimator } from './CharacterAnimator';
import { registerAuthoredClips } from './authored';
import { installOpponentMotion, HERO_CAPTURE } from './opponentMotion';
import { POSE_CLIP_FAST, POSE_CLIP_SHARE, poseClipShareStats } from './poseClip';
import { setFeelOverride, setFeelSession, setFeelUser } from '../../feel-panel/feel';

const FILES = { kit: 'public/models/candidates/fel-kit-male.mobile.glb', rival: 'public/models/rivals/echo.glb' } as const;
let scene: Scene;
const containers = {} as Record<keyof typeof FILES, AssetContainer>;
beforeAll(async () => {
  scene = new Scene(new NullEngine());
  scene.activeCamera = new ArcRotateCamera('c', -Math.PI / 2, 1.2, 3.2, new Vector3(0, 1, 0), scene);
  scene.metadata = { felTier: 'mobile', felModeId: 'onevone' };
  for (const k of Object.keys(FILES) as (keyof typeof FILES)[]) {
    containers[k] = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync(FILES[k]).toString('base64')}`, scene, undefined, '.glb');
  }
  setFeelUser(true); setFeelSession(null);
}, 120_000);
afterEach(() => { setFeelOverride('perf.poseClipFast', POSE_CLIP_FAST); setFeelOverride('perf.poseClipShare', POSE_CLIP_SHARE); poseClipShareStats.clear(); });

let n = 0;
/** A body built the way CharacterLibrary.spawn builds a hoops player's clips: the authored set and the hoops captures. */
function build(body: keyof typeof FILES, at: [number, number, number], yaw: number, only?: (name: string) => boolean): Map<string, AnimationGroup> {
  const inst = containers[body].instantiateModelsToScene((x) => `${x}_t${++n}`, false, { doNotInstantiate: true });
  for (const g of inst.animationGroups) g.stop();
  const root = inst.rootNodes[0] as TransformNode;
  root.position.set(...at); root.rotation = new Vector3(0, yaw, 0);
  const animator = new CharacterAnimator(scene, inst.animationGroups);
  registerAuthoredClips(animator, scene, inst.skeletons[0], undefined, only);
  installOpponentMotion(animator, scene, inst.skeletons[0], undefined, HERO_CAPTURE);
  return (animator as unknown as { groups: Map<string, AnimationGroup> }).groups;
}
/** Every track of every built clip as plain numbers: [clip, bone, property, frames and values]. */
function tracks(groups: Map<string, AnimationGroup>): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const [name, g] of groups) {
    if (!g.targetedAnimations.length || !/^[a-z]/.test(name)) continue;
    for (const t of g.targetedAnimations) {
      const key = `${name}|${(t.target as { name: string }).name.replace(/_t\d+$/, '')}|${t.animation.targetProperty}`;
      out.set(key, t.animation.getKeys().flatMap((k) => [k.frame, ...(typeof k.value === 'number' ? [k.value] : (k.value.asArray() as number[]))]));
    }
  }
  return out;
}
const worstDiff = (a: Map<string, number[]>, b: Map<string, number[]>): number => {
  expect([...b.keys()].sort()).toEqual([...a.keys()].sort());
  let worst = 0;
  for (const [k, va] of a) {
    const vb = b.get(k)!; expect(vb.length, k).toBe(va.length);
    for (let i = 0; i < va.length; i++) worst = Math.max(worst, Math.abs(va[i] - vb[i]));
  }
  return worst;
};

describe('perf.poseClipFast: the limb-only recompute', () => {
  it('builds every clip bit for bit as the whole-body recompute does, on the kit body and a roster body', () => {
    setFeelOverride('perf.poseClipShare', 0);
    for (const body of ['kit', 'rival'] as const) {
      setFeelOverride('perf.poseClipFast', 0);
      const before = tracks(build(body, [0, 0, 0], Math.PI));
      setFeelOverride('perf.poseClipFast', 1);
      const after = tracks(build(body, [0, 0, 0], Math.PI));
      expect(before.size, body).toBeGreaterThan(500);
      expect(worstDiff(before, after), body).toBe(0);
    }
  }, 120_000);
});

describe('perf.poseClipShare: a second body with the same rig', () => {
  it('copies the solved keys (agreeing with its own solve to float rounding); another rig solves its own', () => {
    setFeelOverride('perf.poseClipShare', 0);
    const own = tracks(build('kit', [3.2, 0, -4.1], 0.7));
    setFeelOverride('perf.poseClipShare', 1);
    poseClipShareStats.clear();
    build('kit', [0, 0, 0], Math.PI);
    const solvedFirst = poseClipShareStats.misses;
    expect(poseClipShareStats.hits).toBe(0);
    const shared = tracks(build('kit', [3.2, 0, -4.1], 0.7));
    expect(poseClipShareStats.hits).toBeGreaterThan(150);   // most of them: the handle v2 clips lay their keys on the body's own spot
    expect(worstDiff(own, shared)).toBeLessThan(2e-4);
    const hitsBefore = poseClipShareStats.hits;
    build('rival', [0, 0, 0], 0);   // echo: another rig — nothing of the kit body's is handed to it
    expect(poseClipShareStats.hits).toBe(hitsBefore);
    expect(solvedFirst).toBeGreaterThan(150);
  }, 120_000);
  it('at 0 never keeps or hands out anything', () => {
    setFeelOverride('perf.poseClipShare', 0);
    build('kit', [0, 0, 0], 0); build('kit', [1, 0, 1], 0);
    expect(poseClipShareStats.hits + poseClipShareStats.misses).toBe(0);
    expect(poseClipShareStats.size()).toBe(0);
  }, 120_000);
});
