// MUSIC-SUITE P9 FIX (2026-09-29): THE DANCER TURNED HIS BACK ON THE AUDIENCE. MoveRootLayer's restore put back only the
// root's quaternion; a root turned by EULER angles (CharacterLibrary.spawn: `root.rotation = (0, yawRad, 0)`, the Cypher's
// yaw π) had its yaw zeroed by Babylon's rotationQuaternion setter the first time a captured move played, and never got it
// back. Measured live (:3121, /dev/mode/dance): yaw 180° before the shipped windmill, 0° after it, for the rest of the song.
// A real rig (NullEngine + fel-hero.glb), the real layer and the real windmill track.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { MoveRootLayer } from './MoveRootLayer';
import { buildDanceClip, danceRootTracks } from './danceClips';

async function rig() {
  const scene = new Scene(new NullEngine());
  new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const b64 = readFileSync('public/models/fel-hero.glb').toString('base64');
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  return { scene, sk: r.skeletons[0], root: r.meshes[0] as unknown as TransformNode };
}

describe('MoveRootLayer gives the root back exactly as the mode left it', () => {
  it('an EULER-turned root (the Cypher\'s spawn yaw π) keeps its yaw through and after a captured move', async () => {
    const { scene, sk, root } = await rig();
    root.rotationQuaternion = null;
    root.rotation = new Vector3(0, Math.PI, 0);          // exactly what CharacterLibrary.spawn does
    const layer = new MoveRootLayer(scene, root, sk, danceRootTracks(['dance_power_windmill']));
    const w = buildDanceClip(scene, sk, 'dance_power_windmill')!;
    w.start(true, 1, w.from, w.to, false);
    let turnedDuring = false;
    for (let f = w.from; f <= w.to; f += 5) {
      w.goToFrame(f);
      scene.render();                                      // apply (after animations) … restore (after render)
      expect(root.rotationQuaternion, `frame ${f}: the quaternion goes back to none`).toBeNull();
      expect(root.rotation.y, `frame ${f}: the yaw is back`).toBeCloseTo(Math.PI, 9);
      if (layer.active === 'dance_power_windmill') turnedDuring = true;
    }
    expect(turnedDuring).toBe(true);                       // the layer really did play the track
    w.stop(); w.dispose(); layer.dispose();
    expect(root.rotation.y).toBeCloseTo(Math.PI, 9);
  });

  it('a QUATERNION-turned root is put back as before (the same quaternion, the Euler untouched)', async () => {
    const { scene, sk, root } = await rig();
    const q0 = Quaternion.FromEulerAngles(0, 0.7, 0);
    root.rotationQuaternion = q0.clone();
    const layer = new MoveRootLayer(scene, root, sk, danceRootTracks(['dance_power_windmill']));
    const w = buildDanceClip(scene, sk, 'dance_power_windmill')!;
    w.start(true, 1, w.from, w.to, false);
    for (let f = w.from; f <= w.to; f += 7) {
      w.goToFrame(f); scene.render();
      expect(Quaternion.Dot(root.rotationQuaternion!, q0)).toBeCloseTo(1, 9);
      expect(root.rotation.asArray()).toEqual([0, 0, 0]);
    }
    w.dispose(); layer.dispose();
  });
});
