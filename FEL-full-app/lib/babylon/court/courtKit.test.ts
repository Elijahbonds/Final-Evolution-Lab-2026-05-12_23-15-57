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

// ── the derby's board and fireworks ──────────────────────────────────────────────────────────────────────
import { boardLine, buildJumbotron, paintJumbotron, JUMBO_H, JUMBO_W } from './Jumbotron';
import { FireworkShow, fireworkPlan } from './Fireworks';

describe('the jumbotron', () => {
  it('reads the tally and the last ball, and paints a card only when there is one', () => {
    expect(boardLine(3, 1, 5)).toBe('HR 3  ·  OUTS 1/5');
    const texts: string[] = [];
    const g = { createLinearGradient: () => ({ addColorStop() {} }), fillRect() {}, fillText: (t: string) => { texts.push(t); }, set fillStyle(_v: string) {}, set font(_v: string) {}, set textAlign(_v: string) {}, set textBaseline(_v: string) {} };
    paintJumbotron(g as unknown as CanvasRenderingContext2D, { title: 'HOME RUN DERBY', board: 'HR 1', card: ['EXIT VELO 99 MPH', 'LAUNCH 27°', 'DISTANCE 410 FT'], homer: true });
    expect(texts).toContain('EXIT VELO 99 MPH'); expect(texts).toContain('DISTANCE 410 FT');
    texts.length = 0;
    paintJumbotron(g as unknown as CanvasRenderingContext2D, { title: 'T', board: 'B', card: null, homer: false });
    expect(texts.join('|')).toContain('STEP UP TO THE PLATE');
    expect(JUMBO_W / JUMBO_H).toBeGreaterThan(2);
  });
  it('builds a screen and a frame behind it, and disposes', () => {
    const { scene } = rig();
    const j = buildJumbotron(scene, { x: 0, y: 12, z: 40 }, Math.PI);
    const screen = scene.getMeshByName('court_jumbotron_screen')!, frame = scene.getMeshByName('court_jumbotron_frame')!;
    expect(screen.isPickable).toBe(false);
    // yaw π: the face looks toward −z (the plate); the frame stands behind it, farther from the plate
    expect(frame.position.z).toBeLessThan(screen.position.z + 1e-9 + 0.3);
    j.show({ title: 'x', board: 'y', card: null, homer: false });
    j.dispose();
    expect(scene.meshes.some((m) => m.name.startsWith('court_jumbotron'))).toBe(false);
  });
});

describe('the fireworks', () => {
  it('a plan is deterministic, ordered, bounded and clear of the ground', () => {
    const a = fireworkPlan({ x: 3, z: 40 }, 6, 2), b = fireworkPlan({ x: 3, z: 40 }, 6, 2);
    expect(a).toEqual(b); expect(a.length).toBe(6);
    expect(a.map((s) => s.delay)).toEqual([...a.map((s) => s.delay)].sort((x, y) => x - y));
    for (const s of a) { expect(s.y).toBeGreaterThanOrEqual(14); expect(s.y).toBeLessThanOrEqual(24); expect(Math.abs(s.x - 3)).toBeLessThanOrEqual(16); expect(s.delay).toBeLessThan(1.8); }
    expect(fireworkPlan({ x: 0, z: 0 }, 6, 3)).not.toEqual(fireworkPlan({ x: 0, z: 0 }, 6, 4));
  });
  it('the show fires each shell once, when its time comes, on the mode’s own clock', () => {
    const { scene } = rig();
    const show = new FireworkShow(scene);
    show.launch(fireworkPlan({ x: 0, z: 40 }, 5));
    expect(show.live).toBe(5);
    show.update(0.05); expect(show.live).toBe(5);       // nothing is due yet
    for (let i = 0; i < 40; i++) show.update(0.05);
    expect(show.live).toBe(0);
    show.launch(fireworkPlan({ x: 0, z: 40 }, 3)); show.clear(); expect(show.live).toBe(0);
  });
});

// ── the penalty's net and flares ──────────────────────────────────────────────────────────────────────────
import { buildGoalNet, netAlpha, netPush, NET_LIFE_SEC } from './GoalNet';
import { FlareShow, flareBurn, flareSpots, FLARE_SEC } from './Flares';

describe('the goal net', () => {
  it('bulges back most where the ball struck, never pulls forward, and is gone when its life is up', () => {
    const at = netPush(0, 0, 0.1, 1);
    expect(at).toBeGreaterThan(0.5); expect(at).toBeLessThan(1.3);
    expect(netPush(2.5, 0, 0.1, 1)).toBeLessThan(at * 0.2);
    for (let t = 0; t < NET_LIFE_SEC; t += 0.05) for (const dx of [-2, 0, 1.5]) expect(netPush(dx, 0.4, t, 1)).toBeGreaterThanOrEqual(0);
    expect(netPush(0, 0, NET_LIFE_SEC, 1)).toBe(0); expect(netPush(0, 0, 0.2, 0)).toBe(0); expect(netPush(0, 0, -1, 1)).toBe(0);
  });
  it('a harder strike pushes further', () => { expect(netPush(0, 0, 0.1, 1)).toBeGreaterThan(netPush(0, 0, 0.1, 0.4)); });
  it('the sheet fades in fast and out slowly, and is invisible outside its life', () => {
    expect(netAlpha(0)).toBe(0); expect(netAlpha(0.1)).toBe(1); expect(netAlpha(1)).toBe(1);
    expect(netAlpha(NET_LIFE_SEC - 0.25)).toBeCloseTo(0.5, 6); expect(netAlpha(NET_LIFE_SEC)).toBe(0);
  });
  it('is invisible until struck, moves its vertices back while live, and puts them home when done', () => {
    const { scene, frame } = rig();
    const n = buildGoalNet(scene, { halfW: 3.66, height: 2.44, z: 11 });
    const mesh = scene.getMeshByName('court_goal_net')!;
    expect(mesh.isVisible).toBe(false); expect(mesh.isPickable).toBe(false);
    const rest = Array.from(mesh.getVerticesData('position')!);
    n.hit(1, 1.2, 1); n.update(0.1);
    expect(mesh.isVisible).toBe(true); expect(n.live).toBe(true);
    const pos = Array.from(mesh.getVerticesData('position')!);
    let maxZ = 0; for (let k = 2; k < pos.length; k += 3) maxZ = Math.max(maxZ, pos[k] - rest[k]);
    expect(maxZ).toBeGreaterThan(0.4);
    for (let i = 0; i < 80; i++) n.update(1 / 30);
    expect(n.live).toBe(false); expect(mesh.isVisible).toBe(false);
    expect(Array.from(mesh.getVerticesData('position')!)).toEqual(rest);
    frame(1); n.dispose();
    expect(scene.getMeshByName('court_goal_net')).toBeNull();
  });
});

describe('the flares', () => {
  it('flare up fast, burn, die away, and are nothing outside their life', () => {
    expect(flareBurn(0)).toBe(0); expect(flareBurn(0.25)).toBe(1); expect(flareBurn(FLARE_SEC / 2)).toBe(1);
    expect(flareBurn(FLARE_SEC - 0.4)).toBeCloseTo(0.5, 6); expect(flareBurn(FLARE_SEC)).toBe(0); expect(flareBurn(-1)).toBe(0); expect(flareBurn(FLARE_SEC + 1)).toBe(0); expect(flareBurn(60)).toBe(0);
  });
  it('stand behind the goal, spread across it; a phone lights one', () => {
    const d = flareSpots(11, 3.66, false), p = flareSpots(11, 3.66, true);
    expect(d.length).toBe(3); expect(p.length).toBe(1);
    for (const s of d) expect(s.z).toBeGreaterThan(11 + 5);
    expect(new Set(d.map((s) => s.x)).size).toBe(3);
  });
  it('lights, burns for its length on the mode’s clock and goes out; disposes its systems', () => {
    const { scene } = rig();
    const f = new FlareShow(scene, flareSpots(11, 3.66, false));
    expect(f.live).toBe(false);
    f.ignite(); expect(f.live).toBe(true);
    const sys = scene.particleSystems.filter((p) => p.name.startsWith('fx_flare_'));
    expect(sys.length).toBe(6);
    f.update(0.5); expect(sys[0].emitRate).toBeGreaterThan(0);
    for (let i = 0; i < 100; i++) f.update(0.05);
    expect(f.live).toBe(false); expect(sys.every((p) => p.emitRate === 0)).toBe(true);
    f.dispose();
    expect(scene.particleSystems.some((p) => p.name.startsWith('fx_flare_'))).toBe(false);
    const g = new FlareShow(scene, flareSpots(11, 3.66, true), false);
    expect(scene.particleSystems.filter((p) => p.name.startsWith('fx_flare_')).length).toBe(1);
    g.dispose();
  });
});

// ── the gridiron ─────────────────────────────────────────────────────────────────────────────────────────
import { footballTowers, pylonSpots, firstDownVisible, pyroBurn, PYRO_SEC, mountFootballFx } from './FootballFx';

describe('the gridiron', () => {
  it('four towers outside the stands (two on a phone), each facing the field', () => {
    const t = footballTowers(22, 40, false);
    expect(t.length).toBe(4);
    for (const s of t) { expect(Math.abs(s.x)).toBeGreaterThan(22 + 4); expect(Math.sin(s.yaw) * -s.x).toBeGreaterThan(0); }   // the bank faces inward
    expect(footballTowers(22, 40, true).length).toBe(2);
  });
  it('pylons stand at the goal line and the end line, a hand outside the sideline', () => {
    const p = pylonSpots(20.8, 40, 45);
    expect(p.length).toBe(4); expect(p.map((s) => s.z).sort()).toEqual([40, 40, 45, 45]);
    for (const s of p) expect(Math.abs(s.x)).toBeGreaterThan(20.8);
  });
  it('the yellow line is for a line to gain on the field, not at or past the goal line', () => {
    expect(firstDownVisible(30, 40)).toBe(true); expect(firstDownVisible(39.8, 40)).toBe(false); expect(firstDownVisible(44, 40)).toBe(false);
  });
  it('the jets kick in at once, burn, and die in the last stretch', () => {
    expect(pyroBurn(-1)).toBe(0); expect(pyroBurn(0.12)).toBe(1); expect(pyroBurn(PYRO_SEC / 2)).toBe(1); expect(pyroBurn(PYRO_SEC - 0.35)).toBeCloseTo(0.5, 6); expect(pyroBurn(PYRO_SEC)).toBe(0);
  });
  it('mounts the lines, the pylons, the towers and the jets; moves the lines; goes off when the show is over; disposes clean', () => {
    const { scene } = rig();
    const before = scene.meshes.length;
    const f = mountFootballFx(scene, { phone: false, fieldHalfW: 20.8, goalZ: 40, endZ: 45 });
    expect(scene.getMeshByName('fel_decal_downline_los')).toBeTruthy(); expect(scene.getMeshByName('court_pylon_3')).toBeTruthy();
    expect(f.meshes.filter((m) => /^flood_court_tower_\d$/.test(m.name)).length).toBe(4);
    f.update(1 / 60, { los: 12, firstDown: 21 });
    expect(scene.getMeshByName('fel_decal_downline_los')!.position.z).toBe(12);
    expect(scene.getMeshByName('fel_decal_downline_first')!.isVisible).toBe(true);
    f.update(1 / 60, { los: 35, firstDown: 44 });
    expect(scene.getMeshByName('fel_decal_downline_first')!.isVisible).toBe(false);
    f.touchdown();
    const jets = scene.particleSystems.filter((p) => p.name.startsWith('fx_pyro_'));
    expect(jets.length).toBe(4);
    f.update(0.3, { los: 0, firstDown: 9 }); expect(jets[0].emitRate).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) f.update(0.05, { los: 0, firstDown: 9 });
    expect(jets.every((j) => j.emitRate === 0)).toBe(true);
    f.cut({ x: 1, z: 5 }, 0.3); f.tackle({ x: 1, z: 5 }); f.truck({ x: 1, z: 5 });   // no decal pool on this scene: nothing may throw
    f.dispose();
    expect(scene.meshes.length).toBe(before);
    expect(scene.particleSystems.some((p) => p.name.startsWith('fx_pyro_'))).toBe(false);
  });
});
