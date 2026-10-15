// The bake on a real crowd body (NullEngine): every clip lands in its rows, behind its pad row, and the poses are the ones
// authored — seated rows carry the hips down a seat's height, a cheer moves, the folded skeleton is out of the way after.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LoadAssetContainerAsync, NullEngine, Scene } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { gateContainerRig } from '../../anim/rigNormalize';
import { findBone } from '../../anim/boneLookup';
import { bakeBody } from './crowdBake';
import { SEAT_DROP } from './crowdClips';
import { layoutClips } from './crowdVat';

const GLB = join(__dirname, '..', '..', '..', '..', 'public', 'models', 'crowd', 'scout.glb');

describe('baking a crowd body', () => {
  it('samples every clip into its rows, and the rows hold the authored poses', async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const data = 'data:model/gltf-binary;base64,' + readFileSync(GLB).toString('base64');
    const c = await LoadAssetContainerAsync(data, scene, { pluginExtension: '.glb', pluginOptions: { gltf: { skipMaterials: true } } });
    gateContainerRig(c, 'scout.glb');
    c.addAllToScene();
    const sk = c.skeletons[0];
    const mesh = c.meshes.find((m) => !!m.skeleton)!;
    const { ranges, rows } = layoutClips();
    const vat = bakeBody(scene, sk, mesh, ranges, rows);
    const stride = (sk.bones.length + 1) * 16;
    expect(vat.length).toBe(stride * rows);
    expect(vat.every(Number.isFinite)).toBe(true);
    const hips = sk.bones.indexOf(findBone(sk, 'Hips')!);
    const hipsY = (row: number): number => vat[row * stride + hips * 16 + 13];   // the hips' displacement from bind (translation y)
    const row = (name: keyof typeof ranges, i = 0): number => ranges[name].start + 1 + i;
    // seated vs standing: the hips are a chair's height lower — thighs level over a ~0.45 m seat (measured, not SEAT_DROP's
    // own value, so a drop that stops reading as sitting is caught)
    const drop = hipsY(row('stand_idle')) - hipsY(row('sit_idle'));
    expect(drop).toBeGreaterThan(0.32);
    expect(drop).toBeLessThan(0.55);
    expect(drop).toBeCloseTo(SEAT_DROP, 1);
    // the rise starts seated and ends standing
    expect(hipsY(row('rise'))).toBeCloseTo(hipsY(row('sit_idle')), 2);
    expect(hipsY(row('rise', ranges.rise.frames - 1))).toBeCloseTo(hipsY(row('stand_idle')), 1);
    // the cheer moves: at its peak the seated fan is up off the seat
    expect(hipsY(row('sit_cheer', 10)) - hipsY(row('sit_idle'))).toBeGreaterThan(0.15);
    // each pad row is a copy of its clip's first pose
    for (const r of Object.values(ranges)) {
      for (let k = 0; k < stride; k++) expect(vat[r.start * stride + k]).toBe(vat[(r.start + 1) * stride + k]);
    }
    scene.dispose(); engine.dispose();
  }, 60000);
});
