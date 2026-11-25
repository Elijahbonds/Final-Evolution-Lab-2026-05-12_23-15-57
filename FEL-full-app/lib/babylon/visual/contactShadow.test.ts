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

// depth pass phase 1 (lane depth-light, 2026-11-25): the phone's feet pool, look.phoneFeetPool (0 = today's disc exactly)
describe('the phone feet pool (look.phoneFeetPool)', () => {
  it('ships OFF: the shipped value is 0, and at 0 the pool is today\'s round disc (matrix and alpha as before)', async () => {
    const { PHONE_FEET_POOL, contactPoolFeet } = await import('./contactShadow');
    expect(PHONE_FEET_POOL).toBe(0);
    const scene = new Scene(new NullEngine());
    (scene.metadata ??= {}).felTier = 'mobile';
    new FreeCamera('c', new Vector3(0, 2, -8), scene);
    const { DirectionalLight } = await import('@babylonjs/core');
    new DirectionalLight('fel_sun', new Vector3(-0.7, -0.62, -0.3), scene);   // a low sun: with the pool on, this would stretch it
    const r = new TransformNode('__root___b', scene); r.position.set(2, 0, 1);
    attachContactShadow(scene, r);
    scene.render();
    expect(contactPoolFeet(scene)).toBe(0);
    const m = contactPoolMatrix(scene, 0);
    expect(m[0]).toBeCloseTo(0.9, 5); expect(m[2]).toBeCloseTo(0, 5);    // round, unturned
    expect(m[12]).toBeCloseTo(2, 5); expect(m[14]).toBeCloseTo(1, 5);   // centred on the feet
    expect(contactPoolAlphas(scene)[0]).toBeCloseTo(0.38, 5);
  });

  it('the shape: round under a sun overhead; stretched along a low sun\'s ground direction, capped, leaning away from it', async () => {
    const { feetPoolShape, POOL_MAX_STRETCH } = await import('./contactShadow');
    expect(feetPoolShape(null)).toEqual({ stretch: 1, leanX: 0, leanZ: 0, yaw: 0 });
    expect(feetPoolShape({ x: 0, y: -1, z: 0 }).stretch).toBe(1);
    const golden = feetPoolShape({ x: -0.6, y: -1, z: -0.35 }), dusk = feetPoolShape({ x: -0.7, y: -0.62, z: -0.3 });
    expect(golden.stretch).toBeGreaterThan(1.2);
    expect(dusk.stretch).toBeGreaterThan(golden.stretch);                // a lower sun, a longer pool
    expect(feetPoolShape({ x: -1, y: -0.01, z: 0 }).stretch).toBe(POOL_MAX_STRETCH);
    // the lean goes the way the light travels (away from the sun), on the ground
    expect(Math.sign(dusk.leanX)).toBe(-1); expect(Math.sign(dusk.leanZ)).toBe(-1);
  });

  it('on (mobile): one draw still, darker, the long axis on the sun\'s ground direction; desktop is untouched', async () => {
    const { setFeelUser, setFeelSession, setFeelOverride, resetFeelForTests } = await import('@/lib/feel-panel/feel');
    const { DirectionalLight } = await import('@babylonjs/core');
    setFeelUser(true); setFeelSession(null); setFeelOverride('look.phoneFeetPool', 0.6);
    try {
      for (const tier of ['mobile', 'desktop']) {
        const scene = new Scene(new NullEngine());
        (scene.metadata ??= {}).felTier = tier;
        new FreeCamera('c', new Vector3(0, 2, -8), scene);
        new DirectionalLight('fel_sun', new Vector3(-0.7, -0.62, -0.3), scene);
        const roots = [0, 1, 2].map((i) => { const r = new TransformNode(`__root___p${i}`, scene); r.position.set(i * 2, 0, 1); return r; });
        for (const r of roots) attachContactShadow(scene, r);
        scene.render();
        const discs = scene.meshes.filter((m) => /_contact$/.test(m.name));
        if (tier === 'desktop') { expect(discs.length).toBe(3); expect(contactPoolBodies(scene)).toBe(0); continue; }
        expect(discs.length).toBe(1);
        expect(contactPoolAlphas(scene)[0]).toBeCloseTo(0.6, 5);       // the knob is the pool's centre darkness
        const m = contactPoolMatrix(scene, 0);
        // the disc's local x (its long axis) lands on the sun's ground direction, longer than the 0.9 m disc
        const gx = -0.7 / Math.hypot(0.7, 0.3), gz = -0.3 / Math.hypot(0.7, 0.3);
        const len = Math.hypot(m[0], m[1], m[2]);
        expect(len).toBeGreaterThan(0.9 * 1.3);
        expect(m[0] / len).toBeCloseTo(gx, 3); expect(m[2] / len).toBeCloseTo(gz, 3); expect(m[1]).toBeCloseTo(0, 5);
        expect(m[13]).toBeCloseTo(0.02, 5);                              // on the floor
        expect(m[12]).toBeLessThan(0); expect(m[14]).toBeLessThan(1);    // leaning away from the sun
        roots[1].position.y = 1.3; scene.render();                       // a jump fades it as before
        expect(contactPoolAlphas(scene)[1]).toBeCloseTo(0.6 * 0.25, 4);
      }
    } finally { resetFeelForTests(); }
  });
});
