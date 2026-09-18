// FREE RUN RIVALS — the runners you race, and the combat that keeps you moving (owner brief, 2026-09-18).
//
// A rival is a pacer down its lane (the honest kind the karts use): it holds a pace with a corner-free wobble, HOPS the gaps
// and the vault boxes on its line, and can be knocked off its stride. What makes it an opponent:
//   · it LUNGES at a runner just ahead of it — a telegraph, then the hit; a timed parry (B) turns its body into a
//     vaulting board and steals its speed (the PARRY-VAULT);
//   · a DRIVE-BY (RB) alongside it knocks it stumbling and pays the striker's speed and kinetic meter;
//   · a kicked hazard that reaches it, or a ground slam near it, drops it too.
// Pure: distances along the course (+z), lateral x, and seconds. The mode owns the bodies.

export const RIVALS = {
  names: ['VOSS', 'KEELE', 'ARIN'] as const,
  tints: ['#4cc9f0', '#ffd75e', '#c99bf7'] as const,
  /** Lanes (x) the three run, and the pace spread (× the base top speed). */
  lanes: [-6, 0, -3] as const,
  paceMin: 0.78, paceMax: 0.98,
  /** The hop over a gap or a box: vertical launch and how far ahead of the edge it goes. */
  hopV: 6.2, hopLeadM: 0.8,
  /** How long a stumble holds the rival at a crawl. */
  stumbleSec: 1.1, stumbleSpeed: 1.2,
  /** The lunge: the rival attacks a runner inside this gap ahead of it, telegraphs this long, on this cooldown. */
  lungeGapM: 2.6, lungeLateralM: 2.0, lungeTelegraphSec: 0.5, lungeCooldownSec: 4, lungeHitKeep: 0.5,
  /** The parry window around the hit frame, and what a parry-vault steals. */
  parryWindowSec: 0.24, parrySteal: 2.2, parryVaultV: 5.8,
  /** A drive-by: alongside inside this, pays this. */
  driveByAlongM: 2.2, driveByLateralM: 2.6, driveBySpeedGain: 1.2,
  /** A kicked hazard flies this far and drops a rival inside this of its path. */
  hazardFlyM: 11, hazardHitM: 1.4,
} as const;

export interface Rival {
  name: string; tint: string;
  /** Along the course (z) and the lane (x); y is the mode's (the surface). */
  z: number; x: number; y: number;
  /** Pace as a share of the base top speed, and the speed now. */
  pace: number; speed: number;
  /** Airborne hop: vertical velocity and time in the air. */
  vy: number; air: boolean;
  /** Seconds left crawling after a hit. */
  stumble: number;
  /** The lunge: seconds until it lands (telegraphing) and the cooldown after. */
  lungeT: number; lungeCool: number;
  phase: number;
  finished: boolean;
}

export function makeRivals(count = 3): Rival[] {
  return Array.from({ length: Math.min(count, RIVALS.names.length) }, (_, i) => ({
    name: RIVALS.names[i], tint: RIVALS.tints[i], z: -2 - i * 1.6, x: RIVALS.lanes[i], y: 0,
    pace: RIVALS.paceMin + (RIVALS.paceMax - RIVALS.paceMin) * (i / Math.max(1, RIVALS.names.length - 1)),
    speed: 0, vy: 0, air: false, stumble: 0, lungeT: 0, lungeCool: 2 + i, phase: i * 2.1, finished: false,
  }));
}

export interface CourseRead {
  /** Is (x, z) over a gap? */
  overGap(x: number, z: number): boolean;
  /** Something to hop ahead of (x, z) on the lane inside `ahead` metres (a vault box, a bar…). */
  obstacleAhead(x: number, z: number, ahead: number): boolean;
  /** The finish line's z. */
  finishZ: number;
}

export interface RivalStepOut {
  /** The rival's lunge just landed this frame (the mode decides parried / hit). */
  lunged: boolean;
  /** The rival began telegraphing this frame. */
  telegraphed: boolean;
  /** Crossed the finish this frame. */
  finished: boolean;
}

/** One frame of a rival. `topSpeed` is the base top speed; `player` where the runner is; `t` the clock (for the wobble). */
export function stepRival(r: Rival, dt: number, topSpeed: number, course: CourseRead, player: { x: number; z: number }, t: number): RivalStepOut {
  const out: RivalStepOut = { lunged: false, telegraphed: false, finished: false };
  if (r.finished) return out;
  r.stumble = Math.max(0, r.stumble - dt);
  r.lungeCool = Math.max(0, r.lungeCool - dt);
  const wobble = 1 + Math.sin(t * 0.7 + r.phase) * 0.04;
  const target = r.stumble > 0 ? RIVALS.stumbleSpeed : topSpeed * r.pace * wobble;
  r.speed += (target - r.speed) * Math.min(1, 3 * dt);
  // hop the gaps and the boxes on the line
  if (!r.air && r.stumble <= 0 && (course.overGap(r.x, r.z + RIVALS.hopLeadM) || course.obstacleAhead(r.x, r.z, RIVALS.hopLeadM + 0.4))) { r.air = true; r.vy = RIVALS.hopV; }
  if (r.air) { r.vy -= 9.81 * dt; r.y += r.vy * dt; if (r.y <= 0 && r.vy < 0) { r.y = 0; r.air = false; r.vy = 0; } }
  r.z += r.speed * dt;
  // the lunge at a runner just ahead
  const gap = player.z - r.z;
  if (r.lungeT > 0) {
    r.lungeT -= dt;
    if (r.lungeT <= 0) { r.lungeT = 0; out.lunged = true; r.lungeCool = RIVALS.lungeCooldownSec; }
  } else if (!r.air && r.stumble <= 0 && r.lungeCool <= 0 && gap > 0.4 && gap < RIVALS.lungeGapM && Math.abs(player.x - r.x) < RIVALS.lungeLateralM) {
    r.lungeT = RIVALS.lungeTelegraphSec; out.telegraphed = true;
  }
  if (r.z >= course.finishZ) { r.finished = true; out.finished = true; }
  return out;
}

/** Is the rival alongside the runner for a drive-by? */
export function alongside(r: Rival, player: { x: number; z: number }): boolean {
  return Math.abs(r.z - player.z) < RIVALS.driveByAlongM && Math.abs(r.x - player.x) < RIVALS.driveByLateralM && Math.abs(r.x - player.x) > 0.3;
}

/** Knock a rival off its stride. */
export function stumble(r: Rival): void { r.stumble = RIVALS.stumbleSec; r.speed = Math.min(r.speed, RIVALS.stumbleSpeed); r.lungeT = 0; }

/** The rivals a kicked hazard from (x, z) reaches: on its line, ahead, inside its flight. */
export function hazardVictims(from: { x: number; z: number }, rivals: readonly Rival[]): Rival[] {
  return rivals.filter((r) => !r.finished && r.z > from.z && r.z - from.z < RIVALS.hazardFlyM && Math.abs(r.x - from.x) < RIVALS.hazardHitM);
}

/** The rivals a ground slam at (x, z) reaches. */
export function slamVictims(at: { x: number; z: number }, rivals: readonly Rival[], radius: number): Rival[] {
  return rivals.filter((r) => !r.finished && Math.hypot(r.x - at.x, r.z - at.z) <= radius);
}

/** The runner's place, 1-based, and the seconds to the leader (0 when leading). */
export function standing(playerZ: number, playerSpeed: number, rivals: readonly Rival[]): { place: number; deltaSec: number; field: number } {
  const ahead = rivals.filter((r) => r.z > playerZ);
  const leader = Math.max(playerZ, ...rivals.map((r) => r.z));
  return { place: 1 + ahead.length, deltaSec: playerSpeed > 0.5 ? (leader - playerZ) / playerSpeed : 0, field: rivals.length + 1 };
}
