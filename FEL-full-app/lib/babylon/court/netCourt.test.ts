// vis-court wave 2 — the net sports' dressing: the net, the beach, the gym hall, the stadium boards, and the fx object.
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, MeshBuilder, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { installOffscreenShim } from '../../../tests/helpers/canvasShim';
import { brushStrength, buildNet, hideVenueNet, netLook, netSwing } from './NetKit';
import { beachLayout, buildBeachDressing, flagWave } from './BeachDressing';
import { buildGymHall, gymPlan } from './GymHall';
import { boardLayout, buildStadiumDressing, faceYaw, panelsFor } from './StadiumDressing';
import { mountNetCourtFx } from './NetCourtFx';
import { stampDecal } from './decals';
import { TENNIS_CFG, VOLLEY_CFG } from '../../../tests/helpers/courtCfg';

beforeAll(() => installOffscreenShim());

function rig() {
  const engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const scene = new Scene(engine);
  new FreeCamera('cam', new Vector3(0, 4, 20), scene);
  return { scene, frame: (n: number) => { for (let i = 0; i < n; i++) scene.render(); } };
}

describe('the net', () => {
  it('a volleyball net is a one-metre strip under the tape; a tennis net hangs to the court', () => {
    expect(netLook('volley', 2.43).drop).toBe(1);
    expect(netLook('tennis', 0.95).drop).toBeCloseTo(0.91, 6);
  });
  it('a brush is hardest on the tape and nothing a hand clear of it', () => {
    expect(brushStrength(0)).toBe(1); expect(brushStrength(0.5)).toBe(0); expect(brushStrength(-0.5)).toBe(0);
    expect(brushStrength(0.1)).toBeGreaterThan(brushStrength(0.3));
  });
  it('the swing is a damped wobble that dies away to exactly zero', () => {
    expect(netSwing(0, 1)).toBe(0);
    let peak = 0; for (let t = 0; t < 0.4; t += 0.01) peak = Math.max(peak, Math.abs(netSwing(t, 1)));
    expect(peak).toBeGreaterThan(0.03); expect(peak).toBeLessThan(0.12);
    expect(netSwing(5, 1)).toBe(0); expect(netSwing(0.1, 0)).toBe(0); expect(netSwing(-1, 1)).toBe(0);
  });
  it('builds posts, a band and a tape; shakes and settles; disposes clean; and hides the venue panel', () => {
    const { scene } = rig();
    MeshBuilder.CreateBox('net', { width: 9, height: 1, depth: 0.05 }, scene);
    const n = buildNet(scene, TENNIS_CFG, 'tennis');
    hideVenueNet(scene);
    expect(scene.getMeshByName('net')!.isEnabled()).toBe(false);
    expect(n.meshes.map((m) => m.name).sort()).toEqual(['court_net_band', 'court_net_post', 'court_net_post', 'court_net_tape']);
    const band = scene.getMeshByName('court_net_band')!;
    // the net IS the line the rally judges against: the tape sits at the config's net height
    expect(scene.getMeshByName('court_net_tape')!.position.y).toBeCloseTo(TENNIS_CFG.netHeight - 0.035, 6);
    n.shake(1); n.update(0.05);
    expect(band.rotation.x).not.toBe(0);
    for (let i = 0; i < 200; i++) n.update(1 / 60);
    expect(band.rotation.x).toBe(0);
    n.dispose();
    expect(scene.meshes.some((m) => m.name.startsWith('court_net'))).toBe(false);
  });
});

describe('the beach', () => {
  it('everything stands outside the crowd bank and the free zone, deterministically', () => {
    const a = beachLayout(4.5, 9), b = beachLayout(4.5, 9);
    expect(a).toEqual(b);
    for (const u of a.umbrellas) expect(Math.abs(u.x)).toBeGreaterThan(4.5 + 7);
    for (const t of a.towels) expect(Math.abs(t.x)).toBeGreaterThan(4.5 + 5.5);
    for (const f of a.flags) { expect(Math.abs(f.x)).toBeGreaterThan(4.5 + 1.5); expect(f.z).toBeLessThan(0); }   // far side, never on the camera's side
  });
  it('a phone gets fewer of everything', () => {
    const d = beachLayout(4.5, 9), p = beachLayout(4.5, 9, true);
    expect(p.umbrellas.length).toBeLessThan(d.umbrellas.length); expect(p.towels.length).toBeLessThan(d.towels.length); expect(p.flags.length).toBeLessThan(d.flags.length);
  });
  it('cloth is pinned at the pole and free at the edge', () => {
    for (let t = 0; t < 3; t += 0.17) expect(flagWave(t, 0, 0.5)).toBeCloseTo(0, 9);
    let peak = 0; for (let t = 0; t < 3; t += 0.05) peak = Math.max(peak, Math.abs(flagWave(t, 1, 0.5)));
    expect(peak).toBeGreaterThan(0.1);
  });
  it('thin-instances the umbrellas and towels: a handful of draws however many there are', () => {
    const { scene } = rig();
    const h = buildBeachDressing(scene, 4.5, 9);
    const L = beachLayout(4.5, 9);
    const canopy = scene.getMeshByName('court_beach_canopy')!;
    expect(canopy.thinInstanceCount).toBe(L.umbrellas.length);
    expect(scene.getMeshByName('court_beach_towel')!.thinInstanceCount).toBe(L.towels.length);
    expect(h.meshes.filter((m) => m.name.startsWith('court_beach_flag_')).length).toBe(L.flags.length);
    h.update(0.016); h.update(0.5);
    h.dispose();
    expect(scene.meshes.some((m) => m.name.startsWith('court_beach'))).toBe(false);
  });
});

describe('the gym hall', () => {
  it('encloses the court with room for the camera behind the baseline, and hangs its bars over the court', () => {
    const p = gymPlan(4.5, 9);
    expect(p.frontZ).toBeGreaterThan(9 + 11.5 + 2);   // the play camera stands ~11.5 m behind the hero's baseline
    expect(p.halfX).toBeGreaterThan(4.5 + 8);
    for (const b of p.bars) { expect(Math.abs(b.x)).toBeLessThan(4.5); expect(Math.abs(b.z)).toBeLessThan(p.backZ); }
    expect(gymPlan(4.5, 9, true).bars.length).toBeLessThan(p.bars.length);
  });
  it('builds the hall with fixtures named for the rig, and disposes every mesh', () => {
    const { scene } = rig();
    const before = scene.meshes.length;
    const h = buildGymHall(scene, 4.5, 9);
    const bars = h.meshes.filter((m) => /^flood_court_gym_\d+$/.test(m.name));
    expect(bars.length).toBe(gymPlan(4.5, 9).bars.length);
    for (const b of bars) { const e = (b.material as unknown as { emissiveColor: { r: number; g: number; b: number } }).emissiveColor; expect(Math.max(e.r, e.g, e.b)).toBeGreaterThan(0.2); }
    expect(h.meshes.filter((m) => m.name.startsWith('court_gym_wall_')).length).toBe(4);
    h.dispose();
    expect(scene.meshes.length).toBe(before);
  });
});

describe('the stadium boards', () => {
  it('a plane face looks the way yaw says it does', () => {
    const { scene } = rig();
    for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const p = MeshBuilder.CreatePlane('p', { width: 1, height: 1 }, scene);
      p.rotation.y = faceYaw(nx, nz);
      p.computeWorldMatrix(true);
      const n = Vector3.TransformNormal(new Vector3(0, 0, -1), p.getWorldMatrix());   // the face's normal: down −z in its own frame
      expect(n.x).toBeCloseTo(nx, 6); expect(n.z).toBeCloseTo(nz, 6);
    }
  });
  it('four boards, each facing the middle of the court, outside the given edge', () => {
    const b = boardLayout(6.7, 13.6);
    expect(b.map((x) => x.name)).toEqual(['far', 'near', 'left', 'right']);
    for (const s of b) {
      const nx = -Math.sin(s.yaw), nz = -Math.cos(s.yaw);   // the face's direction
      expect(nx * -s.x + nz * -s.z).toBeGreaterThan(0);        // it looks toward the origin
      expect(Math.max(Math.abs(s.x) - 6.7, Math.abs(s.z) - 13.6)).toBeGreaterThan(0.9);   // and stands outside the edge
    }
    for (const s of boardLayout(6.7, 13.6, -0.09)) expect(Math.max(Math.abs(s.x) - 6.7, Math.abs(s.z) - 13.6)).toBeCloseTo(-0.09, 6);   // a negative gap: just inside
    expect(panelsFor(30)).toBe(9); expect(panelsFor(1)).toBe(2);
  });
  it('lights each board as a panel the glow leaves alone, builds a chair, and disposes clean', () => {
    const { scene } = rig();
    const h = buildStadiumDressing(scene, 6.7, 13.6, { x: 8.4, z: 0 });
    expect(h.meshes.filter((m) => /^court_ad_panel_(far|left|right)$/.test(m.name)).length).toBe(3);   // never the end the camera stands behind
    expect(scene.getMeshByName('court_umpire_chair')).toBeTruthy();
    h.dispose();
    expect(scene.meshes.some((m) => /court_ad_panel|court_ad|court_umpire/.test(m.name))).toBe(false);
  });
});

describe('the fx object', () => {
  it('a volleyball beach mounts the beach, the net and the rings; the gym mounts a hall, never sand', () => {
    const a = rig();
    const beach = mountNetCourtFx(a.scene, { modeId: 'volleyball', cfg: VOLLEY_CFG, cage: false, tier: 'desktop' });
    expect(beach.surface).toBe('sand'); expect(beach.indoors).toBe(false);
    expect(a.scene.getMeshByName('court_beach_canopy')).toBeTruthy(); expect(a.scene.getMeshByName('court_gym_floor')).toBeNull();
    beach.dispose();
    const b = rig();
    const gym = mountNetCourtFx(b.scene, { modeId: 'volleyball', placeId: 'gym', cfg: VOLLEY_CFG, cage: false, tier: 'desktop' });
    expect(gym.surface).toBe('gym'); expect(gym.indoors).toBe(true);
    expect(b.scene.getMeshByName('court_gym_floor')).toBeTruthy(); expect(b.scene.getMeshByName('court_beach_canopy')).toBeNull();
    gym.dispose();
  });
  it('tennis mounts boards outside the cage and a chair; clay dusts and leaves marks, hard court leaves none', () => {
    const a = rig();
    const fx = mountNetCourtFx(a.scene, { modeId: 'tennis', placeId: 'clay', cfg: TENNIS_CFG, cage: true, tier: 'desktop' });
    expect(fx.surface).toBe('clay');
    const far = a.scene.getMeshByName('court_ad_panel_far')!;
    expect(Math.abs(far.position.z)).toBeLessThan(TENNIS_CFG.halfLength + 1.6);   // against the cage's back glass, on its inside
    expect(Math.abs(far.position.z)).toBeGreaterThan(TENNIS_CFG.halfLength + 1.2);   // and clear of the playing area
    fx.landing(1, 2, true);   // no decal pool on this scene: it must simply not throw
    fx.dispose();
    expect(stampDecal(a.scene, 'scuff', 0, 0)).toBe(false);
  });
  it('stamps through the scene’s pool when one is mounted, and survives a pool that throws', () => {
    const { scene } = rig();
    const calls: unknown[][] = [];
    (scene.metadata ??= {}).felDecals = { stamp: (...a: unknown[]) => { calls.push(a); } };
    expect(stampDecal(scene, 'foot', 1, 2, 0.5, 2)).toBe(true);
    expect(calls[0].slice(0, 3)).toEqual(['foot', 1, 2]);
    scene.metadata.felDecals = { stamp: () => { throw new Error('boom'); } };
    expect(stampDecal(scene, 'foot', 1, 2)).toBe(false);
  });
  it('walks leave prints a stride apart on sand and none on a hard court; a ball crossing the net near the tape shakes it', () => {
    const { scene } = rig();
    const marks: number[] = [];
    (scene.metadata ??= {}).felDecals = { stamp: () => { marks.push(1); } };
    const sand = mountNetCourtFx(scene, { modeId: 'volleyball', cfg: VOLLEY_CFG, cage: false, tier: 'mobile' });
    const upd = (x: number, ball: { x: number; y: number; z: number } | null) => sand.update(1 / 60, { hero: { x, z: 8 }, foe: { x: 0, z: -8 }, heroSwing: false, foeSwing: false, ball });
    for (let i = 0; i < 60; i++) upd(i * 0.05, null);      // 3 m of walking
    expect(marks.length).toBeGreaterThanOrEqual(3); expect(marks.length).toBeLessThanOrEqual(4);
    const band = scene.getMeshByName('court_net_band')!;
    upd(0, { x: 0, y: VOLLEY_CFG.netHeight + 0.05, z: 0.4 }); upd(0, { x: 0, y: VOLLEY_CFG.netHeight + 0.05, z: -0.4 });
    sand.update(0.05, { hero: { x: 0, z: 8 }, foe: { x: 0, z: -8 }, heroSwing: false, foeSwing: false, ball: null });
    expect(band.rotation.x).not.toBe(0);
    sand.dispose();
    const hard = mountNetCourtFx(scene, { modeId: 'tennis', cfg: TENNIS_CFG, cage: false, tier: 'mobile' });
    marks.length = 0;
    for (let i = 0; i < 60; i++) hard.update(1 / 60, { hero: { x: i * 0.05, z: 11 }, foe: { x: 0, z: -11 }, heroSwing: false, foeSwing: false, ball: null });
    expect(marks.length).toBe(0);
    hard.dispose();
  });
  it('a contact squashes the ball and gives it back', () => {
    const { scene } = rig();
    const fx = mountNetCourtFx(scene, { modeId: 'tennis', cfg: TENNIS_CFG, cage: false, tier: 'mobile' });
    const ball = MeshBuilder.CreateSphere('ball', { diameter: 0.14 }, scene);
    fx.contact({ x: 0, y: 1, z: 10 }, { x: 0, z: 10 }, 'perfect', 'swing', ball);
    fx.update(0.01, { hero: { x: 0, z: 11 }, foe: { x: 0, z: -11 }, heroSwing: false, foeSwing: false, ball: null });
    expect(ball.scaling.y).toBeLessThan(1);
    for (let i = 0; i < 30; i++) fx.update(1 / 60, { hero: { x: 0, z: 11 }, foe: { x: 0, z: -11 }, heroSwing: false, foeSwing: false, ball: null });
    expect(ball.scaling.y).toBe(1);
    fx.contact({ x: 0, y: 1, z: 10 }, { x: 0, z: 10 }, 'miss', 'swing', ball);   // a miss is no contact at all
    expect(ball.scaling.y).toBe(1);
    void TransformNode;
    fx.dispose();
  });
});
