// DUNK MOTION phase 9 (2026-09-23): on the REAL hero rig, the hinged arm leaves every solved elbow and hand where it was.
import { readFileSync } from 'node:fs';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { beforeAll, describe, expect, it } from 'vitest';
import { armChain, hingeArmApply, makeHingeArm } from './HandIK';
import { bindFrame } from './bindFrame';
import { bindFrontInFrame } from './groupMirror';
import { buildTakeOffOne } from './authored/dunkTakeoff';
import { buildFlushOne } from './authored/dunkFlush';

let scene: Scene, sk: Skeleton;
beforeAll(async () => {
  scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync('public/models/fel-hero.glb').toString('base64'), scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0];
}, 120000);
const pos = (n: TransformNode) => { n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); };

describe('the hinged arm on the hero rig', () => {
  it('moves no elbow and no hand across the take-off and the flush', () => {
    const bf = bindFrame(sk), front = bindFrontInFrame(sk)!;
    expect(front).not.toBeNull();
    const hinges = (['Left', 'Right'] as const).map((side) => {
      const a = armChain(sk, side)!; const bu = bf.bind.get(a.shoulder)!, bfo = bf.bind.get(a.elbow)!;
      return makeHingeArm(a, (bf.parentRot.get(a.shoulder) ?? Quaternion.Identity()).multiply(bu.q), bfo.q, front)!;
    });
    let worst = 0, stamp = 0;
    for (const build of [buildTakeOffOne, buildFlushOne]) {
      const g = build(scene, sk)!; g.start(false, 1, g.from, g.to, false); g.pause();
      for (const t of [0, 0.1, 0.2, 0.3, 0.45]) {
        g.goToFrame(t * 30); scene.render();
        for (const H of hinges) {
          const E0 = pos(H.arm.elbow), P0 = pos(H.arm.hand);
          hingeArmApply(H, 1 / 60, ++stamp, 800);
          worst = Math.max(worst, Vector3.Distance(pos(H.arm.elbow), E0), Vector3.Distance(pos(H.arm.hand), P0));
        }
      }
      g.stop();
    }
    expect(worst).toBeLessThan(0.002);
  });
});
