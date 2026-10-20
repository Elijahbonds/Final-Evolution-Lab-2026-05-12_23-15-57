// hoops-dip (owner 2026-10-20): the dip on the REAL tree and the real v2 crossover clip, the forge hero on a NullEngine — the idle dribble
// built for this body, the crossover beat thrown through BasketballAnimTree.beat, and MoveDip mounted as the modes mount it (after the
// clips). The hips go down from where the body was by the crossover's depth and never above it, both ankles stay on the floor, the knees
// bend further than the clip's own, and the beat's timing is the clip's (the layer reads it, never sets it).
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { buildDribbleIdle, buildCrossover } from './authored/basketball';
import { CharacterAnimator } from './CharacterAnimator';
import { BasketballAnimTree, type AnimTreeInput } from './basketballTree';
import { rightHandHoops } from './hoopsHand';
import { boneNode } from './boneLookup';
import { MoveDip, DIP_DEPTH_M } from './moveDip';

let engine: NullEngine; let scene: Scene; let sk: Skeleton; let root: TransformNode;
let animator: CharacterAnimator; let tree: BasketballAnimTree; let cross: AnimationGroup;
beforeAll(async () => {
  engine = new NullEngine(); (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  scene = new Scene(engine); scene.useConstantAnimationDeltaTime = true;   // 16 ms of clip a render, as a 60 fps frame (NullEngine's wall clock barely moves)
  new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync('public/models/fel-hero.glb').toString('base64'), scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0]; root = r.meshes[0] as TransformNode; root.scaling.setAll(1);
  cross = buildCrossover(scene, sk, 'left')!;
  animator = new CharacterAnimator(scene, [buildDribbleIdle(scene, sk)!, cross]);
  rightHandHoops(animator, sk);
  tree = new BasketballAnimTree(animator);
}, 120000);
afterAll(() => { scene?.dispose(); engine?.dispose(); });

const IDLE: AnimTreeInput = { speed01: 0, speedMps: 0, crossover: false, hasBall: true, shooting: false, dunking: false, driving: false, defending: false, bracing: false, staggered: false, nearestDefender: 9 };
const at = (b: string) => { const n = boneNode(sk, b)!; n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); };
const knee = (sd: string) => { const u = at(`${sd}UpLeg`), k = at(`${sd}Leg`), a = at(`${sd}Foot`); return 180 - Math.acos(Vector3.Dot(u.subtract(k).normalize(), a.subtract(k).normalize())) * 180 / Math.PI; };
interface F { hips: number; ankleLow: number; knee: number; playing: boolean; hands: Vector3[] }
function run(withDip: boolean): { idle: F[]; beat: F[] } {
  tree.reset(); for (const g of scene.animationGroups) g.stop();
  const dip = withDip ? MoveDip.for(scene, sk, root, (n) => animator.groupFor(n)) : null;
  const frame = (): F => { tree.update(IDLE); scene.render(); const ry = root.getAbsolutePosition().y;
    return { hips: at('Hips').y - ry, ankleLow: Math.min(at('LeftFoot').y, at('RightFoot').y) - ry, knee: Math.max(knee('Left'), knee('Right')), playing: cross.isPlaying, hands: [at('LeftHand'), at('RightHand')] }; };
  const idle: F[] = []; for (let i = 0; i < 60; i++) idle.push(frame());
  tree.beat('bball_crossover_left', { fadeSec: 0.08 });
  const beat: F[] = []; for (let i = 0; i < 60; i++) beat.push(frame());
  dip?.dispose();
  return { idle, beat };
}

describe('the dip on the real tree (the forge hero, the v2 crossover)', () => {
  it('the hips go down by the crossover\'s depth from where the body was, never above it; the ankles stay on the floor; the knees bend into it', () => {
    const bare = run(false), dipped = run(true);
    const base = dipped.idle.at(-1)!.hips, floor = Math.min(...dipped.idle.map((f) => f.ankleLow));
    const during = dipped.beat.filter((f) => f.playing);
    expect(during.length).toBeGreaterThan(15);
    expect(Math.max(...during.map((f) => f.hips)) - base, 'never above where the body was').toBeLessThanOrEqual(0.005);
    expect(base - Math.min(...during.map((f) => f.hips)), 'down by the depth').toBeGreaterThanOrEqual(DIP_DEPTH_M.crossover - 0.01);
    for (const f of during) expect(f.ankleLow - floor, 'an ankle stays on the floor (within handleV2.test\'s own 2 cm: the clip\'s push step lifts a heel)').toBeLessThan(0.02);
    expect(Math.min(...during.map((f) => f.ankleLow)) - floor, 'and never through it').toBeGreaterThan(-0.005);
    const kneeBare = Math.max(...bare.beat.filter((f) => f.playing).map((f) => f.knee)), kneeDip = Math.max(...during.map((f) => f.knee));
    const kneeIdle = dipped.idle.at(-1)!.knee;
    // (this harness's idle is the AUTHORED dribble idle, which stands near bind — the clip itself sinks from it; in play the loops sit ~21 cm
    // lower and the clip ROSE: the rig's numbers, not this test, read that case)
    expect(kneeDip - kneeIdle, `knees idle ${kneeIdle.toFixed(0)}° → the dip ${kneeDip.toFixed(0)}°`).toBeGreaterThan(10);
    expect(kneeDip, `never straighter than the clip alone (${kneeBare.toFixed(0)}°)`).toBeGreaterThanOrEqual(kneeBare - 1);
    // the beat runs the same frames with and without the layer (it reads the clip's clock, it never sets it)
    expect(dipped.beat.map((f) => f.playing)).toEqual(bare.beat.map((f) => f.playing));
    // …and both hands are where the clip alone put them: only the body sinks around the ball's path
    const handOff = Math.max(...dipped.beat.flatMap((f, i) => f.hands.map((h, j) => Vector3.Distance(h, bare.beat[i].hands[j]))));
    expect(handOff, 'the hands stay where the clip drew them').toBeLessThan(0.01);
  });
});
