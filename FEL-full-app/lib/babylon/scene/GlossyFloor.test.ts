// vis-foundation-2 (A9.7 second half) — the named glossy floors reflect the players.
import { describe, expect, it } from 'vitest';
import { MeshBuilder, NullEngine, PBRMaterial, Scene, Vector3 } from '@babylonjs/core';
import { GLOSSY_FLOOR_MESH, GLOSSY_FLOOR_MODES, MIRROR_RADIUS, VARNISH_ROUGHNESS, glossyFloorWanted, mirrorRatio, mirrors, mountGlossyFloor } from './GlossyFloor';
import { HELD_PROBE_MODE, holdProbeMode } from '../../../tests/helpers/heldMode';

const mesh = (name: string, extra: Partial<{ skeleton: unknown; isVisible: boolean; enabled: boolean }> = {}) =>
  ({ name, skeleton: extra.skeleton, isVisible: extra.isVisible ?? true, isEnabled: () => extra.enabled ?? true });

describe('which floors', () => {
  it('the named stages, and any place whose ground is a wooden court; desktop and high only; never a held mode', () => {
    expect(glossyFloorWanted('desktop', 'dance', undefined)).toBe(true);
    expect(glossyFloorWanted('high', 'brainbrawl', null)).toBe(true);
    expect(glossyFloorWanted('desktop', 'volleyball', 'court')).toBe(true);    // the Gym
    expect(glossyFloorWanted('desktop', 'volleyball', 'sand')).toBe(false);    // the beach
    expect(glossyFloorWanted('mobile', 'dance', undefined)).toBe(false);
    const release = holdProbeMode();
    try { expect(glossyFloorWanted('high', HELD_PROBE_MODE, 'court')).toBe(false); } finally { release(); }   // a held mode gets no mirror
    expect(glossyFloorWanted('high', 'onevone', 'court')).toBe(true);          // vis-hoops-court lifted the hold: a wooden-court place mirrors
    for (const m of ['dunk', 'dunkduel', 'threepoint']) expect(glossyFloorWanted('desktop', m, undefined), m).toBe(true);   // vis-hoops-dunk: the Venice court's painted plane
    expect(glossyFloorWanted('mobile', 'dunk', undefined)).toBe(false);
    expect(glossyFloorWanted('desktop', 'dunk', undefined, true)).toBe(false);   // ?lookoff=mirror
    expect(glossyFloorWanted('high', 'dance', undefined, true)).toBe(false);   // ?lookoff=mirror
    expect(glossyFloorWanted('high', null, 'court')).toBe(false);
    expect(GLOSSY_FLOOR_MODES.has('dance')).toBe(true);
    expect(mirrorRatio('high')).toBeGreaterThan(mirrorRatio('desktop'));
  });
});

describe('what the floor reflects', () => {
  it('bodies wherever they are, the room (sky, walls), props near the play; never the floor, effects or HUD', () => {
    expect(mirrors(mesh('Human.body', { skeleton: {} }), 999)).toBe(true);
    expect(mirrors(mesh('nexus_sky'), 300)).toBe(true);
    expect(mirrors(mesh('venue_box_north'), 60)).toBe(true);
    expect(mirrors(mesh('net_post'), MIRROR_RADIUS - 1)).toBe(true);
    expect(mirrors(mesh('net_post'), MIRROR_RADIUS + 1)).toBe(false);
    for (const n of ['venue_ground', 'player_ring', 'fx_spark', 'juice_rim', 'hero_contact', 'ProxyMesh']) expect(mirrors(mesh(n), 1), n).toBe(false);
    expect(mirrors(mesh('Human.body', { skeleton: {}, isVisible: false }), 1)).toBe(false);
  });
});

describe('mountGlossyFloor', () => {
  it('varnishes the floor, points its reflection at the mirror, and puts both back', () => {
    const s = new Scene(new NullEngine());
    (s.metadata ??= {}).felModeId = 'dance';
    const floor = MeshBuilder.CreateGround('venue_ground', { width: 20, height: 20 }, s);
    const mat = new PBRMaterial('nexus_groundMat', s); mat.roughness = 0.85; floor.material = mat;
    const prop = MeshBuilder.CreateBox('stage_speaker', {}, s); prop.position.set(3, 1, 0);
    const h = mountGlossyFloor(s, 'desktop', new Vector3(0, 0, 0))!;
    expect(h).not.toBeNull();
    expect(mat.roughness).toBe(VARNISH_ROUGHNESS);
    expect(mat.reflectionTexture).toBe(h.mirror);
    expect(h.mirror.renderList).toContain(prop);
    expect(h.mirror.renderList).not.toContain(floor);
    h.dispose();
    expect(mat.roughness).toBe(0.85);
    expect(mat.reflectionTexture).toBeNull();
  });
  it('nothing for a mode without a glossy floor, or on a phone', () => {
    const s = new Scene(new NullEngine());
    (s.metadata ??= {}).felModeId = 'sprint';
    const floor = MeshBuilder.CreateGround('venue_ground', { width: 20, height: 20 }, s); floor.material = new PBRMaterial('g', s);
    expect(mountGlossyFloor(s, 'high', null)).toBeNull();
    s.metadata.felModeId = 'dance';
    expect(mountGlossyFloor(s, 'mobile', null)).toBeNull();
  });
  it('a mode with its own floor plane (the Venice court\'s paint) mirrors that plane, not the ground under it', () => {
    const s = new Scene(new NullEngine());
    (s.metadata ??= {}).felModeId = 'dunk';
    const ground = MeshBuilder.CreateGround('venue_ground', { width: 20, height: 20 }, s); const gm = new PBRMaterial('g', s); gm.roughness = 0.9; ground.material = gm;
    const paint = MeshBuilder.CreateGround('vb_court_paint', { width: 16, height: 26 }, s); const pm = new PBRMaterial('court_street_mat', s); pm.roughness = 0.66; paint.material = pm;
    expect(GLOSSY_FLOOR_MESH.dunk).toBe('vb_court_paint');
    const h = mountGlossyFloor(s, 'desktop', new Vector3(0, 0, 0))!;
    expect(h).not.toBeNull(); expect(h.floor).toBe(paint);
    expect(pm.roughness).toBe(VARNISH_ROUGHNESS); expect(gm.roughness).toBe(0.9);
    expect(h.mirror.renderList).not.toContain(paint);
    h.dispose();
    expect(pm.roughness).toBe(0.66);
  });
  it('a venue without that plane (another court location) mounts nothing for it', () => {
    const s = new Scene(new NullEngine());
    (s.metadata ??= {}).felModeId = 'threepoint';
    const ground = MeshBuilder.CreateGround('venue_ground', { width: 20, height: 20 }, s); ground.material = new PBRMaterial('g', s);
    expect(mountGlossyFloor(s, 'desktop', null)).toBeNull();
  });
});
