// COMBAT ARENAS — places to fight, and places that fight back (2026-09-18).
//
// Owner: "in the combat modes have an arena/map that has walls to run off of and other mechanics" and "3 map/arena/
// environment per mode minimum". Before this every combat mode had exactly ONE room, and the room was a constant in the
// mode file: the horde's `ARENA_RADIUS = 7.5` disc, Karate VS's `ARENA_HALF = 4.5` box, Mixed's `RING_RADIUS = 6.2`
// octagon with a drop, Duel's `DISC_RADIUS = 6.5`. Four numbers, four ideas of what an edge is, nothing to run off.
//
// So an arena here is DATA, the way the hoops court locations and the board venues are: a shape, what its edge does
// (a wall you can run along, a drop you can be knocked off, ropes that bounce a body back into the fight), the walls as
// SEGMENTS the wall run can take (core/MatrixFocus wallRunAvailableOn), pillars that block a line, hazards that hurt
// whoever stands in them, and a look for the venue to paint. Pure: no Babylon. `combat/arenaBuild.ts` builds it.

import type { VenueMood } from '../scene/moods';

export type CombatModeId = 'karate' | 'karate_vs' | 'mixedcombat' | 'duel';
export const COMBAT_MODE_IDS: readonly CombatModeId[] = ['karate', 'karate_vs', 'mixedcombat', 'duel'];

/** A wall as a segment on the floor with an INWARD normal (into the arena), `height` metres tall. */
export interface ArenaWall { a: { x: number; z: number }; b: { x: number; z: number }; nx: number; nz: number; height: number; label: string }
export type ArenaShape = { kind: 'disc'; radius: number } | { kind: 'box'; halfX: number; halfZ: number };
/** What the arena's edge does: a WALL stops you (and can be run along), a DROP rings you out, ROPES bounce you back. */
export type EdgeKind = 'wall' | 'drop' | 'ropes';
export interface ArenaPillar { x: number; z: number; r: number; h: number; label: string }
export interface ArenaHazard { x: number; z: number; r: number; kind: 'fire' | 'shock'; dps: number; label: string }

export interface ArenaLook {
  skyTop: string; skyBottom: string; fog: string; sun: string; ambient: number;
  backdrop: 'beach' | 'ocean' | 'city' | 'stadium' | 'mountains' | 'dojo' | 'neon' | 'links';
  /** The floor: the venue's ground kind + colours (NexusWebScene GroundSpec). */
  ground: { kind: 'mat' | 'street' | 'stage' | 'court' | 'sand'; color: string; line: string; markings: 'ring' | 'none' };
  /** The CC0 prop dressing set (visual/venuePropSets); null = none — a neon cage has no shrine behind it. */
  propSet: string | null;
  /** Half-extent of the floor the venue paints (the camera's box is derived from it). */
  floorHalf: number;
  wallColor: string; accent: string;
  mood: VenueMood;
  /** Lamps and banners around the arena, in the venue spec's prop vocabulary. */
  props: Array<{ kind: 'lamp' | 'banner' | 'wall'; position: [number, number, number]; color?: string; scale?: number; rotationY?: number }>;
}

export interface CombatArena {
  id: string; name: string; sub: string; tint: string;
  modes: readonly CombatModeId[];
  ready: boolean;
  shape: ArenaShape;
  edge: EdgeKind;
  walls: ArenaWall[];
  pillars: ArenaPillar[];
  hazards: ArenaHazard[];
  look: ArenaLook;
}

// ── geometry helpers ─────────────────────────────────────────────────────────────────────────────────────────────────

/** The perimeter of a shape as inward-facing wall segments (a disc becomes an N-gon). */
export function perimeterWalls(shape: ArenaShape, height: number, label: string, segs = 16, from = 0, to = Math.PI * 2): ArenaWall[] {
  const out: ArenaWall[] = [];
  if (shape.kind === 'disc') {
    const n = Math.max(3, Math.round(segs * ((to - from) / (Math.PI * 2))));
    for (let i = 0; i < n; i++) {
      const a0 = from + ((to - from) * i) / n, a1 = from + ((to - from) * (i + 1)) / n;
      const a = { x: Math.sin(a0) * shape.radius, z: Math.cos(a0) * shape.radius };
      const b = { x: Math.sin(a1) * shape.radius, z: Math.cos(a1) * shape.radius };
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, l = Math.hypot(mx, mz) || 1;
      out.push({ a, b, nx: -mx / l, nz: -mz / l, height, label });
    }
    return out;
  }
  const hx = shape.halfX, hz = shape.halfZ;
  out.push({ a: { x: -hx, z: hz }, b: { x: hx, z: hz }, nx: 0, nz: -1, height, label: `${label} (north)` });
  out.push({ a: { x: hx, z: -hz }, b: { x: -hx, z: -hz }, nx: 0, nz: 1, height, label: `${label} (south)` });
  out.push({ a: { x: hx, z: hz }, b: { x: hx, z: -hz }, nx: -1, nz: 0, height, label: `${label} (east)` });
  out.push({ a: { x: -hx, z: -hz }, b: { x: -hx, z: hz }, nx: 1, nz: 0, height, label: `${label} (west)` });
  return out;
}

/** Signed distance INSIDE the shape's edge (positive = inside), planar. */
export function insideBy(p: { x: number; z: number }, shape: ArenaShape): number {
  if (shape.kind === 'disc') return shape.radius - Math.hypot(p.x, p.z);
  return Math.min(shape.halfX - Math.abs(p.x), shape.halfZ - Math.abs(p.z));
}

/** Push `p` back inside the shape by `inset` (the body's half-width). Returns true when it moved. */
export function clampToShape(p: { x: number; z: number }, shape: ArenaShape, inset = 0): boolean {
  if (shape.kind === 'disc') {
    const r = Math.hypot(p.x, p.z), lim = shape.radius - inset;
    if (r <= lim) return false;
    const k = lim / (r || 1); p.x *= k; p.z *= k; return true;
  }
  const lx = shape.halfX - inset, lz = shape.halfZ - inset;
  const x = Math.max(-lx, Math.min(lx, p.x)), z = Math.max(-lz, Math.min(lz, p.z));
  const moved = x !== p.x || z !== p.z; p.x = x; p.z = z; return moved;
}

/** Keep `p` off the wall segments (a body cannot stand inside a wall). Returns true when it moved. */
export function clampToWalls(p: { x: number; z: number }, walls: readonly ArenaWall[], inset = 0.3): boolean {
  let moved = false;
  for (const w of walls) {
    const abx = w.b.x - w.a.x, abz = w.b.z - w.a.z, l2 = abx * abx + abz * abz || 1;
    const t = Math.max(0, Math.min(1, ((p.x - w.a.x) * abx + (p.z - w.a.z) * abz) / l2));
    const cx = w.a.x + abx * t, cz = w.a.z + abz * t;
    const d = (p.x - cx) * w.nx + (p.z - cz) * w.nz;   // signed: positive = on the inside
    if (d < inset && Math.hypot(p.x - cx, p.z - cz) < inset + 0.01) { p.x = cx + w.nx * inset; p.z = cz + w.nz * inset; moved = true; }
    else if (d < inset && d > -w.height && t > 0 && t < 1) { p.x += w.nx * (inset - d); p.z += w.nz * (inset - d); moved = true; }
  }
  return moved;
}

/** Push `p` out of every pillar. Returns true when it moved. */
export function clampToPillars(p: { x: number; z: number }, pillars: readonly ArenaPillar[], bodyR = 0.3): boolean {
  let moved = false;
  for (const c of pillars) {
    const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), lim = c.r + bodyR;
    if (d >= lim) continue;
    const k = d < 1e-4 ? 1 : lim / d;
    p.x = d < 1e-4 ? c.x + lim : c.x + dx * k; p.z = d < 1e-4 ? c.z : c.z + dz * k; moved = true;
  }
  return moved;
}

/**
 * Keep a body in the arena the way ITS edge says: a wall or ropes clamp to the shape; a drop does not (the mode's
 * ring-out owns the body past the edge). Explicit walls and pillars always block. Returns what stopped it.
 */
export function arenaClamp(p: { x: number; z: number }, arena: CombatArena, inset = 0.3): 'edge' | 'wall' | 'pillar' | null {
  let hit: 'edge' | 'wall' | 'pillar' | null = null;
  if (clampToPillars(p, arena.pillars, inset)) hit = 'pillar';
  if (arena.edge !== 'drop' && clampToShape(p, arena.shape, inset)) hit = 'edge';
  // the walls too, always: a disc's wall is an N-gon of chords INSIDE the circle (the cage's 8 sides sag 0.5 m at their
  // middles), so a body clamped to the circle alone stood beyond the wall's face and the wall run never saw it
  if (clampToWalls(p, arena.walls, inset)) hit = hit ?? 'wall';
  return hit;
}

/** Past the edge of a DROP arena (a ring-out). Never true where the edge is a wall or ropes. */
export function offEdge(p: { x: number; z: number }, arena: CombatArena): boolean {
  return arena.edge === 'drop' && insideBy(p, arena.shape) < 0;
}

/**
 * A knockback's landing point in this arena. Walls stop it at the edge; ROPES bounce it — the overshoot comes back
 * inward (the cage's one trick: a body shoved into the ropes returns to you for the follow-up); a DROP lets it go.
 */
export function knockTo(from: { x: number; z: number }, to: { x: number; z: number }, arena: CombatArena, inset = 0.3): { x: number; z: number; rebound: boolean } {
  const q = { x: to.x, z: to.z };
  if (arena.edge === 'drop') { clampToWalls(q, arena.walls, inset); clampToPillars(q, arena.pillars, inset); return { ...q, rebound: false }; }
  const over = -insideBy(q, arena.shape) + inset;
  if (over <= 0) { clampToPillars(q, arena.pillars, inset); return { ...q, rebound: false }; }
  clampToShape(q, arena.shape, inset);
  if (arena.edge !== 'ropes') { clampToPillars(q, arena.pillars, inset); return { ...q, rebound: false }; }
  // the overshoot, reflected back along the edge's inward normal at the contact point
  const n = arena.shape.kind === 'disc'
    ? (() => { const l = Math.hypot(q.x, q.z) || 1; return { x: -q.x / l, z: -q.z / l }; })()
    : (Math.abs(q.x) / arena.shape.halfX > Math.abs(q.z) / arena.shape.halfZ ? { x: -Math.sign(q.x), z: 0 } : { x: 0, z: -Math.sign(q.z) });
  const back = Math.min(over * ROPES.rebound, ROPES.maxRebound);
  q.x += n.x * back; q.z += n.z * back;
  clampToPillars(q, arena.pillars, inset);
  return { ...q, rebound: true };
}

export const ROPES = { rebound: 1.6, maxRebound: 2.4, stunSec: 0.55 } as const;

/** The hazard `p` stands in, if any. */
export function hazardAt(p: { x: number; z: number }, arena: CombatArena): ArenaHazard | null {
  for (const h of arena.hazards) if (Math.hypot(p.x - h.x, p.z - h.z) < h.r) return h;
  return null;
}

/** A spawn ring radius that fits the arena (enemies arrive on it; the horde's was a fixed 6). */
export function spawnRadius(arena: CombatArena): number {
  return arena.shape.kind === 'disc' ? arena.shape.radius - 1.5 : Math.min(arena.shape.halfX, arena.shape.halfZ) - 1.2;
}

// ── the arenas ───────────────────────────────────────────────────────────────────────────────────────────────────────

const shrineSky = { skyTop: '#C9D3DC', skyBottom: '#8E9AA6', fog: '#B9C2CA', sun: '#FFF4E6', ambient: 0.7 } as const;
const nightSky = { skyTop: '#0b0f1e', skyBottom: '#1e1035', fog: '#140c24', sun: '#9ad7ff', ambient: 0.4 } as const;
const emberSky = { skyTop: '#2a1810', skyBottom: '#5a2a14', fog: '#3a1e12', sun: '#ffb070', ambient: 0.45 } as const;
const duskSky = { skyTop: '#3b2f5a', skyBottom: '#d9825a', fog: '#8a5a68', sun: '#ffc48a', ambient: 0.55 } as const;

const lamp = (x: number, z: number, color = '#FFD79A') => ({ kind: 'lamp' as const, position: [x, 0, z] as [number, number, number], color });

const GAUNTLET: CombatArena = {
  id: 'gauntlet', name: 'Shadow Gauntlet', sub: 'THE SHRINE COURTYARD · A STONE RING TO RUN', tint: '#BF5AF2',
  modes: ['karate'], ready: true,
  shape: { kind: 'disc', radius: 7.5 }, edge: 'wall',
  walls: perimeterWalls({ kind: 'disc', radius: 7.5 }, 2.6, 'stone ring'),
  pillars: [], hazards: [],
  look: { ...shrineSky, backdrop: 'dojo', ground: { kind: 'mat', color: '#C6BFB2', line: '#6B5B4A', markings: 'ring' }, floorHalf: 12,
    wallColor: '#B9AFA0', accent: '#BF5AF2', propSet: 'dojo', mood: 'dojoWarm',
    props: [{ kind: 'wall', position: [0, 0, -14], color: '#B9AFA0', scale: 0.6 }, lamp(7, -5), lamp(-7, -5), { kind: 'banner', position: [0, 0, -13.6], color: '#BF5AF2' }] },
};

const DOJO: CombatArena = {
  id: 'dojo', name: 'Sovereign Dojo', sub: 'THE SHRINE COURTYARD · LOW STONE WALLS ON FOUR SIDES', tint: '#FF2D55',
  modes: ['karate_vs', 'mixedcombat'], ready: true,
  shape: { kind: 'box', halfX: 5, halfZ: 5 }, edge: 'wall',
  walls: perimeterWalls({ kind: 'box', halfX: 5, halfZ: 5 }, 2.4, 'courtyard wall'),
  pillars: [], hazards: [],
  look: { ...shrineSky, backdrop: 'dojo', ground: { kind: 'mat', color: '#C6BFB2', line: '#6B5B4A', markings: 'none' }, floorHalf: 12,   // CAM CLEARANCE: was 8 — the 'fight' camera stands 11.3 m out from the 5x5 box's corner, so the mat ran out under the frame (gauntlet, the other dojo, has always painted 12)
    wallColor: '#A89B88', accent: '#FF2D55', mood: 'dojoWarm', propSet: 'dojo',
    props: [{ kind: 'banner', position: [0, 0, -11.6], color: '#FF2D55' }, lamp(6, -6), lamp(-6, -6)] },
};

const CAGE: CombatArena = {
  id: 'cage', name: 'Neon Cage', sub: 'AN OCTAGON OF ROPES · THEY BOUNCE BACK', tint: '#22d3ee',
  modes: ['karate', 'karate_vs', 'mixedcombat'], ready: true,
  shape: { kind: 'disc', radius: 6.4 }, edge: 'ropes',
  walls: perimeterWalls({ kind: 'disc', radius: 6.4 }, 3, 'cage', 8, Math.PI / 8, Math.PI * 2 + Math.PI / 8),
  pillars: [], hazards: [],
  look: { ...nightSky, backdrop: 'neon', ground: { kind: 'street', color: '#1a1d2b', line: '#22d3ee', markings: 'none' }, floorHalf: 12,   // CAM CLEARANCE: was 11 — the 'fight' camera swings 3 m off-axis as well as 4.2 m back, which is 11.6 m out from the 6.4 m rim
    wallColor: '#22d3ee', accent: '#22d3ee', mood: 'nightGame', propSet: null,
    props: [lamp(8, 8, '#22d3ee'), lamp(-8, 8, '#f472b6'), lamp(8, -8, '#f472b6'), lamp(-8, -8, '#22d3ee'), { kind: 'banner', position: [0, 0, -10.5], color: '#22d3ee' }] },
};

const FOUNDRY: CombatArena = {
  id: 'foundry', name: 'The Foundry', sub: 'STEEL WALLS · FOUR PILLARS · TWO FIRE PITS', tint: '#ff7b3d',
  modes: ['karate', 'karate_vs', 'mixedcombat'], ready: true,
  shape: { kind: 'box', halfX: 7, halfZ: 6 }, edge: 'wall',
  walls: perimeterWalls({ kind: 'box', halfX: 7, halfZ: 6 }, 3.2, 'steel wall'),
  pillars: [
    { x: 3.4, z: 2.6, r: 0.5, h: 3.2, label: 'pillar NE' }, { x: -3.4, z: 2.6, r: 0.5, h: 3.2, label: 'pillar NW' },
    { x: 3.4, z: -2.6, r: 0.5, h: 3.2, label: 'pillar SE' }, { x: -3.4, z: -2.6, r: 0.5, h: 3.2, label: 'pillar SW' },
  ],
  hazards: [{ x: 0, z: 4.4, r: 1.1, kind: 'fire', dps: 14, label: 'north pit' }, { x: 0, z: -4.4, r: 1.1, kind: 'fire', dps: 14, label: 'south pit' }],
  look: { ...emberSky, backdrop: 'city', ground: { kind: 'street', color: '#2a2622', line: '#ff7b3d', markings: 'none' }, floorHalf: 14,   // CAM CLEARANCE: was 10 — the 7x6 box's corner plus the 'fight' pullback puts the camera 13.4 m out
    wallColor: '#3a3b40', accent: '#ff7b3d', mood: 'goldenHour', propSet: null,
    props: [lamp(8.5, 7.5, '#ff7b3d'), lamp(-8.5, 7.5, '#ff7b3d'), lamp(8.5, -7.5, '#ff7b3d'), lamp(-8.5, -7.5, '#ff7b3d')] },
};

const PIT: CombatArena = {
  id: 'pit', name: 'The Pit', sub: 'A RAISED OCTAGON · KNOCK THEM OFF', tint: '#ffb347',
  modes: ['mixedcombat', 'duel'], ready: true,
  shape: { kind: 'disc', radius: 6.2 }, edge: 'drop',
  walls: [], pillars: [], hazards: [],
  look: { ...duskSky, backdrop: 'stadium', ground: { kind: 'street', color: '#1a1d24', line: '#ffb347', markings: 'none' }, floorHalf: 13,
    wallColor: '#8a6d4a', accent: '#ffb347', mood: 'goldenHour', propSet: null, props: [] },
};

const ROOFTOP: CombatArena = {
  id: 'rooftop', name: 'Rooftop', sub: 'BILLBOARDS AT EACH END · A LONG DROP EITHER SIDE', tint: '#9ad7ff',
  modes: ['mixedcombat', 'duel'], ready: true,
  shape: { kind: 'box', halfX: 6, halfZ: 4.2 }, edge: 'drop',
  walls: [
    { a: { x: -6, z: 4.2 }, b: { x: 6, z: 4.2 }, nx: 0, nz: -1, height: 3.4, label: 'north billboard' },
    { a: { x: 6, z: -4.2 }, b: { x: -6, z: -4.2 }, nx: 0, nz: 1, height: 3.4, label: 'south billboard' },
  ],
  pillars: [{ x: 4.6, z: 0, r: 0.55, h: 1.4, label: 'AC unit east' }, { x: -4.6, z: 0, r: 0.55, h: 1.4, label: 'AC unit west' }],
  hazards: [],
  look: { ...nightSky, backdrop: 'city', ground: { kind: 'street', color: '#2b2f3a', line: '#9ad7ff', markings: 'none' }, floorHalf: 13,
    wallColor: '#1f2937', accent: '#9ad7ff', mood: 'nightGame', propSet: null, props: [lamp(0, 6.5, '#9ad7ff'), lamp(0, -6.5, '#9ad7ff')] },
};

const CLIFF: CombatArena = {
  id: 'cliff', name: 'Cliffside Shrine', sub: 'THE ROCK AT YOUR BACK · THE SEA IN FRONT', tint: '#34d399',
  modes: ['mixedcombat', 'duel'], ready: true,
  shape: { kind: 'disc', radius: 6.5 }, edge: 'drop',
  // the cliff face is the back half of the ring (behind the spawn line, −z); the front half is open air over the sea
  walls: perimeterWalls({ kind: 'disc', radius: 6.5 }, 4, 'cliff face', 16, Math.PI * 0.5, Math.PI * 1.5),
  pillars: [], hazards: [],
  look: { ...shrineSky, backdrop: 'ocean', ground: { kind: 'mat', color: '#B8B0A0', line: '#5f6b60', markings: 'none' }, floorHalf: 13,
    wallColor: '#6b6560', accent: '#34d399', mood: 'overcast', propSet: 'dojo', props: [lamp(4.5, -5.5, '#FFD79A'), lamp(-4.5, -5.5, '#FFD79A')] },
};

export const COMBAT_ARENAS: readonly CombatArena[] = [GAUNTLET, DOJO, CAGE, FOUNDRY, PIT, ROOFTOP, CLIFF];

export function arenasFor(mode: CombatModeId): CombatArena[] {
  return COMBAT_ARENAS.filter((a) => a.ready && a.modes.includes(mode));
}

export const ARENA_KEY_PREFIX = 'fel-combat-arena-';

/** The player's pick for a mode: `?arena=` wins, then the remembered pick, then the mode's first. */
export function readCombatArena(mode: CombatModeId): CombatArena {
  const list = arenasFor(mode);
  const first = list[0];
  try {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('arena');
      const byQuery = list.find((a) => a.id === q);
      if (byQuery) return byQuery;
      const s = window.localStorage.getItem(ARENA_KEY_PREFIX + mode);
      const byStore = list.find((a) => a.id === s);
      if (byStore) return byStore;
    }
  } catch { /* private mode: the default */ }
  return first;
}

export function writeCombatArena(mode: CombatModeId, id: string): void {
  try { window.localStorage.setItem(ARENA_KEY_PREFIX + mode, id); } catch { /* convenience only */ }
}

/** One line for the console: what was picked and what it holds. */
export function describeArena(a: CombatArena): string {
  const shape = a.shape.kind === 'disc' ? `disc r ${a.shape.radius}` : `box ${a.shape.halfX * 2}×${a.shape.halfZ * 2}`;
  return `${a.name} · ${shape} · edge ${a.edge} · walls ${a.walls.length} · pillars ${a.pillars.length} · hazards ${a.hazards.length}`;
}
