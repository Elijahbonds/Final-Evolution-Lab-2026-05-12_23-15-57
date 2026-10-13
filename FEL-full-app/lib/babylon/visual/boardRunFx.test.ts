// vis-board (wave 2) — freerun's and big air's pieces: the world around the slab, the runner's palette, the ring, the event around the kicker.
import { describe, expect, it } from 'vitest';
import { Color3, FreeCamera, MeshBuilder, NullEngine, RawTexture, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { FREERUN_TRACKS } from '../nexus/freeRunTracks';
import { trackPieces } from '../modes/freeRunCourse';
import { tierById } from '../core/FreeRunCore';
import { SLAB_EDGE, TRACK_KINDS, YARD_DROP, YARD_INNER, dressingSpots, footprint, mountFreeRunDressing } from './freeRunDressing';
import { EDGE_KINDS, KEEP_SATURATION, MARKER_KINDS, RED_KINDS, RUNNER_RED, chroma, desaturate, runnerLook } from './runnerPalette';
import { RING_POOL, RING_SEC, ShockRing, ringState } from './ShockRing';
import { eventLayout, fireworksWorthy, judgeSpread, mountBigAirEvent, scoreColor } from './bigAirDressing';
import { BIG_AIR_HILL, BIG_AIR_TUNING } from '../../feel/cores/big-air-constants';
import { SpinTrail, trailWanted } from './SpinTrail';

const scene = () => { const sc = new Scene(new NullEngine()); new FreeCamera('cam', new Vector3(0, 3, -6), sc); return sc; };

describe('the world around the slab', () => {
  for (const track of FREERUN_TRACKS) {
    const pieces = trackPieces(track, tierById(1));
    it(`${track.id}: props only past the slab, none on a course piece or on each other, the same world every build`, () => {
      const spots = dressingSpots(track.id, pieces);
      expect(spots.length).toBeGreaterThan(8);
      for (const s of spots) {
        expect(Math.abs(s.x), s.kind).toBeGreaterThan(SLAB_EDGE + 1);
        expect(TRACK_KINDS[track.id].map(([k]) => k)).toContain(s.kind);
        for (const p of pieces) { if (p.kind === 'gap') continue; const overlap = Math.abs(s.x - p.x) < p.w / 2 + footprint(s.kind, s.scale) && Math.abs(s.z - p.z) < p.d / 2 + footprint(s.kind, s.scale); expect(overlap, `${s.kind} on ${p.kind}`).toBe(false); }
      }
      for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) expect(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z)).toBeGreaterThan(Math.min(footprint(spots[i].kind, spots[i].scale), footprint(spots[j].kind, spots[j].scale)));
      expect(dressingSpots(track.id, pieces)).toEqual(spots);
    });
    it(`${track.id}: a phone gets about a third of them`, () => {
      const full = dressingSpots(track.id, pieces).length, lite = dressingSpots(track.id, pieces, 0.34).length;
      expect(lite).toBeLessThan(full * 0.6);
    });
  }
  it('an unknown track has no world', () => { expect(dressingSpots('nowhere', [])).toEqual([]); });
  it('builds as a handful of draws, never pickable, and is gone when disposed', () => {
    const sc = scene();
    const track = FREERUN_TRACKS[0];
    const h = mountFreeRunDressing(sc, track.id, trackPieces(track, tierById(1)), 'desktop');
    expect(h.spots).toBeGreaterThan(8);
    expect(h.draws).toBeLessThan(h.spots);                                                       // merged: fewer draws than props
    const dress = sc.meshes.filter((m) => /^(fr_dress_|neon_sign_|lantern_mast_)/.test(m.name));
    expect(dress.length).toBe(h.draws);
    expect(dress.every((m) => !m.isPickable)).toBe(true);
    h.dispose();
    expect(sc.meshes.filter((m) => /^(fr_dress_|neon_sign_|lantern_mast_)/.test(m.name))).toHaveLength(0);
  });
});

describe('the props stand on something', () => {
  for (const track of FREERUN_TRACKS) {
    it(`${track.id}: a yard deck below the slab, every prop on it and none below it, and the deck clear of the course`, () => {
      const sc = scene();
      const h = mountFreeRunDressing(sc, track.id, trackPieces(track, tierById(1)), 'desktop');
      const yard = sc.meshes.find((m) => m.name === 'fr_dress_yard')!;
      expect(yard).toBeTruthy();
      const yb = yard.getBoundingInfo().boundingBox;
      expect(yb.maximumWorld.y).toBeCloseTo(-YARD_DROP, 2);                                     // its top is the floor the props stand on
      expect(yb.minimumWorld.x).toBeLessThan(-YARD_INNER); expect(yb.maximumWorld.x).toBeGreaterThan(YARD_INNER);
      for (const m of sc.meshes) {
        if (!/^(fr_dress_|neon_sign_|lantern_mast_)/.test(m.name) || m === yard) continue;
        m.computeWorldMatrix(true);
        expect(m.getBoundingInfo().boundingBox.minimumWorld.y, m.name).toBeGreaterThanOrEqual(-YARD_DROP - 0.35);   // nothing hangs below its floor (a moss ball sinks a hair)
      }
      expect(YARD_INNER).toBeGreaterThan(SLAB_EDGE);                                           // the slab's edge is bare: the deck never reaches the course
      h.dispose();
    });
  }
});

describe("the runner's colour language", () => {
  it('the verbs\' pieces are runner red with an emissive floor; the quiet world keeps a fraction of its colour; markers are untouched', () => {
    for (const k of RED_KINDS) { const l = runnerLook(k, '#33aa99'); expect(l.hex, k).toBe(RUNNER_RED); expect(l.red).toBe(true); expect(l.emissive).toBeGreaterThanOrEqual(0.2); expect(l.edges).toBe(true); }
    for (const k of MARKER_KINDS) { const l = runnerLook(k, '#33aa99'); expect(l.hex, k).toBe('#33aa99'); expect(l.edges).toBe(false); }
    const quiet = runnerLook('ground', '#2a2440');
    expect(chroma(quiet.hex)).toBeLessThan(chroma('#2a2440'));
    expect(chroma(quiet.hex)).toBeGreaterThan(0);                                                // each track keeps its cast
    expect(quiet.red).toBe(false);
    expect(runnerLook('wall', '#6b7a6e').edges).toBe(true); expect(runnerLook('roof', '#3fb8b0').edges).toBe(true);
    for (const k of EDGE_KINDS) expect(['vault', 'bar', 'spring', 'rail', 'anchor', 'ledge', 'wall', 'roof']).toContain(k);
  });
  it('desaturate: luma kept, saturation scaled, held to range', () => {
    expect(desaturate('#808080', 0.3)).toBe('#808080');
    expect(chroma(desaturate('#ff0000', 0))).toBeLessThan(0.01);
    expect(desaturate('#ff0000', 1)).toBe('#ff0000');
    expect(chroma(desaturate('#ff0000', KEEP_SATURATION))).toBeCloseTo(chroma('#ff0000') * KEEP_SATURATION, 1);
    expect(desaturate('#abc', 5)).toBe('#aabbcc');
  });
  it('every authored track palette is quieter after the pass than before, in every non-verb kind', () => {
    for (const t of FREERUN_TRACKS) for (const [k, hex] of Object.entries(t.world.colors)) {
      if (RED_KINDS.has(k) || MARKER_KINDS.has(k)) continue;
      expect(chroma(runnerLook(k, hex).hex), `${t.id}.${k}`).toBeLessThanOrEqual(chroma(hex) + 1e-9);
    }
  });
});

describe('the shock ring', () => {
  it('grows from a fist to its reach, thins as it goes, ends on time', () => {
    expect(ringState(-1, 5).alpha).toBe(0); expect(ringState(RING_SEC, 5).alpha).toBe(0);
    expect(ringState(0.05, 5).radius).toBeLessThan(ringState(0.3, 5).radius);
    expect(ringState(RING_SEC - 0.01, 5).radius).toBeCloseTo(5, 0);
    expect(ringState(0.45, 5).alpha).toBeLessThan(ringState(0.1, 5).alpha);
  });
  it('a pool of a few, reused; each ends by itself', () => {
    const sc = scene(); const r = new ShockRing(sc);
    for (let i = 0; i < RING_POOL + 2; i++) r.fire(i, 0, 0, 4, '#ff3b2f');
    expect(r.live).toBe(RING_POOL);
    for (let i = 0; i < 60; i++) r.update(1 / 60);
    expect(r.live).toBe(0);
    r.dispose();
    expect(sc.meshes.filter((m) => m.name.startsWith('fr_shock_'))).toHaveLength(0);
  });
});

describe('the big air event', () => {
  const L = eventLayout(BIG_AIR_HILL, BIG_AIR_TUNING.launchZ);
  it('the gate over the run-in, a tower either side of the kicker, the booth beside the landing', () => {
    expect(L.gate.z).toBeGreaterThan(BIG_AIR_TUNING.launchZ);
    expect(L.towers.map((t) => Math.sign(t.x)).sort()).toEqual([-1, 1]);
    for (const t of L.towers) { expect(Math.abs(t.x)).toBeGreaterThan(4); expect(t.z).toBeLessThan(BIG_AIR_TUNING.launchZ + BIG_AIR_HILL.kickerLen); expect(t.z).toBeGreaterThan(BIG_AIR_TUNING.launchZ); }
    expect(Math.abs(L.booth.x)).toBeGreaterThan(8);                                              // beside the 16 m landing, not on it
    expect(L.booth.z).toBeLessThan(BIG_AIR_HILL.knuckleZ);
  });
  it('three judges average back to the read (within a tenth) and stay on the 0..10 card', () => {
    for (const read of [0, 3.4, 7.4, 9.9, 10]) for (let a = 0; a < 5; a++) {
      const s = judgeSpread(read, a);
      expect(s.every((v) => v >= 0 && v <= 10)).toBe(true);
      if (read > 1 && read < 9) expect(Math.abs(s.reduce((x, y) => x + y, 0) / 3 - read)).toBeLessThan(0.1);
    }
    expect(judgeSpread(Number.NaN, 0)).toEqual([0, 0, 0].map((v, i) => judgeSpread(0, 0)[i]));
    expect(scoreColor(9)).not.toBe(scoreColor(4)); expect(scoreColor(1)).not.toBe(scoreColor(7));
  });
  it('fireworks for a landed double on a clean landing — not a crash, not a single', () => {
    expect(fireworksWorthy(2, 'stuck')).toBe(true); expect(fireworksWorthy(-2.5, 'clean')).toBe(true);
    expect(fireworksWorthy(2, 'crash')).toBe(false); expect(fireworksWorthy(2, 'sketchy')).toBe(false); expect(fireworksWorthy(1.5, 'stuck')).toBe(false);
  });
  it('mounts as merged scenery, named for the glow where it is a light, never pickable, and is gone when disposed', () => {
    const sc = scene();
    const bursts: { kind: string; y: number }[] = [];
    const h = mountBigAirEvent(sc, BIG_AIR_HILL, BIG_AIR_TUNING.launchZ, (_s, at, kind) => bursts.push({ kind, y: at.y }));
    expect(h.meshes.length).toBeGreaterThan(8);
    expect(sc.getMeshByName('bigair_gate_led')).toBeTruthy();
    expect(h.meshes.every((m) => !m.isPickable)).toBe(true);
    expect(sc.meshes.filter((m) => m.name === 'ba_tower')).toHaveLength(2);                      // each tower is ONE draw
    h.reveal(8.4, 2); h.update(0.5);
    expect(sc.getMeshByName('ba_judge_panel_0')!.scaling.y).toBeGreaterThan(0.5);               // the card has swung up
    h.clear(); expect(sc.getMeshByName('ba_judge_panel_0')!.scaling.y).toBeLessThan(0.01);
    h.fireworks(); h.update(0.05); expect(bursts).toHaveLength(0);                              // the first shell waits a beat
    for (let i = 0; i < 120; i++) h.update(1 / 60);
    expect(bursts.filter((b) => b.kind === 'sparks')).toHaveLength(4);                            // four shells, a burst of sparks and of confetti each
    expect(bursts.filter((b) => b.kind === 'confetti')).toHaveLength(4);
    expect(bursts.every((b) => b.y > 8)).toBe(true);                                              // up over the booth, not on it
    h.dispose();
    expect(sc.meshes.filter((m) => /^(ba_|bigair_gate)/.test(m.name))).toHaveLength(0);
  });
});

describe('the spin trails', () => {
  it('only in the air, only through a trick, never under reduced motion', () => {
    expect(trailWanted(true, true, true)).toBe(true);
    expect(trailWanted(false, true, true)).toBe(false); expect(trailWanted(true, false, true)).toBe(false); expect(trailWanted(true, true, false)).toBe(false);
  });
  it('two ribbons off the board\'s tips, started cleared and stopped cleared', () => {
    const sc = scene();
    const board = new TransformNode('board', sc);
    const t = new SpinTrail(sc, board);
    expect(sc.meshes.filter((m) => m.name.startsWith('spin_trail_') && !m.name.includes('tip'))).toHaveLength(2);
    t.setActive(true); expect(t.active).toBe(true);
    t.setActive(true); expect(t.active).toBe(true);
    t.setActive(false); expect(t.active).toBe(false);
    t.dispose();
    expect(sc.meshes.filter((m) => m.name.startsWith('spin_trail_'))).toHaveLength(0);
  });
});

// ── the unlit pieces survive LightRig.liftBlackMaterials (a black diffuse is lifted to a grey that washes an emissive out) ──
import { liftBlackMaterials } from '../scene/LightRig';
import { GateFlash } from './GateFlash';
import { buildSlopeLamps } from './slopeLamps';
import { mountWarehouseDressing } from './warehouseDressing';
import { UNLIT_DIFFUSE_LEVEL, settleEmissive, unlitDiffuse } from './unlit';
describe('unlit surfaces are not lifted to grey', () => {
  it('the lift threshold is 0.04 and the unlit diffuse sits just over it', () => {
    expect(UNLIT_DIFFUSE_LEVEL).toBeGreaterThan(0.04);
    expect(UNLIT_DIFFUSE_LEVEL).toBeLessThan(0.06);
    expect(unlitDiffuse()).not.toBe(unlitDiffuse());   // each material owns its colour
  });
  it('after the lift runs, every emissive-only material of the lane is as it was built', () => {
    const sc = scene();
    const gate = new GateFlash(sc);
    const ring = new ShockRing(sc);
    const trail = new SpinTrail(sc, new TransformNode('b', sc));
    const lamps = buildSlopeLamps(sc, [new Vector3(0, 0, 20), new Vector3(0, -1, 40)], 20, 'desktop');
    const wh = mountWarehouseDressing(sc, 48, 'desktop');
    const ev = mountBigAirEvent(sc, BIG_AIR_HILL, BIG_AIR_TUNING.launchZ, () => undefined);
    const track = FREERUN_TRACKS[0];
    const dress = mountFreeRunDressing(sc, track.id, trackPieces(track, tierById(1)), 'desktop');
    const before = sc.materials.filter((m) => /^(led_|lampHead|wh_shaft|gate_flash|fr_shock|spin_trail|ba_banner|ba_judge|neon_sign|lantern_mast)/.test(m.name)).map((m) => [m.name, (m as unknown as { diffuseColor?: { r: number } }).diffuseColor?.r]);
    expect(before.length).toBeGreaterThan(8);
    const fixed = liftBlackMaterials(sc);
    const after = sc.materials.filter((m) => /^(led_|lampHead|wh_shaft|gate_flash|fr_shock|spin_trail|ba_banner|ba_judge|neon_sign|lantern_mast)/.test(m.name)).map((m) => [m.name, (m as unknown as { diffuseColor?: { r: number } }).diffuseColor?.r]);
    expect(after).toEqual(before);
    expect(fixed).toBe(0);
    gate.dispose(); ring.dispose(); trail.dispose(); wh.dispose(); ev.dispose(); dress.dispose(); void lamps;
  });
  it('an emissive texture is shown on its own: the colour added to it is taken to black (the shader ADDS it, it does not scale)', () => {
    const sc = scene();
    const m = new StandardMaterial('with_tex', sc);
    m.emissiveColor = new Color3(0.9, 0.95, 1);
    expect(settleEmissive(m).emissiveColor.r).toBeCloseTo(0.9, 5);                 // no texture: the colour IS the emission, left alone
    m.emissiveTexture = RawTexture.CreateRGBATexture(new Uint8Array([5, 8, 15, 255]), 1, 1, sc);
    settleEmissive(m);
    expect(m.emissiveColor.r + m.emissiveColor.g + m.emissiveColor.b).toBe(0);
  });
  it('and the lift DOES grey a plain black diffuse (the control: the guard measures something)', () => {
    const sc = scene();
    const m = new StandardMaterial('control', sc);
    m.diffuseColor = new Color3(0, 0, 0);
    const box = MeshBuilder.CreateBox('ctl', {}, sc); box.material = m;
    expect(liftBlackMaterials(sc)).toBeGreaterThan(0);
    expect(m.diffuseColor.r).toBeGreaterThan(0.2);
  });
});
