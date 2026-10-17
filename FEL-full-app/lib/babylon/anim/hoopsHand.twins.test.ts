// HOOPS MOTION phase 4b (plan §3.5, U4) — THE DRIBBLE LOOPS IN THE LEFT HAND: runtime mirrors of the right-handed loops (hoopsHand.
// leftDribbleTwins), on the forge hero. The twin is the loop reflected across the body again — the ball arm's pose on the other arm — and
// the source is untouched (its keys are copied, not shared); the tree asks for it by its own name (basketballTree.leftTwinOf).
import { readFileSync } from 'node:fs';
import { FreeCamera, NullEngine, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { beforeAll, describe, expect, it } from 'vitest';
import { boneNode } from './boneLookup';
import { buildDribbleIdle } from './authored/basketball';
import { rightHandHoops, leftDribbleTwins, LEFT_TWIN_LOOPS } from './hoopsHand';
import { leftTwinOf } from './basketballTree';

let scene: Scene, sk: Skeleton;
beforeAll(async () => {
  scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const b64 = readFileSync('public/models/fel-hero.glb').toString('base64');
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0];
}, 120000);
const pos = (n: string) => { const b = boneNode(sk, n)! as TransformNode; b.computeWorldMatrix(true); return b.getAbsolutePosition().clone(); };
function at(g: AnimationGroup, t: number): void { g.start(false, 1, g.from, g.to, false); g.pause(); g.goToFrame(t * 30); scene.render(); }
/** A stand-in for the CharacterAnimator's registry (what rightHandHoops / leftDribbleTwins read: its groups, its register). */
function animator(gs: AnimationGroup[]) {
  const groups = new Map(gs.map((g) => [g.name, g] as const));
  return { groups, register: (g: AnimationGroup) => { g.stop(); groups.set(g.name, g); }, get clipNames() { return new Set(groups.keys()); } };
}

describe('leftDribbleTwins', () => {
  it('registers each loop\'s left twin under the tree\'s name, mirrored from the right-handed loop; the source stays as it was; a second call adds nothing', () => {
    const g = buildDribbleIdle(scene, sk)!;
    const a = animator([g]);
    expect(leftDribbleTwins(a, sk)).toEqual([]);   // not right-handed yet: nothing to twin
    rightHandHoops(a, sk);
    at(g, 0.4); const src = { L: pos('LeftHand'), R: pos('RightHand'), c: pos('Hips') }; g.stop();
    const made = leftDribbleTwins(a, sk);
    expect(made).toEqual(['bball_dribble_idle_left']); expect(leftTwinOf('bball_dribble_idle')).toBe('bball_dribble_idle_left');
    expect(LEFT_TWIN_LOOPS).toContain('bball_dribble_idle');
    const twin = a.groups.get('bball_dribble_idle_left')!;
    expect(twin).not.toBe(g); expect((twin.metadata as { felLeftTwinOf?: string }).felLeftTwinOf).toBe(g.name);
    // the twin's pose is the source's reflected across the body: each hand where the other hand was, mirrored across the hip line
    const n = pos('RightUpLeg').subtract(pos('LeftUpLeg')).normalize();
    const reflect = (p: Vector3) => p.subtract(n.scale(2 * Vector3.Dot(p.subtract(src.c), n)));
    at(twin, 0.4);
    expect(Vector3.Distance(pos('RightHand'), reflect(src.L))).toBeLessThan(0.03);
    expect(Vector3.Distance(pos('LeftHand'), reflect(src.R))).toBeLessThan(0.03);
    twin.stop();
    at(g, 0.4); expect(Vector3.Distance(pos('LeftHand'), src.L)).toBeLessThan(1e-4); g.stop();   // the source's keys untouched
    expect(leftDribbleTwins(a, sk)).toEqual([]);
    expect(rightHandHoops(a, sk)).toBe(0);   // the twin is marked mirrored: the family's pass never flips it back
  });
});
