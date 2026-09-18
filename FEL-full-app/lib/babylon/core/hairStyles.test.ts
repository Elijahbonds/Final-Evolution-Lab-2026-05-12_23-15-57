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
    expect(hairNodeFor('Mohawk')).toBe('cap');
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
