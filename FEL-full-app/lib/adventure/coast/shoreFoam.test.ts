// look pass C4 (lane/look-world): the Coast's living sea and shore foam (coast.oceanSurface)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NullEngine, Scene, StandardMaterial } from '@babylonjs/core';
import { COAST_OCEAN_SURFACE, FOAM, foamAlpha, foamAt, mountShoreFoam, shoreFoamGeometry } from './shoreFoam';
import { SEA_Y, terrainY, zonePieces } from './zoneLayout';
import { FEEL_KNOB_BY_ID } from '@/lib/feel-panel/knobs';

describe('coast.oceanSurface (look pass C4)', () => {
  it('the knob: its default is the shipped constant; 0 is the flat sheet', () => {
    const k = FEEL_KNOB_BY_ID.get('coast.oceanSurface')!;
    expect(k.def).toBe(COAST_OCEAN_SURFACE);
    expect(k.min).toBe(0);
  });

  it('the foam peaks just under the waterline and is gone a hand\'s depth either side', () => {
    expect(foamAt(SEA_Y - FOAM.peakUnder)).toBeCloseTo(1, 6);
    expect(foamAt(SEA_Y + 0.5)).toBe(0);
    expect(foamAt(SEA_Y - 0.6)).toBe(0);
    expect(foamAt(SEA_Y)).toBeGreaterThan(0.5);
  });

  it('the foam lies along the real shore: on the waterline, never on dry land or open sea', () => {
    const land = zonePieces().filter((p) => p.kind !== 'sea');
    const g = shoreFoamGeometry(land);
    expect(g.cells).toBeGreaterThan(50);
    expect(g.indices.length).toBe(g.cells * 6);
    for (let i = 0; i < g.positions.length; i += 3) expect(g.positions[i + 1]).toBeCloseTo(SEA_Y + 0.03, 6);
    for (let i = 3; i < g.colors.length; i += 4) { expect(g.colors[i]).toBeGreaterThanOrEqual(0); expect(g.colors[i]).toBeLessThanOrEqual(1); }
    // every quad has a corner near the line: some corner's terrain inside the band
    for (let q = 0; q < g.cells; q++) {
      const near = [0, 1, 2, 3].some((k) => { const v = (q * 4 + k) * 3; return foamAt(terrainY(g.positions[v], g.positions[v + 2])) > 0; });
      expect(near).toBe(true);
    }
    // the same every load
    expect(shoreFoamGeometry(land)).toEqual(g);
  });

  it('a flat shore, synthetic: a ramp from -1 m to +1 m makes one band of foam, at the line', () => {
    const rect = { minX: 0, maxX: 20, minZ: 0, maxZ: 20 };
    const g = shoreFoamGeometry([{ rect, lo: -1, hi: 1 }], (x) => -1 + x / 10);
    const xs = new Set<number>();
    for (let i = 0; i < g.positions.length; i += 3) xs.add(g.positions[i]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(6);
    expect(Math.max(...xs)).toBeLessThanOrEqual(14);
    expect(shoreFoamGeometry([{ rect, lo: 3, hi: 5 }], () => 4).cells).toBe(0);   // high ground: none
  });

  it('the foam breathes between 0.55 and 0.9; the mesh draws after the sea', () => {
    for (let t = 0; t < 20; t += 0.37) { expect(foamAlpha(t)).toBeGreaterThanOrEqual(0.549); expect(foamAlpha(t)).toBeLessThanOrEqual(0.901); }
    const scene = new Scene(new NullEngine());
    const f = mountShoreFoam(scene, null, null);
    expect(f.mesh).not.toBeNull();
    expect(f.mesh!.alphaIndex).toBe(1001);
    expect(f.mesh!.hasVertexAlpha).toBe(true);
    for (let i = 0; i < 10; i++) f.update(0.1);   // a frame's step is capped at 0.1 s
    expect((f.mesh!.material as StandardMaterial).alpha).toBeCloseTo(foamAlpha(1), 6);
    f.dispose();
    expect(scene.getMeshByName('coast_foam')).toBeNull();
    scene.dispose();
  });

  it('off builds nothing: the zone view only shades and foams with the knob on', () => {
    const view = readFileSync('lib/adventure/coast/zoneView.ts', 'utf8');
    expect(view).toContain('const oceanSh = opts.ocean ? oceanShade(seaMat');
    expect(view).toContain('const foam: ShoreFoam | null = opts.ocean ? mountShoreFoam(scene, root, sea) : null;');
    const mode = readFileSync('lib/babylon/modes/CoastZoneMode.ts', 'utf8');
    expect(mode).toContain("feel('coast.oceanSurface', COAST_OCEAN_SURFACE) >= 0.5 ? ");
  });
});
