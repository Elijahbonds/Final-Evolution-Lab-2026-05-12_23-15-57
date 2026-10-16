import { describe, it, expect } from 'vitest';
import { FreeCamera, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { attachContactShadow, contactPoolAlphas, contactPoolBodies, contactPoolMatrix, followFloor, type FloorState } from './contactShadow';

describe('the contact disc never floats over the feet (GATE-CRASHER-MAJOR)', () => {
  it('follows a body down a slope at once', () => {
    // the snow rider: 11 m/s down a 0.22 rad piste drops ~2.5 m a second
    const st: FloorState = { floorY: 0, awaySince: -1 };
    let worst = 0;
    for (let f = 1; f <= 180; f++) {
      const y = -2.5 * (f / 60);
      followFloor(st, y, f / 60);
      worst = Math.max(worst, st.floorY - y);
    }
    expect(worst).toBeLessThan(0.03);
  });
  it('still stays on the floor through a jump, and re-anchors on a platform it stays on', () => {
    const st: FloorState = { floorY: 0, awaySince: -1 };
    followFloor(st, 1.2, 0.1);                 // in the air: the disc keeps the floor
    expect(st.floorY).toBe(0);
    followFloor(st, 1.2, 0.5);
    expect(st.floorY).toBe(0);
    followFloor(st, 1.2, 1.8);                 // still up there 1.7 s later: a platform
    expect(st.floorY).toBe(1.2);
  });
  it('rides a small step without a pop', () => {
    const st: FloorState = { floorY: 0, awaySince: -1 };
    followFloor(st, 0.1, 0.1);
    expect(st.floorY).toBeCloseTo(0.02, 6);
  });
});

// lane/owner-1016 (2026-10-16): on a phone every body's disc is an instance of ONE disc mesh (karate: 10 active meshes and 10
// draws became 1). Desktop keeps a disc per body.
describe('a phone pools the contact discs', () => {
  const mk = (tier: string, bodies: number) => {
    const scene = new Scene(new NullEngine());
    (scene.metadata ??= {}).felTier = tier;
    new FreeCamera('c', new Vector3(0, 2, -8), scene);
    const roots = Array.from({ length: bodies }, (_, i) => { const r = new TransformNode(`__root___c${i}`, scene); r.position.set(i * 2, 0, 1); return r; });
    for (const r of roots) attachContactShadow(scene, r);
    scene.render();
    const discs = scene.meshes.filter((m) => /_contact$/.test(m.name));
    return { scene, roots, discs };
  };

  it('CONTROL: desktop and high keep a disc and a material per body', () => {
    for (const tier of ['desktop', 'high']) {
      const { discs, scene } = mk(tier, 4);
      expect(discs.length, tier).toBe(4);
      expect(scene.materials.filter((m) => /_contact_m$/.test(m.name)).length, tier).toBe(4);
    }
  });

  it('mobile: one mesh and one material for all the bodies, one instance each', () => {
    const { discs, scene } = mk('mobile', 10);
    expect(discs.length).toBe(1);
    expect(scene.materials.filter((m) => /_contact_m$/.test(m.name)).length).toBe(1);
    expect(contactPoolBodies(scene)).toBe(10);
    expect(discs[0].name).toMatch(/_contact$/);       // LightRig / GlossyFloor / VenueReflection keep a disc out of their lists by the suffix
    expect(discs[0].hasThinInstances).toBe(true);
    expect(discs[0].thinInstanceCount).toBeGreaterThanOrEqual(10);
  });

  it('each instance rides its body on the floor, fades and grows with height, and a hidden body draws nothing', () => {
    const { scene, roots } = mk('mobile', 3);
    const m0 = contactPoolMatrix(scene, 1);
    expect(m0[12]).toBeCloseTo(2, 5); expect(m0[14]).toBeCloseTo(1, 5); expect(m0[13]).toBeCloseTo(0.02, 5);
    expect(m0[0]).toBeCloseTo(0.9, 5);                // the 0.9 m default diameter on a 1 m disc: the matrix carries it
    expect(contactPoolAlphas(scene)[1]).toBeCloseTo(0.38, 5);   // the default strength at the floor
    roots[1].position.y = 1.3;                         // up in a jump: the disc stays on the floor and grows
    scene.render();
    const m1 = contactPoolMatrix(scene, 1);
    expect(m1[13]).toBeCloseTo(0.02, 5);
    expect(m1[0]).toBeCloseTo(0.9 * (1 + 1.3 * 0.35), 4);
    expect(contactPoolAlphas(scene)[1]).toBeCloseTo(0.38 * 0.25, 4);   // k = 1 - 1.3/2.6 = 0.5, squared
    roots[2].setEnabled(false);                        // a disabled body draws nothing
    scene.render();
    expect(contactPoolMatrix(scene, 2)[0]).toBe(0);
    expect(contactPoolAlphas(scene)[2]).toBe(0);
  });

  it('the pool needs blending (the disc is translucent) and grows past its first size', () => {
    const { scene, discs } = mk('mobile', 20);
    expect(contactPoolBodies(scene)).toBe(20);
    expect(discs[0].material!.needAlphaBlendingForMesh(discs[0])).toBe(true);
  });

  it('a disposed body gives its slot back', () => {
    const { scene, roots } = mk('mobile', 3);
    roots[0].dispose();
    expect(contactPoolBodies(scene)).toBe(2);
    attachContactShadow(scene, new TransformNode('again', scene));
    expect(contactPoolBodies(scene)).toBe(3);
  });
});
