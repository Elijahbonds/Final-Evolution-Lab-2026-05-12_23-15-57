// vis-foundation-2 (A9.7 second half) — the named glossy floors reflect the players.
import { describe, expect, it } from 'vitest';
import { MeshBuilder, NullEngine, PBRMaterial, Scene, Vector3 } from '@babylonjs/core';
import { GLOSSY_FLOOR_MODES, MIRROR_RADIUS, VARNISH_ROUGHNESS, glossyFloorWanted, mirrorRatio, mirrors, mountGlossyFloor } from './GlossyFloor';

const mesh = (name: string, extra: Partial<{ skeleton: unknown; isVisible: boolean; enabled: boolean }> = {}) =>
  ({ name, skeleton: extra.skeleton, isVisible: extra.isVisible ?? true, isEnabled: () => extra.enabled ?? true });

describe('which floors', () => {
  it('the named stages, and any place whose ground is a wooden court; desktop and high only; never a held mode', () => {
    expect(glossyFloorWanted('desktop', 'dance', undefined)).toBe(true);
    expect(glossyFloorWanted('high', 'brainbrawl', null)).toBe(true);
    expect(glossyFloorWanted('desktop', 'volleyball', 'court')).toBe(true);    // the Gym
    expect(glossyFloorWanted('desktop', 'volleyball', 'sand')).toBe(false);    // the beach
    expect(glossyFloorWanted('mobile', 'dance', undefined)).toBe(false);
    expect(glossyFloorWanted('high', 'onevone', 'court')).toBe(false);         // hoops held this wave
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
});
