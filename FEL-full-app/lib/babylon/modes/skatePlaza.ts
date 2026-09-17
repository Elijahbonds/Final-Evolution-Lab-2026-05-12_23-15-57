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
    { a: [0.54 - 0.11, 1.36, 0.46 - 0.11], b: [0.54 + 0.11, 1.36, 0.46 - 0.11], bonus: 380, of: 'pyramid hubba' },
    { a: [-0.56, 1.0, -0.1 - 0.1], b: [-0.56, 1.0, -0.1 + 0.1], bonus: 420, of: 'flat bar over the gap' },
    { a: [0.06, 1.7, 0.66], b: [0.06 + 0.1, 1.1, 0.66 + 0.09], bonus: 300, of: 'kinked rail, first half' },
    { a: [0.06 + 0.1, 1.1, 0.66 + 0.09], b: [0.06 + 0.2, 0.6, 0.66 + 0.16], bonus: 320, of: 'kinked rail, second half' },
    { a: [0.62, 0.86, -0.3 - 0.07], b: [0.62, 0.86, -0.3 + 0.07], bonus: 240, of: 'picnic table top' },
    { a: [-0.72, 0.6, 0.56 - 0.06], b: [-0.72, 0.6, 0.56 + 0.06], bonus: 200, of: 'bench, west' },
    { a: [0.74 - 0.06, 0.6, 0.1], b: [0.74 + 0.06, 0.6, 0.1], bonus: 200, of: 'bench, east' },
    { a: [0.2 - 0.16, 3.3, 0.82], b: [0.2 + 0.16, 3.3, 0.82], bonus: 460, of: 'wallride lip' },
  ],
  markers: [
    [-0.12, 1.9, -0.44], [0.54, 1.3, 0.46], [-0.56, 0.9, -0.1],
    [0.3, 0.32, -0.2], [-0.3, 0.32, 0.68], [0.2, 3.2, 0.82],
  ],
};

/** Metres from a fraction of the bound. */
export const atBound = (fraction: number, bound: number): number => fraction * bound;

/** Every solid's world centre, for the builder and the test to agree on. */
export function plazaSolids(bound: number): (PlazaSolid & { x: number; z: number })[] {
  return SKATE_PLAZA.solids.map((s) => ({ ...s, x: atBound(s.fx, bound), z: atBound(s.fz, bound) }));
}

/** Every rail's world endpoints. */
export function plazaRails(bound: number): { a: [number, number, number]; b: [number, number, number]; bonus: number; of: string }[] {
  return SKATE_PLAZA.rails.map((r) => ({
    a: [atBound(r.a[0], bound), r.a[1], atBound(r.a[2], bound)] as [number, number, number],
    b: [atBound(r.b[0], bound), r.b[1], atBound(r.b[2], bound)] as [number, number, number],
    bonus: r.bonus,
    of: r.of,
  }));
}

export function plazaMarkers(bound: number): [number, number, number][] {
  return SKATE_PLAZA.markers.map(([fx, y, fz]) => [atBound(fx, bound), y, atBound(fz, bound)]);
}
