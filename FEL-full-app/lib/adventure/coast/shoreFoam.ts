/**
 * THE COAST'S SEA, ALIVE (look pass C4, lane/look-world, 2026-11-24; docs/LOOK-PASS-AUDIT.md finding 16).
 *
 * Measured before: the Coast's sea read as a flat cyan sheet — no glints, no foam where it meets the sand, no change with distance
 * (look-audit shots/b1-landscape-coast-d-play.jpg). `coast.oceanSurface` 1 gives it what ships, no new files:
 *   the water   the sea plane keeps its material and its scrolling wave normals, takes its own colour (#1C6F88) as the linear
 *               albedo a PBR surface expects (handed in as the raw hex it drew bright cyan: the story's colour-space lift, C1), and borrows the surf break's ocean shading
 *               (visual/OceanSurface.ts oceanShade: the small chop bending the light, and the sea fading toward the sky with
 *               distance; the sun's glitter path on a desktop only — OceanSurface's own phone rule). No vertex displacement: the
 *               plane is one quad, and the zone's wading and turn-back read SEA_Y, which stays true.
 *   the shore   a foam line where the water meets the sand: one mesh over the zone's shallows, a 2 m grid only where the terrain
 *               is within a hand's depth of the waterline, its strength in the vertex colour's alpha (strongest a few centimetres
 *               under the line, broken up by a fixed noise so it reads as wash, not a painted stripe), breathing slowly in and
 *               out (one material alpha, no per-frame geometry). Drawn after the sea.
 * 0 = the flat sheet, exactly as before (nothing here is built).
 */

import { Color3, Mesh, StandardMaterial, VertexData, type Scene, type TransformNode } from '@babylonjs/core';
import { SEA_Y, terrainY, zonePieces, type Piece } from './zoneLayout';

/** coast.oceanSurface: 1 = the living sea and the shore foam; 0 = the flat sheet as before. Ships per the look pass's bar. */
export const COAST_OCEAN_SURFACE = 0;

/** The foam's shape: the grid step (m), the depth the line peaks at (m under the waterline), its half-width in height (m). [TUNE] new */
export const FOAM = { step: 2, peakUnder: 0.08, halfBand: 0.22 } as const;

/** Foam strength 0..1 at a terrain height `h` above the sea (pure): peaks just under the line, gone a hand's depth either side. */
export function foamAt(h: number): number {
  return Math.max(0, 1 - Math.abs(h - SEA_Y + FOAM.peakUnder) / FOAM.halfBand);
}

/** A fixed value noise in [0, 1) (no generator: the shore looks the same every load). */
function hash(a: number, b: number): number { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); }
function noise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export interface FoamGeometry { positions: number[]; colors: number[]; indices: number[]; cells: number }

/**
 * The foam's geometry over the given pieces (pure): every grid cell whose corners straddle the foam band gets a quad at the
 * waterline, each corner's alpha its foam strength × a fixed noise. `height` is the terrain (zoneLayout.terrainY in the game).
 */
export function shoreFoamGeometry(pieces: readonly Pick<Piece, 'rect' | 'lo' | 'hi'>[], height: (x: number, z: number) => number = terrainY): FoamGeometry {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const s = FOAM.step, y = SEA_Y + 0.03;   // a hair over the water, so the sea never covers it
  let cells = 0;
  for (const p of pieces) {
    // a piece that never reaches the band has no shore (all sea floor, or all high ground)
    if (p.hi < SEA_Y - FOAM.peakUnder - FOAM.halfBand || p.lo > SEA_Y - FOAM.peakUnder + FOAM.halfBand) continue;
    for (let x = p.rect.minX; x < p.rect.maxX - 1e-6; x += s) for (let z = p.rect.minZ; z < p.rect.maxZ - 1e-6; z += s) {
      const corners: [number, number][] = [[x, z], [x + s, z], [x + s, z + s], [x, z + s]];
      const a = corners.map(([cx, cz]) => foamAt(height(cx, cz)) * (0.45 + 0.55 * noise(cx * 0.35, cz * 0.35)));
      if (a.every((v) => v <= 0.02)) continue;
      const base = positions.length / 3;
      corners.forEach(([cx, cz], k) => { positions.push(cx, y, cz); colors.push(1, 1, 1, Math.min(1, a[k])); });
      indices.push(base, base + 2, base + 1, base, base + 3, base + 2);   // facing up (Babylon's left-handed winding)
      cells++;
    }
  }
  return { positions, colors, indices, cells };
}

/** How the foam breathes: the material's alpha at time t (s) (pure): 0.55..0.9 over a slow swell. */
export function foamAlpha(t: number): number {
  return 0.725 + 0.175 * Math.sin(t * 0.9);
}

export interface ShoreFoam { update(dt: number): void; dispose(): void; readonly mesh: Mesh | null }

/** Build the shore foam over the zone's land pieces (one mesh, one material). `sea` is drawn first (its alphaIndex is set below). */
export function mountShoreFoam(scene: Scene, parent: TransformNode | null, sea: Mesh | null): ShoreFoam {
  const g = shoreFoamGeometry(zonePieces().filter((p) => p.kind !== 'sea'));
  if (!g.cells) return { mesh: null, update: () => {}, dispose: () => {} };
  const mesh = new Mesh('coast_foam', scene);
  const vd = new VertexData();
  vd.positions = g.positions; vd.indices = g.indices; vd.colors = g.colors;
  vd.normals = g.positions.map((_, i) => (i % 3 === 1 ? 1 : 0));
  vd.applyToMesh(mesh, false);
  mesh.hasVertexAlpha = true;
  const mat = new StandardMaterial('coast_foam_mat', scene);
  mat.diffuseColor = Color3.Black(); mat.specularColor = Color3.Black();
  mat.emissiveColor = new Color3(0.93, 0.97, 1);   // foam is its own light: it never goes grey in a shadow
  mat.disableLighting = true;
  mat.backFaceCulling = false;   // a flat sheet seen from above: either winding draws
  mat.alpha = foamAlpha(0);
  mesh.material = mat; mesh.isPickable = false; mesh.receiveShadows = false;
  if (parent) mesh.parent = parent;
  mesh.freezeWorldMatrix();
  // the sea first, then the foam over it (both see-through: Babylon sorts by alphaIndex before distance)
  if (sea) sea.alphaIndex = 1000;
  mesh.alphaIndex = 1001;
  let t = 0;
  return {
    mesh,
    update(dt) { t += Math.max(0, Math.min(0.1, dt)); mat.alpha = foamAlpha(t); },
    dispose() { mesh.dispose(); mat.dispose(); },
  };
}

/** The colour the far sea fades toward (the zone's haze over the water), and the fade's start and end (m from the eye). [TUNE] new;
 *  the colour is a look call (the owner's): a pale sea-haze between the water and the sky. */
export const OCEAN_LOOK = { foam: '#F2FAFF', horizon: '#8FC3CF', fade: [150, 255] as [number, number] } as const;