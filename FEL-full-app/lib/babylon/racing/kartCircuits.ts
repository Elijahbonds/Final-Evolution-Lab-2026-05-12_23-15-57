// KART CIRCUITS — the four kart courses, each derived from one racing line.
//
// This replaces four to ten authored checkpoints per course with sixteen to twenty authored LINE points, and derives
// the checkpoints from the line instead. The invariant VelocityKartMode depends on is unchanged: there is still
// exactly one source for where the course goes, so the road and the gates still cannot disagree. What changes is that
// the road is now a curve rather than a polygon.
//
// WHAT WAS ACTUALLY WRONG, measured before touching anything:
//
//   course            gates   lap      race      footprint
//   boardwalk-loop      4     850 m    1701 m    280 x 320 m
//   stadium-oval       10     942 m    1884 m    164 x 384 m
//   rooftop-circuit     8     748 m    1496 m    260 x 260 m
//   alpine-descent      6    1046 m    1046 m    245 x 900 m
//
// A real racing kart circuit is ~1100-1200 m at 7-9 m wide; these are 748-1046 m at 18 m wide, which is circuit-sized
// and correctly wider for arcade racing. At the courses' own gold times they run 52-56 s a lap, LONGER than the
// arcade racers they answer to. So they were never too small. BOARDWALK LOOP's road was a quadrilateral with four
// 212 m straight legs, and its own `sub` promised "bank boost in the hairpin" on a course that had no hairpin.
//
// THE GRIP FLOOR IS DECLARED, NOT ASSUMED. The starter kart holds ~61 m (26 m/s, 11 m/s^2). Every spec below states
// the tightest corner it MEANS to have, and kartCircuits.test.ts measures the built line and fails if the geometry
// disagrees. That is the whole difference between ROOFTOP CIRCUIT, whose premise is corners you cannot hold, and the
// original boardwalk loop, which broke traction by accident and logged 516 drift frames with drifting switched off.
// A course below the floor must also carry `slideNote`, which the picker shows, because a course tighter than grip is
// only fair when the player was told.

import { Vector3 } from '@babylonjs/core';
import type { Course, Gate } from '../core/RaceCourse';
import {
  type RacingLine, cornerRadiusAt, elevationProfile, holdableRadius, locate, pointAlong, sampleLine, tightestCorner,
} from './racingLine';

/** The starter kart, from KartModel: these two numbers set every corner on every course. */
export const STARTER_TOP_SPEED = 26;   // m/s
export const STARTER_GRIP = 11;        // m/s^2
/** ~61 m. The tightest corner the starter kart can hold without the rear breaking away. */
export const HOLDABLE_RADIUS = holdableRadius(STARTER_TOP_SPEED, STARTER_GRIP);

export type RampSize = 'kicker' | 'jump' | 'gap';

export interface KartRamp {
  /** Metres along the lap. */
  dist: number;
  size: RampSize;
  /** Take-off angle, degrees. */
  pitch: number;
  /** Length of the ramp surface, metres. */
  run: number;
  /** Metres of flat landing beyond the lip; a `gap` has none until the far side. */
  gap: number;
}

export interface KartObstacle {
  dist: number;
  /** Sideways offset from the line, + = right of travel. Never zero: an obstacle ON the line is a wall, not a choice. */
  lateral: number;
  kind: 'barrel' | 'cone' | 'planter' | 'crate' | 'puddle' | 'gravel';
}

export interface KartKerb {
  from: number;
  to: number;
  /** Which side the corner turns towards, so the kerb goes on the apex. */
  side: -1 | 1;
  radius: number;
}

export interface KartCircuit {
  course: Course;
  line: RacingLine;
  /** Half-width of the road at the line. */
  halfWidth: number;
  /** What the spec claims its tightest corner is, and what the built line measures. */
  declaredMinRadius: number;
  measuredMinRadius: number;
  slideNote: string | null;
  ramps: KartRamp[];
  obstacles: KartObstacle[];
  kerbs: KartKerb[];
  elevation: { climb: number; drop: number; low: number; high: number };
  /** Road surface height, and how far off the line before it is no longer road. */
  surfaceAt: (x: number, z: number) => number;
}

interface KartSpec {
  id: string;
  name: string;
  sub: string;
  venue: Course['venue'];
  mood: Course['mood'];
  tint: string;
  loop: boolean;
  laps: number;
  /** x, z, y — y is world height, so a descent actually descends. */
  pts: [number, number, number][];
  halfWidth: number;
  /** The tightest corner this course means to have. Enforced by the test. */
  declaredMinRadius: number;
  /** Required when declaredMinRadius < HOLDABLE_RADIUS. Shown to the player. */
  slideNote?: string;
  /** Fractions of the lap where the road launches. */
  ramps: { at: number; size: RampSize }[];
  obstacles?: { at: number; lateral: number; kind: KartObstacle['kind'] }[];
}

const RAMP_SHAPE: Record<RampSize, { pitch: number; run: number; gap: number }> = {
  kicker: { pitch: 9, run: 12, gap: 26 },   // a hop; keeps the nose down, lands on the road
  jump: { pitch: 15, run: 18, gap: 42 },    // long enough in the air for one trick
  gap: { pitch: 18, run: 22, gap: 0 },      // nothing underneath; the landing is the far side
};

const SPECS: KartSpec[] = [
  {
    // ONE LONG STRAIGHT AND A REAL HAIRPIN. The `sub` has always promised a hairpin to bank boost in; with four gates
    // there was no hairpin to bank it in. The 236 m beach straight is kept — it is what the oval was supposed to
    // contrast with and what the slipstream is tuned against — and everything after it is now a sequence rather than
    // a corner: sweep right onto the pier, the hairpin at the pier head, then esses back through the boardwalk.
    id: 'boardwalk-loop', name: 'BOARDWALK LOOP', sub: 'One long straight. Bank boost in the hairpin.',
    venue: 'park', mood: 'goldenHour', tint: '#ffb36b',
    loop: true, laps: 2, halfWidth: 9,
    declaredMinRadius: 30,
    slideNote: 'The pier hairpin is tighter than grip. Slide it or brake for it.',
    pts: [
      [0, 0, 0], [0, 78, 0], [0, 156, 0], [2, 236, 0],
      [26, 296, 0.6], [76, 332, 1.2], [132, 330, 1.8], [178, 298, 2.2],
      [196, 250, 2.4], [178, 217.3, 2.4], [146.4, 202.6, 2.2], [120, 166, 1.8],
      [134, 108, 1.4], [169, 57.1, 1], [148, -10, 0.6], [90, -46, 0.3],
      [33.3, -60.8, 0.1], [2.7, -38.3, 0],
    ],
    ramps: [{ at: 0.63, size: 'kicker' }, { at: 0.88, size: 'jump' }],
    obstacles: [
      { at: 0.30, lateral: 6.5, kind: 'planter' }, { at: 0.335, lateral: -6.5, kind: 'planter' },
      { at: 0.52, lateral: -7, kind: 'barrel' }, { at: 0.545, lateral: -5, kind: 'barrel' },
      { at: 0.72, lateral: 7, kind: 'cone' }, { at: 0.735, lateral: 5.5, kind: 'cone' }, { at: 0.75, lateral: 4, kind: 'cone' },
      { at: 0.17, lateral: 8, kind: 'puddle' },
    ],
  },
  {
    // TWO STRAIGHTS UNDER THE LIGHTS. The ends stay 82 m arcs — the measured fix for the original hexagon, whose
    // 98-degree vertices made a 54 m corner on the course that was supposed to be the top-speed one. What is added is
    // a KINK a third of the way down each straight: not enough to need a brake, enough that flat out is a line
    // choice rather than a held button. The ends are also the only banked corners in the set.
    id: 'stadium-oval', name: 'STADIUM OVAL', sub: 'Two straights under the lights. Top speed wins here.',
    venue: 'pitch', mood: 'nightGame', tint: '#9fb7ff',
    loop: true, laps: 2, halfWidth: 10,
    // 64 m is chosen, not eyeballed: 61 m is what the kart holds AT TOP SPEED, so a tightest corner above that
    // means the entire lap is flat out — which is the only thing "top speed wins here" can honestly mean.
    declaredMinRadius: 64,
    pts: [
      [82, 80, 0], [86, 150, 0], [82, 220, 0], [82, 300, 0],
      [70, 344, 0.8], [40, 372, 1.4], [0, 382, 1.6], [-40, 372, 1.4],
      [-69.5, 343.6, 0.8], [-82, 300, 0], [-86, 230, 0], [-82, 160, 0],
      [-82, 80, 0], [-70, 36, 0.8], [-40, 8, 1.4], [0, -2, 1.6],
      [40, 8, 1.4], [69.5, 36.4, 0.8],
    ],
    ramps: [],
    obstacles: [
      { at: 0.21, lateral: 9, kind: 'cone' }, { at: 0.71, lateral: -9, kind: 'cone' },
    ],
  },
  {
    // EVERY CORNER INSIDE THE LIMIT — the one course where that is the premise rather than the bug, and the picker
    // says so. Now it is also a ROOFTOP circuit in elevation as well as in name: the eight rooftops sit at different
    // heights, and the two lowest are reached across gaps with nothing underneath, which is where the kart's air
    // tricks live. Tighter corners than the original, because the alternating radii now have sampled curves between
    // them rather than straight chords.
    id: 'rooftop-circuit', name: 'ROOFTOP CIRCUIT', sub: 'Every corner is tighter than grip. Slide the whole lap.',
    venue: 'street', mood: 'overcast', tint: '#b8c4d4',
    loop: true, laps: 2, halfWidth: 8,
    declaredMinRadius: 24,
    slideNote: 'Nothing here can be held on grip. The whole lap is the drift.',
    pts: [
      [130, 0, 18], [112, 46, 18], [64, 62, 16], [22, 92, 14],
      [-3.2, 120, 12], [-38, 118, 12], [-70, 84, 10], [-118, 62, 6],
      [-130, 12, 6], [-112, -38, 8], [-72, -62, 10], [-33.7, -63.5, 12],
      [-4, -92, 14], [28.6, -119.9, 16], [72, -108, 18], [104, -72, 18],
      [126, -36, 18],
    ],
    ramps: [{ at: 0.34, size: 'gap' }, { at: 0.61, size: 'jump' }, { at: 0.83, size: 'gap' }],
    obstacles: [
      { at: 0.08, lateral: 5.5, kind: 'crate' }, { at: 0.235, lateral: -5.5, kind: 'crate' },
      { at: 0.47, lateral: 6, kind: 'barrel' }, { at: 0.49, lateral: 4, kind: 'barrel' },
      { at: 0.70, lateral: -6, kind: 'gravel' }, { at: 0.93, lateral: 6, kind: 'cone' },
    ],
  },
  {
    // POINT TO POINT, AND NOW ACTUALLY A DESCENT. Every gate on this course was authored at y = 0, so the mountain
    // run down was flat: the name, the alpine mood and the "no lap to fix it on" character all described a course
    // the geometry did not have. It now drops 96 m over 1.1 km — about 8.5%, a real mountain road — which is also
    // what makes its long sweepers pay, since gravity does the work the boost meter does elsewhere. Corners stay at
    // or above what the kart can hold: this is the pace course, and the one where SLIPSTREAM's missing grip costs
    // least.
    id: 'alpine-descent', name: 'ALPINE DESCENT', sub: 'One run down the mountain. No lap to fix it on.',
    venue: 'slope', mood: 'alpine', tint: '#cfe8ff',
    loop: false, laps: 1, halfWidth: 9,
    declaredMinRadius: 62,
    pts: [
      [-30, -430, 96], [-16, -356, 90], [8, -286, 82], [46, -224, 73],
      [96, -168, 64], [126, -96, 55], [116, -22, 47], [78, 44, 40],
      [58, 118, 33], [16, 178, 27], [-52, 214, 21], [-113.4, 254.8, 16],
      [-134, 320, 11], [-104, 386, 7], [-62, 436, 3], [-40, 478, 0],
    ],
    ramps: [{ at: 0.42, size: 'jump' }, { at: 0.77, size: 'kicker' }],
    obstacles: [
      { at: 0.19, lateral: 7, kind: 'planter' }, { at: 0.35, lateral: -7.5, kind: 'gravel' },
      { at: 0.58, lateral: 7.5, kind: 'gravel' }, { at: 0.66, lateral: -6, kind: 'barrel' },
      { at: 0.88, lateral: 6.5, kind: 'cone' },
    ],
  },
];

/** Corners tighter than this get a kerb on the apex; it is also roughly where a kart starts to need the brake. */
const KERB_RADIUS = 90;

function buildKerbs(line: RacingLine, step = 6): KartKerb[] {
  const out: KartKerb[] = [];
  let open: KartKerb | null = null;
  const span = line.loop ? line.length : line.length - 12;
  for (let d = line.loop ? 0 : 12; d < span; d += step) {
    const r = cornerRadiusAt(line, d);
    if (r < KERB_RADIUS) {
      // which way it turns: cross product of the tangent before and after
      const t0 = pointAlong(line, d - 10).tangent;
      const t1 = pointAlong(line, d + 10).tangent;
      const side: -1 | 1 = (t0.x * t1.z - t0.z * t1.x) > 0 ? -1 : 1;
      if (open && open.side === side && d - open.to <= step * 2) {
        open.to = d;
        open.radius = Math.min(open.radius, r);
      } else {
        if (open) out.push(open);
        open = { from: d, to: d, side, radius: r };
      }
    }
  }
  if (open) out.push(open);
  // a kerb shorter than a kart is scenery noise, not a kerb
  return out.filter((k) => k.to - k.from >= 8);
}

export function buildKartCircuit(spec: KartSpec): KartCircuit {
  if (spec.declaredMinRadius < HOLDABLE_RADIUS && !spec.slideNote) {
    throw new Error(
      `${spec.id} declares a ${spec.declaredMinRadius} m corner, inside the ${Math.round(HOLDABLE_RADIUS)} m the ` +
      `starter kart can hold, without a slideNote. A course tighter than grip is only fair when the player is told.`,
    );
  }

  const line = sampleLine(spec.pts, { loop: spec.loop });
  const L = line.length;

  // CHECKPOINTS, every ~110 m, facing the way the line runs — the same cadence aeroCircuits uses. Wide, because they
  // are lap logic and not a slalom: a gate you can miss while on the road is a bug.
  const count = Math.max(6, Math.round(L / 110));
  const gates: Gate[] = [];
  for (let i = 1; i <= count; i++) {
    const { pos, tangent } = pointAlong(line, (i / count) * L);
    gates.push({ at: pos, through: tangent, radius: spec.halfWidth + 6 });
  }

  const start = pointAlong(line, 0);
  const { radius: measuredMinRadius } = tightestCorner(line);

  const ramps: KartRamp[] = spec.ramps.map(({ at, size }) => ({
    dist: at * L, size, ...RAMP_SHAPE[size],
  }));

  const obstacles: KartObstacle[] = (spec.obstacles ?? []).map(({ at, lateral, kind }) => ({
    dist: at * L, lateral, kind,
  }));

  // The road surface: the line's own height, held flat across the road and falling away past the kerb, so that
  // leaving the road READS as leaving the road rather than as an invisible penalty.
  const surfaceAt = (x: number, z: number): number => {
    const at = locate(line, x, z);
    const off = Math.abs(at.lateral) - spec.halfWidth;
    return off <= 0 ? at.point.y : at.point.y - Math.min(6, off * 0.35);
  };

  const course: Course = {
    id: spec.id, name: spec.name, sub: spec.sub, kind: 'kart',
    venue: spec.venue, mood: spec.mood, tint: spec.tint, ready: true,
    gates, loop: spec.loop, laps: spec.laps,
    // THE DENSE LINE, published on the course so that everything downstream measures against the curve the
    // player drives rather than against the checkpoint polyline. The gates are ~110 m apart: a polyline
    // through them cuts every corner, so onTrack() would have called the apex of a corner off-road.
    path: line.pts,
    start: {
      at: spec.loop ? start.pos.add(start.tangent.scale(-14)) : start.pos,
      heading: Math.atan2(start.tangent.x, start.tangent.z),
    },
    // Gold pace: the old courses ran 52-56 s a lap at gold, which is the feel being preserved. 17 m/s average is
    // that pace on these lengths — below the 26 m/s top speed, because a lap is corners and not a straight.
    gold: Math.round((L * spec.laps) / 17),
  };

  return {
    course, line, halfWidth: spec.halfWidth,
    declaredMinRadius: spec.declaredMinRadius, measuredMinRadius,
    slideNote: spec.slideNote ?? null,
    ramps, obstacles, kerbs: buildKerbs(line),
    elevation: elevationProfile(line),
    surfaceAt,
  };
}

let cache: Map<string, KartCircuit> | null = null;
export function kartCircuits(): KartCircuit[] {
  cache ??= new Map(SPECS.map((s) => [s.id, buildKartCircuit(s)]));
  return [...cache.values()];
}
export function kartCircuitById(id: string): KartCircuit | null {
  return kartCircuits().find((c) => c.course.id === id) ?? null;
}
export const KART_CIRCUIT_IDS = SPECS.map((s) => s.id);
export const KART_SPECS_FOR_TEST: readonly KartSpec[] = SPECS;
