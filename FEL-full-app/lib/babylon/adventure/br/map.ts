/**
 * The first Battle Royale map (ADVENTURE PLAN Phase C: "about 320 × 320 m (5 × 5 pieces) for 12–16 fighters, with rail
 * loops between landmarks so traversal is a weapon"). Assembled from world/pieces/brTiles.ts tiles on a 5 × 5 grid:
 *
 *        x: −160 ─────────────────────────────── +160
 *   z +160  tower   grove   ruins   grove   mesa
 *           grove   field   ruins   field   grove
 *           ruins   ruins   PLAZA   ruins   ruins
 *           grove   field   ruins   field   grove
 *   z −160  mesa    grove   ruins   grove   tower
 *
 * THE RAILS run on the streets between tiles (every tile keeps its edges clear): an outer LOOP round the four corner
 * landmarks (four straights on the lines x = ±96 and z = ±96, joined by smooth corners, linked end to end so a rider
 * can lap it), a parallel FAST LANE beside the south straight with switches both ways, and four SPOKES from the plaza's
 * corners out toward the loop. 1.2 m up, as the sandbox's: a jump catches them.
 *
 * THE WORLD SOURCE answers `groundY` and `clear` from a 16 m grid of the pieces, not a scan of all of them (the map has
 * about 120 pieces and the bots ask for line of sight often), with no allocation per query.
 *
 * Pure: no Babylon, no randomness. The map is the same map every match; the seed only moves the zone and the loot.
 */

import type { AdventureWorld, RailNetwork, RailSegment, Vec3, WallSegment } from '../contracts';
import { validateRailNetwork } from '../contracts';
import { addParallelSwitches, linkEnds } from '../rails/adapters';
import type { WorldSource } from '../host/hostWorld';
import { block, flat, pieceY, segmentHitsBlock, type BlockPiece, type GroundPiece } from '../world/pieces';
import { BR_TILE_M, buildBRTile, validateBRTile, type BRLandmark, type BRLootTable, type BRTile, type BRTileKind } from '../world/pieces/brTiles';

export const BR_MAP_HALF = 160;
export const BR_RAIL_Y = 1.2;
const GRID = 5;

/** The 5 × 5 layout, row by row from z = −160 (j = 0) to z = +160 (j = 4), x from −160 (i = 0). */
export const BR_LAYOUT: readonly (readonly BRTileKind[])[] = [
  ['mesa', 'grove', 'ruins', 'grove', 'tower'],
  ['grove', 'field', 'ruins', 'field', 'grove'],
  ['ruins', 'ruins', 'plaza', 'ruins', 'ruins'],
  ['grove', 'field', 'ruins', 'field', 'grove'],
  ['tower', 'grove', 'ruins', 'grove', 'mesa'],
];

/** [PLACEHOLDER] landmark names, by tile (the owner names them). */
const LANDMARK_NAMES: Readonly<Record<string, string>> = {
  '22': '[PLACEHOLDER] The Monument', '00': '[PLACEHOLDER] South-West Mesa', '40': '[PLACEHOLDER] South-East Spire',
  '04': '[PLACEHOLDER] North-West Spire', '44': '[PLACEHOLDER] North-East Mesa',
};

export interface BRMap {
  id: string;
  tiles: BRTile[];
  pieces: GroundPiece[];
  blocks: BlockPiece[];
  rails: RailNetwork;
  walls: WallSegment[];
  bounds: NonNullable<AdventureWorld['bounds']>;
  landmarks: BRLandmark[];
  /** Floor loot spots (y = the ground there) and chests. */
  loot: { pos: Vec3; table: BRLootTable }[];
  chests: Vec3[];
}

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/** A smooth quarter turn from the end of one straight to the start of the next, `r` metres in radius. */
function corner(cx: number, cz: number, r: number, fromDeg: number, y: number): Vec3[] {
  const pts: Vec3[] = [];
  for (let k = 0; k <= 4; k++) {
    const a = ((fromDeg + k * 22.5) * Math.PI) / 180;
    pts.push(v(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r));
  }
  return pts;
}

/** The loop, the fast lane and the spokes. */
export function brRails(): RailNetwork {
  const y = BR_RAIL_Y, R = 96, r = 14, s = R - r;
  // the loop runs counter-clockwise seen from above: south straight east-bound, east straight north-bound, …
  const loop: RailSegment[] = [
    { id: 'loop.s', points: [v(-s, y, -R), v(s, y, -R)], speedBias: 0, switches: [] },
    { id: 'loop.se', points: corner(s, -s, r, 270, y), smooth: true, speedBias: 1.5, minSpeed: 8, switches: [] },
    { id: 'loop.e', points: [v(R, y, -s), v(R, y, s)], speedBias: 0, switches: [] },
    { id: 'loop.ne', points: corner(s, s, r, 0, y), smooth: true, speedBias: 1.5, minSpeed: 8, switches: [] },
    { id: 'loop.n', points: [v(s, y, R), v(-s, y, R)], speedBias: 0, switches: [] },
    { id: 'loop.nw', points: corner(-s, s, r, 90, y), smooth: true, speedBias: 1.5, minSpeed: 8, switches: [] },
    { id: 'loop.w', points: [v(-R, y, s), v(-R, y, -s)], speedBias: 0, switches: [] },
    { id: 'loop.sw', points: corner(-s, -s, r, 180, y), smooth: true, speedBias: 1.5, minSpeed: 8, switches: [] },
  ];
  const segs: RailSegment[] = [
    ...linkEnds(loop, 0.05),
    // the fast lane: 3 m inside the south straight, a booster (switch onto it for speed)
    { id: 'fast.s', points: [v(-60, y, -R + 3), v(60, y, -R + 3)], speedBias: 2.5, switches: [], tags: ['booster'] },
    // the spokes: plaza corners out toward the loop (they end short of it; hop off, or jump the gap)
    { id: 'spoke.n', points: [v(32, y, 34), v(32, y, 84)], speedBias: 1, switches: [] },
    { id: 'spoke.s', points: [v(-32, y, -34), v(-32, y, -84)], speedBias: 1, switches: [] },
    { id: 'spoke.e', points: [v(34, y, -32), v(84, y, -32)], speedBias: 1, switches: [] },
    { id: 'spoke.w', points: [v(-34, y, 32), v(-84, y, 32)], speedBias: 1, switches: [] },
  ];
  return addParallelSwitches({ id: 'br.rails', segments: segs }, { minGapM: 2, maxGapM: 4, everyM: 10, windowM: 2 });
}

export function buildBRMap(): BRMap {
  const tiles: BRTile[] = [];
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const kind = BR_LAYOUT[j][i];
      const minX = -BR_MAP_HALF + i * BR_TILE_M, minZ = -BR_MAP_HALF + j * BR_TILE_M;
      tiles.push(buildBRTile(kind, i, j, minX, minZ, LANDMARK_NAMES[`${i}${j}`] ?? ''));
    }
  }
  const H = BR_MAP_HALF;
  const ground = flat('br.ground', -H, H, -H, H, 0);
  // the rim: a 4 m wall round the map so nobody walks off the world (the storm does the rest)
  const rim = [
    block('br.rim.s', -H, H, -H, -H + 1, 4), block('br.rim.n', -H, H, H - 1, H, 4),
    block('br.rim.w', -H, -H + 1, -H, H, 4), block('br.rim.e', H - 1, H, -H, H, 4),
  ];
  const pieces: GroundPiece[] = [ground, ...rim, ...tiles.flatMap((t) => t.pieces)];
  const blocks = pieces.filter((p): p is BlockPiece => p.kind === 'block');
  const map: BRMap = {
    id: 'br.map.1',
    tiles,
    pieces,
    blocks,
    rails: brRails(),
    walls: tiles.flatMap((t) => t.walls),
    bounds: { minX: -H + 2, maxX: H - 2, minZ: -H + 2, maxZ: H - 2 },
    landmarks: tiles.map((t) => t.landmark).filter((l): l is BRLandmark => !!l),
    loot: [],
    chests: [],
  };
  // the spots stand on the ground as built (an authored y is only a hint)
  const idx = new PieceIndex(pieces);
  for (const t of tiles) {
    for (const l of t.loot) map.loot.push({ pos: v(l.pos.x, idx.groundY(l.pos.x, l.pos.z) ?? 0, l.pos.z), table: l.table });
    for (const c of t.chests) map.chests.push(v(c.x, idx.groundY(c.x, c.z) ?? 0, c.z));
  }
  return map;
}

/** Authoring lint for the map: tiles, rails, every spot on solid ground and inside the bounds. Empty = valid. */
export function validateBRMap(m: BRMap): string[] {
  const errs = [...validateRailNetwork(m.rails)];
  for (const t of m.tiles) errs.push(...validateBRTile(t));
  const idx = new PieceIndex(m.pieces);
  const b = m.bounds;
  for (const s of [...m.loot.map((l) => l.pos), ...m.chests]) {
    const g = idx.groundY(s.x, s.z);
    if (g === null || Math.abs(g - s.y) > 0.01) errs.push(`a spot at (${s.x.toFixed(1)}, ${s.z.toFixed(1)}) is not on the ground`);
    if (s.x < b.minX || s.x > b.maxX || s.z < b.minZ || s.z > b.maxZ) errs.push('a spot outside the bounds');
  }
  // a rail must not run through a block (the streets are clear)
  for (const seg of m.rails.segments) {
    for (let k = 1; k < seg.points.length; k++) {
      for (const bl of m.blocks) if (!bl.id.startsWith('br.rim') && segmentHitsBlock(seg.points[k - 1], seg.points[k], bl)) errs.push(`${seg.id} runs through ${bl.id}`);
    }
  }
  if (m.landmarks.length < 5) errs.push('fewer than five landmarks');
  return errs;
}

// ── The world source: a grid of the pieces ────────────────────────────────────────────────────────────────────────

/** Cell edge for the piece index, metres. [TUNE] */
export const PIECE_CELL_M = 16;

/**
 * The pieces bucketed by 16 m cell. `groundY` reads one cell; `clear` tests the blocks in the cells the segment's
 * box covers, each block once (a stamp per block, no Set). No allocation per query.
 */
export class PieceIndex {
  private readonly cells = new Map<number, GroundPiece[]>();
  private readonly blockCells = new Map<number, number[]>();
  private readonly blocks: BlockPiece[] = [];
  private readonly stamp: Uint32Array;
  private stampAt = 0;
  /** Pieces covering the whole map (the base ground): asked everywhere, not bucketed. */
  private readonly everywhere: GroundPiece[] = [];

  constructor(pieces: readonly GroundPiece[], readonly cellM = PIECE_CELL_M) {
    for (const p of pieces) {
      const span = Math.max(p.maxX - p.minX, p.maxZ - p.minZ);
      if (span > 200 && p.kind !== 'block') { this.everywhere.push(p); continue; }
      const bi = p.kind === 'block' ? this.blocks.push(p) - 1 : -1;
      for (let ix = Math.floor(p.minX / cellM); ix <= Math.floor(p.maxX / cellM); ix++) {
        for (let iz = Math.floor(p.minZ / cellM); iz <= Math.floor(p.maxZ / cellM); iz++) {
          const k = key(ix, iz);
          let c = this.cells.get(k);
          if (!c) { c = []; this.cells.set(k, c); }
          c.push(p);
          if (bi >= 0) {
            let bc = this.blockCells.get(k);
            if (!bc) { bc = []; this.blockCells.set(k, bc); }
            bc.push(bi);
          }
        }
      }
    }
    this.stamp = new Uint32Array(this.blocks.length);
  }

  groundY(x: number, z: number): number | null {
    let best: number | null = null;
    for (const p of this.everywhere) {
      const y = pieceY(p, x, z);
      if (y !== null && (best === null || y > best)) best = y;
    }
    const c = this.cells.get(key(Math.floor(x / this.cellM), Math.floor(z / this.cellM)));
    if (c) {
      for (const p of c) {
        const y = pieceY(p, x, z);
        if (y !== null && (best === null || y > best)) best = y;
      }
    }
    return best;
  }

  clear(a: Vec3, b: Vec3): boolean {
    this.stampAt = (this.stampAt + 1) >>> 0;
    if (this.stampAt === 0) { this.stamp.fill(0); this.stampAt = 1; }
    const s = this.stampAt;
    const x0 = Math.floor(Math.min(a.x, b.x) / this.cellM), x1 = Math.floor(Math.max(a.x, b.x) / this.cellM);
    const z0 = Math.floor(Math.min(a.z, b.z) / this.cellM), z1 = Math.floor(Math.max(a.z, b.z) / this.cellM);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const bc = this.blockCells.get(key(ix, iz));
        if (!bc) continue;
        for (const bi of bc) {
          if (this.stamp[bi] === s) continue;
          this.stamp[bi] = s;
          const bl = this.blocks[bi];
          if (!bl.off && segmentHitsBlock(a, b, bl)) return false;
        }
      }
    }
    return true;
  }
}

const SPAN = 1 << 12;
function key(ix: number, iz: number): number { return (ix + (SPAN >> 1)) * SPAN + (iz + (SPAN >> 1)); }

/** The host's view of the map (contracts.AdventureWorld's ground, sight, rails, walls and sides). */
export function brWorldSource(map: BRMap): WorldSource & { index: PieceIndex } {
  const index = new PieceIndex(map.pieces);
  return {
    index,
    groundY: (x, z) => index.groundY(x, z),
    clear: (a, b) => index.clear(a, b),
    rails: map.rails,
    walls: map.walls,
    bounds: map.bounds,
  };
}
