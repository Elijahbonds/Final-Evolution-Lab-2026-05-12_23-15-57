import { describe, expect, it } from 'vitest';
import { MeshBuilder, NullEngine, Scene } from '@babylonjs/core';
import { HAIR_NODE_KEYS, HAIR_STYLE_NODE, applyHairStyle, hairNodeFor } from './hairStyles';
import { HAIR_STYLES } from '../../closet/wearable-catalog';

describe('hair style mapping', () => {
  it('covers every catalog style', () => {
    for (const s of HAIR_STYLES) expect(s in HAIR_STYLE_NODE, s).toBe(true);
  });
  it('every mapped node is a forge node key', () => {
    for (const v of Object.values(HAIR_STYLE_NODE)) if (v) expect(HAIR_NODE_KEYS).toContain(v);
  });
  it('unknown styles fall back to the cap, Bald to none', () => {
    // test changed (2026-10-07, the hair expansion): 'Mohawk' became a catalog style (its nearest baked node is the buzz),
    // so the unknown name this pins is one no catalog has
    expect(hairNodeFor('Mystery Cut')).toBe('cap');
    expect(hairNodeFor('Mohawk')).toBe('buzz');
    expect(hairNodeFor(undefined)).toBe('cap');
    expect(hairNodeFor('Bald')).toBeNull();
  });
});

describe('applyHairStyle', () => {
  it('shows exactly the chosen node and leaves non-hair meshes alone', () => {
    const s = new Scene(new NullEngine());
    const names = ['Body_primitive0', 'Hair_cap_c3', 'Hair_afro_c3', 'Hair_bun_c3', 'jersey_decal_x'];
    const meshes = names.map((n) => MeshBuilder.CreateBox(n, {}, s));
    expect(applyHairStyle(meshes, 'Afro')).toBe(3);
    expect(meshes.map((m) => m.isVisible)).toEqual([true, false, true, false, true]);
    applyHairStyle(meshes, 'Bald');
    expect(meshes.slice(1, 4).every((m) => !m.isVisible)).toBe(true);
    applyHairStyle(meshes, 'Straight');
    expect(meshes[1].isVisible).toBe(true);
  });
});

// IMPROVE (2026-10-06), research item 3 / BACKLOG B19: Hijab showed bald because no body carries Hair_hijab.
import { readFileSync } from 'node:fs';
import { HAIR_NODE_FALLBACK } from './hairStyles';

describe('a style whose node the body lacks falls back to a covering node', () => {
  const kitNodes = ['Hair_afro', 'Hair_braids', 'Hair_bun', 'Hair_buzz', 'Hair_cap', 'Hair_ponytail'];
  it('the kit bodies really have no Hair_hijab (the bug this covers)', () => {
    for (const f of ['public/models/candidates/fel-kit-male.glb', 'public/models/candidates/fel-kit-female.glb', 'public/models/fel-hero.glb']) {
      const b = readFileSync(f);
      const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8')) as { nodes: { name?: string }[] };
      const names = j.nodes.map((n) => n.name ?? '');
      expect(names.filter((n) => n.startsWith('Hair_')).sort(), f).toEqual(kitNodes);
    }
  });
  it('Hijab shows the cap instead of nothing on a body without a hijab node', () => {
    const s = new Scene(new NullEngine());
    const meshes = kitNodes.map((n) => MeshBuilder.CreateBox(`${n}_c9`, {}, s));
    applyHairStyle(meshes, 'Hijab');
    expect(meshes.filter((m) => m.isVisible).map((m) => m.name)).toEqual(['Hair_cap_c9']);
    expect(HAIR_NODE_FALLBACK.hijab).toEqual(['cap']);
  });
  it('a body that HAS the hijab node shows it (the fallback steps aside)', () => {
    const s = new Scene(new NullEngine());
    const meshes = [...kitNodes, 'Hair_hijab'].map((n) => MeshBuilder.CreateBox(`${n}_c9`, {}, s));
    applyHairStyle(meshes, 'Hijab');
    expect(meshes.filter((m) => m.isVisible).map((m) => m.name)).toEqual(['Hair_hijab_c9']);
  });
  it('Bald still shows nothing; a body with no hair nodes is untouched', () => {
    const s = new Scene(new NullEngine());
    const meshes = kitNodes.map((n) => MeshBuilder.CreateBox(`${n}_c9`, {}, s));
    applyHairStyle(meshes, 'Bald');
    expect(meshes.some((m) => m.isVisible)).toBe(false);
    expect(applyHairStyle([MeshBuilder.CreateBox('Body', {}, s)], 'Hijab')).toBe(0);
  });
});
