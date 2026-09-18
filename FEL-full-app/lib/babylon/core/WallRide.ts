// WALL RIDES, WALLPLANTS and LIP TRICKS (owner, 2026-09-18: "add kick plants off walls and wall rides in the
// skateboarding mode … add lip tricks too").
//
// THPS's three verbs the plaza did not have. A WALL RIDE: airborne against a wall, the board goes flat onto it and rides
// along it while the height bleeds off, then drops back to the ground. A WALLPLANT (the kick plant): a foot planted on
// the wall and a kick off it — the run reverses, the body turns to face the way it kicks. A LIP TRICK: up a bank to its
// crest with speed, the trucks catch the lip and the rider STALLS on it (rock to fakie, nose stall, tail stall,
// disaster, blunt — the held direction picks it), then drops back in the way he came, riding fakie.
//
// Pure: walls and lips are line segments with a normal / an approach direction; the mode owns the rider and writes
// the body where this says it goes. The plaza derives its walls and lips from its own table (skatePlaza.plazaWalls /
// plazaLips), so a venue with a different layout changes the data, never this.

export interface V2 { x: number; z: number }

/** A vertical (or leaned-back) face the board can ride, seen from the plaza side. `n` points INTO the park (away from the wall). */
export interface Wall {
  a: V2; b: V2;
  nx: number; nz: number;
  /** Top of the face above the slab, and how far back it leans (radians; the top is further from the park). */
  height: number; lean: number;
  label: string;
}

/** A lip: the crest of a bank or the top edge of a wall. `u` is the way the rider comes UP it (planar unit, into the feature). */
export interface Lip {
  a: V2; b: V2; y: number; ux: number; uz: number; label: string;
}

export const WALL_RIDE = {
  /** How near the face the board must be (planar), and how fast it must be travelling INTO the wall. */
  reachM: 0.85, intoMps: 1.2,
  /** Height band the ride may start in (above the slab, below the top). */
  minY: 0.25, topMarginM: 0.15,
  /** Ride length cap, the gravity along the wall, the slowest ride, and where the board sits off the face. */
  maxSec: 1.1, gravity: 4.5, minSpeed: 2.6, offsetM: 0.22,
  /** Leaving the wall: the push off it and the hop. */
  exitPush: 1.6, exitVy: 0.9,
  /** The plant: away from the wall, up, and what is kept of the ride's own speed along it. */
  plantPush: 4.6, plantVy: 3.4, plantAlong: 0.35,
  /** Scores: the lock, per second on the wall, the plant. */
  pts: 150, ptsPerSec: 60, plantPts: 220,
  /** The board flat on the wall and the body leaning into it. */
  boardRoll: 1.35, bodyTilt: 0.32,
} as const;

export interface WallRideState {
  wall: Wall;
  /** +1 travels a→b along the wall, −1 the other way; `s` is the metres along from `a`. */
  dir: 1 | -1; s: number; y: number; vy: number; speed: number; t: number;
}

const len2 = (a: V2, b: V2) => Math.hypot(b.x - a.x, b.z - a.z);
/** Closest point on a→b to p (planar): the parameter t (0..1), the point, and the planar distance. */
export function closestOnSegment(p: V2, a: V2, b: V2): { t: number; x: number; z: number; d: number } {
  const abx = b.x - a.x, abz = b.z - a.z, ab2 = abx * abx + abz * abz;
  const t = ab2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / ab2));
  const x = a.x + abx * t, z = a.z + abz * t;
  return { t, x, z, d: Math.hypot(p.x - x, p.z - z) };
}

/** Where the face is at height `y` (the lean carries the top away from the park): the board's centre at that height. */
export function wallPoint(w: Wall, s: number, y: number): V2 {
  const L = len2(w.a, w.b) || 1;
  const tx = (w.b.x - w.a.x) / L, tz = (w.b.z - w.a.z) / L;
  const back = y * Math.tan(w.lean);
  return { x: w.a.x + tx * s + w.nx * (WALL_RIDE.offsetM - back), z: w.a.z + tz * s + w.nz * (WALL_RIDE.offsetM - back) };
}

/** The wall a body at `pos` moving `vel` could ride now, or null. */
export function canWallRide(pos: { x: number; y: number; z: number }, vel: { x: number; y: number; z: number }, walls: readonly Wall[], airborne: boolean): Wall | null {
  if (!airborne || pos.y < WALL_RIDE.minY) return null;
  let best: Wall | null = null, bestD = Infinity;
  for (const w of walls) {
    if (pos.y > w.height - WALL_RIDE.topMarginM) continue;
    const back = pos.y * Math.tan(w.lean);
    const face = { a: { x: w.a.x - w.nx * back, z: w.a.z - w.nz * back }, b: { x: w.b.x - w.nx * back, z: w.b.z - w.nz * back } };
    const c = closestOnSegment(pos, face.a, face.b);
    if (c.d > WALL_RIDE.reachM) continue;
    const into = -(vel.x * w.nx + vel.z * w.nz);   // speed toward the wall
    if (into < WALL_RIDE.intoMps) continue;
    if (c.d < bestD) { bestD = c.d; best = w; }
  }
  return best;
}

export function startWallRide(w: Wall, pos: { x: number; y: number; z: number }, vel: { x: number; y: number; z: number }): WallRideState {
  const L = len2(w.a, w.b) || 1;
  const tx = (w.b.x - w.a.x) / L, tz = (w.b.z - w.a.z) / L;
  const along = vel.x * tx + vel.z * tz;
  const c = closestOnSegment(pos, w.a, w.b);
  return { wall: w, dir: along >= 0 ? 1 : -1, s: c.t * L, y: pos.y, vy: Math.max(0, vel.y) * 0.5, speed: Math.max(WALL_RIDE.minSpeed, Math.abs(along) + 0.5), t: 0 };
}

/** Advance the ride. Returns the body's place, its facing (along the wall), and whether the ride is over. */
export function stepWallRide(st: WallRideState, dt: number): { x: number; y: number; z: number; yaw: number; done: boolean } {
  const L = len2(st.wall.a, st.wall.b);
  st.t += dt;
  st.s += st.dir * st.speed * dt;
  st.vy -= WALL_RIDE.gravity * dt;
  st.y += st.vy * dt;
  const p = wallPoint(st.wall, Math.max(0, Math.min(L, st.s)), st.y);
  const tx = (st.wall.b.x - st.wall.a.x) / (L || 1), tz = (st.wall.b.z - st.wall.a.z) / (L || 1);
  const yaw = Math.atan2(st.dir * tx, st.dir * tz);
  const done = st.t >= WALL_RIDE.maxSec || st.y <= WALL_RIDE.minY * 0.8 || st.s < 0 || st.s > L;
  return { x: p.x, y: Math.max(0, st.y), z: p.z, yaw, done };
}

/** Which way the board leans onto the wall from the rider's own frame: +1 when the wall is on the rider's right. */
export function wallSide(st: WallRideState): 1 | -1 {
  const L = len2(st.wall.a, st.wall.b) || 1;
  const tx = st.dir * (st.wall.b.x - st.wall.a.x) / L, tz = st.dir * (st.wall.b.z - st.wall.a.z) / L;
  // right of the heading is (tz, -tx); the wall lies along -n
  return (tz * -st.wall.nx + -tx * -st.wall.nz) >= 0 ? 1 : -1;
}

/** Dropping off the wall: along it, a push off, a hop. */
export function wallRideExitVel(st: WallRideState): { x: number; y: number; z: number } {
  const L = len2(st.wall.a, st.wall.b) || 1;
  const tx = st.dir * (st.wall.b.x - st.wall.a.x) / L, tz = st.dir * (st.wall.b.z - st.wall.a.z) / L;
  return { x: tx * st.speed + st.wall.nx * WALL_RIDE.exitPush, y: WALL_RIDE.exitVy, z: tz * st.speed + st.wall.nz * WALL_RIDE.exitPush };
}

/** The wallplant: kick off, away from the wall and up, keeping a little of the ride. The rider faces the way he kicks. */
export function wallplantVel(st: WallRideState): { x: number; y: number; z: number; yaw: number } {
  const L = len2(st.wall.a, st.wall.b) || 1;
  const tx = st.dir * (st.wall.b.x - st.wall.a.x) / L, tz = st.dir * (st.wall.b.z - st.wall.a.z) / L;
  const x = st.wall.nx * WALL_RIDE.plantPush + tx * st.speed * WALL_RIDE.plantAlong;
  const z = st.wall.nz * WALL_RIDE.plantPush + tz * st.speed * WALL_RIDE.plantAlong;
  return { x, y: WALL_RIDE.plantVy, z, yaw: Math.atan2(x, z) };
}

// ── LIP TRICKS ───────────────────────────────────────────────────────────────────────────────────────────────────────
export const LIP = {
  /** Planar reach to the lip line, the height band around it, the speed UP the bank it takes to catch. */
  reachM: 0.9, belowM: 0.7, aboveM: 0.5, upMps: 2.0,
  /** The stall: shortest hold, longest, and the drop-in speed back down the bank. */
  minSec: 0.45, maxSec: 1.2, dropMps: 3.6, dropVy: -0.6,
  /** Points per second of stall on top of the trick's own. */
  ptsPerSec: 70,
} as const;

export type LipDir = 'up' | 'down' | 'left' | 'right' | null;
export interface LipTrick { id: string; label: string; pts: number; /** the board on the lip: pitch (nose up is negative, the manual's sign), roll */ boardPitch: number; boardRoll: number; fakie: boolean }
export const LIP_TRICKS: Record<'n' | 'up' | 'down' | 'left' | 'right', LipTrick> = {
  n: { id: 'rock_fakie', label: 'ROCK TO FAKIE', pts: 180, boardPitch: 0.25, boardRoll: 0, fakie: true },
  up: { id: 'nose_stall', label: 'NOSE STALL', pts: 220, boardPitch: -0.45, boardRoll: 0, fakie: true },
  down: { id: 'tail_stall', label: 'TAIL STALL', pts: 220, boardPitch: 0.2, boardRoll: 0, fakie: true },
  left: { id: 'disaster', label: 'DISASTER', pts: 260, boardPitch: 0, boardRoll: 0.9, fakie: true },
  right: { id: 'blunt_fakie', label: 'BLUNT TO FAKIE', pts: 300, boardPitch: -0.6, boardRoll: 0, fakie: true },
};
export function lipTrickFor(dir: LipDir): LipTrick { return LIP_TRICKS[dir ?? 'n']; }

export interface LipStallState { lip: Lip; trick: LipTrick; x: number; z: number; t: number; released: boolean }

/** The lip a rider at `pos` moving `vel` catches now, or null. */
export function canLipStall(pos: { x: number; y: number; z: number }, vel: { x: number; z: number }, lips: readonly Lip[]): { lip: Lip; x: number; z: number } | null {
  let best: { lip: Lip; x: number; z: number } | null = null, bestD = Infinity;
  for (const l of lips) {
    if (pos.y < l.y - LIP.belowM || pos.y > l.y + LIP.aboveM) continue;
    const c = closestOnSegment(pos, l.a, l.b);
    if (c.d > LIP.reachM) continue;
    const up = vel.x * l.ux + vel.z * l.uz;
    if (up < LIP.upMps) continue;
    if (c.d < bestD) { bestD = c.d; best = { lip: l, x: c.x, z: c.z }; }
  }
  return best;
}

export function startLipStall(hit: { lip: Lip; x: number; z: number }, dir: LipDir): LipStallState {
  return { lip: hit.lip, trick: lipTrickFor(dir), x: hit.x, z: hit.z, t: 0, released: false };
}

/** Advance the stall: `held` is the grind button; the stall ends after minSec once released, or at maxSec. */
export function stepLipStall(st: LipStallState, dt: number, held: boolean): { done: boolean } {
  st.t += dt;
  if (!held) st.released = true;
  return { done: st.t >= LIP.maxSec || (st.released && st.t >= LIP.minSec) };
}

/** Back down the bank the way he came, fakie. `yaw` faces down the bank. */
export function dropInVel(st: LipStallState): { x: number; y: number; z: number; yaw: number } {
  const x = -st.lip.ux * LIP.dropMps, z = -st.lip.uz * LIP.dropMps;
  return { x, y: LIP.dropVy, z, yaw: Math.atan2(x, z) };
}

/** The stall's points: the trick plus the hold. */
export function lipStallPts(st: LipStallState): number { return Math.round(st.trick.pts + LIP.ptsPerSec * Math.min(LIP.maxSec, st.t)); }
