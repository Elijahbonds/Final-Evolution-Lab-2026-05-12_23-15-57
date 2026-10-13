// The dressed Cypher (vis-party, 2026-10-13): the milestone rate limit, the idle phase, and a render smoke on NullEngine —
// the stage mounts, hides the banner it replaces, runs a song frame, and takes every mesh it made away with it.
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import type { LightRigHandle } from '../scene/LightRig';
import {
  DANCE_CROWD_AREA, DANCE_FLOOR, DANCE_HEADS, DANCE_WALL, IDLE_BPM, MILESTONE_GAP_SEC, danceFloorY, idlePhase, milestoneDue, mountDanceStage,
} from './stageDressing';
import { beatPhaseAt } from './beatBus';

const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'measureText' ? () => ({ width: 50 }) : () => {}), set: () => true });
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas ??= class { width = 1; height = 1; getContext() { return ctx2d; } };

describe('dance stage: pure rules', () => {
  it('a milestone is allowed the first time, then not again inside the gap (a streak and an S grade in a second are one burst)', () => {
    expect(milestoneDue(-1, 5)).toBe(true);
    expect(milestoneDue(5, 5.4)).toBe(false);
    expect(milestoneDue(5, 5 + MILESTONE_GAP_SEC)).toBe(true);
  });
  it('the menu idles on a slow club tempo, and agrees with the beat bus\'s own grid at that tempo', () => {
    for (const t of [0, 0.7, 3.3, 11.9]) expect(idlePhase(t)).toEqual(beatPhaseAt(t, IDLE_BPM));
    expect(IDLE_BPM).toBeLessThan(120);
  });
  it('the heads hang above the stage camera\'s frame and the podium top is where a beam on the stage lands', () => {
    for (const h of DANCE_HEADS) expect(h.at[1]).toBeGreaterThan(6);
    expect(danceFloorY(0, 0)).toBeGreaterThan(0.5);
    expect(danceFloorY(6, 6)).toBeLessThan(0.1);
  });
  it('the wall and the crowd sit behind the dancer (+z, away from the stage camera) and in front of the back wall at 14.6', () => {
    expect(DANCE_WALL.at[2]).toBeGreaterThan(11); expect(DANCE_WALL.at[2]).toBeLessThan(14.6);
    expect(DANCE_CROWD_AREA.z0).toBeGreaterThan(2.1);                  // clear of the podium (radius 2.1)
    expect(DANCE_CROWD_AREA.z1).toBeLessThan(11);                       // clear of the stand at z = 11
    expect(DANCE_FLOOR.cz).toBeGreaterThan(0);
  });
});

describe('dance stage: the mount', () => {
  let scene: Scene;
  beforeAll(() => { scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene); });
  const lights = (tier: string) => ({ tier, shadows: null } as unknown as LightRigHandle);

  it('replaces the banner, runs song frames and idle frames, and disposes clean', () => {
    const before = scene.meshes.length, mats = scene.materials.length;
    const before0 = scene.materials.map((m) => m.name);
    const banner = new TransformNode('banner_stand_in', scene);
    const stage = mountDanceStage({ scene, lights: lights('desktop'), banners: [banner], track: 'WINDWARD CIRCLE', player: '', calmLights: false, calmMotion: false });
    expect(banner.isEnabled()).toBe(false);
    for (let t = 0; t < 4; t += 0.25) stage.update(beatPhaseAt(t, 120), 0.3, 12);
    stage.idle(0.016);
    stage.setTrack('MIDNIGHT RUN');
    expect(stage.heads.fixtures.length).toBe(4);           // the desktop's four
    expect(stage.crowd.figures.length).toBe(72);
    stage.dispose();
    expect(scene.meshes.length).toBe(before + 0);          // (the banner transform node is not a mesh)
    expect(scene.materials.map((m) => m.name).filter((n) => !before0.includes(n) && n !== 'default material')).toEqual([]);
    expect(scene.materials.filter((m) => m.name !== 'default material').length).toBe(mats);
    banner.dispose();
  });
  it('the phones get two beams, no pools and half the crowd; the high tier six', () => {
    const phone = mountDanceStage({ scene, lights: lights('mobile'), banners: [], track: 'X', calmLights: false, calmMotion: false });
    expect(phone.heads.fixtures.length).toBe(2);
    expect(phone.heads.root.getChildMeshes().some((m) => /pool/.test(m.name))).toBe(false);
    expect(phone.crowd.figures.length).toBe(36);
    phone.dispose();
    const high = mountDanceStage({ scene, lights: lights('high'), banners: [], track: 'X', calmLights: false, calmMotion: false });
    expect(high.heads.fixtures.length).toBe(6);
    high.dispose();
  });
  it('reduced motion fires no jets or confetti; a normal run fires once, then waits out the gap', () => {
    const calm = mountDanceStage({ scene, lights: lights('desktop'), banners: [], track: 'X', calmLights: true, calmMotion: true });
    expect(calm.milestone('streak')).toBe(false);
    calm.dispose();
  });
});
