// depth pass phase 2 (lane depth-light, 2026-11-25): the bodies' own share of the hemisphere (look.bodyFormLight, 0 = today).
import { describe, it, expect } from 'vitest';
import { FreeCamera, HemisphericLight, MeshBuilder, NullEngine, Scene, Skeleton, Vector3 } from '@babylonjs/core';
import { BODY_FORM_LIGHT, bodyFillShare, mountBodyFill } from './bodyFill';

const mk = () => {
  const scene = new Scene(new NullEngine());
  new FreeCamera('c', new Vector3(0, 2, -8), scene);
  const hemi = new HemisphericLight('fel_hemi', Vector3.Up(), scene);
  hemi.intensity = 0.75;
  const body = MeshBuilder.CreateBox('body', {}, scene); body.skeleton = new Skeleton('sk', 'sk', scene);
  const court = MeshBuilder.CreateGround('court', { width: 4, height: 4 }, scene);
  return { scene, hemi, body, court };
};

describe('the body fill (look.bodyFormLight)', () => {
  it('ships OFF: 0 mounts nothing, and the hemisphere lights every mesh as before', () => {
    expect(BODY_FORM_LIGHT).toBe(0);
    expect(bodyFillShare(0)).toBeNull(); expect(bodyFillShare(-1)).toBeNull(); expect(bodyFillShare(Number.NaN)).toBeNull();
    const { scene, hemi } = mk();
    expect(mountBodyFill(scene, hemi, 0)).toBeNull();
    expect(scene.lights.length).toBe(1);
    expect(hemi.excludedMeshes.length).toBe(0);
  });

  it('on: the bodies leave the hemisphere for their own copy at the share; the court keeps the hemisphere', () => {
    const { scene, hemi, body, court } = mk();
    const h = mountBodyFill(scene, hemi, 0.6)!;
    scene.render();
    expect(hemi.excludedMeshes).toContain(body);
    expect(hemi.excludedMeshes).not.toContain(court);
    expect(h.light.includedOnlyMeshes.length).toBe(1); expect(h.light.includedOnlyMeshes[0]).toBe(body);
    expect(h.light.intensity).toBeCloseTo(0.45, 6);
    expect(h.light.diffuse.equals(hemi.diffuse)).toBe(true);
    expect(h.light.groundColor.equals(hemi.groundColor)).toBe(true);
    hemi.intensity = 0.5; scene.render();                 // it follows the hemisphere (a weather, a dimmer)
    expect(h.light.intensity).toBeCloseTo(0.3, 6);
    h.dispose();
    expect(hemi.excludedMeshes.length).toBe(0);
    expect(scene.getLightByName('fel_body_hemi')).toBeNull();
  });

  it('on: a body\'s PBR material takes the same share of the image light, once, and gets it back on dispose; the court\'s is untouched', async () => {
    const { PBRMaterial } = await import('@babylonjs/core');
    const { scene, hemi, body, court } = mk();
    const bm = new PBRMaterial('skin', scene); bm.environmentIntensity = 1; body.material = bm;
    const twin = MeshBuilder.CreateBox('body2', {}, scene); twin.skeleton = new Skeleton('sk3', 'sk3', scene); twin.material = bm;   // shared kit material
    const cm = new PBRMaterial('court_m', scene); cm.environmentIntensity = 0.45; court.material = cm;
    const h = mountBodyFill(scene, hemi, 0.6)!;
    expect(bm.environmentIntensity).toBeCloseTo(0.6, 6);    // once, not once per body
    expect(cm.environmentIntensity).toBe(0.45);
    h.dispose();
    expect(bm.environmentIntensity).toBe(1);
    expect(scene.getLightByName('fel_body_hemi')).toBeNull();
  });

  it('stays off until a body exists (an empty include list would light everything)', async () => {
    const scene = new Scene(new NullEngine());
    new FreeCamera('c', new Vector3(0, 2, -8), scene);
    const hemi = new HemisphericLight('fel_hemi', Vector3.Up(), scene);
    const h = mountBodyFill(scene, hemi, 0.6)!;
    scene.render();
    expect(h.light.isEnabled()).toBe(false);
    const b = MeshBuilder.CreateBox('late', {}, scene); b.skeleton = new Skeleton('sk2', 'sk2', scene);
    await new Promise((r) => setTimeout(r, 0));          // Babylon announces a new mesh on the next tick
    scene.render(); scene.render();                      // a body found a frame after it is added (its skeleton attaches late)
    expect(h.light.isEnabled()).toBe(true);
    expect(h.light.includedOnlyMeshes.indexOf(b)).toBeGreaterThanOrEqual(0);
  });
});

describe('the kicker follows the bodies\' backs (phase 2)', () => {
  it('backness: 1 straight behind, 0 in front or with no body, the mean over bodies', async () => {
    const { kickerBackness, KICKER_BACK_GAIN } = await import('./KickerLight');
    expect(KICKER_BACK_GAIN).toBeGreaterThan(0);
    expect(kickerBackness({ x: 0, z: 1 }, [])).toBe(0);
    expect(kickerBackness({ x: 0, z: 1 }, [{ x: 0, z: 1 }])).toBeCloseTo(1, 6);    // camera looks the way the body faces: its back
    expect(kickerBackness({ x: 0, z: 1 }, [{ x: 0, z: -1 }])).toBe(0);              // facing the camera
    expect(kickerBackness({ x: 0, z: 1 }, [{ x: 0, z: 1 }, { x: 1, z: 0 }])).toBeCloseTo(0.5, 6);
  });
  it('off (the default), the kicker keeps its per-mood strength', async () => {
    const { mountKickerLight, KICKER } = await import('./KickerLight');
    const { scene, body } = mk();
    const k = mountKickerLight(scene, 'goldenHour');
    body.position.set(0, 0, 2);
    scene.render(); scene.render();
    expect(k.light.intensity).toBe(KICKER.goldenHour.intensity);
    expect(k.backness).toBe(0);
  });
});
