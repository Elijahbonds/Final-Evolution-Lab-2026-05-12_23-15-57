// OccluderFade (lane/gameplay-clean): a prop between the camera and the hero goes see-through while it blocks the view, and
// comes back exactly as it was; the hero, the floor, a ball and the world are never faded; the hoops modes are off it.
import { describe, expect, it, vi } from 'vitest';
import { FreeCamera, MeshBuilder, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import {
  OccluderFade, OCCLUDER_FADE_ALPHA, OCCLUDER_FADE_OFF, OCCLUDER_MIN_RADIUS_M, OCCLUDER_MAX_RADIUS_M, fadeCandidate, stepLevel,
} from './OccluderFade';

function rig(modeId = 'karate') {
  const engine = new NullEngine();
  vi.spyOn(engine, 'getDeltaTime').mockReturnValue(1000 / 60);
  const scene = new Scene(engine);
  const cam = new FreeCamera('cam', new Vector3(0, 1.5, -8), scene);
  cam.setTarget(new Vector3(0, 1, 0));
  const hero = new TransformNode('hero', scene);
  const body = MeshBuilder.CreateBox('body', { width: 0.5, height: 1.8, depth: 0.3 }, scene);
  body.position.y = 0.9; body.parent = hero;
  const pole = MeshBuilder.CreateBox('pole', { width: 1.2, height: 4, depth: 1.2 }, scene);
  pole.position.set(0, 2, -4);   // on the line of sight
  const tree = MeshBuilder.CreateBox('tree', { width: 1.5, height: 3, depth: 1.5 }, scene);
  tree.position.set(6, 1.5, -4);   // off it
  const floor = MeshBuilder.CreateGround('ground', { width: 40, height: 40 }, scene);
  for (const m of [body, pole, tree, floor]) m.computeWorldMatrix(true);
  const fade = new OccluderFade(scene, () => hero, modeId);
  const frames = (n: number) => { for (let i = 0; i < n; i++) scene.render(); };
  return { scene, pole, tree, floor, body, fade, frames };
}

describe('OccluderFade', () => {
  it('fades what blocks the view, and only that', () => {
    const r = rig();
    r.fade.start();
    r.frames(30);
    expect(r.pole.visibility).toBeCloseTo(OCCLUDER_FADE_ALPHA, 2);
    expect(r.tree.visibility).toBe(1);
    expect(r.floor.visibility).toBe(1);
    expect(r.body.visibility).toBe(1);
  });

  it('brings it back once it is off the line (after the hold), and stop() restores everything', () => {
    const r = rig();
    r.fade.start();
    r.frames(30);
    r.pole.position.x = 8; r.pole.computeWorldMatrix(true);
    r.frames(80);   // hold 0.4 s + fade 0.18 s at 60 fps
    expect(r.pole.visibility).toBe(1);
    expect(r.fade.count).toBe(0);
    r.pole.position.x = 0; r.pole.computeWorldMatrix(true);
    r.frames(30);
    expect(r.pole.visibility).toBeLessThan(0.5);
    r.fade.stop();
    expect(r.pole.visibility).toBe(1);
  });

  it('an instanced copy is hidden on its own (an instance has no alpha of its own)', () => {
    const r = rig();
    r.pole.position.x = 20; r.pole.computeWorldMatrix(true);
    const inst = r.pole.createInstance('pole_i');
    inst.position.set(0, 2, -4); inst.computeWorldMatrix(true);
    r.fade.start();
    r.frames(30);
    expect(inst.isVisible).toBe(false);
    expect(r.pole.isVisible).toBe(true);
    r.fade.stop();
    expect(inst.isVisible).toBe(true);
  });

  it('is off for the hoops modes (their lanes own the call)', () => {
    for (const id of ['dunk', 'onevone', 'threevthree']) expect(OCCLUDER_FADE_OFF.has(id)).toBe(true);
    const r = rig('dunk');
    r.fade.start();
    r.frames(30);
    expect(r.fade.active).toBe(false);
    expect(r.pole.visibility).toBe(1);
  });

  it('never fades a ball, the world, the floor, a body, a see-through mesh or an opt-out', () => {
    const base = { name: 'prop', radius: 1, visibility: 1, enabled: true, visible: true, hero: false, optOut: false, thinInstances: 0, materialAlpha: 1 };
    expect(fadeCandidate(base)).toBe(true);
    expect(fadeCandidate({ ...base, radius: OCCLUDER_MIN_RADIUS_M - 0.01 })).toBe(false);
    expect(fadeCandidate({ ...base, radius: OCCLUDER_MAX_RADIUS_M + 1 })).toBe(false);
    expect(fadeCandidate({ ...base, name: 'beach_ground' })).toBe(false);
    expect(fadeCandidate({ ...base, name: 'skyDome' })).toBe(false);
    expect(fadeCandidate({ ...base, name: 'courtside_bench' })).toBe(true);
    expect(fadeCandidate({ ...base, hero: true })).toBe(false);
    expect(fadeCandidate({ ...base, optOut: true })).toBe(false);
    expect(fadeCandidate({ ...base, materialAlpha: 0.3 })).toBe(false);
    expect(fadeCandidate({ ...base, thinInstances: 40 })).toBe(false);
    expect(fadeCandidate({ ...base, skinned: true })).toBe(false);   // a rival or a horde fighter is the game, not scenery
  });

  it('steps the fade at 1/fadeSec per second, both ways', () => {
    expect(stepLevel(1, 0, 0.09, 0.18)).toBeCloseTo(0.5);
    expect(stepLevel(0.1, 0, 0.09, 0.18)).toBe(0);
    expect(stepLevel(0.9, 1, 0.09, 0.18)).toBe(1);
    expect(stepLevel(0.5, 1, 0.01, 0)).toBe(1);
  });
});
