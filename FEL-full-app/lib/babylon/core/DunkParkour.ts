// DUNK PARKOUR — momentum as power on the runway (owner brief, 2026-09-18: "Parkour Dunk Contest").
//
// Three pure rules the contest reads:
//   · THE GLASS REBOUND. The runway is walled in curved glass. Run into a wall at an angle and the run reflects off it
//     with the speed kept — and the takeoff that follows inside the window is a VECTOR-TRANSFER launch: the horizontal
//     speed you carried through the glass buys height (×1.35 on the apex, a point of difficulty for the judges).
//   · THE TWO LAUNCHES. Off one foot at a run the jump keeps its carry (the SPEED launch: long, free-throw-line style);
//     off two feet the run is absorbed into height (the POWER launch: taller, shorter). The contest already reads the
//     foot from the run-up; this is what each foot DOES.
//   · THE BACKBOARD DOUBLE-LAUNCH. In the rise, L1 kicks off the glass behind the rim for a second lift — more apex,
//     more difficulty, once a flight.
//   · THE OVERDRIVE DUNK. A perfect execution on a hard dunk shatters the board.

export const GLASS = {
  /** The runway's clamp is ±6; the glass stands here, and the rebound reads inside `windowM` of it. */
  halfX: 5.6, windowM: 0.55,
  /** The run must be this fast and this oblique (degrees off the wall's face) to rebound rather than scrape. */
  minSpeed: 3.2, minDeg: 14,
  /** What the rebound buys the launch that follows inside `carrySec`. */
  apexMult: 1.35, difficulty: 0.9, carrySec: 2.6,
  /** The nudge back off the wall on the rebound frame. */
  pushM: 0.45,
} as const;

/** The run reflects off the glass: returns the new planar velocity, or null when the runner is not into the wall. */
export function glassRebound(x: number, vx: number, vz: number): { x: number; z: number } | null {
  const side = Math.sign(x);
  if (side === 0 || Math.abs(x) < GLASS.halfX - GLASS.windowM) return null;
  if (Math.sign(vx) !== side) return null;   // not moving INTO the wall
  const speed = Math.hypot(vx, vz);
  if (speed < GLASS.minSpeed) return null;
  const deg = (Math.atan2(Math.abs(vx), Math.abs(vz)) * 180) / Math.PI;   // 0 = along the wall, 90 = head-on
  if (deg < GLASS.minDeg) return null;
  return { x: -vx, z: vz };
}

export const WALL_RUN_DEG = 34;
export const WALL_RUN_APEX_MULT = 1.5;

export type LaunchFoot = 'one' | 'two';
export interface LaunchProfile { apexMult: number; carryMult: number; difficulty: number; label: string }

/** What a launch off this foot does, and what a corner rebound (or the wall run along the hoopbus) just before it adds. Capped at ×2. */
export function launchProfile(foot: LaunchFoot, vector: boolean, wallRun = false): LaunchProfile {
  const base: LaunchProfile = foot === 'one'
    ? { apexMult: 1.0, carryMult: 1.15, difficulty: 0, label: 'SPEED LAUNCH' }
    : { apexMult: 1.18, carryMult: 0.9, difficulty: 0.2, label: 'POWER LAUNCH' };
  if (!vector) return base;
  const mult = wallRun ? WALL_RUN_APEX_MULT : GLASS.apexMult;
  return { apexMult: Math.min(2, base.apexMult * mult), carryMult: base.carryMult, difficulty: base.difficulty + GLASS.difficulty + (wallRun ? 0.4 : 0), label: `${wallRun ? 'WALL RUN' : 'CORNER REBOUND'} → ${base.label}` };
}

export const DOUBLE_LAUNCH = {
  /** The window on the flight clock: from a share of the rise to the hang. */
  fromT: 0.12, toT: 0.62,
  apexAdd: 0.35, difficulty: 1.0, label: 'BACKBOARD DOUBLE-LAUNCH',
} as const;

/** Is a double-launch allowed now? Once a flight, inside the window. */
export function doubleLaunchAllowed(clipTime: number, used: boolean): boolean {
  return !used && clipTime >= DOUBLE_LAUNCH.fromT && clipTime <= DOUBLE_LAUNCH.toT;
}

export const OVERDRIVE = { minExecution: 0.95, minDifficulty: 6.5 } as const;

/** A perfect execution on a hard dunk: the board goes. */
export function overdriveDunk(execution01: number, difficulty: number): boolean {
  return execution01 >= OVERDRIVE.minExecution && difficulty >= OVERDRIVE.minDifficulty;
}

// ── THE CORNER GLASS (owner, 2026-09-18: "catacornered at the corners … don't ruin the scene with a wall on the sidelines") ──
// Two diagonal panels across the runway's front corners, facing back at the runway's centre. A run down the side meets
// one at an angle and is kicked toward the rim's line (the rebound); a shallow approach runs ALONG it (the wall run) and
// the launch off that carries even more. Nothing stands on the sidelines.

export interface GlassPane { cx: number; cz: number; nx: number; nz: number; half: number; side: 1 | -1 }

/** The two corner panes for a runway `halfX` wide whose takeoff line is at `lineZ` (the runway runs toward −z). */
export function cornerPanes(halfX: number, lineZ: number): GlassPane[] {
  const r = Math.SQRT1_2;
  return ([1, -1] as const).map((side) => ({ cx: side * (halfX - 1.1), cz: lineZ + 0.9, nx: -side * r, nz: r, half: 1.9, side }));
}


/** The run meets a corner pane: the reflected velocity, the pane, and whether it was shallow enough to be a WALL RUN. */
export function paneRebound(x: number, z: number, vx: number, vz: number, panes: readonly GlassPane[]): { v: { x: number; z: number }; pane: GlassPane; wallRun: boolean } | null {
  const speed = Math.hypot(vx, vz);
  if (speed < GLASS.minSpeed) return null;
  for (const p of panes) {
    const d = (x - p.cx) * p.nx + (z - p.cz) * p.nz;   // signed distance in front of the face
    if (d < -0.2 || d > GLASS.windowM) continue;
    const tx = -p.nz, tz = p.nx;   // along the pane
    const s = (x - p.cx) * tx + (z - p.cz) * tz;
    if (Math.abs(s) > p.half + 0.3) continue;
    const into = -(vx * p.nx + vz * p.nz) / speed;   // 1 = head-on into the face
    if (into <= 0) continue;
    const deg = (Math.asin(Math.min(1, into)) * 180) / Math.PI;   // angle off the face
    if (deg < GLASS.minDeg) continue;
    const dot = vx * p.nx + vz * p.nz;
    return { v: { x: vx - 2 * dot * p.nx, z: vz - 2 * dot * p.nz }, pane: p, wallRun: deg < WALL_RUN_DEG };
  }
  return null;
}

// ── THE CORNER RIDE (owner, 2026-09-18: "keep the bus"; "make the bus a space shuttle in the space one") ─────────────
// What is parked across the right front corner: the hoopbus everywhere, a space shuttle in Orbit. Its face is the wall-run
// surface and the corner oop's bank; its name is what the banners and the judge line call it.
export interface CornerRide { kind: 'hoopbus' | 'shuttle'; name: string; short: string }
export const CORNER_RIDES: Record<string, CornerRide> = {
  hoopbus: { kind: 'hoopbus', name: 'THE HOOPBUS', short: 'BUS' },
  shuttle: { kind: 'shuttle', name: 'THE SHUTTLE', short: 'SHUTTLE' },
};
export function cornerRideFor(location: string | undefined): CornerRide { return location === 'orbit' ? CORNER_RIDES.shuttle : CORNER_RIDES.hoopbus; }

// ── THE BUS WALL RUN (owner, 2026-09-18: "keep the bus, try a wall run dunk off the bus") ────────────────────────────
// A shallow run into the hoopbus's face is not a rebound: the runner goes UP the side of the bus and runs ALONG it toward the
// rim (the bus is parked across the corner, so its length points at the basket), banked into the panels, and leaves it at the
// front end — a launch from 1.15 m up and 2 m off the centre line, the flight a diagonal to the iron.
export const BUS_RUN = {
  /** How far off the face the body runs, how high up the side it gets and how fast it gets there. */
  offM: 0.42, height: 1.15, riseSec: 0.28,
  /** The run's floor speed along the bus; where along it (metres from the pane's centre, toward the rim) the run leaves. */
  speedMin: 5.6, exitS: 2.6, maxSec: 1.1,
  /** The bank into the panels (root roll, radians); what the run buys the launch on top of the wall-run apex. */
  bank: 0.42, difficulty: 1.1, apexAdd: 0.2, hype: 8,
} as const;
/** The runner on the bus's face `s` metres along it (toward the rim), `t` seconds into the run: position, height, facing. */
export function busRunPose(pane: GlassPane, s: number, t: number): { x: number; z: number; y: number; fx: number; fz: number } {
  const tx = -pane.nz, tz = pane.nx;   // along the pane, toward the rim
  const rise = Math.min(1, Math.max(0, t) / BUS_RUN.riseSec);
  return { x: pane.cx + pane.nx * BUS_RUN.offM + tx * s, z: pane.cz + pane.nz * BUS_RUN.offM + tz * s, y: Math.sin((rise * Math.PI) / 2) * BUS_RUN.height, fx: tx, fz: tz };
}
/** Where along the pane a point is (metres from its centre, toward the rim). */
export function alongPane(pane: GlassPane, x: number, z: number): number { return (x - pane.cx) * -pane.nz + (z - pane.cz) * pane.nx; }
/** The run along the bus is over — past its front end, or out of time — and the jump off it is now. */
export function busRunDone(s: number, t: number): boolean { return s >= BUS_RUN.exitS || t >= BUS_RUN.maxSec; }

// ── THE BILLBOARDS (owner: "make it a billboard and sign, change it for each scene"; the sign MESH came out of the dunk court
// 2026-09-18 — "remove the sign, keep the bus" — the scene names stay for the splash / the card) ──────────────────────────────────
export interface BillboardSign { text: string; sub: string; bg: string; fg: string; accent: string }
export const BILLBOARD_SIGNS: Record<string, BillboardSign> = {
  venice: { text: 'VENICE BEACH', sub: 'DOGTOWN · SINCE \'79', bg: '#0e7490', fg: '#fff7ed', accent: '#fb923c' },
  blossom: { text: 'BLOSSOM PARK', sub: 'SPRING INVITATIONAL', bg: '#9d174d', fg: '#fdf2f8', accent: '#f9a8d4' },
  orbit: { text: 'ORBIT ARENA', sub: 'ZERO-G CLASSIC', bg: '#12062a', fg: '#e0f2fe', accent: '#22d3ee' },
  canopy: { text: 'CANOPY COURT', sub: 'THE TREETOP JAM', bg: '#14532d', fg: '#ecfdf5', accent: '#86efac' },
  rooftop: { text: 'ROOFTOP', sub: 'AFTER HOURS', bg: '#0b0f1e', fg: '#e0e7ff', accent: '#9ad7ff' },
};
export function billboardFor(location: string | undefined): BillboardSign { return BILLBOARD_SIGNS[location ?? ''] ?? BILLBOARD_SIGNS.venice; }
