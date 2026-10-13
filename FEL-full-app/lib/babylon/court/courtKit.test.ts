// vis-court wave 2 — the shared court visuals: tracer, readout, shock rings, floodlight towers, swing trail.
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { installOffscreenShim } from '../../../tests/helpers/canvasShim';
import { ShotTracer, TRACER_FADE_SEC, TRACER_HOLD_SEC, TRACER_POINTS, TRACER_STEP_M, TracerPath, ribbonEdges, tracerStrength } from './ShotTracer';
import { READOUT_FADE_SEC, READOUT_HOLD_SEC, mountReadout, readoutAlpha } from './Readout';
import { RING_LIFE_SEC, RING_POOL, mountShockRings, ringAt } from './ShockRing';
import { buildFloodTowers, paintLampBank, towerLayout } from './FloodTowers';
import { mountSwingTrail, swingTrailStep } from './SwingTrail';

beforeAll(() => installOffscreenShim());

function rig() {
  const engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const scene = new Scene(engine);
  new FreeCamera('cam', new Vector3(0, 3, -10), scene);
  return { scene, frame: (n: number) => { for (let i = 0; i < n; i++) scene.render(); } };
}

describe('the tracer path', () => {
  it('keeps a sample only a full step from the last, and the first always', () => {
    const p = new TracerPath();
    expect(p.push({ x: 0, y: 0, z: 0 })).toBe(true);
    expect(p.push({ x: 0, y: 0, z: TRACER_STEP_M * 0.5 })).toBe(false);
    expect(p.push({ x: 0, y: 0, z: TRACER_STEP_M * 1.1 })).toBe(true);
    expect(p.pts.length).toBe(2);
  });
  it('a long flight thins itself instead of growing past the ribbon', () => {
    const p = new TracerPath();
    for (let i = 0; i < 4000; i++) p.push({ x: 0, y: Math.sin(i / 90) * 10, z: i * 0.2 });
    expect(p.pts.length).toBeLessThanOrEqual(TRACER_POINTS);
    expect(p.step).toBeGreaterThan(TRACER_STEP_M);
    const zs = p.pts.map((q) => q.z);
    expect([...zs].sort((a, b) => a - b)).toEqual(zs);   // still in flight order
  });
  it('closeAt reaches the landing even inside a step; apex is the highest sample', () => {
    const p = new TracerPath();
    p.push({ x: 0, y: 0, z: 0 }); p.push({ x: 0, y: 9, z: 5 }); p.push({ x: 0, y: 2, z: 10 });
    p.closeAt({ x: 0, y: 0, z: 10.05 });
    expect(p.pts[p.pts.length - 1].z).toBe(10.05);
    expect(p.apex()!.height).toBe(9);
  });
});

describe('the ribbon', () => {
  it('has exactly n points an edge, padded on the last, and the edges are a width apart', () => {
    const pts = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 5 }, { x: 0, y: 0, z: 10 }];
    const { left, right } = ribbonEdges(pts, { x: 0, y: 2, z: -20 }, 0.1, 0, 8);
    expect(left.length).toBe(8); expect(right.length).toBe(8);
    expect(left[7]).toEqual(left[2]);
    for (let i = 0; i < 3; i++) expect(Math.hypot(right[i].x - left[i].x, right[i].y - left[i].y, right[i].z - left[i].z)).toBeCloseTo(0.2, 6);
  });
  it('widens with distance from the camera', () => {
    const pts = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 5 }];
    const w = (cam: number): number => { const e = ribbonEdges(pts, { x: 0, y: 4, z: cam }, 0.1, 0.02, 2); return Math.hypot(e.right[0].x - e.left[0].x, e.right[0].y - e.left[0].y, e.right[0].z - e.left[0].z); };
    expect(w(-100)).toBeGreaterThan(w(-10));
  });
  it('a camera dead along the tangent still gives a finite ribbon', () => {
    const e = ribbonEdges([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }], { x: 0, y: 0, z: -9 }, 0.1, 0, 2);
    for (const p of [...e.left, ...e.right]) expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
  });
  it('is held, then fades to nothing', () => {
    expect(tracerStrength(0)).toBe(1); expect(tracerStrength(TRACER_HOLD_SEC - 0.01)).toBe(1);
    expect(tracerStrength(TRACER_HOLD_SEC + TRACER_FADE_SEC / 2)).toBeCloseTo(0.5, 6);
    expect(tracerStrength(TRACER_HOLD_SEC + TRACER_FADE_SEC + 1)).toBe(0);
  });
});

describe('the tracer on a scene', () => {
  it('draws one ribbon, never a shadow caster name, and goes away when cleared and on dispose', () => {
    const { scene, frame } = rig();
    const t = new ShotTracer(scene);
    t.start({ x: 0, y: 0.1, z: 0 });
    for (let i = 1; i <= 30; i++) { t.push({ x: 0, y: Math.sin(i / 10) * 8, z: i }); frame(1); }
    const mesh = scene.getMeshByName('fel_decal_tracer')!;
    expect(mesh).toBeTruthy(); expect(mesh.isVisible).toBe(true); expect(mesh.isPickable).toBe(false);
    t.finish({ x: 0, y: 0, z: 31 });
    frame(Math.ceil((TRACER_HOLD_SEC + TRACER_FADE_SEC) * 60) + 10);
    expect(mesh.isVisible).toBe(false);
    t.start({ x: 0, y: 0, z: 0 }); t.push({ x: 0, y: 1, z: 3 }); frame(2);
    expect(mesh.isVisible).toBe(true);
    t.clear(); frame(1);
    expect(mesh.isVisible).toBe(false);
    t.dispose();
    expect(scene.getMeshByName('fel_decal_tracer')).toBeNull();
  });
});

describe('the readout', () => {
  it('fades in, holds and fades out', () => {
    expect(readoutAlpha(-1)).toBe(0); expect(readoutAlpha(0)).toBe(0); expect(readoutAlpha(0.06)).toBeCloseTo(0.5, 6);
    expect(readoutAlpha(1)).toBe(1); expect(readoutAlpha(READOUT_HOLD_SEC + READOUT_FADE_SEC / 2)).toBeCloseTo(0.5, 6);
    expect(readoutAlpha(READOUT_HOLD_SEC + READOUT_FADE_SEC)).toBe(0);
  });
  it('shows a card, hides after its hold, and disposes clean', () => {
    const { scene, frame } = rig();
    const r = mountReadout(scene);
    r.show({ x: 0, y: 3, z: 20 }, ['APEX 21 m', 'CARRY 186 m']);
    expect(r.visible).toBe(true);
    const mesh = scene.getMeshByName('fel_decal_readout')!;
    expect(mesh.isPickable).toBe(false);
    frame(Math.ceil((READOUT_HOLD_SEC + READOUT_FADE_SEC) * 60) + 10);
    expect(r.visible).toBe(false);
    r.dispose();
    expect(scene.getMeshByName('fel_decal_readout')).toBeNull();
  });
});

describe('the shock rings', () => {
  it('eases out and fades; nothing outside its life', () => {
    expect(ringAt(-0.1, 1)).toBeNull(); expect(ringAt(1, 1)).toBeNull();
    const a = ringAt(0.25, 1)!, b = ringAt(0.75, 1)!;
    expect(b.grow).toBeGreaterThan(a.grow); expect(b.alpha).toBeLessThan(a.alpha);
  });
  it('a pool: more fires than rings reuse the oldest, and every ring is idle once its life is up', () => {
    const { scene, frame } = rig();
    const h = mountShockRings(scene);
    for (let i = 0; i < RING_POOL + 3; i++) h.fire({ x: i, z: 0 });
    expect(h.live()).toBe(RING_POOL);
    expect(scene.meshes.filter((m) => m.name.startsWith('fel_decal_shockring_')).length).toBe(RING_POOL);
    frame(Math.ceil(RING_LIFE_SEC * 60) + 10);
    expect(h.live()).toBe(0);
    h.dispose();
    expect(scene.meshes.some((m) => m.name.startsWith('fel_decal_shockring_'))).toBe(false);
  });
});

describe('the floodlight towers', () => {
  it('four corners outside the touchlines, each turned to the pitch centre; two for the far side', () => {
    const t = towerLayout(20, 45, 6);
    expect(t.length).toBe(4);
    for (const s of t) { expect(Math.abs(s.x)).toBe(26); expect(Math.abs(s.z)).toBe(51); expect(Math.sin(s.yaw) * -s.x + Math.cos(s.yaw) * -s.z).toBeGreaterThan(0); }   // the bank's facing points at the centre
    // a tower at +x faces −x: its yaw's sine is negative
    expect(Math.sin(t.find((s) => s.x > 0)!.yaw)).toBeLessThan(0);
    expect(towerLayout(20, 45, 6, 2).length).toBe(2);
    expect(towerLayout(20, 45, 6, 0).length).toBe(0);
  });
  it('builds three meshes a tower named for the fixtures and the shadow rules, and disposes them', () => {
    const { scene } = rig();
    const h = buildFloodTowers(scene, towerLayout(10, 20, 4, 4));
    expect(h.meshes.length).toBe(12);
    expect(h.meshes.filter((m) => /^flood_court_tower_\d$/.test(m.name)).length).toBe(4);
    expect(h.meshes.filter((m) => /^court_tower_(mast|frame)_\d$/.test(m.name)).length).toBe(8);
    for (const m of h.meshes) expect(m.isPickable).toBe(false);
    const bank = scene.getMeshByName('flood_court_tower_0')!;
    const e = (bank.material as unknown as { emissiveColor: { r: number; g: number; b: number } }).emissiveColor;
    expect(Math.max(e.r, e.g, e.b)).toBeGreaterThan(0.2);   // FixtureLights skips a lamp that is off
    h.dispose();
    expect(scene.meshes.some((m) => /court_tower/.test(m.name))).toBe(false);
  });
  it('the lamp bank paints a cell a lamp', () => {
    let fills = 0;
    const g = { fillStyle: '', fillRect() {}, createRadialGradient: () => ({ addColorStop() {} }), beginPath() {}, arc() { fills++; }, fill() {} };
    paintLampBank(g as unknown as CanvasRenderingContext2D, 256, 128, 6, 3);
    expect(fills).toBe(18);
  });
});

describe('the swing trail', () => {
  it('rises fast, falls slower, and is off below a hundredth', () => {
    expect(swingTrailStep(0, true, 1 / 60)).toBeGreaterThan(0.2);
    expect(swingTrailStep(1, false, 1 / 60)).toBeGreaterThan(0.8);
    expect(swingTrailStep(0.005, false, 1 / 60)).toBe(0);
    expect(swingTrailStep(0.99, true, 1)).toBeLessThanOrEqual(1);
  });
  it('shows while swinging and hides after, on a tip node', () => {
    const { scene } = rig();
    const tip = new TransformNode('tip', scene);
    const t = mountSwingTrail(scene, tip, { color: '#ffffff', width: 0.1, length: 20, alpha: 0.8, name: 'racket' })!;
    expect(t).toBeTruthy();
    const mesh = scene.getMeshByName('fel_decal_trail_racket')!;
    expect(mesh.isVisible).toBe(false);
    for (let i = 0; i < 10; i++) t.drive(1 / 60, true);
    expect(mesh.isVisible).toBe(true);
    for (let i = 0; i < 120; i++) t.drive(1 / 60, false);
    expect(mesh.isVisible).toBe(false);
    t.dispose();
    expect(scene.getMeshByName('fel_decal_trail_racket')).toBeNull();
  });
});
