// MATRIX FOCUS — bullet time you HOLD (owner, 2026-09-18: "Add enter the matrix physics and combat").
//
// The horde already had a slow-motion LATCH (NeoCombatCore.SlowMoLatch): a beat the game grants you for a perfect dodge or
// a finisher, everything in the ring slowed together, over in half a second. Enter the Matrix's Focus is the other thing:
// a meter you spend on purpose. Hold the trigger and the room drops to a third of its speed while YOU keep moving at
// yours — the strikes come at you slow enough to read and step around, your own swing lands at full pace, and the
// moves the meter unlocks (a wall-run along the arena's edge, the kick off it, a launcher that sends a body flying)
// are the ones only Neo gets. The meter drains while you hold it and refills from what you land, so Focus is a rhythm,
// not a mode.
//
// Pure: no scene, no clock of its own. A mode ticks it on the REAL clock, reads `worldScale` for the room and `heroScale`
// for the player, and asks the wall-run helpers where the body goes.

export const FOCUS = {
  max: 100,
  /** Meter per second while held. */
  drainPerSec: 30,
  /** Meter per second refilling, after `regenDelaySec` without holding. */
  regenPerSec: 9,
  regenDelaySec: 1.0,
  /** You cannot start a Focus you cannot hold for half a second. */
  minToStart: 15,
  /** The room's clock while Focus is held. */
  worldScale: 0.32,
  /** The player's clock while Focus is held (a hair under real time: the body reads deliberate, not sped up). */
  heroScale: 0.92,
  /** A strike landed inside Focus hits this much harder and LAUNCHES (the push that knocks a body off its feet). */
  damageMult: 1.5,
  launchPush: 0.85,
  /** Meter back for what you land in or out of Focus. */
  hitGain: 5, dodgeGain: 12, koGain: 8, throwGain: 6,
} as const;

export class FocusMeter {
  value: number = FOCUS.max;
  active = false;
  /** Real seconds since the hold ended (regen waits on it). */
  sinceHold: number = FOCUS.regenDelaySec;
  /** Real seconds spent in Focus this run; starts counted. */
  heldSec = 0;
  starts = 0;
  /** Hold the trigger. False when the meter is too low to begin (a running Focus keeps going down to zero). */
  start(): boolean {
    if (this.active) return true;
    if (this.value < FOCUS.minToStart) return false;
    this.active = true; this.starts++;
    return true;
  }
  /** Let go. */
  stop(): void { if (this.active) { this.active = false; this.sinceHold = 0; } }
  /** Real seconds. Returns true on the frame Focus ran dry (the mode plays the drop). */
  tick(dtReal: number): boolean {
    if (this.active) {
      this.value = Math.max(0, this.value - FOCUS.drainPerSec * dtReal);
      this.heldSec += dtReal;
      if (this.value <= 0) { this.active = false; this.sinceHold = 0; return true; }
      return false;
    }
    this.sinceHold += dtReal;
    if (this.sinceHold >= FOCUS.regenDelaySec) this.value = Math.min(FOCUS.max, this.value + FOCUS.regenPerSec * dtReal);
    return false;
  }
  gain(n: number): void { this.value = Math.min(FOCUS.max, this.value + n); }
  get worldScale(): number { return this.active ? FOCUS.worldScale : 1; }
  get heroScale(): number { return this.active ? FOCUS.heroScale : 1; }
  get value01(): number { return this.value / FOCUS.max; }
  reset(): void { this.value = FOCUS.max; this.active = false; this.sinceHold = FOCUS.regenDelaySec; this.heldSec = 0; this.starts = 0; }
}

// ── THE WALL RUN, on a round arena ──────────────────────────────────────────────────────────────────────────────────
// The horde fights on a disc (KarateEndlessMode.ARENA_RADIUS). The wall is its edge: inside Focus, a jump thrown while
// running INTO the edge takes the body up onto it and along it — three strides on the wall, the room crawling below —
// and the next press kicks off it, back through the pack with a flying kick that drops whoever it passes.

export const WALL_RUN = {
  /** Metres inside the edge from which the wall is reachable. */
  near: 1.7,
  /** The body must be moving at the edge (cosine of its heading against the outward normal). */
  outwardCos: 0.35,
  /** Seconds on the wall, metres per second along it, and the arc's height. */
  sec: 0.95, speed: 5.6, height: 1.15,
  /** How far inside the edge the body's centre rides (the wall is where the feet are). */
  inset: 0.38,
  /** The kick off the wall: height and push back through the ring, and how long the flight lasts. */
  kickV: 5.4, kickPush: 6.8, kickSec: 0.62,
  /** The flying kick hits every body within this of its path. */
  kickHitM: 0.85,
  kickDamage: 26, kickPush01: 0.95, kickStunSec: 1.1,
} as const;

export interface WallRunState {
  /** Angle (rad) around the disc where the run started, and the direction of travel (+1 counter-clockwise). */
  a0: number; dir: 1 | -1; t: number;
}

/** Can a jump here take the wall? `pos` on the disc, `heading` the movement direction (planar), `radius` the disc's. */
export function wallRunAvailable(pos: { x: number; z: number }, heading: { x: number; z: number }, radius: number): boolean {
  const r = Math.hypot(pos.x, pos.z);
  if (r < radius - WALL_RUN.near) return false;
  const h = Math.hypot(heading.x, heading.z);
  if (h < 0.3) return false;
  const outward = (pos.x * heading.x + pos.z * heading.z) / (Math.max(1e-3, r) * h);
  return outward >= WALL_RUN.outwardCos;
}

/** Begin a run at `pos`, travelling the way the heading leans (its tangential component decides the direction). */
export function startWallRun(pos: { x: number; z: number }, heading: { x: number; z: number }): WallRunState {
  const a0 = Math.atan2(pos.x, pos.z);
  // tangent for +1 (counter-clockwise seen from above, +y): (cos a, -sin a) in (x, z)
  const tx = Math.cos(a0), tz = -Math.sin(a0);
  const along = heading.x * tx + heading.z * tz;
  return { a0, dir: along >= 0 ? 1 : -1, t: 0 };
}

/** Where the body is `t` seconds into the run: position on the wall, its facing (the tangent), and its height. */
export function wallRunAt(s: WallRunState, radius: number, t: number): { x: number; z: number; y: number; yaw: number; done: boolean } {
  const tt = Math.min(WALL_RUN.sec, Math.max(0, t));
  const rr = radius - WALL_RUN.inset;
  const a = s.a0 + (s.dir * WALL_RUN.speed * tt) / rr;
  const u = tt / WALL_RUN.sec;
  const y = WALL_RUN.height * Math.sin(u * Math.PI) * (0.55 + 0.45 * (1 - u));   // up onto the wall fast, easing down along it
  const tx = s.dir * Math.cos(a), tz = -s.dir * Math.sin(a);
  return { x: Math.sin(a) * rr, z: Math.cos(a) * rr, y, yaw: Math.atan2(tx, tz), done: t >= WALL_RUN.sec };
}

/** The kick off the wall: a straight flight from `from` toward `aim` (planar), `kickSec` long, on a jump arc. */
export interface WallKickState { fx: number; fz: number; dx: number; dz: number; t: number; hit: Set<number> }
export function startWallKick(from: { x: number; z: number }, aim: { x: number; z: number } | null): WallKickState {
  // no target: kick back toward the centre of the ring
  const ax = aim ? aim.x - from.x : -from.x, az = aim ? aim.z - from.z : -from.z;
  const l = Math.hypot(ax, az) || 1;
  return { fx: from.x, fz: from.z, dx: ax / l, dz: az / l, t: 0, hit: new Set() };
}
export function wallKickAt(k: WallKickState, t: number, startY: number): { x: number; z: number; y: number; done: boolean } {
  const tt = Math.min(WALL_RUN.kickSec, Math.max(0, t));
  const u = tt / WALL_RUN.kickSec;
  const d = WALL_RUN.kickPush * tt;
  // from the wall's height down to the floor on a shallow arc that peaks early (the kick is thrown on the way in)
  const y = Math.max(0, startY * (1 - u) + WALL_RUN.kickV * tt - 0.5 * 19.5 * tt * tt);
  return { x: k.fx + k.dx * d, z: k.fz + k.dz * d, y, done: t >= WALL_RUN.kickSec };
}

/** Which bodies a flight from `a` to `b` reaches (planar), excluding those already hit. */
export function kickHits(a: { x: number; z: number }, b: { x: number; z: number }, bodies: { x: number; z: number }[], hitM: number, already: ReadonlySet<number>): number[] {
  const out: number[] = [];
  const abx = b.x - a.x, abz = b.z - a.z, ab2 = abx * abx + abz * abz;
  for (let i = 0; i < bodies.length; i++) {
    if (already.has(i)) continue;
    const p = bodies[i];
    const t = ab2 < 1e-6 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / ab2));
    const cx = a.x + abx * t, cz = a.z + abz * t;
    if (Math.hypot(p.x - cx, p.z - cz) <= hitM) out.push(i);
  }
  return out;
}
