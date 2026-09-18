// AERO CIRCUITS — themed three-lap courses with a full field, the Diddy Kong Racing way (owner, 2026-09-15: Aero Aces
// "like diddy Kong flyers"; decision: THEMED LAP CIRCUITS — three laps through canyons, islands and caves with a full
// field of rivals, instead of the point-to-point ring race).
//
// A circuit is a closed RACING LINE (a Catmull-Rom loop through a handful of authored points, each with a height above
// the ground) and everything else is derived from that one line, so nothing can disagree about where the course goes:
//   · the CHECKPOINTS the lap counter needs (RaceCourse gates, invisible, wide as the corridor, every ~110 m);
//   · the CORRIDOR — how far off the line the course lets you fly before its edge turns you back;
//   · the GROUND (`floorAt`) — canyon walls and glacier walls rise off the corridor edge, islands rise out of the sea;
//   · the CEILING (`ceilingAt`) — open sky, except inside the ice cave;
//   · BALLOON rows and BANANA lines, placed by distance along the line;
//   · ARCHES over the line (a rock arch, an ice arch) and the TUNNEL section.
//
// Pure: Vector3 and numbers. The world builder (aeroWorlds.ts) reads the same functions to shape the meshes, so the
// ground the plane is held above is the ground you see.

import { Vector3 } from '@babylonjs/core';
import type { Course, Gate } from '../core/RaceCourse';
import type { ItemKind } from './AeroItems';

export type AeroTheme = 'canyon' | 'island' | 'glacier' | 'volcano' | 'city';

export interface CircuitLine {
  pts: Vector3[];
  cum: number[];
  length: number;
}

export interface AeroCircuit {
  course: Course;
  theme: AeroTheme;
  line: CircuitLine;
  /** Half-width of the flyable corridor, metres. */
  corridor: number;
  floorAt: (x: number, z: number) => number;
  ceilingAt: (x: number, z: number) => number;
  balloons: { kind: ItemKind; pos: Vector3 }[];
  bananas: Vector3[];
  arches: { dist: number; span: number; height: number }[];
  tunnel: { from: number; to: number; clear: number } | null;
  /** The city's towers — x, z, half-width, height — for the world to build as lit buildings. Empty elsewhere. */
  towers: [number, number, number, number][];
}

interface Spec {
  id: string; name: string; sub: string; theme: AeroTheme;
  mood: Course['mood']; tint: string;
  /** Authored loop: x, z, and height above the ground there. */
  pts: [number, number, number][];
  corridor: number;
  arches: number[];                 // fractions of the lap
  tunnel?: [number, number];        // fractions of the lap
  islands?: [number, number, number, number][];   // x, z, radius, height
  /** MAP EXPANSION (2026-09-18): the city's TOWERS — x, z, half-width, height. Flat-topped, a smooth skirt, and always off the corridor. */
  towers?: [number, number, number, number][];
}

const SPECS: Spec[] = [
  {
    id: 'redrock-canyon', name: 'RED ROCK CANYON', sub: 'Three laps down the gorge. Under the arches, over the mesa.', theme: 'canyon',
    mood: 'goldenHour', tint: '#ff8a4c', corridor: 34,
    pts: [[0, -260, 10], [120, -250, 12], [230, -170, 16], [260, -40, 22], [200, 90, 12], [240, 210, 18], [120, 280, 26],
      [-20, 230, 12], [-140, 270, 16], [-250, 170, 20], [-230, 20, 10], [-150, -90, 14], [-190, -210, 18], [-90, -270, 12]],
    arches: [0.14, 0.47, 0.8],
  },
  {
    id: 'coconut-cove', name: 'COCONUT COVE', sub: 'Palm islands and a rock arch over the lagoon. Skim the water for speed.', theme: 'island',
    mood: 'daylight', tint: '#3ad1c9', corridor: 46,
    pts: [[0, -230, 6], [150, -210, 12], [270, -110, 24], [250, 40, 7], [150, 130, 26], [210, 250, 12], [60, 300, 6],
      [-90, 230, 18], [-220, 280, 30], [-300, 140, 10], [-210, 10, 6], [-260, -130, 22], [-140, -220, 10]],
    arches: [0.3, 0.72],
    islands: [[60, 40, 95, 16], [-150, 120, 60, 22], [200, -60, 38, 12], [-40, -120, 40, 9], [320, 200, 70, 30], [-340, -40, 80, 26]],
  },
  {
    id: 'frostbite-caverns', name: 'FROSTBITE CAVERNS', sub: 'Down the ice valley and straight through the cave. Keep your nose level.', theme: 'glacier',
    mood: 'alpine', tint: '#9fd7ff', corridor: 30,
    pts: [[0, -240, 9], [140, -230, 14], [240, -130, 28], [220, 10, 10], [260, 140, 22], [150, 250, 12], [0, 220, 8],
      [-130, 280, 26], [-250, 180, 14], [-220, 30, 8], [-260, -110, 30], [-130, -200, 12]],
    arches: [0.08, 0.9],
    tunnel: [0.36, 0.52],
  },
  // ── MAP EXPANSION (owner, 2026-09-18: "a map expansion pass and detail pass for the kart and aero ace modes") ──
  {
    // THE CALDERA. A ring of black rock round a lava lake: the lap runs the rim, dips across the lake (skim it for
    // the glow, and the heat), and threads a LAVA TUBE through the far wall. Canyon walls, a darker palette, embers.
    id: 'ember-caldera', name: 'EMBER CALDERA', sub: 'Round the rim, across the lava lake, through the tube. Mind the heat.', theme: 'volcano',
    mood: 'dojoWarm', tint: '#ff5a2a', corridor: 32,
    pts: [[0, -250, 14], [130, -240, 18], [240, -150, 30], [250, -20, 12], [190, 110, 40], [230, 230, 16], [100, 290, 24],
      [-40, 240, 10], [-160, 280, 20], [-260, 160, 34], [-230, 20, 12], [-140, -100, 18], [-200, -220, 26], [-90, -280, 14]],
    arches: [0.22, 0.66],
    tunnel: [0.44, 0.56],
  },
  {
    // THE SKYLINE. Open water under a night city: the line weaves between lit towers at rooftop height, under one
    // sky bridge. No walls — the towers are the walls, and they are off the corridor, so the fast line is between
    // them and the slow one is over them.
    id: 'neon-skyline', name: 'NEON SKYLINE', sub: 'Between the towers at rooftop height. Under the sky bridge, over the bay.', theme: 'city',
    mood: 'nightGame', tint: '#ff4fd8', corridor: 44,
    pts: [[0, -240, 20], [160, -220, 30], [280, -100, 26], [240, 60, 40], [130, 150, 22], [220, 270, 34], [60, 310, 20],
      [-90, 240, 28], [-230, 290, 44], [-300, 130, 24], [-200, 0, 18], [-270, -140, 36], [-130, -230, 22]],
    arches: [0.5],
    towers: [[70, 40, 26, 48], [-120, 110, 22, 70], [180, -30, 20, 56], [-30, -110, 18, 36], [330, 190, 30, 64], [-330, -30, 26, 52], [40, -345, 18, 40], [90, 400, 22, 58], [-60, 350, 20, 46], [330, -220, 24, 44]],
  },
];

// ── the line ──────────────────────────────────────────────────────────────────────────────────────────────

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** The closed loop through the authored points, sampled ~every `step` metres. `groundAt` lifts each point to its height. */
export function sampleLoop(pts: [number, number, number][], groundAt: (x: number, z: number) => number, step = 4): CircuitLine {
  const raw: Vector3[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const k = Math.max(4, Math.ceil(segLen / step));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      const x = catmull(p0[0], p1[0], p2[0], p3[0], t);
      const z = catmull(p0[1], p1[1], p2[1], p3[1], t);
      const h = catmull(p0[2], p1[2], p2[2], p3[2], t);
      raw.push(new Vector3(x, h, z));
    }
  }
  const out = raw.map((p) => new Vector3(p.x, p.y, p.z));
  const cum = [0];
  for (let i = 1; i < out.length; i++) cum.push(cum[i - 1] + Math.hypot(out[i].x - out[i - 1].x, out[i].z - out[i - 1].z));
  const length = cum[cum.length - 1] + Math.hypot(out[0].x - out[out.length - 1].x, out[0].z - out[out.length - 1].z);
  // heights are ABOVE THE GROUND in the spec; the ground itself depends on the line (walls), so lift in a second pass
  for (const p of out) p.y = groundAt(p.x, p.z) + p.y;
  return { pts: out, cum, length };
}

/** Where on the line a point is nearest: distance along, sideways offset (+ = right of travel), and the tangent. */
export function locate(line: CircuitLine, x: number, z: number): { dist: number; lateral: number; i: number; tangent: Vector3; point: Vector3 } {
  const { pts, cum, length } = line;
  let best = Infinity, bi = 0, bt = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const abx = b.x - a.x, abz = b.z - a.z; const l2 = abx * abx + abz * abz;
    const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / l2));
    const dx = a.x + abx * t - x, dz = a.z + abz * t - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < best) { best = d2; bi = i; bt = t; }
  }
  const a = pts[bi], b = pts[(bi + 1) % pts.length];
  const seg = (bi + 1 < pts.length ? cum[bi + 1] : length) - cum[bi];
  const tangent = new Vector3(b.x - a.x, 0, b.z - a.z).normalize();
  const point = new Vector3(a.x + (b.x - a.x) * bt, a.y + (b.y - a.y) * bt, a.z + (b.z - a.z) * bt);
  // right of travel = tangent × up (x, z) → (tz, −tx)
  const lateral = (x - point.x) * tangent.z - (z - point.z) * tangent.x;
  return { dist: cum[bi] + seg * bt, lateral, i: bi, tangent, point };
}

/** The point `dist` metres along the loop (wraps). */
export function pointAlong(line: CircuitLine, dist: number): { pos: Vector3; tangent: Vector3 } {
  const { pts, cum, length } = line;
  const d = ((dist % length) + length) % length;
  let lo = 0, hi = pts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid - 1; }
  const a = pts[lo], b = pts[(lo + 1) % pts.length];
  const seg = (lo + 1 < pts.length ? cum[lo + 1] : length) - cum[lo];
  const t = seg > 1e-6 ? (d - cum[lo]) / seg : 0;
  return {
    pos: new Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t),
    tangent: new Vector3(b.x - a.x, 0, b.z - a.z).normalize(),
  };
}

const smooth = (e0: number, e1: number, x: number): number => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// ── building one ─────────────────────────────────────────────────────────────────────────────────────────

const ITEM_ROTA: ItemKind[][] = [['missile', 'boost', 'missile'], ['shield', 'mine', 'boost'], ['boost', 'missile', 'shield'], ['mine', 'missile', 'boost']];

export function buildCircuit(spec: Spec): AeroCircuit {
  // a flat-ish ground first, to lay the line; the walls come from the line afterwards
  const baseGround = (x: number, z: number): number => {
    if (spec.theme === 'island') return islandHeight(spec, x, z);
    if (spec.theme === 'city') return -6 + towerHeight(spec, x, z);   // the bay: below the water everywhere but the towers
    if (spec.theme === 'volcano') {
      // the caldera: a lava lake in the middle (floor below the lava's surface), rising to the rim
      const r = Math.hypot(x, z);
      return -4 + 6 * smooth(110, 250, r) + 1.2 * Math.sin(x * 0.03) * Math.cos(z * 0.027);
    }
    if (spec.theme === 'canyon') return 2 + 1.6 * Math.sin(x * 0.021) * Math.cos(z * 0.017);
    return 1.5 + 1.2 * Math.sin(x * 0.03 + 1) * Math.sin(z * 0.025);
  };
  const line = sampleLoop(spec.pts, baseGround);
  const L = line.length;
  const tunnel = spec.tunnel ? { from: spec.tunnel[0] * L, to: spec.tunnel[1] * L, clear: 20 } : null;

  // THE GROUND: walls rise off the corridor edge in the canyon and the glacier; the island's sea is open water
  const wallRise = spec.theme === 'canyon' ? 70 : spec.theme === 'glacier' ? 48 : 0;
  const floorAt = (x: number, z: number): number => {
    const g = baseGround(x, z);
    if (spec.theme === 'volcano') {
      // THE CALDERA IS OPEN (2026-09-18): 80 m corridor walls made the lava lake a slot canyon in another colour. Low
      // basalt banks line the corridor so the lake is in view from the line, and the crater RIM rises past the far
      // side of the whole course — the wall you see from everywhere and never fly into.
      const d = Math.abs(locate(line, x, z).lateral);
      return g + smooth(spec.corridor + 2, spec.corridor + 18, d) * 9 + smooth(350, 430, Math.hypot(x, z)) * 90;
    }
    if (!wallRise) return g;
    const at = locate(line, x, z);
    const d = Math.abs(at.lateral);
    return g + smooth(spec.corridor + 2, spec.corridor + 26, d) * wallRise;
  };
  const ceilingAt = (x: number, z: number): number => {
    if (tunnel) {
      const at = locate(line, x, z);
      if (at.dist >= tunnel.from && at.dist <= tunnel.to && Math.abs(at.lateral) < spec.corridor + 10) return at.point.y + tunnel.clear;
    }
    return 220;
  };

  // CHECKPOINTS: invisible, as wide as the corridor, every ~110 m, facing the way the line runs
  const count = Math.max(8, Math.round(L / 110));
  const gates: Gate[] = [];
  for (let i = 1; i <= count; i++) {
    const { pos, tangent } = pointAlong(line, (i / count) * L);
    gates.push({ at: pos, through: tangent, radius: spec.corridor + 40 });
  }
  const start = pointAlong(line, 0);

  // BALLOON rows of three across the line, every ~quarter lap, starting past the grid
  const balloons: AeroCircuit['balloons'] = [];
  const rows = Math.max(4, Math.round(L / 260));
  for (let r = 0; r < rows; r++) {
    const { pos, tangent } = pointAlong(line, ((r + 0.35) / rows) * L);
    const right = new Vector3(tangent.z, 0, -tangent.x);
    ITEM_ROTA[r % ITEM_ROTA.length].forEach((kind, j) => balloons.push({ kind, pos: pos.add(right.scale((j - 1) * 11)).add(new Vector3(0, 1.5, 0)) }));
  }
  // BANANA lines of five, weaving off the line between the balloon rows
  const bananas: Vector3[] = [];
  const lines = rows;
  for (let r = 0; r < lines; r++) {
    const d0 = ((r + 0.78) / lines) * L;
    const side = r % 2 ? 1 : -1;
    for (let k = 0; k < 5; k++) {
      const { pos, tangent } = pointAlong(line, d0 + k * 7);
      const right = new Vector3(tangent.z, 0, -tangent.x);
      bananas.push(pos.add(right.scale(side * (4 + k * 1.5))));
    }
  }

  const course: Course = {
    id: spec.id, name: spec.name, sub: spec.sub, kind: 'aero', venue: spec.theme, mood: spec.mood, tint: spec.tint,
    gates, loop: true, laps: 3,
    start: { at: start.pos.add(start.tangent.scale(-18)), heading: Math.atan2(start.tangent.x, start.tangent.z) },
    gold: Math.round((L * 3) / 30), ready: true,
  };
  return {
    course, theme: spec.theme, line, corridor: spec.corridor, floorAt, ceilingAt, balloons, bananas,
    arches: spec.arches.map((f) => ({ dist: f * L, span: spec.corridor * 2 + 16, height: 26 })), tunnel,
    towers: spec.towers ?? [],
  };
}

/** A city tower: a flat top over a smooth skirt, so a line that passes near one rises gently rather than stepping. */
function towerHeight(spec: Spec, x: number, z: number): number {
  let h = 0;
  for (const [cx, cz, hw, top] of spec.towers ?? []) {
    const d = Math.max(Math.abs(x - cx), Math.abs(z - cz)) - hw;   // square footprint
    if (d < 5) h = Math.max(h, top * (1 - smooth(0, 5, d)) + 6);    // a 5 m skirt: the building's own box hides it
  }
  return h;
}

function islandHeight(spec: Spec, x: number, z: number): number {
  let h = 0;
  for (const [cx, cz, r, top] of spec.islands ?? []) {
    const d = Math.hypot(x - cx, z - cz) / r;
    if (d < 1) h = Math.max(h, top * (1 - d * d) * (1 - d * d));
  }
  return h;
}

let cache: Map<string, AeroCircuit> | null = null;
/** Every circuit, built once. */
export function aeroCircuits(): AeroCircuit[] {
  cache ??= new Map(SPECS.map((s) => [s.id, buildCircuit(s)]));
  return [...cache.values()];
}
export function circuitById(id: string): AeroCircuit | null {
  return aeroCircuits().find((c) => c.course.id === id) ?? null;
}
export const AERO_CIRCUIT_IDS = SPECS.map((s) => s.id);
