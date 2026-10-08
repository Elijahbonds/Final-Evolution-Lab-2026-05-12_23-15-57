/**
 * World pieces for the first Battle Royale map (ADVENTURE PLAN Phase C, "The map": "Built from the same world pieces
 * as the story: 64 m pieces on a grid, the first BR map about 320 × 320 m (5 × 5 pieces)"). A NEW piece file beside
 * A4's (world/pieces.ts stays as A4 wrote it; this file only uses its builders).
 *
 * A TILE is one 64 m footprint: its ground pieces, its run-walls, where loot lies and chests stand, and its landmark,
 * all authored in LOCAL metres (0..64 on x and z) and shifted to the tile's corner by `buildBRTile`. Every tile keeps a
 * MARGIN clear along its edges: the map's rails run on the tile boundaries (the streets), so a rail never passes
 * through a wall.
 *
 *   plaza   the middle: a low dais, a tall monument (the landmark the whole map sees), cover walls, two chests
 *   tower   a corner landmark: a tall tower and a ramp up to a lookout with a chest
 *   mesa    a corner landmark: a ramp up to a plateau with a chest
 *   ruins   broken walls: cover, sight-blockers and run-walls
 *   grove   a stand of trunks: sight-blockers, close fights
 *   field   open ground with a few rocks
 *
 * Pure data: no Babylon, no randomness (variation comes from the tile's grid position, so the map is the same map
 * every time). Names are [PLACEHOLDER]; numbers [TUNE].
 */

import type { Vec3, WallSegment } from '../../contracts';
import { block, ramp, type GroundPiece } from '../pieces';

/** A tile's edge, metres (the plan's world piece). */
export const BR_TILE_M = 64;
/** Kept clear along every tile edge: the streets where the rails run. [TUNE] */
export const BR_TILE_MARGIN = 7;

export type BRTileKind = 'plaza' | 'tower' | 'mesa' | 'ruins' | 'grove' | 'field';
export type BRLootTable = 'field' | 'landmark';

export interface BRLandmark { id: string; name: string; pos: Vec3; heightM: number }

export interface BRTile {
  kind: BRTileKind;
  id: string;
  minX: number;
  minZ: number;
  pieces: GroundPiece[];
  walls: WallSegment[];
  loot: { pos: Vec3; table: BRLootTable }[];
  chests: Vec3[];
  landmark: BRLandmark | null;
}

/** A small deterministic wobble from the tile's grid position, −1..1 (no generator: the map is fixed). */
function wobble(i: number, j: number, k: number): number {
  const s = Math.sin(i * 12.9898 + j * 78.233 + k * 37.719) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/**
 * One tile at grid (i, j), its corner at (minX, minZ). `landmarkName` names the landmark of a landmark tile.
 */
export function buildBRTile(kind: BRTileKind, i: number, j: number, minX: number, minZ: number, landmarkName = ''): BRTile {
  const id = `t${i}${j}`;
  const P = (x: number, y: number, z: number): Vec3 => ({ x: minX + x, y, z: minZ + z });
  const pieces: GroundPiece[] = [];
  const walls: WallSegment[] = [];
  const loot: BRTile['loot'] = [];
  const chests: Vec3[] = [];
  let landmark: BRLandmark | null = null;
  // a block in local coordinates
  const box = (name: string, x0: number, x1: number, z0: number, z1: number, top: number, y0 = 0): GroundPiece => {
    const p = block(`${id}.${name}`, minX + x0, minX + x1, minZ + z0, minZ + z1, top, y0);
    pieces.push(p);
    return p;
  };
  /** A wall you can run along, both faces (MatrixFocus walls: a block plus its two run faces). */
  const runWall = (name: string, x0: number, x1: number, z0: number, z1: number, h: number): void => {
    box(name, x0, x1, z0, z1, h);
    const alongX = x1 - x0 > z1 - z0;
    if (alongX) {
      walls.push({ a: { x: minX + x0, z: minZ + z0 }, b: { x: minX + x1, z: minZ + z0 }, nx: 0, nz: -1, height: h });
      walls.push({ a: { x: minX + x0, z: minZ + z1 }, b: { x: minX + x1, z: minZ + z1 }, nx: 0, nz: 1, height: h });
    } else {
      walls.push({ a: { x: minX + x0, z: minZ + z0 }, b: { x: minX + x0, z: minZ + z1 }, nx: -1, nz: 0, height: h });
      walls.push({ a: { x: minX + x1, z: minZ + z0 }, b: { x: minX + x1, z: minZ + z1 }, nx: 1, nz: 0, height: h });
    }
  };

  switch (kind) {
    case 'plaza': {
      // the dais: a walkable step (under A1's 0.45 m step-up)
      box('dais', 14, 50, 14, 50, 0.4);
      // the monument: the map's tallest thing, seen from every corner
      box('monument', 28.5, 35.5, 28.5, 35.5, 26, 0.4);
      landmark = { id: `${id}.monument`, name: landmarkName, pos: P(32, 0.4, 32), heightM: 26 };
      // four cover walls round it, each a run-wall
      runWall('cover.n', 24, 40, 42, 43, 2.6);
      runWall('cover.s', 24, 40, 21, 22, 2.6);
      runWall('cover.e', 42, 43, 24, 40, 2.6);
      runWall('cover.w', 21, 22, 24, 40, 2.6);
      chests.push(P(18, 0.4, 18), P(46, 0.4, 46));
      for (const [x, z] of [[18, 46], [46, 18], [32, 17], [32, 47], [17, 32], [47, 32]]) loot.push({ pos: P(x, 0.4, z), table: 'landmark' });
      break;
    }
    case 'tower': {
      box('tower', 24, 36, 24, 36, 24);
      // the ramp up its east side to a lookout at 10 m (a 25% grade: a climb, not a cliff)
      pieces.push(ramp(`${id}.ramp`, minX + 39, minX + 45, minZ + 12, minZ + 50, 'z', 0, 10));
      box('lookout', 37, 50, 50, 57, 10);
      landmark = { id: `${id}.tower`, name: landmarkName, pos: P(30, 0, 30), heightM: 24 };
      chests.push(P(44, 10, 54));
      for (const [x, z] of [[14, 14], [14, 46], [50, 14], [20, 52], [30, 16]]) loot.push({ pos: P(x, 0, z), table: 'landmark' });
      loot.push({ pos: P(40, 10, 54), table: 'landmark' });
      break;
    }
    case 'mesa': {
      pieces.push(ramp(`${id}.ramp`, minX + 22, minX + 42, minZ + 10, minZ + 30, 'z', 0, 8));
      box('plateau', 14, 50, 30, 54, 8);
      landmark = { id: `${id}.mesa`, name: landmarkName, pos: P(32, 8, 42), heightM: 8 };
      chests.push(P(32, 8, 46));
      for (const [x, z] of [[20, 36], [44, 36], [20, 50], [44, 50]]) loot.push({ pos: P(x, 8, z), table: 'landmark' });
      for (const [x, z] of [[12, 14], [52, 14]]) loot.push({ pos: P(x, 0, z), table: 'field' });
      break;
    }
    case 'ruins': {
      const w = (k: number) => wobble(i, j, k) * 3;
      runWall('wall.a', 12 + w(1), 34 + w(1), 16, 17, 3.2);
      runWall('wall.b', 30 + w(2), 52 + w(2), 46, 47, 3.2);
      runWall('wall.c', 46, 47, 14 + w(3), 32 + w(3), 2.8);
      runWall('wall.d', 16, 17, 30 + w(4), 50 + w(4), 2.8);
      box('rubble', 28, 34, 28, 34, 1.2);
      for (const [x, z] of [[22, 24], [40, 38], [24, 40], [40, 24], [31, 40]]) loot.push({ pos: P(x, 0, z), table: 'field' });
      if ((i + j) % 2 === 0) chests.push(P(38, 0, 30));
      break;
    }
    case 'grove': {
      // trunks on a jittered grid: sight-blockers you fight between
      for (let a = 0; a < 3; a++) {
        for (let b = 0; b < 3; b++) {
          const x = 16 + a * 16 + wobble(i, j, a * 3 + b) * 4, z = 16 + b * 16 + wobble(j, i, a * 5 + b) * 4;
          box(`trunk.${a}${b}`, x - 0.6, x + 0.6, z - 0.6, z + 0.6, 7);
        }
      }
      for (const [x, z] of [[24, 24], [40, 40], [24, 40], [40, 24]]) loot.push({ pos: P(x + wobble(i, j, x) * 2, 0, z), table: 'field' });
      break;
    }
    case 'field': {
      box('rock.a', 18, 21, 40, 43, 1.6);
      box('rock.b', 42, 46, 20, 23, 1.4);
      for (const [x, z] of [[32, 32], [20, 22], [46, 44]]) loot.push({ pos: P(x, 0, z), table: 'field' });
      break;
    }
  }
  return { kind, id, minX, minZ, pieces, walls, loot, chests, landmark };
}

/** Authoring lint for one tile: nothing inside the street margin, every spot inside the tile. Empty = valid. */
export function validateBRTile(t: BRTile): string[] {
  const errs: string[] = [];
  const lo = BR_TILE_MARGIN, hi = BR_TILE_M - BR_TILE_MARGIN;
  for (const p of t.pieces) {
    if (p.minX - t.minX < lo - 1e-6 || p.maxX - t.minX > hi + 1e-6 || p.minZ - t.minZ < lo - 1e-6 || p.maxZ - t.minZ > hi + 1e-6) {
      errs.push(`${p.id}: inside the street margin`);
    }
  }
  for (const s of [...t.loot.map((l) => l.pos), ...t.chests]) {
    const x = s.x - t.minX, z = s.z - t.minZ;
    if (x < 0 || x > BR_TILE_M || z < 0 || z > BR_TILE_M) errs.push(`${t.id}: a spot outside the tile`);
  }
  return errs;
}
