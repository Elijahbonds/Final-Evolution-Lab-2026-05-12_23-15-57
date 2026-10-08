/**
 * Rails the app already has, as an Adventure RailNetwork (lane A1; docs/ADVENTURE-PLAN.md "rails/adapters.ts").
 *
 * The board modes grind on `GrindLine`s (core/GroundRide: a two-point bar with a bonus), built by rideWorlds' scene
 * builders. Those builders need a canvas (they paint a DynamicTexture first), so the LAYOUTS they place are read from
 * the pure tables they read: skatePlaza.plazaRails for the plaza's street furniture, snowSlope.SNOW_SLOPE for the snow
 * park's rails, and rideWorlds' own arithmetic for the rest (mirrored here, said so, and pinned by adapters.test.ts).
 * A live world's lines (RideWorld.grindLines) adapt directly through grindLinesToRailNetwork.
 *
 * Every adapter links rails that meet end to end (the plaza's kinked rail is two lines) and returns a network that
 * passes contracts.validateRailNetwork. addParallelSwitches gives A4's world builders switch points between parallel
 * rails without hand-authoring each one.
 */

import type { RailNetwork, RailSegment, RailSwitch, Vec3 } from '../contracts';
import { plazaRails } from '@/lib/babylon/modes/skatePlaza';
import { SNOW_SLOPE } from '@/lib/babylon/modes/snowSlope';
import { buildRailPath, nearestOnPath, railNearest, sampleRail } from './railMath';

/** Anything shaped like core/GroundRide.GrindLine (its Vector3s read as plain x/y/z). */
export interface LineLike { a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number }; bonus?: number; gapId?: string }

const P = (p: { x: number; y: number; z: number }): Vec3 => ({ x: p.x, y: p.y, z: p.z });
const near = (a: Vec3, b: Vec3, m: number): boolean => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= m;

/**
 * Link segments whose ends meet (within `joinM`): an end that touches another segment's end or start becomes `next`
 * (at its end) or `prev` (at its start). The grind finds the right end of the linked rail either way round.
 */
export function linkEnds(segments: RailSegment[], joinM = 0.05): RailSegment[] {
  for (const s of segments) {
    const s0 = s.points[0], s1 = s.points[s.points.length - 1];
    for (const t of segments) {
      if (t === s) continue;
      const t0 = t.points[0], t1 = t.points[t.points.length - 1];
      if (!s.next && (near(s1, t0, joinM) || near(s1, t1, joinM))) s.next = t.id;
      if (!s.prev && (near(s0, t0, joinM) || near(s0, t1, joinM))) s.prev = t.id;
    }
  }
  return segments;
}

/** Grind lines (a live RideWorld's, or any two-point bars) as a network. High-bonus lines are trick zones. */
export function grindLinesToRailNetwork(id: string, lines: readonly LineLike[], joinM = 0.05): RailNetwork {
  const segments: RailSegment[] = lines
    .filter((l) => Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y, l.b.z - l.a.z) > 0.5)
    .map((l, i) => ({
      id: l.gapId ?? `${id}:${i}`,
      points: [P(l.a), P(l.b)],
      speedBias: 0,
      switches: [],
      ...((l.bonus ?? 0) >= 300 ? { tags: ['trickZone'] as const } : {}),
    }));
  return { id, segments: linkEnds(segments, joinM) };
}

/** The plaza's street furniture (skatePlaza.plazaRails), at a venue's bound. */
export function skatePlazaRailNetwork(bound: number): RailNetwork {
  const lines = plazaRails(bound).map((r) => ({
    a: { x: r.a[0], y: r.a[1], z: r.a[2] }, b: { x: r.b[0], y: r.b[1], z: r.b[2] }, bonus: r.bonus, gapId: r.gapId,
  }));
  return grindLinesToRailNetwork(`plaza@${bound}`, lines);
}

/**
 * The skatepark's six hand-placed rails, as fractions of the bound. MIRRORED from rideWorlds.buildSkatepark (its
 * `makeRail` calls after "const grindLines"), which cannot run headless. assumption: the builder still places them
 * there; if it moves one, this table must follow (adapters.test.ts checks the shape, not the builder).
 */
export const SKATEPARK_RAILS: readonly { a: [number, number, number]; b: [number, number, number]; bonus: number; dx?: number }[] = [
  { a: [-0.18, 0.8, 0.12], b: [-0.18, 0.8, 0.36], bonus: 180 },
  { a: [0.18, 0.8, -0.12], b: [0.18, 0.8, -0.36], bonus: 180 },
  { a: [0.48, 2.9, -0.54], b: [0.48, 0.9, 0.18], bonus: 220 },
  { a: [-0.06, 0.8, 0.6], b: [0.18, 0.8, 0.72], bonus: 260 },
  { a: [0.18, 0.8, 0.72], b: [0.42, 0.8, 0.6], bonus: 300 },
  // the handrail down the stair set: x is a fraction PLUS 5 m, z runs 4.4 m from its fraction
  { a: [0.12, 1.5, -0.62], b: [0.12, 0.5, -0.62], bonus: 340, dx: 5 },
];

/** The whole skatepark at a venue's bound: its six rails and the plaza's furniture, linked. */
export function skateparkRailNetwork(bound: number): RailNetwork {
  const own = SKATEPARK_RAILS.map((r, i) => {
    const a = { x: r.a[0] * bound + (r.dx ?? 0), y: r.a[1], z: r.a[2] * bound };
    const b = r.dx !== undefined
      ? { x: r.b[0] * bound + r.dx, y: r.b[1], z: r.b[2] * bound + 4.4 }
      : { x: r.b[0] * bound, y: r.b[1], z: r.b[2] * bound };
    return { a, b, bonus: r.bonus, gapId: `park:${i}` };
  });
  const plaza = plazaRails(bound).map((r) => ({
    a: { x: r.a[0], y: r.a[1], z: r.a[2] }, b: { x: r.b[0], y: r.b[1], z: r.b[2] }, bonus: r.bonus, gapId: r.gapId,
  }));
  return grindLinesToRailNetwork(`skatepark@${bound}`, [...own, ...plaza]);
}

/** rideWorlds.SLOPE_PITCH, copied by value (rideWorlds imports Babylon); pinned by adapters.test.ts. */
export const SLOPE_PITCH = 0.22;

/**
 * The snow park's rails: each SNOW_SLOPE feature with a bonus carries a bar along its top edge, on the pitched piste,
 * plus the ski-lift cable between pylons 2 and 3 (a 'grindable-cable'). Mirrors rideWorlds.buildSlopeRun's arithmetic
 * (onPiste, the piste's normal, the pylon tops). `half` is the venue's bound, `pitch` its SLOPE_PITCH × ride pitch.
 */
export function snowSlopeRailNetwork(half: number, pitch = SLOPE_PITCH): RailNetwork {
  const onPiste = (x: number, dist: number): Vec3 => ({ x, y: -Math.sin(pitch) * dist, z: Math.cos(pitch) * dist });
  const up = { x: 0, y: Math.cos(pitch), z: Math.sin(pitch) };
  const lines: LineLike[] = [];
  SNOW_SLOPE.forEach((f, i) => {
    if (!(f.bonus > 0)) return;
    const x = f.lateral * half;
    const a = onPiste(x, f.dist), b = onPiste(x, f.dist + f.length);
    lines.push({
      a: { x: a.x + up.x * f.height, y: a.y + up.y * f.height, z: a.z + up.z * f.height },
      b: { x: b.x + up.x * f.height, y: b.y + up.y * f.height, z: b.z + up.z * f.height },
      bonus: f.bonus, gapId: `snow:${f.kind}:${i}`,
    });
  });
  const pylon = (i: number): Vec3 => { const p = onPiste(half - 3.5, 30 + i * 40); return { x: p.x, y: p.y + 5.2, z: p.z }; };
  lines.push({ a: pylon(2), b: pylon(3), bonus: 400, gapId: 'snow:lift' });
  const net = grindLinesToRailNetwork(`snow@${half}`, lines);
  const cable = net.segments.find((s) => s.id === 'snow:lift');
  if (cable) cable.tags = ['grindable-cable'];
  return net;
}

export interface ParallelOpts {
  /** Rails count as parallel when their directions agree this well (|cos|). */
  parallelCos?: number;
  /** The lateral gap a hop can cover, metres. */
  minGapM?: number;
  maxGapM?: number;
  /** A switch point every this many metres, each with this window. */
  everyM?: number;
  windowM?: number;
  /** The heights may differ by at most this. */
  maxRiseM?: number;
}

/**
 * Add switch points between parallel rails: walking each rail, wherever another rail runs alongside within the gap, a
 * switch to it on that side. Returns a new network (the input is not changed). For world builders: a pair of rails
 * laid side by side becomes switchable without hand-authoring each point.
 */
export function addParallelSwitches(net: RailNetwork, o: ParallelOpts = {}): RailNetwork {
  const cosMin = o.parallelCos ?? 0.97, gapMin = o.minGapM ?? 1.2, gapMax = o.maxGapM ?? 5;
  const every = o.everyM ?? 6, win = o.windowM ?? 1.5, rise = o.maxRiseM ?? 1.5;
  const segments = net.segments.map((s) => ({ ...s, switches: [...s.switches] }));
  const paths = segments.map((s) => buildRailPath(s));
  const p = { x: 0, y: 0, z: 0 }, t = { x: 0, y: 0, z: 0 }, q = { x: 0, y: 0, z: 0 }, u = { x: 0, y: 0, z: 0 };
  const n = railNearest();
  paths.forEach((from, i) => {
    for (let s = Math.min(every / 2, from.length / 2); s < from.length; s += every) {
      sampleRail(from, s, p, t);
      const tl = Math.hypot(t.x, t.z);
      if (tl < 1e-3) continue;
      paths.forEach((to, j) => {
        if (i === j) return;
        nearestOnPath(to, p, n);
        if (n.s <= 0.01 || n.s >= to.length - 0.01) return;
        sampleRail(to, n.s, q, u);
        const ul = Math.hypot(u.x, u.z);
        if (ul < 1e-3 || Math.abs((t.x * u.x + t.z * u.z) / (tl * ul)) < cosMin) return;
        const dx = n.point.x - p.x, dz = n.point.z - p.z, gap = Math.hypot(dx, dz);
        if (gap < gapMin || gap > gapMax || Math.abs(n.point.y - p.y) > rise) return;
        // side: + when the other rail is to the RIGHT of increasing s (right of yaw θ is (cos θ, −sin θ))
        const side: -1 | 1 = (dx * (t.z / tl) - dz * (t.x / tl)) > 0 ? 1 : -1;
        const sw: RailSwitch = { atM: s, windowM: win, side, toSegment: segments[j].id, toAtM: n.s };
        if (!segments[i].switches.some((w) => w.toSegment === sw.toSegment && Math.abs(w.atM - s) < every / 2)) segments[i].switches.push(sw);
      });
    }
  });
  return { id: net.id, segments };
}
