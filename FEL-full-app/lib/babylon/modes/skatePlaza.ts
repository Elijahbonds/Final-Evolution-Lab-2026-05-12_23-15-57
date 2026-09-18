// SKATE PLAZA — the street furniture, as DATA.
//
// The park's other features are authored inline in rideWorlds.buildSkatepark, which cannot be tested: the builder
// makes a DynamicTexture on its first line and that needs a canvas, so no headless test can ever reach the layout.
// A park you cannot measure is a park where a rail outside the fence, two rails in the same place, or a bench on
// the spawn point all ship silently.
//
// So the plaza's layout is a pure table: fractions of the venue's bound, rail endpoints, marker positions. The
// builder walks it and makes meshes; the test walks the same table and checks it. Same trick as
// racing/kartCircuits, for the same reason.
//
// A NOTE ON THE WORD OBSTACLE. `RideWorld.obstacles` means HAZARD — snow rocks, surf reef, read by
// SnowboardSlalomMode and SurfBreakMode as things that hurt you. Skate does not read it and should not: to a
// skater an obstacle is a thing you skate, not a thing that kills you. Everything here is real geometry —
// rideable, collidable, grindable where a skater would grind it — never an entry in a hazard list.

export type PlazaSolidKind =
  | 'spine' | 'pyramid' | 'pyramidBank' | 'gapLedge' | 'manualPad' | 'table' | 'bench' | 'wallride'
  | 'bin' | 'planter';

export interface PlazaSolid {
  kind: PlazaSolidKind;
  /** Fractions of the venue bound (−1..1). */
  fx: number;
  fz: number;
  /** Metres. Height is the top surface above the slab. */
  width: number;
  depth: number;
  height: number;
  /** Yaw, radians. */
  ry: number;
  /** Does the rider collide with it and ride on it? Scenery is false. */
  solid: boolean;
  /** A wedge rises toward +z in its own frame; a box is flat-topped. */
  wedge?: boolean;
  /** Leaned back, radians — the wallride. */
  pitch?: number;
}

export interface PlazaRail {
  /**
   * Goal id, for the three features worth a goal. ParkGoals' 'gap' kind is keyed by this and GrindLine already
   * carried the field, so naming a rail is the whole of making it a goal.
   */
  gapId?: string;
  /** Endpoints as [fx, y, fz]; y is metres, fx/fz are fractions of the bound. */
  a: [number, number, number];
  b: [number, number, number];
  bonus: number;
  /** What it belongs to, for the test's benefit and for anyone reading a log line. */
  of: string;
}

export interface PlazaLayout {
  solids: PlazaSolid[];
  rails: PlazaRail[];
  /** Fractions of the bound, with a height — what the mode may point a camera or an objective at. */
  markers: [number, number, number][];
}

/** Clear radius the rider spawns into, metres. Nothing solid may sit inside it. */
export const SPAWN_CLEAR_M = 6;

const S = (
  kind: PlazaSolidKind, fx: number, fz: number,
  width: number, depth: number, height: number,
  opts: { ry?: number; solid?: boolean; wedge?: boolean; pitch?: number } = {},
): PlazaSolid => ({
  kind, fx, fz, width, depth, height,
  ry: opts.ry ?? 0, solid: opts.solid ?? true, wedge: opts.wedge, pitch: opts.pitch,
});

/**
 * The plaza.
 *
 * Bonuses are ordered on purpose, and the order is the difficulty of the lock rather than the size of the feature:
 * a bench (200) is a step up to, the table (240) needs a hop, the kinked rail (300/320) is two locks in a row, the
 * hubba (380) is a ledge you have to be travelling along already, the flat bar over the gap (420) has nothing
 * underneath it, and the wallride lip (460) is 3.3 m up and only reachable with speed.
 */
export const SKATE_PLAZA: PlazaLayout = {
  solids: [
    // A SPINE: two banks back to back — the only feature you transfer OVER rather than ride back down.
    S('spine', -0.12, -0.44 - 0.05, 8.4, 3.4, 1.9, { wedge: true }),
    S('spine', -0.12, -0.44 + 0.05, 8.4, 3.4, 1.9, { wedge: true, ry: Math.PI }),

    // A PYRAMID with banks on all four sides and a hubba down one edge.
    S('pyramid', 0.54, 0.46, 7.2, 7.2, 1.3),
    S('pyramidBank', 0.54, 0.46, 7.2, 3.6, 1.3, { wedge: true }),
    S('pyramidBank', 0.54, 0.46, 7.2, 3.6, 1.3, { wedge: true, ry: Math.PI }),
    S('pyramidBank', 0.54, 0.46, 7.2, 3.6, 1.3, { wedge: true, ry: Math.PI / 2 }),
    S('pyramidBank', 0.54, 0.46, 7.2, 3.6, 1.3, { wedge: true, ry: -Math.PI / 2 }),

    // THE GAP — two ledges with nothing between them. The raised ollie (1.5 m off no charge) is what makes a
    // 4 m gap a decision instead of a wall.
    S('gapLedge', -0.56, -0.1 - 0.11, 6.4, 3.4, 0.9),
    S('gapLedge', -0.56, -0.1 + 0.11, 6.4, 3.4, 0.9),

    // MANUAL PADS: low, flat, long — the only geometry a manual actually wants, added alongside the manual's own
    // fix, because a trick with no terrain built for it is a trick nobody links.
    S('manualPad', 0.3, -0.2, 3.2, 9.5, 0.32),
    S('manualPad', -0.3, 0.68, 3.2, 9.5, 0.32, { ry: Math.PI / 2 }),

    S('table', 0.62, -0.3, 2.4, 4.6, 0.78),
    S('bench', -0.72, 0.56, 1.0, 4.2, 0.52),
    S('bench', 0.74, 0.1, 1.0, 4.2, 0.52, { ry: Math.PI / 2 }),

    // A WALLRIDE, leaned back so speed carries you along it rather than into it.
    S('wallride', 0.2, 0.82, 11, 0.5, 3.2, { pitch: 0.16 }),

    // the things nobody designed for skating
    S('bin', -0.86, -0.5, 0.86, 0.86, 1.05),
    S('bin', 0.86, 0.62, 0.86, 0.86, 1.05),
    S('bin', -0.1, -0.88, 0.86, 0.86, 1.05),
    S('planter', -0.66, 0.86, 2.2, 2.2, 0.7),
    S('planter', 0.66, -0.86, 2.2, 2.2, 0.7),
  ],
  rails: [
    { a: [0.54 - 0.11, 1.36, 0.46 - 0.11], b: [0.54 + 0.11, 1.36, 0.46 - 0.11], bonus: 380, of: 'pyramid hubba', gapId: 'plaza_hubba' },
    { a: [-0.56, 1.0, -0.1 - 0.1], b: [-0.56, 1.0, -0.1 + 0.1], bonus: 420, of: 'flat bar over the gap', gapId: 'plaza_gap' },
    { a: [0.06, 1.7, 0.66], b: [0.06 + 0.1, 1.1, 0.66 + 0.09], bonus: 300, of: 'kinked rail, first half' },
    { a: [0.06 + 0.1, 1.1, 0.66 + 0.09], b: [0.06 + 0.2, 0.6, 0.66 + 0.16], bonus: 320, of: 'kinked rail, second half' },
    { a: [0.62, 0.86, -0.3 - 0.07], b: [0.62, 0.86, -0.3 + 0.07], bonus: 240, of: 'picnic table top' },
    { a: [-0.72, 0.6, 0.56 - 0.06], b: [-0.72, 0.6, 0.56 + 0.06], bonus: 200, of: 'bench, west' },
    { a: [0.74 - 0.06, 0.6, 0.1], b: [0.74 + 0.06, 0.6, 0.1], bonus: 200, of: 'bench, east' },
    { a: [0.2 - 0.16, 3.3, 0.82], b: [0.2 + 0.16, 3.3, 0.82], bonus: 460, of: 'wallride lip', gapId: 'plaza_wallride' },
  ],
  markers: [
    [-0.12, 1.9, -0.44], [0.54, 1.3, 0.46], [-0.56, 0.9, -0.1],
    [0.3, 0.32, -0.2], [-0.3, 0.32, 0.68], [0.2, 3.2, 0.82],
  ],
};

/**
 * WHERE PEOPLE WATCH FROM (BOARD-10PHASE P9).
 *
 * The park's onlookers stood at ten hardcoded points chosen before any of this existed, so a crowd could be
 * facing an empty corner while the whole plaza was on the other side of the slab. A crowd's job is to tell you
 * where the good stuff is, so these are derived from the features: beside the pyramid, along the gap, under the
 * wallride, and on the benches — which is where people sit in a real plaza anyway.
 *
 * Offsets are deliberately clear of each feature's own footprint: onlookers are scenery, and a body standing on
 * the landing of the gap is an obstacle the tests in skatePlaza just spent their time keeping off the line.
 */
export const PLAZA_CROWD: { fx: number; fz: number; watching: string }[] = [
  { fx: 0.54, fz: 0.68, watching: 'pyramid' },
  { fx: 0.62, fz: 0.64, watching: 'pyramid' },
  { fx: -0.56, fz: 0.12, watching: 'the gap' },
  { fx: -0.62, fz: 0.08, watching: 'the gap' },
  { fx: 0.04, fz: 0.72, watching: 'wallride' },
  { fx: 0.34, fz: 0.76, watching: 'wallride' },
  { fx: -0.72, fz: 0.46, watching: 'west bench' },
  { fx: 0.74, fz: 0.2, watching: 'east bench' },
  // The spine is 8.4 m across and its centre sits at fz -0.49, so fz -0.5 put this group ON it, not beside it.
  { fx: -0.2, fz: -0.62, watching: 'spine' },
  { fx: 0.68, fz: -0.36, watching: 'picnic table' },
];

export function plazaCrowd(bound: number): { x: number; z: number; watching: string }[] {
  return PLAZA_CROWD.map((c) => ({ x: atBound(c.fx, bound), z: atBound(c.fz, bound), watching: c.watching }));
}

/** Metres from a fraction of the bound. */
export const atBound = (fraction: number, bound: number): number => fraction * bound;

/** Every solid's world centre, for the builder and the test to agree on. */
export function plazaSolids(bound: number): (PlazaSolid & { x: number; z: number })[] {
  return SKATE_PLAZA.solids.map((s) => ({ ...s, x: atBound(s.fx, bound), z: atBound(s.fz, bound) }));
}

/** Every rail's world endpoints. */
export function plazaRails(bound: number): {
  a: [number, number, number]; b: [number, number, number]; bonus: number; of: string; gapId?: string;
}[] {
  return SKATE_PLAZA.rails.map((r) => ({
    a: [atBound(r.a[0], bound), r.a[1], atBound(r.a[2], bound)] as [number, number, number],
    b: [atBound(r.b[0], bound), r.b[1], atBound(r.b[2], bound)] as [number, number, number],
    bonus: r.bonus,
    of: r.of,
    gapId: r.gapId,
  }));
}

/** The features a goal can name. */
export const plazaGoalRails = (): PlazaRail[] => SKATE_PLAZA.rails.filter((r) => r.gapId);

export function plazaMarkers(bound: number): [number, number, number][] {
  return SKATE_PLAZA.markers.map(([fx, y, fz]) => [atBound(fx, bound), y, atBound(fz, bound)]);
}

// ── WALLS AND LIPS (2026-09-18: wall rides, wallplants, lip tricks) ─────────────────────────────────────────────────
// Derived from the table above, so a wall the layout moves takes its ride with it. The rideable faces are the wallride's
// park-side face and the four fence lines; the lips are the spine's crest (from either side), the pyramid deck's four
// edges (up any bank), and the wallride lip (reached off a wall ride).
import type { Wall, Lip } from '../core/WallRide';

/** The fence is a rail you can ride up to this high. */
export const FENCE_RIDE_HEIGHT = 1.85;   // the built fence is 1.9 m

export function plazaWalls(bound: number): Wall[] {
  const walls: Wall[] = [];
  for (const s of SKATE_PLAZA.solids) {
    if (s.kind !== 'wallride') continue;
    const cx = atBound(s.fx, bound), cz = atBound(s.fz, bound);
    // the face toward the park: the wall stands near the +z edge, so its rideable side looks −z (its yaw is 0 in the table)
    const hw = s.width / 2, faceZ = cz - s.depth / 2;
    walls.push({ a: { x: cx - hw, z: faceZ }, b: { x: cx + hw, z: faceZ }, nx: 0, nz: -1, height: s.height, lean: s.pitch ?? 0, label: 'the wallride' });
  }
  const B = bound;
  walls.push({ a: { x: -B, z: B }, b: { x: B, z: B }, nx: 0, nz: -1, height: FENCE_RIDE_HEIGHT, lean: 0, label: 'the north fence' });
  walls.push({ a: { x: -B, z: -B }, b: { x: B, z: -B }, nx: 0, nz: 1, height: FENCE_RIDE_HEIGHT, lean: 0, label: 'the south fence' });
  walls.push({ a: { x: B, z: -B }, b: { x: B, z: B }, nx: -1, nz: 0, height: FENCE_RIDE_HEIGHT, lean: 0, label: 'the east fence' });
  walls.push({ a: { x: -B, z: -B }, b: { x: -B, z: B }, nx: 1, nz: 0, height: FENCE_RIDE_HEIGHT, lean: 0, label: 'the west fence' });
  return walls;
}

export function plazaLips(bound: number): Lip[] {
  const lips: Lip[] = [];
  // THE SPINE IS TWO BANKS WITH A GAP (measured on the built plaza: wedges at z −30.8..−27.4 and −21.8..−18.4 for a 56 m
  // bound) — each has its own crest at its high end, and each is approached up its own face
  for (const s of SKATE_PLAZA.solids) {
    if (s.kind !== 'spine') continue;
    const cx = atBound(s.fx, bound), cz = atBound(s.fz, bound), hw = s.width / 2, hd = s.depth / 2;
    const flipped = Math.abs(s.ry) > 1;                        // ry π: rises toward −z
    // the builder places a wedge by its HIGH end (position = table z − cos(ry)·depth/2, rising toward it): the table's z IS the crest
    // (measured: the table's −27.4 / −21.8 are the wedges' high ends, bounds −30.8..−27.4 and −21.8..−18.4)
    void hd;
    const crestZ = cz, uz = flipped ? -1 : 1;
    lips.push({ a: { x: cx - hw, z: crestZ }, b: { x: cx + hw, z: crestZ }, y: s.height, ux: 0, uz, label: flipped ? 'the spine (north bank)' : 'the spine (south bank)' });
  }
  // THE PYRAMID'S banks rise from its four edges to its centre lines, so the lips are the two ridges, each from either side
  const pyr = SKATE_PLAZA.solids.find((s) => s.kind === 'pyramid');
  if (pyr) {
    const cx = atBound(pyr.fx, bound), cz = atBound(pyr.fz, bound), hw = pyr.width / 2, hd = pyr.depth / 2, y = pyr.height;
    lips.push({ a: { x: cx - hw, z: cz }, b: { x: cx + hw, z: cz }, y, ux: 0, uz: 1, label: 'the pyramid (up the south bank)' });
    lips.push({ a: { x: cx - hw, z: cz }, b: { x: cx + hw, z: cz }, y, ux: 0, uz: -1, label: 'the pyramid (up the north bank)' });
    lips.push({ a: { x: cx, z: cz - hd }, b: { x: cx, z: cz + hd }, y, ux: 1, uz: 0, label: 'the pyramid (up the west bank)' });
    lips.push({ a: { x: cx, z: cz - hd }, b: { x: cx, z: cz + hd }, y, ux: -1, uz: 0, label: 'the pyramid (up the east bank)' });
  }
  const lipRail = SKATE_PLAZA.rails.find((r) => r.gapId === 'plaza_wallride');
  if (lipRail) lips.push({ a: { x: atBound(lipRail.a[0], bound), z: atBound(lipRail.a[2], bound) }, b: { x: atBound(lipRail.b[0], bound), z: atBound(lipRail.b[2], bound) }, y: lipRail.a[1], ux: 0, uz: 1, label: 'the wallride lip' });
  return lips;
}
