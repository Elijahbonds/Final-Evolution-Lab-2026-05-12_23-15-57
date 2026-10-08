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

import type { CoinLook } from '../core/Pickups';

/**
 * SKATE-SCORE (SK-6, 2026-09-29): the plaza's coins. The shared coin (0.34 m, metal 0.9, glow 0.22) went dark olive in
 * Venice's golden-hour haze, and its lines and arcs over the plaza read as "olive dot particles" (eye 9096d7cf, skate/100–111;
 * the run collected none). Bigger, less mirror and more self-lit, it reads as gold across the park. Only skate asks for it.
 */
export const SKATE_COIN_LOOK: Readonly<CoinLook> = { diameter: 0.42, glow: 0.35, metallic: 0.65 };

// ── THE PARK'S OTHER FEATURES, AS NUMBERS (IMPROVE 2026-10-06) ─────────────────────────────────────────────────────
// The downhill lane, the bowl and the centre funbox are still built inline by rideWorlds.buildSkatepark, but their
// numbers live here so the coin lines that run over them can be laid out — and tested — without a canvas. rideWorlds
// reads these exact values, so the geometry is what it was.
/** The downhill straight: a slab `thick` deep at `y`, tilted `tilt` rad about x (its −z end high), `len(bound)` long. */
export const SKATE_LANE = { fx: 0.6, fz: -0.18, y: 1.6, width: 8, thick: 0.5, tilt: 0.14, len: (bound: number): number => Math.max(30, bound * 0.9) } as const;
/** The bowl: an octagon of banks at radius `r` round its centre. */
export const SKATE_BOWL = { fx: -0.48, fz: 0.42, r: 6.5 } as const;
/** The funbox in the middle of the park (the first of rideWorlds' four). */
export const SKATE_CENTRE_BOX = { fx: 0, fz: -0.06, width: 6, depth: 4, height: 1.1 } as const;

/** The lane's riding surface over its centre line, `dz` metres along it from its middle (+ is down the hill, toward +z).
 *  Babylon's rotation about x carries the slab's local (0, thick/2, dz) to y·cos − dz·sin up and y·sin + dz·cos along. */
export function laneTop(bound: number, dz: number): { x: number; y: number; z: number } {
  const L = SKATE_LANE, h = L.thick / 2, c = Math.cos(L.tilt), s = Math.sin(L.tilt);
  return { x: atBound(L.fx, bound), y: L.y + h * c - dz * s, z: atBound(L.fz, bound) + h * s + dz * c };
}

type Tri = [number, number, number];
/** Where the coins go: single coins, and the arcs (CoinField.arc's from / to / apex above them / count). */
export interface CoinLayout { points: Tri[]; arcs: { from: Tri; to: Tri; apex: number; n: number }[] }
/** Coins float this far over what they mark, metres. */
export const COIN_LIFT_M = 0.4;
/** Lane coins start where its surface is this high: the top of a long lane is a 5 m cliff nobody rides up to. */
export const LANE_COIN_TOP_Y = 3;

/**
 * THE COIN LINES, FROM THE VENUE (IMPROVE 2026-10-06, skate item 8). They were fixed metres from the 33 m park — "down
 * the downhill straight" at x 20 — while the park now scales with its bound (48–62): at Venice the lane is at x 33.6, so
 * the line ran down open concrete 14 m from it and the bowl arc missed the rim. Every run is laid on the feature it names:
 *   · the two DIAGONALS the boost pads sit on, out to just short of the 45° bank on the south-west diagonal, skipping
 *     the centre funbox (the arc covers it) and anything solid in the plaza;
 *   · an arc over the CENTRE FUNBOX;
 *   · down the LANE's own surface, from where it stands LANE_COIN_TOP_Y high to where it meets the floor;
 *   · an arc across the BOWL, rim to rim through its centre.
 */
export function skateCoinLayout(bound: number): CoinLayout {
  const points: Tri[] = [];
  const box = SKATE_CENTRE_BOX, bz = atBound(box.fz, bound);
  const solids = plazaSolids(bound).filter((s) => s.solid && s.height > COIN_LIFT_M);
  const blocked = (x: number, z: number): boolean => {
    if (Math.abs(x - atBound(box.fx, bound)) < box.width / 2 + 0.5 && Math.abs(z - bz) < box.depth / 2 + 0.5) return true;
    return solids.some((s) => {
      // into the solid's own frame (the builder's yaw: local +x → (cos, −sin), local +z → (sin, cos)); a wedge's table point
      // is its crest and its body runs half a depth back from there (rideWorlds places it so)
      const c = Math.cos(s.ry), sn = Math.sin(s.ry);
      const cx = s.wedge ? s.x - sn * s.depth / 2 : s.x, cz = s.wedge ? s.z - c * s.depth / 2 : s.z;
      const dx = x - cx, dz = z - cz;
      const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
      return Math.abs(lx) < s.width / 2 + 0.5 && Math.abs(lz) < s.depth / 2 + 0.5;
    });
  };
  // the diagonals: the south-west one runs at the 45° bank at (−0.34, −0.34)·bound, whose near edge is 3 m (half its
  // depth) short of its centre along the diagonal — stop a metre before it, the same distance on all four arms
  const e = 0.34 * bound - 4 / Math.SQRT2;
  for (const [sx, sz] of [[1, 1], [1, -1]] as const) {
    for (let i = 0; i < 10; i++) {
      const t = -1 + (2 * i) / 9, x = sx * e * t, z = sz * e * t;
      if (!blocked(x, z)) points.push([x, COIN_LIFT_M, z]);
    }
  }
  // down the lane: from LANE_COIN_TOP_Y high to a metre before its foot meets the floor
  const L = SKATE_LANE, s = Math.sin(L.tilt), c = Math.cos(L.tilt), half = L.len(bound) / 2;
  const dzTop = Math.max(-(half - 2), (L.y + (L.thick / 2) * c - LANE_COIN_TOP_Y) / s);
  const dzFoot = Math.min(half - 2, (L.y + (L.thick / 2) * c) / s - 1);
  for (let i = 0; i < 8; i++) {
    const p = laneTop(bound, dzTop + ((dzFoot - dzTop) * i) / 7);
    points.push([p.x, Math.max(0, p.y) + COIN_LIFT_M + 0.2, p.z]);
  }
  const bowlX = atBound(SKATE_BOWL.fx, bound), bowlZ = atBound(SKATE_BOWL.fz, bound);
  return {
    points,
    arcs: [
      { from: [-3, 1.2, bz], to: [3, 1.2, bz], apex: 2.4, n: 6 },
      { from: [bowlX - 6, 1.6, bowlZ], to: [bowlX + 6, 1.6, bowlZ], apex: 2.6, n: 6 },
    ],
  };
}

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
    // A STREET WALL in the open (asset-polish, 2026-10-05; owner: "add wall rides"): free-standing and upright, so both faces
    // ride, low enough to reach off a plain ollie. The only other wall was the 3.2 m one against the north fence.
    S('wallride', 0.28, -0.6, 9, 0.4, 2.2),

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
// Derived from the table above, so a wall the layout moves takes its ride with it. The lips are the spine's crest (from
// either side), the pyramid deck's four edges (up any bank), and the wallride lip (reached off a wall ride).
//
// THE FACES (asset-polish, 2026-10-05). Only the big wallride's park face and the fences were walls, so a kick plant had
// one place to happen in a 112 m park. Every solid upright box now gives its four vertical faces: long and tall enough
// (RIDE_FACE_*) and it rides; shorter, a bench end or a planter, it takes a kick plant only. Banks are not walls (the
// pyramid's sides are its banks), and a bin is round.
import type { Wall, Lip } from '../core/WallRide';

/** The fence is a rail you can ride up to this high. */
export const FENCE_RIDE_HEIGHT = 1.85;   // the built fence is 1.9 m
/** A face this long and this tall is a wall ride; anything lower than PLANT_FACE_MIN_H is an ollie onto, not a wall. */
export const RIDE_FACE_MIN_LEN = 2.5, RIDE_FACE_MIN_H = 0.85, PLANT_FACE_MIN_H = 0.5;
const NOT_WALLS = new Set(['pyramid', 'bin']);

export function plazaWalls(bound: number): Wall[] {
  const walls: Wall[] = [];
  for (const s of SKATE_PLAZA.solids) {
    if (!s.solid || s.wedge || NOT_WALLS.has(s.kind) || s.height < PLANT_FACE_MIN_H) continue;
    const cx = atBound(s.fx, bound), cz = atBound(s.fz, bound), hw = s.width / 2, hd = s.depth / 2;
    const c = Math.cos(s.ry), sn = Math.sin(s.ry);
    // the builder's yaw (Babylon, left-handed): local +x → (cos, −sin), local +z → (sin, cos)
    const W = (lx: number, lz: number) => ({ x: cx + lx * c + lz * sn, z: cz - lx * sn + lz * c });
    const faces: { a: [number, number]; b: [number, number]; n: [number, number]; len: number; side: string }[] = [
      { a: [-hw, -hd], b: [hw, -hd], n: [0, -1], len: s.width, side: 'south' },
      { a: [-hw, hd], b: [hw, hd], n: [0, 1], len: s.width, side: 'north' },
      { a: [hw, -hd], b: [hw, hd], n: [1, 0], len: s.depth, side: 'east' },
      { a: [-hw, -hd], b: [-hw, hd], n: [-1, 0], len: s.depth, side: 'west' },
    ];
    const leaned = !!s.pitch;
    for (const f of faces) {
      // the leaned wallride stands against the fence: its park face (local −z) is the ride, and its overhanging back is not a wall
      if (leaned && f.side === 'north') continue;
      const lean = leaned && f.side === 'south' ? s.pitch ?? 0 : 0;
      const n = { x: f.n[0] * c + f.n[1] * sn, z: -f.n[0] * sn + f.n[1] * c };
      const label = leaned && f.side === 'south' ? 'the wallride' : `the ${s.kind} (${f.side} face)`;
      walls.push({ a: W(...f.a), b: W(...f.b), nx: n.x, nz: n.z, height: s.height, lean, label,
        rideable: f.len >= RIDE_FACE_MIN_LEN && s.height >= RIDE_FACE_MIN_H && !(leaned && f.side !== 'south') });
    }
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
