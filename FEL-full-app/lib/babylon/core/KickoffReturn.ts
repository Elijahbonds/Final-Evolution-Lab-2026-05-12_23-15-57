// KICKOFF RETURN — the full-field parkour gauntlet (owner brief, 2026-09-18: "Football Kickoff Return").
//
// Pure reads on the geometry the rush mode already tracks. The runner is a body with momentum (RushRun); this is what
// the field, the blockers and the gunners DO to it:
//   · THE LAUNCH. The kick is in the air; a press as it lands (the Ledge-Pop) is an instant speed stack.
//   · THE BLOCKING WALL. Two lead blockers run the runner's lane and drive-by the gunners; a downed gunner is a human
//     hurdle — the HURDLE-CATAPULT off him is a low air dash.
//   · THE GUNSLINGER PARRY-VAULT. A tackle diving in from the front or side, met with B inside the window, is a launchpad.
//   · THE FIELD-LATERAL SLINGSHOT. Drafting behind a blocker fills a gauge; L1 beside a parallel blocker (or on a full
//     gauge) blasts the tackle seam.
//   · THE STIFF-ARM CLOTHESLINE. R1 on an adjacent gunner: he goes down, the speed is kept.
//   · THE LANES. HIGH: the sideline rail (a wall run up the stadium wall — a hit up there is OUT OF BOUNDS). MID: turf
//     ramps (a hop over the yard-line gap, untouchable in the air). LOW: the maintenance tunnel under the bench (a slide
//     in, a max-speed pop out; a bonk if you are standing).
//   · THE GUNNERS' ANSWER. A POUNCE off the sideline wall (a missile tackle), and LANE STRIPPING — a hit mid-vault,
//     mid-slide or on the rail is a FUMBLE and a live-ball scramble.

export interface P2 { x: number; z: number }
const hyp = (a: number, b: number) => Math.hypot(a, b);
/** Along / lateral of `p` relative to `origin` looking down `dir` (unnormalised ok). */
export function frameOf(origin: P2, dir: P2, p: P2): { along: number; lateral: number } {
  const n = hyp(dir.x, dir.z) || 1, fx = dir.x / n, fz = dir.z / n;
  const dx = p.x - origin.x, dz = p.z - origin.z;
  return { along: dx * fx + dz * fz, lateral: dx * fz - dz * fx };
}

// ── THE LAUNCH ──────────────────────────────────────────────────────────────────────────────────────────────────────
export const CATCH = {
  /** Seconds the kick hangs; the press is graded by how far from the landing (k = 1) it came. */
  flightSec: 1.7, perfectK: 0.07, goodK: 0.18,
  /** The speed stack each grade buys (a share of the full run), and the free catch when nobody pressed. */
  perfectStack: 1.0, goodStack: 0.6, lateK: 1.12,
} as const;
export type CatchGrade = 'perfect' | 'good' | 'early';
export function catchGrade(k: number): CatchGrade {
  const off = Math.abs(1 - k);
  return off <= CATCH.perfectK ? 'perfect' : off <= CATCH.goodK ? 'good' : 'early';
}
export function catchStack(grade: CatchGrade | 'late'): number {
  return grade === 'perfect' ? CATCH.perfectStack : grade === 'good' ? CATCH.goodStack : 0;
}

// ── THE BLOCKING WALL ───────────────────────────────────────────────────────────────────────────────────────────────
export const BLOCK = {
  /** A blocker leads the runner by this, a lane's width to his side. */
  leadM: 3.5, sideM: 2.2, speed: 6.2,
  /** He picks a standing gunner this far ahead of the runner, inside the lane, and runs him down. */
  pickAhead: [0.5, 14] as readonly [number, number], laneM: 6.5,
  /** The engage: inside this he drives the gunner into the turf; then he is busy for `busySec`. */
  engageM: 1.15, busySec: 1.2,
  /** A downed body this far ahead on the line is a hurdle; the catapult off him. */
  hurdleAhead: [0.5, 2.3] as readonly [number, number], hurdleLateral: 1.2, catapultMult: 1.35, catapultSec: 0.8, catapultPts: 30,
} as const;

/** The gunner the blocker goes for: the nearest standing one in the runner's lane ahead. */
export function blockerTarget(me: P2, meVel: P2, defenders: readonly (P2 & { down: boolean })[]): P2 | null {
  const dir = hyp(meVel.x, meVel.z) > 0.5 ? meVel : { x: 0, z: 1 };
  let best: P2 | null = null, bd = Infinity;
  for (const d of defenders) {
    if (d.down) continue;
    const f = frameOf(me, dir, d);
    if (f.along < BLOCK.pickAhead[0] || f.along > BLOCK.pickAhead[1] || Math.abs(f.lateral) > BLOCK.laneM) continue;
    if (f.along < bd) { bd = f.along; best = d; }
  }
  return best;
}
/** Where a blocker runs with nobody to hit: ahead of the runner, off his shoulder. */
export function blockerLeadPoint(me: P2, meVel: P2, side: 1 | -1): P2 {
  const n = hyp(meVel.x, meVel.z), fx = n > 0.5 ? meVel.x / n : 0, fz = n > 0.5 ? meVel.z / n : 1;
  return { x: me.x + fx * BLOCK.leadM + fz * side * BLOCK.sideM, z: me.z + fz * BLOCK.leadM - fx * side * BLOCK.sideM };
}
export function engageRead(blocker: P2, gunner: P2): boolean { return hyp(gunner.x - blocker.x, gunner.z - blocker.z) <= BLOCK.engageM; }
/** A downed body just ahead on my line: the hurdle is a CATAPULT. */
export function hurdleRead(me: P2, meVel: P2, downed: readonly P2[]): boolean {
  if (hyp(meVel.x, meVel.z) < 3) return false;
  return downed.some((d) => { const f = frameOf(me, meVel, d); return f.along >= BLOCK.hurdleAhead[0] && f.along <= BLOCK.hurdleAhead[1] && Math.abs(f.lateral) <= BLOCK.hurdleLateral; });
}

// ── THE GUNSLINGER PARRY-VAULT ──────────────────────────────────────────────────────────────────────────────────────
export const GUNSLING = {
  minDist: 0.9, maxDist: 3.6, minClosing: 3.0,   // 13 m/s of closing at a full run: 2.7 m is a 210 ms window (2.6 was 130)
  /** From the front or the side: behind you it is just a tackle. */
  frontCos: -0.2,
  sec: 0.55, up: 1.1, forward: 2.4, launchMult: 1.3, launchSec: 0.9, iframes: 0.7, pts: 40,
} as const;
/** A diver arriving inside the window, from the front or side. `closing` = his speed toward me; `cos` = where he is on my line (1 = dead ahead). */
export function gunslingRead(dist: number, closing: number, cosAhead: number): boolean {
  return dist >= GUNSLING.minDist && dist <= GUNSLING.maxDist && closing >= GUNSLING.minClosing && cosAhead >= GUNSLING.frontCos;
}
export function vaultArc(from: { x: number; y: number; z: number }, dir: P2, u: number, up = GUNSLING.up, forward = GUNSLING.forward): { x: number; y: number; z: number } {
  const n = hyp(dir.x, dir.z) || 1;
  return { x: from.x + (dir.x / n) * forward * u, y: from.y + Math.sin(u * Math.PI) * up, z: from.z + (dir.z / n) * forward * u };
}

// ── THE FIELD-LATERAL SLINGSHOT ─────────────────────────────────────────────────────────────────────────────────────
export const SLINGSHOT = {
  /** A blocker running PARALLEL: level with me, a lane or two over. */
  parallelAlong: 2.5, parallelLateral: [1.4, 5.5] as readonly [number, number],
  /** Drafting: behind a blocker on my line. The gauge fills at this rate; full, L1 blasts on its own. */
  draftBehind: [0.5, 3.6] as readonly [number, number], draftLateral: 1.3, gaugePerSec: 40, full: 100,
  blastMult: 1.45, blastSec: 1.0, immuneSec: 0.45, pts: 35,
  /** One slingshot per this many seconds (five in five seconds made the gauntlet a sprint, measured); the parallel blocker must be RUNNING. */
  cooldownSec: 3, mateMinSpeed: 3,
} as const;
export function parallelRead(me: P2, meVel: P2, mate: P2): boolean {
  if (hyp(meVel.x, meVel.z) < 3) return false;
  const f = frameOf(me, meVel, mate);
  return Math.abs(f.along) <= SLINGSHOT.parallelAlong && Math.abs(f.lateral) >= SLINGSHOT.parallelLateral[0] && Math.abs(f.lateral) <= SLINGSHOT.parallelLateral[1];
}
export function draftingRead(me: P2, meVel: P2, mate: P2): boolean {
  if (hyp(meVel.x, meVel.z) < 3) return false;
  const f = frameOf(me, meVel, mate);
  return f.along >= SLINGSHOT.draftBehind[0] && f.along <= SLINGSHOT.draftBehind[1] && Math.abs(f.lateral) <= SLINGSHOT.draftLateral;
}
export function slingshotStep(gauge: number, drafting: boolean, dt: number): number {
  return drafting ? Math.min(SLINGSHOT.full, gauge + SLINGSHOT.gaugePerSec * dt) : gauge;
}

// ── THE STIFF-ARM CLOTHESLINE ───────────────────────────────────────────────────────────────────────────────────────
export const STIFF = { alongM: 1.4, lateral: [0.35, 1.7] as readonly [number, number], minSpeed: 3.5, cooldownSec: 1.0, pts: 25 } as const;
export function stiffArmRead(me: P2, meVel: P2, gunner: P2): boolean {
  if (hyp(meVel.x, meVel.z) < STIFF.minSpeed) return false;
  const f = frameOf(me, meVel, gunner);
  return Math.abs(f.along) <= STIFF.alongM && Math.abs(f.lateral) >= STIFF.lateral[0] && Math.abs(f.lateral) <= STIFF.lateral[1];
}

// ── THE LANES ───────────────────────────────────────────────────────────────────────────────────────────────────────
export interface Ramp { x: number; z: number; halfX: number; halfZ: number }
export interface Tunnel { x: number; z0: number; z1: number; halfX: number }
export const LANES = {
  /** HIGH — the sideline rail: the stadium wall at ±railX; run into it at speed and you are up it. */
  railX: 19.3, railWindow: 1.1, railMinSpeed: 4.8, railMaxSec: 1.6, railMult: 1.15, railY: 0.55, railPts: 20,
  /** MID — turf ramps: the hop over the yard-line gap. */
  ramps: [{ x: -7, z: 9, halfX: 1.6, halfZ: 1.1 }, { x: 7, z: 17, halfX: 1.6, halfZ: 1.1 }, { x: 0, z: 26, halfX: 1.6, halfZ: 1.1 }] as readonly Ramp[],
  rampMinSpeed: 4, rampAirSec: 0.7, rampUp: 1.3, rampMult: 1.2, rampPts: 15,
  /** LOW — the maintenance tunnel under the bench: slide in, pop out at max speed. */
  tunnels: [{ x: -16.5, z0: 11, z1: 21, halfX: 1.5 }, { x: 16.5, z0: 19, z1: 29, halfX: 1.5 }] as readonly Tunnel[],
  tunnelMult: 1.3, tunnelExitSec: 0.8, tunnelExitMult: 1.35, tunnelPts: 25, bonkSpeed: 1.2,
  /** The slide (LT held) off the tunnel: a little slower, a lower body. */
  slideMult: 0.94,
} as const;
/** Running into the sideline wall at speed: the side it is on, or 0. */
export function railRead(x: number, vx: number, vz: number): 1 | -1 | 0 {
  const side = Math.sign(x) as 1 | -1 | 0;
  if (side === 0 || Math.abs(x) < LANES.railX - LANES.railWindow) return 0;
  if (Math.sign(vx) !== side) return 0;
  return hyp(vx, vz) >= LANES.railMinSpeed ? side : 0;
}
export function rampAt(x: number, z: number): number { return LANES.ramps.findIndex((r) => Math.abs(x - r.x) <= r.halfX && Math.abs(z - r.z) <= r.halfZ); }
export function tunnelAt(x: number, z: number): number { return LANES.tunnels.findIndex((t) => Math.abs(x - t.x) <= t.halfX && z >= t.z0 && z <= t.z1); }

// ── THE GUNNERS' ANSWER ─────────────────────────────────────────────────────────────────────────────────────────────
export const POUNCE = { fromWallX: 14.5, minDist: 3, maxDist: 7.5, sec: 0.55, speed: 9.5, cooldownSec: 3.5, hitM: 1.0 } as const;
/** A gunner near the wall, the runner in range: he launches. */
export function pounceRead(gunner: P2, me: P2): boolean {
  if (Math.abs(gunner.x) < POUNCE.fromWallX) return false;
  const d = hyp(me.x - gunner.x, me.z - gunner.z);
  return d >= POUNCE.minDist && d <= POUNCE.maxDist;
}
export type Exposure = 'vault' | 'slide' | 'rail' | 'air' | null;
export const STRIP = { scrambleSec: 2.5, recoverM: 1.1, launchM: 2.6, pts: -20 } as const;
/** A hit while exposed strips the ball. */
export function fumbleRead(exposure: Exposure): boolean { return exposure !== null; }
