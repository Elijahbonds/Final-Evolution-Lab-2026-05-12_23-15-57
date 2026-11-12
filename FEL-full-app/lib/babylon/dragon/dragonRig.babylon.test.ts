// The v5 dragon LODs load through Babylon's glTF loader (the path DragonRig takes): the sparse morphs come in as five named targets,
// the eight clips as animation groups (the two dunk clips also animate morph weights), and DR_Seat is a node the rider can parent to.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NullEngine, Scene, SceneLoader, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { CLIP_FRAMES, DRAGON_GLB_FILES, DR_SEAT, MORPH_NAMES } from './dragonRideConsts';

describe('the dragon LODs in Babylon', () => {
  DRAGON_GLB_FILES.forEach((file, lod) => {
    it(`LOD${lod}: five named morph targets, the eight clips, DR_Seat; the rider parents to the seat keeping his world pose`, async () => {
      const engine = new NullEngine(), scene = new Scene(engine);
      try {
        const b64 = readFileSync(path.resolve(__dirname, '../../../public/models/dragon', file)).toString('base64');
        const c = await SceneLoader.LoadAssetContainerAsync('data:model/gltf-binary;base64,' + b64, '', scene, undefined, '.glb');
        c.addAllToScene();
        const mtm = c.meshes.map((m) => m.morphTargetManager).filter((m) => !!m);
        expect(mtm.length).toBeGreaterThan(0);
        for (const m of mtm) expect(Array.from({ length: m!.numTargets }, (_, i) => m!.getTarget(i).name)).toEqual([...MORPH_NAMES]);
        expect(c.animationGroups.map((g) => g.name).sort()).toEqual(Object.keys(CLIP_FRAMES).sort());
        const seat = c.transformNodes.find((t) => t.name === DR_SEAT);
        expect(seat).toBeTruthy();
        const rider = new TransformNode('rider', scene); rider.position.set(0.3, 2.5, -0.2); rider.computeWorldMatrix(true);
        const before = rider.getAbsolutePosition().clone();
        rider.setParent(seat!); rider.computeWorldMatrix(true);
        expect(rider.getAbsolutePosition().subtract(before).length()).toBeLessThan(1e-6);   // no snap
      } finally { scene.dispose(); engine.dispose(); }
    });
  });
});
