// A9.9 (visual-foundation, 2026-10-06): a crowd body far from the camera drops its ink hull and its cast shadow.
import { describe, expect, it } from 'vitest';
import { DirectionalLight, FreeCamera, MeshBuilder, NullEngine, Scene, ShadowGenerator, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';
import { CROWD_CHECK_EVERY, CROWD_FAR_M, CROWD_NEAR_M, crowdIsFar, registerCrowdBody } from './CrowdLod';

describe('crowdIsFar', () => {
  it('goes far past CROWD_FAR_M and comes back only inside CROWD_NEAR_M (no flicker on the line)', () => {
    expect(CROWD_NEAR_M).toBeLessThan(CROWD_FAR_M);
    expect(crowdIsFar(CROWD_FAR_M + 0.1, false)).toBe(true);
    expect(crowdIsFar(CROWD_FAR_M - 0.1, false)).toBe(false);
    expect(crowdIsFar((CROWD_FAR_M + CROWD_NEAR_M) / 2, true)).toBe(true);    // in the gap it keeps what it was
    expect(crowdIsFar((CROWD_FAR_M + CROWD_NEAR_M) / 2, false)).toBe(false);
    expect(crowdIsFar(CROWD_NEAR_M - 0.1, true)).toBe(false);
    expect(crowdIsFar(NaN, true)).toBe(true);
  });
});

function world(tier?: string) {
  const scene = new Scene(new NullEngine());
  if (tier) (scene.metadata ??= {}).felTier = tier;
  const cam = new FreeCamera('cam', new Vector3(0, 1.6, 0), scene);
  scene.activeCamera = cam;
  const sun = new DirectionalLight('fel_sun', new Vector3(-0.5, -1, -0.3), scene);
  const gen = new ShadowGenerator(512, sun);
  const root = new TransformNode('onlooker', scene);
  const body = MeshBuilder.CreateBox('Body_c', {}, scene);
  body.parent = root;
  body.skeleton = new Skeleton('sk', 'sk', scene);
  body.renderOutline = true;   // what the ink pass gave it
  gen.addShadowCaster(body, false);
  const casts = () => (gen.getShadowMap()?.renderList ?? []).includes(body);
  const frames = (n: number) => { for (let i = 0; i < n; i++) scene.render(); };
  return { scene, root, body, casts, frames };
}

describe('the crowd rule on a scene', () => {
  it('a far body loses its ink and its cast shadow; walking the camera up gives both back', () => {
    const w = world('desktop');
    w.root.position.set(0, 0, CROWD_FAR_M + 5);
    registerCrowdBody(w.scene, w.root);
    w.frames(CROWD_CHECK_EVERY + 1);
    expect(w.body.renderOutline).toBe(false);
    expect(w.casts()).toBe(false);
    w.root.position.set(0, 0, CROWD_NEAR_M - 2);
    w.frames(CROWD_CHECK_EVERY + 1);
    expect(w.body.renderOutline).toBe(true);
    expect(w.casts()).toBe(true);
  });
  it('a near body keeps both — on desktop', () => {
    const w = world('desktop');
    w.root.position.set(0, 0, 4);
    registerCrowdBody(w.scene, w.root);
    w.frames(CROWD_CHECK_EVERY * 2);
    expect(w.body.renderOutline).toBe(true);
    expect(w.casts()).toBe(true);
  });
  it('on the phone tier a crowd body never casts into the map, near or far; its ink follows distance', () => {
    const w = world('mobile');
    w.root.position.set(0, 0, 4);
    registerCrowdBody(w.scene, w.root);
    w.frames(CROWD_CHECK_EVERY + 1);
    expect(w.casts()).toBe(false);
    expect(w.body.renderOutline).toBe(true);
  });
  it('one watcher per scene, however many bodies join', () => {
    const w = world('desktop');
    const before = w.scene.onBeforeRenderObservable.observers.length;
    registerCrowdBody(w.scene, w.root);
    registerCrowdBody(w.scene, new TransformNode('onlooker2', w.scene));
    expect(w.scene.onBeforeRenderObservable.observers.length - before).toBe(1);
    expect((w.scene.metadata as { felCrowdLod: { bodies: unknown[] } }).felCrowdLod.bodies.length).toBe(2);
  });
  it('a disposed body leaves the rule', () => {
    const w = world('desktop');
    w.root.position.set(0, 0, 30);
    registerCrowdBody(w.scene, w.root);
    w.root.dispose();
    expect(() => w.frames(CROWD_CHECK_EVERY * 2)).not.toThrow();
    expect((w.scene.metadata as { felCrowdLod: { bodies: unknown[] } }).felCrowdLod.bodies.length).toBe(0);
  });
});
