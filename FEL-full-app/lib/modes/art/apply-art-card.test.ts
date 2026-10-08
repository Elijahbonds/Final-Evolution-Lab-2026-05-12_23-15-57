// PIPELINES (owner, 2026-10-06): an art card lands on meshes the game really builds. The old map named board_deck,
// court_floor and jersey_mesh (none exist) and `ground` (the board run's world floor), so only the wrong mesh matched.
import { describe, expect, it } from 'vitest';
import { MeshBuilder, NullEngine, Scene, StandardMaterial } from '@babylonjs/core';
import {
  COURT_DECAL_NAME, COURT_DECAL_SHARE, SURFACE_MESHES, applyActiveArtSkins, applyArtCardToSurface,
} from './apply-art-card';
import { buildSkateDeck } from '@/lib/babylon/visual/deckMesh';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const scene = () => new Scene(new NullEngine());
const texName = (m: { material: unknown }) => ((m.material as StandardMaterial | null)?.diffuseTexture as { url?: string } | null)?.url;

describe('board: the real skate deck', () => {
  it('paints the grip (top) and the slab under it, not the invisible rig box', () => {
    const s = scene();
    const box = MeshBuilder.CreateBox('board', {}, s);
    buildSkateDeck(box, '#ff0000');
    expect(applyArtCardToSurface(s, PNG, 'board')).toBe('deck_grip');
    expect(texName(s.getMeshByName('deck_grip')!)).toBe(PNG);
    expect(texName(s.getMeshByName('deck_slab')!)).toBe(PNG);
    expect(texName(box)).toBeUndefined();
    s.dispose();
  });
  it('a snow/surf rig (no built deck) takes it on the board box; nothing named board_deck is needed', () => {
    const s = scene();
    const box = MeshBuilder.CreateBox('board', {}, s);
    expect(applyArtCardToSurface(s, PNG, 'board')).toBe('board');
    expect(texName(box)).toBe(PNG);
    s.dispose();
  });
});

describe('court: a centre-court decal on the court plane', () => {
  it('lays a square decal at the centre of venue_ground, just above it, and keeps the floor material', () => {
    const s = scene();
    const ground = MeshBuilder.CreateGround('venue_ground', { width: 15, height: 28 }, s);
    ground.position.set(2, 0.1, -3);
    const floorMat = new StandardMaterial('floor', s);
    ground.material = floorMat;
    expect(applyArtCardToSurface(s, PNG, 'court')).toBe('venue_ground');
    expect(ground.material).toBe(floorMat);   // lines and paint stay
    const decal = s.getMeshByName(COURT_DECAL_NAME)!;
    expect(decal.isPickable).toBe(false);
    expect(decal.position.x).toBeCloseTo(2, 5);
    expect(decal.position.z).toBeCloseTo(-3, 5);
    expect(decal.position.y).toBeGreaterThan(0.1);
    expect(decal.position.y).toBeLessThan(0.12);
    decal.computeWorldMatrix(true);
    expect(decal.getBoundingInfo().boundingBox.extendSizeWorld.x * 2).toBeCloseTo(15 * COURT_DECAL_SHARE, 3);
    expect(texName(decal)).toBe(PNG);
    s.dispose();
  });
  it('a re-apply replaces the decal instead of stacking a second', () => {
    const s = scene();
    MeshBuilder.CreateGround('venue_ground', { width: 15, height: 28 }, s);
    applyArtCardToSurface(s, PNG, 'court');
    applyArtCardToSurface(s, PNG, 'court');
    expect(s.meshes.filter((m) => m.name === COURT_DECAL_NAME)).toHaveLength(1);
    s.dispose();
  });
  it('the board run\'s world floor (`ground`) is never taken for a court any more', () => {
    const s = scene();
    const g = MeshBuilder.CreateGround('ground', { width: 50, height: 50 }, s);
    expect(applyArtCardToSurface(s, PNG, 'court')).toBe(null);
    expect(g.material).toBeNull();
    expect(SURFACE_MESHES.court).not.toContain('ground');
    s.dispose();
  });
});

describe('applyActiveArtSkins: the hosts\' one-line hook', () => {
  it('a court host paints only the court card, from the saved skins', () => {
    const s = scene();
    MeshBuilder.CreateGround('venue_ground', { width: 15, height: 28 }, s);
    const box = MeshBuilder.CreateBox('board', {}, s);
    const read = (k: string) => (k === 'court' || k === 'board' ? PNG : null);
    expect(applyActiveArtSkins(s, ['court'], read)).toEqual(['venue_ground']);
    expect(box.material).toBeNull();
    expect(applyActiveArtSkins(s, ['court'], () => null)).toEqual([]);
    s.dispose();
  });
});
