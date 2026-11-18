/**
 * THE COAST & ISLANDS — the first open zone, as data (lane/coast-islands, phase A; docs/COAST-ISLANDS-PLAN.md).
 *
 * Owner 2026-11-17: "The first zone is the Coast & Islands". The plan (docs/VENICE-HUB-PLAN.md §3): a 6 × 6 grid of the
 * Adventure's 64 m world pieces (384 m), about 60 % sea, reached from Venice's pier by boat.
 *
 * Pure: no Babylon, no DOM, no randomness (the "wobble" is a fixed function of position, so the zone is the same zone every
 * load). The SIM's ground (zoneWorld.ts) and the VIEW's terrain (zoneView.ts) both read `terrainY`, so what you see is what
 * you stand on.
 *
 * FRAME: the Venice hub's (lib/adventure/venice/layout.ts): metres, x west (−) to east (+), NORTH IS −z, the sea to the west.
 * The zone is centred on the origin. Piece (i, j): column i from the west, row j from the north.
 *
 *   x −192 … 192                     the mainland is the east third: a beach strip facing west over the sea
 *   ┌──────────────────────────┐     Palm Key (the near island) sits off the beach, joined by a boardwalk bridge
 *   │ sea      sea     │ beach │      Reef Rock (the far island) is reached by wading the sandbar from Palm Key
 *   │    Palm Key ═══bridge═══ │     the arrival dock (the boat from Venice) juts out of the beach south of the bridge
 *   │     ╲ sandbar     │ dock │
 *   │  Reef Rock        │      │
 *   └──────────────────────────┘
 *
 * Every name is [PLACEHOLDER] until the owner names it; every number is [TUNE].
 */

export const PIECE_M = 64;
export const ZONE_COLS = 6;
export const ZONE_ROWS = 6;
export const ZONE_MIN_X = -(ZONE_COLS * PIECE_M) / 2;
export const ZONE_MIN_Z = -(ZONE_ROWS * PIECE_M) / 2;
export const ZONE_MAX_X = -ZONE_MIN_X;
export const ZONE_MAX_Z = -ZONE_MIN_Z;

/** The sea's surface (m). */
export const SEA_Y = 0;
/** The open sea floor (m): the deepest the terrain goes. */
export const SEABED_Y = -7;
/** How deep you may wade (m below the surface): deeper water turns you back (zoneWorld). [TUNE] */
export const WADE_DEPTH = 0.85;
/** Every shore's underwater profile: a gentle wading shelf, then a steeper drop to the sea floor. [TUNE] */
const SHELF_SLOPE = 0.09, SHELF_M = 12, DROP_SLOPE = 0.22;
/** The sea floor `d` metres out from a waterline (d < 0). */
function underwater(d: number): number {
  return d > -SHELF_M ? d * SHELF_SLOPE : Math.max(SEABED_Y, -SHELF_M * SHELF_SLOPE + (d + SHELF_M) * DROP_SLOPE);
}

export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }

// ── the landforms ──────────────────────────────────────────────────────────────────────────────────────────────────────

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** The mainland's waterline x at a given z: a gently curving beach. */
export function mainlandShoreX(z: number): number {
  return 70 + 8 * Math.sin(z / 37) + 4 * Math.sin(z / 13 + 1);
}

/** The mainland's beach profile: `d` metres inland of the waterline (negative = out to sea). */
function beachProfile(d: number): number {
  if (d < 0) return underwater(d);
  // dry sand climbs to the dune line, then the grass back of the beach rolls a little
  return 2.6 * smooth(0, 40, d) + 0.8 * smooth(55, 90, d);
}

export interface Island {
  id: string;
  name: string;
  /** Centre (m). */
  at: readonly [x: number, z: number];
  /** The waterline's mean radius (m). */
  radius: number;
  /** How far the waterline wanders from a circle (m). */
  wobble: number;
  /** The beach's height at its back edge (m) and the hill on top (m). */
  beach: number;
  hill: number;
  /** How the island is dressed (zoneLayout props). */
  look: 'palms' | 'rocks';
}

export const ISLANDS: readonly Island[] = [
  { id: 'palmkey', name: '[PLACEHOLDER] Palm Key', at: [-40, -40], radius: 34, wobble: 4, beach: 1.6, hill: 3.5, look: 'palms' },
  { id: 'reefrock', name: '[PLACEHOLDER] Reef Rock', at: [-122, 72], radius: 24, wobble: 3, beach: 1.2, hill: 6, look: 'rocks' },
];

/** The island's waterline radius in the direction of (dx, dz). */
export function islandShoreR(isl: Island, dx: number, dz: number): number {
  const a = Math.atan2(dz, dx);
  const k = isl.id.length;   // a fixed phase per island, so the two do not share a shape
  return isl.radius + isl.wobble * (Math.sin(3 * a + k) * 0.6 + Math.sin(5 * a + 2 * k) * 0.4);
}

function islandY(isl: Island, x: number, z: number): number {
  const dx = x - isl.at[0], dz = z - isl.at[1];
  const r = Math.hypot(dx, dz);
  const d = islandShoreR(isl, dx, dz) - r;   // metres inside the waterline
  if (d < 0) return underwater(d);
  return isl.beach * smooth(0, 12, d) + isl.hill * smooth(10, 30, d);
}

/** The sandbar: a shallow ridge from Palm Key's shore to Reef Rock's that you can wade at this zone's low water. */
export const SANDBAR = { from: [-52, -12] as const, to: [-114, 60] as const, crestY: -0.45, halfFlat: 5, fall: 0.25 };

function sandbarY(x: number, z: number): number {
  const [ax, az] = SANDBAR.from, [bx, bz] = SANDBAR.to;
  const vx = bx - ax, vz = bz - az;
  const t = Math.min(1, Math.max(0, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
  const d = Math.hypot(x - (ax + vx * t), z - (az + vz * t));
  return SANDBAR.crestY - Math.max(0, d - SANDBAR.halfFlat) * SANDBAR.fall;
}

/**
 * THE TERRAIN: the height of the land or the sea floor at (x, z), metres. The highest of the mainland, the islands, the
 * sandbar and the open sea floor. Below SEA_Y is under water.
 */
export function terrainY(x: number, z: number): number {
  let y = Math.max(SEABED_Y, beachProfile(x - mainlandShoreX(z)), sandbarY(x, z));
  for (const isl of ISLANDS) { const h = islandY(isl, x, z); if (h > y) y = h; }
  return y;
}

// ── the built things you stand on: the arrival dock and the bridge ──────────────────────────────────────────────────────

export interface Deck extends Rect { id: string; name: string; y: number }

/** The deck height (m): above the water, and within a step of the sand where each deck meets the beach. [TUNE] */
export const DECK_Y = 0.7;

/** Where the dock meets the beach (z) and the bridge's line (z). */
export const DOCK_Z = 24;
export const BRIDGE_Z = -36;

export const DECKS: readonly Deck[] = [
  // the arrival dock: a jetty out from the beach, the boat from Venice moored at its seaward end
  { id: 'dock', name: '[PLACEHOLDER] The Landing', minX: mainlandShoreX(DOCK_Z) - 34, maxX: mainlandShoreX(DOCK_Z) + 12, minZ: DOCK_Z - 2.5, maxZ: DOCK_Z + 2.5, y: DECK_Y },
  // the boardwalk bridge from the beach to Palm Key
  { id: 'bridge', name: '[PLACEHOLDER] The Boardwalk Bridge', minX: -14, maxX: mainlandShoreX(BRIDGE_Z) + 12, minZ: BRIDGE_Z - 1.75, maxZ: BRIDGE_Z + 1.75, y: DECK_Y },
];

/** The deck under (x, z), or null. */
export function deckAt(x: number, z: number): Deck | null {
  for (const d of DECKS) if (x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ) return d;
  return null;
}

/** How high a deck's boards sit above dry sand (m): a boardwalk lying on the beach, one easy step up from the side. */
export const DECK_ON_SAND = 0.15;

/**
 * A deck's walking surface at a point: on the sand it lies DECK_ON_SAND above it (so the beach steps onto it from any side);
 * over the shallows it rises with the water's depth (a gentle ramp, the sand's own slope); over deeper water it is level at
 * the deck's height. (Phase A drew every deck level at its height: from the beach beside the bridge that was a 0.7 m ledge,
 * above the movement sim's 0.45 m step, and a walker beside the bridge could not get on.)
 */
export function deckSurfaceY(d: Deck, terrain: number): number {
  return Math.max(terrain + DECK_ON_SAND, Math.min(d.y, DECK_ON_SAND + Math.max(0, -terrain)));
}

/** What you stand on at (x, z): the terrain, or a deck above it. */
export function surfaceY(x: number, z: number): number {
  const t = terrainY(x, z);
  const d = deckAt(x, z);
  return d ? deckSurfaceY(d, t) : t;
}

/** May a person stand here: dry land, a deck, or water no deeper than WADE_DEPTH, inside the zone? */
export function walkable(x: number, z: number): boolean {
  if (x < ZONE_MIN_X || x > ZONE_MAX_X || z < ZONE_MIN_Z || z > ZONE_MAX_Z) return false;
  return surfaceY(x, z) >= SEA_Y - WADE_DEPTH;
}

// ── the spots: where you arrive, and where you leave ────────────────────────────────────────────────────────────────

export interface ZoneSpot {
  id: string;
  label: string;
  at: readonly [x: number, z: number];
  radius: number;
  /** What walking into it offers: `venice` the boat back to Venice; `sport` a game (zoneTown SPORT_SPOTS); `person` one of
   *  the townsfolk (zoneTown TOWNSFOLK). */
  kind: 'venice' | 'sport' | 'person';
}

const dock = DECKS[0];
/** The boat ties up at the dock's seaward end; the spot is a few steps inland of it. */
export const BOAT_AT: readonly [x: number, z: number] = [dock.minX - 4, DOCK_Z];

export const ZONE_SPOTS: readonly ZoneSpot[] = [
  { id: 'dock.venice', label: '[PLACEHOLDER] Boat to Venice', at: [dock.minX + 4, DOCK_Z], radius: 4, kind: 'venice' },
];

export function spotAtZone(x: number, z: number): ZoneSpot | null {
  for (const s of ZONE_SPOTS) if (Math.hypot(x - s.at[0], z - s.at[1]) <= s.radius) return s;
  return null;
}

/** Where a new arrival stands: on the dock, a few metres in from the boat (outside the boat spot's ring), facing Palm Key. */
export function arrivalSpawn(): { pos: { x: number; y: number; z: number }; yaw: number } {
  const x = dock.minX + 13, z = DOCK_Z;
  const isl = ISLANDS[0];
  return { pos: { x, y: surfaceY(x, z), z }, yaw: Math.atan2(isl.at[0] - x, isl.at[1] - z) };
}

// ── the pieces: the streaming unit ──────────────────────────────────────────────────────────────────────────────────

export type PieceKind = 'sea' | 'shore' | 'land';
export interface Piece { i: number; j: number; key: string; rect: Rect; kind: PieceKind; /** lowest and highest terrain (m) */ lo: number; hi: number }

export const pieceKey = (i: number, j: number): string => `${i},${j}`;

export function pieceRect(i: number, j: number): Rect {
  const minX = ZONE_MIN_X + i * PIECE_M, minZ = ZONE_MIN_Z + j * PIECE_M;
  return { minX, maxX: minX + PIECE_M, minZ, maxZ: minZ + PIECE_M };
}

/** The piece under (x, z), clamped to the zone. */
export function pieceAt(x: number, z: number): [number, number] {
  const i = Math.max(0, Math.min(ZONE_COLS - 1, Math.floor((x - ZONE_MIN_X) / PIECE_M)));
  const j = Math.max(0, Math.min(ZONE_ROWS - 1, Math.floor((z - ZONE_MIN_Z) / PIECE_M)));
  return [i, j];
}

/** Sea pieces are open water to the floor: they draw nothing of their own (the one sea plane covers them). */
const SEA_PIECE_BELOW = SEABED_Y + 0.01;

let piecesCache: Piece[] | null = null;
/** Every piece, sampled at 4 m: its kind and its height range. */
export function zonePieces(): Piece[] {
  if (piecesCache) return piecesCache;
  const out: Piece[] = [];
  for (let j = 0; j < ZONE_ROWS; j++) for (let i = 0; i < ZONE_COLS; i++) {
    const rect = pieceRect(i, j);
    let lo = Infinity, hi = -Infinity;
    for (let z = rect.minZ; z <= rect.maxZ; z += 4) for (let x = rect.minX; x <= rect.maxX; x += 4) {
      const y = terrainY(x, z);
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
    const kind: PieceKind = hi <= SEA_PIECE_BELOW ? 'sea' : lo >= SEA_Y ? 'land' : 'shore';
    out.push({ i, j, key: pieceKey(i, j), rect, kind, lo, hi });
  }
  piecesCache = out;
  return out;
}

// ── streaming: which pieces are drawn how ───────────────────────────────────────────────────────────────────────────

/** full: everything (fine terrain, every prop); lod: coarse terrain and the tall props; far: coarse terrain only. */
export type Tier = 'full' | 'lod' | 'far';

export interface StreamRings {
  /** Chebyshev distance (pieces) of the full ring. Phone plan: 1 (the 3 × 3 around you). */
  full: number;
  /** ... and of the LOD ring. Phone plan: 2 (5 × 5). */
  lod: number;
  /** Hysteresis (pieces): a piece keeps its tier until it is this much further out than the ring that gave it. */
  keep: number;
}

/** The tier each piece wants for a player in piece (pi, pj), with no memory. */
export function tierFor(i: number, j: number, pi: number, pj: number, r: StreamRings): Tier {
  const d = Math.max(Math.abs(i - pi), Math.abs(j - pj));
  return d <= r.full ? 'full' : d <= r.lod ? 'lod' : 'far';
}

const RANK: Record<Tier, number> = { full: 2, lod: 1, far: 0 };

/**
 * The streamer's state, pure: the tier each piece holds now. `step` moves it for the player's piece and returns the keys that
 * changed. A piece is RAISED as soon as it is inside a ring; it is LOWERED only once it is `keep` pieces past that ring, so a
 * player walking along a piece edge does not make the pieces flicker in and out.
 */
export class ZoneStreamer {
  readonly tiers = new Map<string, Tier>();
  private here: [number, number] | null = null;
  constructor(public rings: StreamRings) {
    for (const p of zonePieces()) this.tiers.set(p.key, 'far');
  }

  /** The player is in piece (pi, pj): returns the pieces whose tier changed (none when the piece is the same as last time). */
  step(pi: number, pj: number): string[] {
    if (this.here && this.here[0] === pi && this.here[1] === pj) return [];
    this.here = [pi, pj];
    const changed: string[] = [];
    const r = this.rings;
    for (const p of zonePieces()) {
      const want = tierFor(p.i, p.j, pi, pj, r);
      const have = this.tiers.get(p.key)!;
      let next = have;
      if (RANK[want] > RANK[have]) next = want;
      else if (RANK[want] < RANK[have]) {
        // lower only past the hysteresis band: what it would be with the rings widened by `keep`
        const kept = tierFor(p.i, p.j, pi, pj, { full: r.full + r.keep, lod: r.lod + r.keep, keep: 0 });
        next = RANK[kept] < RANK[have] ? kept : have;
      }
      if (next !== have) { this.tiers.set(p.key, next); changed.push(p.key); }
    }
    return changed;
  }

  count(t: Tier): number { let n = 0; for (const v of this.tiers.values()) if (v === t) n++; return n; }
}

// ── the dressing: what stands where (the shipped Kenney nature kit, CC0) ──────────────────

/** A model the zone dresses with. `tall` props are drawn in the LOD ring too; the rest only in the full ring. */
export interface PropModel { id: string; kit: 'nature' | 'meshy'; file: string; tall: boolean }

export const PROP_MODELS: readonly PropModel[] = [
  { id: 'palmTall', kit: 'nature', file: 'tree_palmTall.glb', tall: true },
  { id: 'palmBend', kit: 'nature', file: 'tree_palmBend.glb', tall: true },
  { id: 'palmShort', kit: 'nature', file: 'tree_palmShort.glb', tall: false },
  { id: 'bush', kit: 'nature', file: 'plant_bushLarge.glb', tall: false },
  { id: 'rockA', kit: 'nature', file: 'rock_largeA.glb', tall: false },
  { id: 'rockC', kit: 'nature', file: 'rock_largeC.glb', tall: false },
  { id: 'rockTall', kit: 'nature', file: 'rock_tallA.glb', tall: true },
];

export interface PropPlace { model: string; x: number; y: number; z: number; yaw: number; scale: number; piece: string }

/** A fixed pseudo-random value in [0, 1) from a few integers (no generator: the zone is the same every load). */
export function hash01(a: number, b: number, c = 0): number {
  const s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

let propsCache: PropPlace[] | null = null;
/** Every prop in the zone, each on the terrain under it and tagged with its piece. */
export function zoneProps(): PropPlace[] {
  if (propsCache) return propsCache;
  const out: PropPlace[] = [];
  const put = (model: string, x: number, z: number, yaw: number, scale: number) => {
    if (deckAt(x, z) || Math.abs(z - DOCK_Z) < 5 || Math.abs(z - BRIDGE_Z) < 4) return;   // keep the decks and their landings clear
    const [i, j] = pieceAt(x, z);
    out.push({ model, x, y: terrainY(x, z), z, yaw, scale, piece: pieceKey(i, j) });
  };

  // the mainland: palms along the dune line, bushes on the grass behind, rocks at the water's edge
  for (let z = ZONE_MIN_Z + 10, k = 0; z < ZONE_MAX_Z - 10; z += 13, k++) {
    const sx = mainlandShoreX(z);
    put(hash01(k, 1) < 0.5 ? 'palmTall' : 'palmBend', sx + 30 + hash01(k, 2) * 10, z + (hash01(k, 3) - 0.5) * 6, hash01(k, 4) * 6.28, 4.4 + hash01(k, 5) * 1.2);
    if (k % 2 === 0) put('palmShort', sx + 44 + hash01(k, 6) * 8, z + 5, hash01(k, 7) * 6.28, 3.8);
    if (k % 3 === 0) put('bush', sx + 58 + hash01(k, 8) * 20, z - 3, hash01(k, 9) * 6.28, 5);
    if (k % 4 === 1) put(hash01(k, 10) < 0.5 ? 'rockA' : 'rockC', sx - 2 + hash01(k, 11) * 3, z, hash01(k, 12) * 6.28, 2.5 + hash01(k, 13) * 1.5);
  }
  // (the owner's Meshy surfboard is left for the surf spot, phase D: measured 31,000 triangles and 16 MB of phone textures a copy,
  //  against under 200 triangles and no textures for every Kenney model here — scripts/coast-zone-budget-tests.ts)

  // the islands
  ISLANDS.forEach((isl, n) => {
    const ring = (r0: number, r1: number, count: number, pick: (k: number) => string, scale: (k: number) => number) => {
      for (let k = 0; k < count; k++) {
        const a = (k / count) * Math.PI * 2 + hash01(n, k, 1) * 0.4;
        const dx = Math.cos(a), dz = Math.sin(a);
        const shore = islandShoreR(isl, dx, dz);
        const r = shore - r0 - hash01(n, k, 2) * (r1 - r0);
        put(pick(k), isl.at[0] + dx * r, isl.at[1] + dz * r, hash01(n, k, 3) * 6.28, scale(k));
      }
    };
    if (isl.look === 'palms') {
      ring(7, 14, 16, (k) => (k % 3 === 0 ? 'palmBend' : 'palmTall'), (k) => 4.4 + hash01(n, k, 4) * 1.2);
      ring(16, 24, 8, () => 'bush', () => 5.5);
      ring(-1, 1, 7, (k) => (k % 2 ? 'rockA' : 'rockC'), (k) => 2.5 + hash01(n, k, 5) * 1.5);
    } else {
      ring(2, 14, 12, (k) => (k % 3 === 0 ? 'rockTall' : k % 2 ? 'rockA' : 'rockC'), (k) => 3 + hash01(n, k, 6) * 3);
      ring(6, 10, 4, () => 'palmBend', () => 4.6);
    }
  });
  propsCache = out;
  return out;
}

/** The props drawn for a piece at a tier. */
export function propsDrawnAt(tier: Tier, model: PropModel): boolean {
  return tier === 'full' || (tier === 'lod' && model.tall);
}

/** The phone plan's rings (docs/VENICE-HUB-PLAN.md §3): the 3 × 3 around you at full detail, the 5 × 5 at LOD, one piece of
 *  hysteresis. Knobs coast.streamFull / coast.streamLod / coast.streamKeep (new; no shipped behaviour to restore). */
export const COAST_STREAM_FULL = 1;
export const COAST_STREAM_LOD = 2;
export const COAST_STREAM_KEEP = 1;
