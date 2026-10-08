// The first BR map (ADVENTURE PLAN Phase C: "about 320 × 320 m from 64 m world pieces (5 × 5), landmarks with rail
// loops between them"): the layout, the pieces' lint, the rails, and the grid-indexed world source answering exactly
// what A4's linear piece scan answers.
import { describe, expect, it } from 'vitest';
import { validateRailNetwork } from '../contracts';
import { clearBetween, groundYOf } from '../world/pieces';
import { BR_TILE_M } from '../world/pieces/brTiles';
import { BR_MAP_HALF, buildBRMap, brWorldSource, validateBRMap } from './map';
import { seededRng } from './rng';

describe('the BR map', () => {
  const map = buildBRMap();

  it('is 5 × 5 tiles of 64 m: 320 m a side, with five landmarks', () => {
    expect(map.tiles).toHaveLength(25);
    expect(BR_TILE_M * 5).toBe(320);
    expect(BR_MAP_HALF * 2).toBe(320);
    expect(map.landmarks).toHaveLength(5);
    expect(map.landmarks.every((l) => l.name.startsWith('[PLACEHOLDER]'))).toBe(true);
    expect(new Set(map.tiles.map((t) => t.kind))).toEqual(new Set(['plaza', 'tower', 'mesa', 'ruins', 'grove', 'field']));
  });

  it('lints clean: tiles inside their streets, spots on the ground, rails valid and through no block', () => {
    expect(validateBRMap(map)).toEqual([]);
    expect(validateRailNetwork(map.rails)).toEqual([]);
  });

  it('the loop is a closed rail circuit round the corner landmarks, with a switchable fast lane and the spokes', () => {
    const byId = new Map(map.rails.segments.map((s) => [s.id, s]));
    const order = ['loop.s', 'loop.se', 'loop.e', 'loop.ne', 'loop.n', 'loop.nw', 'loop.w', 'loop.sw'];
    order.forEach((id, i) => expect(byId.get(id)?.next, id).toBe(order[(i + 1) % order.length]));
    expect(map.rails.segments.some((s) => s.switches.some((w) => w.toSegment === 'fast.s'))).toBe(true);
    expect(byId.get('fast.s')!.switches.some((w) => w.toSegment === 'loop.s')).toBe(true);
    expect(['spoke.n', 'spoke.s', 'spoke.e', 'spoke.w'].every((id) => byId.has(id))).toBe(true);
    // every corner landmark lies within 60 m of the loop
    for (const l of map.landmarks.filter((x) => Math.abs(x.pos.x) > 64)) {
      const d = Math.min(Math.abs(Math.abs(l.pos.x) - 96), Math.abs(Math.abs(l.pos.z) - 96));
      expect(d).toBeLessThan(60);
    }
  });

  it('has loot spots and chests across the map, rarer ones at the landmarks', () => {
    expect(map.loot.length).toBeGreaterThan(80);
    expect(map.chests.length).toBeGreaterThanOrEqual(10);
    expect(map.loot.filter((l) => l.table === 'landmark').length).toBeGreaterThan(20);
  });

  it('the indexed world source answers as A4\'s linear scan does (ground and sight), on 4,000 random queries', () => {
    const src = brWorldSource(map);
    const rng = seededRng(17);
    const r = () => (rng() * 2 - 1) * (BR_MAP_HALF + 4);
    for (let i = 0; i < 2000; i++) {
      const x = r(), z = r();
      expect(src.groundY(x, z)).toBe(groundYOf(map.pieces, x, z));
    }
    for (let i = 0; i < 2000; i++) {
      const a = { x: r(), y: rng() * 12, z: r() };
      const len = rng() * 70;
      const ang = rng() * Math.PI * 2;
      const b = { x: a.x + Math.sin(ang) * len, y: rng() * 12, z: a.z + Math.cos(ang) * len };
      expect(src.clear(a, b)).toBe(clearBetween(map.pieces, a, b));
    }
  });

  it('the monument blocks the view across the plaza (the world hides fighters)', () => {
    const src = brWorldSource(map);
    expect(src.clear({ x: -10, y: 1.5, z: 0 }, { x: 10, y: 1.5, z: 0 })).toBe(false);
    expect(src.clear({ x: -10, y: 1.5, z: -20 }, { x: 10, y: 1.5, z: -20 })).toBe(true);
  });
});
