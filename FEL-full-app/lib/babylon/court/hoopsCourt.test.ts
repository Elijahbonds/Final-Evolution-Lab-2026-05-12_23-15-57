// vis-hoops-court — the broadcast, the scuffs, the dusk and the arena, on a NullEngine scene with fake modes' contexts.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DirectionalLight, FreeCamera, HemisphericLight, NullEngine, PointLight, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { installOffscreenShim } from '../../../tests/helpers/canvasShim';
import { MomentumBus } from '../core/MomentumBus';
import type { ModeContext } from '../core/ModeHarness';

let travel = true;
vi.mock('../../a11y/reducedMotion', () => ({ motionPolicy: () => ({ travel }) }));

import { mountHoopsBroadcast } from './mount/hoopsBroadcast';
import { mountHoopsCourt } from './mount/hoopsCourt';
import { mountHoopsScuffs } from './hoopsScuffs';
import { DUSK_START, GLOW_GAIN, LAMP_GAIN, duskTarget, gameProgress, mountDusk } from './mount/hoopsDusk';
import { CAGE, LINK_CELL_M, PLAY, clearOfPlay, latticeSegments, mountStreetball, panelShown, streetballPlan, paintBoombox } from './streetballDressing';
import { fixtureRole } from '../scene/FixtureLights';
import { GLOW_MESH, GLOW_MATERIAL } from '../scene/EmissiveGlow';
import { recordingCtx, allFinite } from '../../../tests/helpers/canvasShim';

beforeAll(() => installOffscreenShim());
afterEach(() => { travel = true; });

function rig() {
  const engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const scene = new Scene(engine);
  new FreeCamera('cam', new Vector3(0, 4, 20), scene);
  return { scene, frame: (n: number) => { for (let i = 0; i < n; i++) scene.render(); } };
}

// ── the broadcast ──────────────────────────────────────────────────────────────────────────────────
function fakeCtx(scene: Scene, opts: { intro?: boolean } = {}) {
  const calls = { cam: 0, highlights: [] as Record<string, unknown>[] };
  let inIntro = opts.intro ?? false;
  let resolve: (() => void) | null = null;
  const ctx = {
    scene, momentum: new MomentumBus(),
    camDirector: { get inIntro() { return inIntro; }, update: () => { calls.cam++; } },
    highlight: (o: Record<string, unknown>) => { calls.highlights.push(o); return new Promise<void>((r) => { resolve = r; }); },
  } as unknown as ModeContext;
  return { ctx, calls, endIntro: () => { inIntro = false; }, finishReplay: async () => { resolve?.(); await Promise.resolve(); await Promise.resolve(); } };
}
const RIM = new Vector3(0, 3.05, -0.6);

describe('the broadcast intro holds the mode', () => {
  it('steps the camera director and tells the mode to return, until the intro is over', () => {
    const { scene } = rig(); const f = fakeCtx(scene, { intro: true });
    const b = mountHoopsBroadcast(f.ctx, { rim: RIM, final: () => false });
    expect(b.holdIntro(new Vector3(0, 0, 6), RIM)).toBe(true);
    expect(f.calls.cam).toBe(1);
    f.endIntro();
    expect(b.holdIntro(new Vector3(0, 0, 6), RIM)).toBe(false);
    expect(f.calls.cam).toBe(1);
  });
});

describe('the replay at the dead ball', () => {
  it('a noted ankle-breaker is replayed at the next dead ball, the reset runs after it, once', async () => {
    const { scene } = rig(); const f = fakeCtx(scene);
    const b = mountHoopsBroadcast(f.ctx, { rim: RIM, final: () => false });
    f.ctx.momentum.report({ kind: 'ankle_break' });
    let resets = 0; const next = (): void => { resets++; };
    expect(b.deadBall(next)).toBe(true);
    expect(f.calls.highlights.length).toBe(1);
    expect(f.calls.highlights[0].objective).toBe(RIM);
    expect(f.calls.highlights[0].lastSeconds).toBeGreaterThan(2);
    expect(resets).toBe(0);   // not before the replay is over: it would put the bodies back where the frame left them
    await f.finishReplay();
    expect(resets).toBe(1);
    expect(b.replays).toBe(1);
  });
  it('the mode\'s own reset coming back through its hook is not planned a second time', async () => {
    const { scene } = rig(); const f = fakeCtx(scene);
    const b = mountHoopsBroadcast(f.ctx, { rim: RIM, final: () => false });
    f.ctx.momentum.report({ kind: 'posterize' });
    let again = true; const next = (): void => { again = b.deadBall(() => undefined); };
    b.deadBall(next); await f.finishReplay();
    expect(again).toBe(false);
    expect(f.calls.highlights.length).toBe(1);
  });
  it('NEVER for the final moment', () => {
    const { scene } = rig(); const f = fakeCtx(scene); let final = true;
    const b = mountHoopsBroadcast(f.ctx, { rim: RIM, final: () => final });
    f.ctx.momentum.report({ kind: 'posterize' });
    expect(b.deadBall(() => undefined)).toBe(false);
    expect(f.calls.highlights.length).toBe(0);
    final = false;   // …and the moment was spent: the next dead ball has nothing to show
    expect(b.deadBall(() => undefined)).toBe(false);
  });
  it('never in reduced motion', () => {
    const { scene } = rig(); const f = fakeCtx(scene); travel = false;
    const b = mountHoopsBroadcast(f.ctx, { rim: RIM, final: () => false });
    f.ctx.momentum.report({ kind: 'block' });
    expect(b.deadBall(() => undefined)).toBe(false);
    expect(f.calls.highlights.length).toBe(0);
  });
  it('an ordinary basket, a miss or a steal is not a replay', () => {
    const { scene } = rig(); const f = fakeCtx(scene);
    const b = mountHoopsBroadcast(f.ctx, { rim: RIM, final: () => false });
    for (const kind of ['big_make', 'miss', 'turnover', 'steal'] as const) f.ctx.momentum.report({ kind });
    expect(b.deadBall(() => undefined)).toBe(false);
  });
  it('3v3\'s drift ankle-break (a heavy clean_hit) is a moment; a light one is not', () => {
    const { scene } = rig(); const f = fakeCtx(scene);
    const b = mountHoopsBroadcast(f.ctx, { rim: RIM, final: () => false });
    f.ctx.momentum.report({ kind: 'clean_hit', weight: 9 });
    expect(b.deadBall(() => undefined)).toBe(false);
    f.ctx.momentum.report({ kind: 'clean_hit', weight: 14 });
    expect(b.deadBall(() => undefined)).toBe(true);
  });
  it('a mode torn down during its replay is not reset', async () => {
    const { scene } = rig(); const f = fakeCtx(scene);
    const b = mountHoopsBroadcast(f.ctx, { rim: RIM, final: () => false });
    f.ctx.momentum.report({ kind: 'posterize' });
    let resets = 0; b.deadBall(() => { resets++; });
    b.dispose(); await f.finishReplay();
    expect(resets).toBe(0);
  });
  it('stops listening to the bus on dispose', () => {
    const { scene } = rig(); const f = fakeCtx(scene);
    const b = mountHoopsBroadcast(f.ctx, { rim: RIM, final: () => false });
    b.dispose();
    f.ctx.momentum.report({ kind: 'posterize' });
    const b2 = mountHoopsBroadcast(f.ctx, { rim: RIM, final: () => false });
    expect(b2.deadBall(() => undefined)).toBe(false);   // the new mount did not see what happened before it existed
  });
});

// ── the scuffs ──────────────────────────────────────────────────────────────────────────────────────
describe('the scuffs reach the decal pool', () => {
  it('a body that runs and stops leaves one mark through scene.metadata.felDecals, on the court\'s height', () => {
    const { scene, frame } = rig();
    const stamps: unknown[][] = [];
    (scene.metadata ??= {}).felDecals = { stamp: (...a: unknown[]) => { stamps.push(a); } };
    const body = new TransformNode('b', scene);
    const h = mountHoopsScuffs(scene, () => [body]);
    frame(2);
    for (let i = 0; i < 48; i++) { body.position.z += 6 / 60; frame(1); }
    frame(30);
    expect(stamps.length).toBe(1);
    expect(stamps[0][0]).toBe('scuff');
    expect((stamps[0][4] as { y: number }).y).toBeCloseTo(0.02, 5);
    expect(h.stamped).toBe(1);
    h.dispose();
  });
  it('lays nothing while a replay is on screen (felCinematic)', () => {
    const { scene, frame } = rig();
    const stamps: unknown[] = [];
    (scene.metadata ??= {}).felDecals = { stamp: (...a: unknown[]) => { stamps.push(a); } };
    scene.metadata.felCinematic = 1;
    const body = new TransformNode('b', scene);
    mountHoopsScuffs(scene, () => [body]);
    frame(2);
    for (let i = 0; i < 48; i++) { body.position.z += 6 / 60; frame(1); }
    frame(30);
    expect(stamps.length).toBe(0);
  });
  it('a scene with no decal pool (a held mode, the legacy look) is simply unmarked', () => {
    const { scene, frame } = rig();
    const body = new TransformNode('b', scene);
    const h = mountHoopsScuffs(scene, () => [body]);
    frame(2); for (let i = 0; i < 48; i++) { body.position.z += 6 / 60; frame(1); } frame(30);
    expect(h.stamped).toBe(0);
  });
});

// ── the dusk ─────────────────────────────────────────────────────────────────────────────────────────
describe('the dusk targets', () => {
  it('is exactly the rig\'s look until the game is a fifth gone, and complete at the end', () => {
    const t0 = duskTarget(0), tS = duskTarget(DUSK_START), t1 = duskTarget(1);
    for (const t of [t0, tS]) expect([t.sunK, t.hemiK, t.sunMix, t.hemiMix, t.lampK, t.glowK, t.k]).toEqual([1, 1, 0, 0, 1, 1, 0]);
    expect(t1.k).toBe(1); expect(t1.lampK).toBeCloseTo(LAMP_GAIN, 6); expect(t1.glowK).toBeCloseTo(GLOW_GAIN, 6);
    expect(t1.sunK).toBeLessThan(1); expect(t1.sunK).toBeGreaterThan(0.6);   // a notch deeper, not a night
    expect(t1.sunMix).toBeGreaterThan(0); expect(t1.sunMix).toBeLessThan(1);
  });
  it('is monotone through the game', () => {
    let prev = duskTarget(0);
    for (let p = 0.05; p <= 1.0001; p += 0.05) { const t = duskTarget(p); expect(t.k).toBeGreaterThanOrEqual(prev.k - 1e-9); expect(t.sunK).toBeLessThanOrEqual(prev.sunK + 1e-9); expect(t.lampK).toBeGreaterThanOrEqual(prev.lampK - 1e-9); prev = t; }
  });
  it('game progress is the better of the score and the clock, clamped', () => {
    expect(gameProgress({ me: 6, foe: 3, target: 11 })).toBeCloseTo(6 / 11, 6);
    expect(gameProgress({ me: 2, foe: 3, target: 21 }, { left: 30, total: 90 })).toBeCloseTo(2 / 3, 6);
    expect(gameProgress({ me: 30, foe: 3, target: 11 })).toBe(1);
    expect(gameProgress({ me: 0, foe: 0, target: 0 })).toBe(0);
  });
});

function litRig() {
  const r = rig();
  const sun = new DirectionalLight('sun', new Vector3(-0.6, -1, -0.35), r.scene); sun.intensity = 2.4;
  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), r.scene); hemi.intensity = 0.75;
  const lamp = new PointLight('fel_fixture_lamp_0', new Vector3(0, 6, 0), r.scene); lamp.intensity = 10;
  const ctx = { scene: r.scene, lights: { sun, hemi, glow: null, fixtureLights: { lights: [lamp] } } } as unknown as ModeContext;
  return { ...r, ctx, sun, hemi, lamp, dir0: sun.direction.clone() };
}

describe('the dusk mount', () => {
  it('touches nothing at the start of a game', () => {
    const k = litRig(); const h = mountDusk(k.ctx, () => 0);
    k.frame(120);
    expect([k.sun.intensity, k.hemi.intensity, k.lamp.intensity]).toEqual([2.4, 0.75, 10]);
    h.dispose();
  });
  it('late in a game: the sun a notch lower, the lamps up, the sun\'s DIRECTION untouched (the shadow cache drew from it)', () => {
    const k = litRig(); let p = 0; const h = mountDusk(k.ctx, () => p);
    p = 1; k.frame(60 * 25);
    expect(k.sun.intensity).toBeLessThan(2.4); expect(k.sun.intensity).toBeGreaterThan(1.5);
    expect(k.lamp.intensity).toBeGreaterThan(10 * 1.9);
    expect(k.sun.direction.equals(k.dir0)).toBe(true);
    h.dispose();
  });
  it('eases: a basket does not jump the sky', () => {
    const k = litRig(); let p = 0; const h = mountDusk(k.ctx, () => p);
    k.frame(10); p = 1; k.frame(6);
    expect(h.progress).toBeLessThan(0.2);
    h.dispose();
  });
  it('holds still under reduced motion', () => {
    travel = false; const k = litRig(); const h = mountDusk(k.ctx, () => 1);
    k.frame(60 * 25);
    expect(k.sun.intensity).toBe(2.4); expect(k.lamp.intensity).toBe(10);
    h.dispose();
  });
  it('dispose stops the drift', () => {
    const k = litRig(); const h = mountDusk(k.ctx, () => 1);
    k.frame(60 * 5); h.dispose(); const at = k.sun.intensity; k.frame(60 * 5);
    expect(k.sun.intensity).toBe(at);
  });
});

// ── the arena ────────────────────────────────────────────────────────────────────────────────────────
describe('the streetball plan', () => {
  const plan = streetballPlan('desktop');
  it('puts every post, pole, wall, bench and prop outside the players\' clamp', () => {
    for (const p of [...plan.posts, ...plan.poles, ...plan.walls, ...plan.benches, plan.boombox, plan.duffel]) expect(clearOfPlay(p), JSON.stringify(p)).toBe(true);
  });
  it('the cage is open at the near end (the camera stands there) and closed behind the basket and down the sidelines', () => {
    expect(plan.panels.map((p) => p.id).sort()).toEqual(['B', 'L', 'R']);
    expect(plan.panels.find((p) => p.id === 'B')!.z0).toBe(CAGE.zBack);
    for (const p of plan.posts) expect(p.z).toBeLessThanOrEqual(CAGE.zFront + 1e-6);
    expect(plan.posts.some((p) => Math.abs(p.z - CAGE.zFront) < 1e-6)).toBe(true);
  });
  it('the fence stands behind the rim, and clear of the painted court\'s edge', () => {
    expect(CAGE.zBack).toBeLessThan(PLAY.rimZ - 1.5);
    expect(CAGE.x).toBeGreaterThan(PLAY.halfW + 1);
  });
  it('the graffiti is never behind the basket (the quiet rule), and a phone gets no wall', () => {
    for (const w of plan.walls) expect(w.z).toBeGreaterThan(0);
    expect(plan.walls.length).toBe(2);
    expect(streetballPlan('mobile').walls.length).toBe(0);
  });
  it('four lamp poles, one at each corner of the cage', () => {
    expect(plan.poles.length).toBe(4);
    expect(new Set(plan.poles.map((p) => `${Math.sign(p.x)}${p.z < 5 ? 'b' : 'f'}`)).size).toBe(4);
  });
});

describe('the fence steps aside before it reaches the lens', () => {
  it('hides inside 1.6 m, comes back from 2.4 m, and holds its state in between (no flicker at the edge)', () => {
    expect(panelShown(1.0, true)).toBe(false); expect(panelShown(3.0, false)).toBe(true);
    expect(panelShown(2.0, true)).toBe(true); expect(panelShown(2.0, false)).toBe(false);
  });
});

describe('the wire\'s lattice', () => {
  const W = 12, H = 3.4, segs = latticeSegments(W, H);
  it('every bar lies inside the panel and runs at 45 degrees', () => {
    expect(segs.length).toBeGreaterThan(40);
    for (const g of segs) {
      for (const [x, y] of [[g.x0, g.y0], [g.x1, g.y1]]) { expect(x).toBeGreaterThanOrEqual(-1e-9); expect(x).toBeLessThanOrEqual(W + 1e-9); expect(y).toBeGreaterThanOrEqual(-1e-9); expect(y).toBeLessThanOrEqual(H + 1e-9); }
      expect(Math.abs(Math.abs(g.y1 - g.y0) - Math.abs(g.x1 - g.x0))).toBeLessThan(1e-9);
    }
  });
  it('both diagonals are there, in equal measure', () => {
    const up = segs.filter((g) => g.y1 > g.y0).length, down = segs.filter((g) => g.y1 < g.y0).length;
    expect(up).toBeGreaterThan(10); expect(Math.abs(up - down)).toBeLessThanOrEqual(2);
  });
  it('the bars of a family are a cell apart along the panel, and a panel the size of the fence is a few hundred bars (one draw)', () => {
    const ups = segs.filter((g) => g.y1 > g.y0).map((g) => g.x0 - g.y0).sort((a, b) => a - b);
    for (let i = 1; i < ups.length; i++) expect(ups[i] - ups[i - 1]).toBeCloseTo(LINK_CELL_M, 6);
    const side = latticeSegments(CAGE.zFront - CAGE.zBack, CAGE.height).length;
    expect(side).toBeGreaterThan(100); expect(side).toBeLessThan(400);
  });
  it('a degenerate panel has no bars', () => { expect(latticeSegments(0, 3)).toEqual([]); expect(latticeSegments(5, 0)).toEqual([]); });
});

describe('the painters', () => {
  it('the boombox draws finite numbers', () => {
    const b = recordingCtx(); paintBoombox(b, 128, 64); expect(b.calls.length).toBeGreaterThan(10); expect(allFinite(b.calls)).toBe(true);
  });
});

describe('the built arena', () => {
  it('names its meshes the way the rig reads them, and nothing is pickable', () => {
    const { scene } = rig();
    const before = scene.meshes.length;
    const h = mountStreetball(scene, { tier: 'desktop', rim: RIM, teams: { mine: () => [], theirs: () => [], mineColor: '#22d3ee', theirsColor: '#ff2d78' } });
    expect(scene.meshes.length).toBeGreaterThan(before + 10);
    const heads = scene.meshes.filter((m) => /^lhead_stb_/.test(m.name));
    expect(heads.length).toBe(4);
    for (const m of heads) { expect(fixtureRole(m.name, m.material?.name)).toBe('lamp'); expect(GLOW_MESH.test(m.name)).toBe(true); expect(GLOW_MATERIAL.test(m.material!.name)).toBe(true); }
    for (const m of h.meshes) expect(m.isPickable, m.name).toBe(false);
    expect(scene.meshes.filter((m) => /^court_cage_link_/.test(m.name)).length).toBe(3);   // `court_` is a receiver-only name: a lattice does not cast a shadow
    expect(scene.meshes.filter((m) => /^player_ring_team_/.test(m.name)).length).toBe(2);
    h.dispose();
    expect(scene.meshes.length).toBe(before);
  });
  it('a phone builds the frame, the poles, the benches, the props and the rings: eight meshes (3v3\'s mobile row has 98 active meshes and spent 81)', () => {
    const { scene } = rig();
    const before = scene.meshes.length;
    const h = mountStreetball(scene, { tier: 'mobile', rim: RIM, teams: { mine: () => [], theirs: () => [], mineColor: '#22d3ee', theirsColor: '#ff2d78' } });
    expect(scene.meshes.length - before).toBeLessThanOrEqual(9);
    expect(scene.meshes.filter((m) => /^court_cage_link_/.test(m.name)).length).toBe(0);
    h.dispose();
    expect(scene.meshes.length).toBe(before);
  });
  it('the team rings follow the bodies (and a hidden pool instance is scaled to nothing)', () => {
    const { scene, frame } = rig();
    const mate = new TransformNode('mate', scene), foe = new TransformNode('foe', scene);
    mate.position.set(3, 0, 7); foe.position.set(-2, 0, 2);
    const h = mountStreetball(scene, { tier: 'desktop', rim: RIM, teams: { mine: () => [mate], theirs: () => [foe], mineColor: '#22d3ee', theirsColor: '#ff2d78' } });
    frame(2);
    const mine = scene.getMeshByName('player_ring_team_mine')!;
    const buf = mine.thinInstanceGetWorldMatrices();
    expect(buf.length).toBe(4);
    expect(buf[0].getTranslation().x).toBeCloseTo(3, 5); expect(buf[0].getTranslation().z).toBeCloseTo(7, 5);
    expect(buf[1].m[0]).toBe(0);
    h.dispose();
  });
});

// ── the mount the two modes call ────────────────────────────────────────────────────────────────────
describe('mountHoopsCourt', () => {
  function modeCtx() {
    const k = litRig();
    const f = fakeCtx(k.scene);
    const ctx = { ...f.ctx, lights: (k.ctx as unknown as { lights: unknown }).lights } as unknown as ModeContext;
    return { ...k, ctx, f };
  }
  const bodies = (scene: Scene): TransformNode[] => [new TransformNode('a', scene), new TransformNode('b', scene)];
  it('1v1 mounts no arena, and leaves a probe handle on the scene that goes with it', () => {
    const k = modeCtx(); const before = k.scene.meshes.length;
    const c = mountHoopsCourt(k.ctx, { kind: 'onevone', rim: RIM, bodies: () => bodies(k.scene), final: () => false, progress: () => 0 });
    expect(k.scene.meshes.length).toBe(before);
    expect((k.scene.metadata as { felHoops?: unknown }).felHoops).toBe(c);
    c.dispose();
    expect((k.scene.metadata as { felHoops?: unknown }).felHoops).toBeUndefined();
  });
  it('3v3 mounts the arena, and disposing takes every mesh of it away', () => {
    const k = modeCtx(); const before = k.scene.meshes.length;
    const c = mountHoopsCourt(k.ctx, { kind: 'threevthree', rim: RIM, bodies: () => [], final: () => false, progress: () => 0, teams: { mine: () => [], theirs: () => [], mineColor: '#22d3ee', theirsColor: '#ff2d78' } });
    expect(k.scene.meshes.length).toBeGreaterThan(before + 10);
    c.dispose();
    expect(k.scene.meshes.length).toBe(before);
  });
  it('force() holds the dusk at a progress whatever the score says, and null hands it back to the game', () => {
    const k = modeCtx();
    const c = mountHoopsCourt(k.ctx, { kind: 'onevone', rim: RIM, bodies: () => [], final: () => false, progress: () => 0 });
    k.frame(60 * 3); expect(k.sun.intensity).toBe(2.4);
    c.force(1); k.frame(60 * 25); expect(k.sun.intensity).toBeLessThan(2.4);
    c.force(null); k.frame(60 * 40); expect(k.sun.intensity).toBeCloseTo(2.4, 2);
    c.dispose();
  });
  it('passes the mode\'s `final` to the replay planner and its dead ball through', async () => {
    const k = modeCtx(); let final = false;
    const c = mountHoopsCourt(k.ctx, { kind: 'onevone', rim: RIM, bodies: () => [], final: () => final, progress: () => 0 });
    c.note('poster'); final = true;
    expect(c.deadBall(() => undefined)).toBe(false);
    final = false; c.note('poster');
    let ran = 0; expect(c.deadBall(() => { ran++; })).toBe(true);
    await k.f.finishReplay(); expect(ran).toBe(1); expect(c.replays).toBe(1);
    c.dispose();
  });
});
