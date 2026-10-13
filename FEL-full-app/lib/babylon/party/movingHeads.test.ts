// Moving heads (vis-party, 2026-10-13): the aim is a pure function of the beat/bar position, so a paused song holds the rig and
// a count-back-in resyncs it; "reduce flashing" takes the beat out of the brightness; the phones carry fewer beams.
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import {
  HEADS_BY_TIER, MOVE_BARS, headCountFor, headLevel, headTarget, mountMovingHeads, moveAt, type HeadFloor, type HeadPhase, type HeadSpec,
} from './movingHeads';

// Babylon's DynamicTexture reaches for OffscreenCanvas, which node has not got: a no-op 2-D surface lets the beam's fade build.
const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas ??= class { width = 1; height = 1; getContext() { return ctx2d; } };

const floor: HeadFloor = { cx: 0, cz: 1.5, halfX: 6, halfZ: 4 };
const ph = (beatIndex: number, beatPhase: number, barIndex = Math.floor(beatIndex / 4)): HeadPhase => ({ beatIndex, beatPhase, barIndex, barPhase: ((beatIndex % 4) + beatPhase) / 4 });

describe('moving heads: the aim', () => {
  it('is the same at the same song position, however many times it is asked (a paused song holds the rig)', () => {
    const a = headTarget(2, 4, ph(9, 0.3), floor, 0.2), b = headTarget(2, 4, ph(9, 0.3), floor, 0.2);
    expect(a).toEqual(b);
  });
  it('resyncs from the song position alone — stepping back (a count-back-in) answers what the grid says, with no memory', () => {
    const early = headTarget(1, 4, ph(2, 0.5), floor, 0);
    headTarget(1, 4, ph(40, 0.1), floor, 0);          // the song ran on…
    expect(headTarget(1, 4, ph(2, 0.5), floor, 0)).toEqual(early);   // …and rewinds to exactly where it was
  });
  it('every head lands on the floor around the stage, for every move, bar and beat', () => {
    for (let bar = 0; bar < 12; bar++) for (let beat = 0; beat < 4; beat++) for (let k = 0; k < 4; k++) for (let i = 0; i < 6; i++) {
      const t = headTarget(i, 6, ph(bar * 4 + beat, k / 4, bar), floor, k / 3);
      expect(Math.abs(t.x - floor.cx)).toBeLessThanOrEqual(floor.halfX * 1.05 + 1e-6 + (moveAt(bar) === 'fan' ? floor.halfX * 0.3 : 0));
      expect(t.z).toBeGreaterThanOrEqual(floor.cz - floor.halfZ - 1e-6);
      expect(t.z).toBeLessThanOrEqual(floor.cz + floor.halfZ + 1e-6);
    }
  });
  it('the phrase changes every MOVE_BARS bars and cycles through sweep, fan and cross', () => {
    const seen = new Set<string>();
    for (let bar = 0; bar < MOVE_BARS * 8; bar++) seen.add(moveAt(bar));
    expect([...seen].sort()).toEqual(['cross', 'fan', 'sweep']);
    expect(moveAt(0)).toBe(moveAt(MOVE_BARS - 1));
    expect(moveAt(-3)).toBe(moveAt(0));   // the count-in's negative bars do not throw or wrap oddly
  });
  it('the cross converges on the mark: heads end up close together', () => {
    const bar = MOVE_BARS * 2;   // a 'cross' bar
    expect(moveAt(bar)).toBe('cross');
    const xs = [0, 1, 2, 3].map((i) => headTarget(i, 4, ph(bar * 4, 0.9, bar), floor, 0).x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(floor.halfX * 1.2);
    for (let i = 0; i < 4; i++) expect(headTarget(i, 4, ph(bar * 4, 0.9, bar), floor, 0).z).toBe(floor.cz);
  });
  it('a high combo ends every second bar on the cross', () => {
    expect(headTarget(0, 4, ph(4, 0.5, 1), floor, 0.9)).toEqual(headTarget(0, 4, ph(4, 0.5, 1), floor, 0.9));
    const sweepBar = 1;   // bar 1 is a sweep bar at no energy
    expect(moveAt(sweepBar)).toBe('sweep');
    const hot = headTarget(1, 4, ph(4, 0.5, sweepBar), floor, 0.9), cool = headTarget(1, 4, ph(4, 0.5, sweepBar), floor, 0);
    expect(hot.z).toBe(floor.cz);
    expect(cool).not.toEqual(hot);
  });
  it('reduced flashing: the fan and the cross do not snap on the beat', () => {
    for (const bar of [MOVE_BARS, MOVE_BARS * 2]) {
      const on = headTarget(1, 4, ph(bar * 4, 0, bar), floor, 0, true), off = headTarget(1, 4, ph(bar * 4, 0.7, bar), floor, 0, true);
      expect(on).toEqual(off);
    }
  });
});

describe('moving heads: the brightness', () => {
  it('bobs on the beat and steadies when flashing is reduced', () => {
    expect(headLevel(ph(0, 0))).toBeGreaterThan(headLevel(ph(0, 0.9)));
    expect(headLevel(ph(0, 0), 0, true)).toBe(headLevel(ph(0, 0.9), 0, true));
  });
  it('a cheer lifts it, never past 1', () => {
    expect(headLevel(ph(0, 0.5), 1)).toBeGreaterThan(headLevel(ph(0, 0.5), 0));
    expect(headLevel(ph(0, 0), 5)).toBeLessThanOrEqual(1);
  });
});

describe('moving heads: the tiers', () => {
  it('phones carry fewer beams than the desktop, the high tier the most', () => {
    expect(headCountFor('mobile')).toBe(HEADS_BY_TIER.mobile);
    expect(headCountFor('desktop')).toBeGreaterThan(headCountFor('mobile'));
    expect(headCountFor('high')).toBeGreaterThan(headCountFor('desktop'));
  });
});

describe('moving heads: the meshes', () => {
  let scene: Scene;
  beforeAll(() => { scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene); });
  const specs: HeadSpec[] = [{ at: [-6, 7.5, 4], color: '#FF2D95' }, { at: [6, 7.5, 4], color: '#00E5FF' }, { at: [0, 7.5, 7], color: '#FFD60A' }];

  it('builds a cone, a pool and a glowing can per head, and aims the cone from the can to the floor point', () => {
    const h = mountMovingHeads(scene, { name: 'tst_a', specs, floor, count: 3, pools: true });
    expect(h.fixtures.length).toBe(3);
    expect(h.root.getChildMeshes().length).toBe(12);   // two cone layers, a pool and a can a head
    h.update(ph(5, 0.2), 0.3, 0, false);
    const cone = scene.getMeshByName('tst_a_beam_0_1')!;
    const t = headTarget(0, 3, ph(5, 0.2), floor, 0.3, false);
    // the cone's midpoint is halfway from the can to the floor, and its length is the distance between them
    expect(cone.position.x).toBeCloseTo((-6 + t.x) / 2, 4);
    expect(cone.position.z).toBeCloseTo((4 + t.z) / 2, 4);
    expect(cone.scaling.y).toBeCloseTo(Math.hypot(t.x + 6, 7.5 - 0.03, t.z - 4), 4);
    h.dispose();
  });
  it('the cans carry "neon" so the foundation\'s include-list glow picks them up (scene/EmissiveGlow.ts GLOW_MESH)', async () => {
    const { glowCandidate } = await import('../scene/EmissiveGlow');
    const h = mountMovingHeads(scene, { name: 'tst_g', specs, floor, count: 2 });
    for (const can of h.fixtures) {
      const m = can.material as unknown as { emissiveColor: { r: number; g: number; b: number } };
      const luma = 0.2126 * m.emissiveColor.r + 0.7152 * m.emissiveColor.g + 0.0722 * m.emissiveColor.b;
      expect(glowCandidate(can.name, can.material!.name, luma, false)).toBe(true);
    }
    // the beams themselves must NOT be glow fixtures (the glow layer would draw the whole cone as a halo)
    for (const m of h.root.getChildMeshes().filter((x) => /beam|pool/.test(x.name))) expect(glowCandidate(m.name, m.material?.name, 1, false)).toBe(false);
    h.dispose();
  });
  it('the phones build no pools, and a floor-height function lifts the pool onto what the beam lands on', () => {
    const phone = mountMovingHeads(scene, { name: 'tst_m', specs, floor, count: 2, pools: false, soft: false });
    expect(phone.root.getChildMeshes().some((m) => /pool/.test(m.name))).toBe(false);
    expect(phone.root.getChildMeshes().filter((m) => /beam/.test(m.name)).length).toBe(2);   // one cone a head
    phone.dispose();
    const h = mountMovingHeads(scene, { name: 'tst_p', specs, floor, count: 1, pools: true, floorY: () => 0.72 });
    h.update(ph(0, 0), 0, 0, false);
    expect(scene.getMeshByName('tst_p_pool_0')!.position.y).toBeCloseTo(0.73, 5);
    h.dispose();
  });
  it('dispose takes every mesh and material with it', () => {
    const before = scene.meshes.length, mats = scene.materials.length;
    const h = mountMovingHeads(scene, { name: 'tst_d', specs, floor, count: 3, pools: true });
    expect(scene.meshes.length).toBeGreaterThan(before);
    h.dispose();
    expect(scene.meshes.length).toBe(before);
    expect(scene.materials.length).toBe(mats);
  });
});
