/**
 * board-flow.ts — PURE flow helpers for the board-sports archetype
 * (skate / snow / surf). Handoff Part 6 fixes 2, 3, 4.
 *
 * This module is deliberately physics-agnostic: the live component
 * (components/games/board-sports-3d.tsx) and the headless test
 * (scripts/board-flow-tests.ts) BOTH import it. It never forks the
 * BoardPhysics engine — it consumes read-only pose values and returns
 * decisions (arc samples, push impulse, chain multiplier) that the
 * caller applies. Deterministic: no RNG, no clock, no globals.
 *
 * Every feel constant below is // TUNE(elijah).
 */

// ---------------------------------------------------------------------------
// Fix 2 — Ghost trajectory arc (readability)
// ---------------------------------------------------------------------------

export interface ArcPoint {
  x: number;
  y: number;
  z: number;
  /** seconds since takeoff */
  t: number;
}

export type ArcClearance = 'green' | 'yellow' | 'red';

export interface ArcResult {
  points: ArcPoint[];
  /** touchdown position (last sampled point if none found) */
  landX: number;
  landY: number;
  landZ: number;
  /** seconds to touchdown; -1 if the rider never lands within horizonS */
  landT: number;
  clearance: ArcClearance;
}

export interface ArcOpts {
  /** launch position */
  x0: number;
  y0: number;
  z0: number;
  /** launch vertical velocity (m/s, up positive) */
  vy0: number;
  /** horizontal ground speed (m/s) */
  speed: number;
  /** forward unit vector on the ground plane */
  fx: number;
  fz: number;
  /** downward gravity accel (m/s^2, positive magnitude) */
  gravity: number;
  /** sample interval, seconds. // TUNE(elijah) */
  stepS?: number;
  /** stop predicting after this many seconds. // TUNE(elijah) */
  horizonS?: number;
}

/** Below this terrain slope magnitude a touchdown reads as a clean landing. // TUNE(elijah) */
export const ARC_FLAT_SLOPE = 0.55;
/** Above this slope the landing is a wall / bad face → red. // TUNE(elijah) */
export const ARC_STEEP_SLOPE = 1.5;
export const ARC_DEFAULT_STEP_S = 0.05; // TUNE(elijah)
export const ARC_DEFAULT_HORIZON_S = 2.6; // TUNE(elijah)

/**
 * Predict the ballistic arc from takeoff until it touches the ground.
 * `groundAt(x,z)` returns terrain height; `slopeAt(x,z)` returns the terrain
 * slope magnitude at a point (hypot of the two partials). The caller owns the
 * real terrain sampler so this module stays physics-agnostic.
 *
 * Clearance:
 *   green  — lands within the horizon on flat-enough ground
 *   yellow — lands but on a marginal (moderately steep) face
 *   red    — never lands within the horizon (flew off / into a wall)
 */
export function predictArc(
  o: ArcOpts,
  groundAt: (x: number, z: number) => number,
  slopeAt: (x: number, z: number) => number
): ArcResult {
  const step = o.stepS ?? ARC_DEFAULT_STEP_S;
  const horizon = o.horizonS ?? ARC_DEFAULT_HORIZON_S;
  const g = o.gravity;
  const points: ArcPoint[] = [];

  let landT = -1;
  let landX = o.x0;
  let landY = o.y0;
  let landZ = o.z0;

  let prevY = o.y0;
  let prevAbove = o.y0 - groundAt(o.x0, o.z0);

  for (let t = 0; t <= horizon + 1e-9; t += step) {
    const x = o.x0 + o.fx * o.speed * t;
    const z = o.z0 + o.fz * o.speed * t;
    const y = o.y0 + o.vy0 * t - 0.5 * g * t * t;
    points.push({ x, y, z, t });

    const gh = groundAt(x, z);
    const above = y - gh;
    // Detect a downward crossing of the terrain (touchdown) after the first step.
    if (t > 0 && prevAbove > 0 && above <= 0 && y <= prevY) {
      // Linear interpolate the crossing for a tidy landing point.
      const frac = prevAbove / (prevAbove - above);
      landT = t - step + step * frac;
      landX = o.x0 + o.fx * o.speed * landT;
      landZ = o.z0 + o.fz * o.speed * landT;
      landY = groundAt(landX, landZ);
      break;
    }
    prevAbove = above;
    prevY = y;
  }

  let clearance: ArcClearance;
  if (landT < 0) {
    clearance = 'red';
  } else {
    const slope = slopeAt(landX, landZ);
    clearance = slope <= ARC_FLAT_SLOPE ? 'green' : slope <= ARC_STEEP_SLOPE ? 'yellow' : 'red';
  }

  return { points, landX, landY, landZ, landT, clearance };
}

/** Map a clearance verdict to a hex color for the dotted ghost line. */
export function arcColor(c: ArcClearance): string {
  return c === 'green' ? '#00FF9D' : c === 'yellow' ? '#FFD700' : '#FF3366';
}

// ---------------------------------------------------------------------------
// Fix 3 — No dead ends (invisible auto-boost push pad)
// ---------------------------------------------------------------------------

/** Speed (m/s) below which the rider is considered stalling. // TUNE(elijah) */
export const STALL_SPEED = 2.0;
/** How long the rider must stay under STALL_SPEED before we push. // TUNE(elijah) */
export const STALL_HOLD_S = 1.5;
/** Speed the push pad restores the rider to. // TUNE(elijah) */
export const STALL_PUSH_TO = 5.5;

export interface AntiStallState {
  /** seconds spent continuously under STALL_SPEED while grounded */
  belowT: number;
  /** total number of push-pad fires this run (telemetry) */
  fires: number;
}

export function createAntiStall(): AntiStallState {
  return { belowT: 0, fires: 0 };
}

export interface AntiStallResult {
  /** true on the frame the invisible push pad fires */
  push: boolean;
  /** speed the caller should clamp UP to when push is true (else unchanged) */
  pushTo: number;
}

/**
 * Advance the anti-stall watchdog. Only counts while grounded (airborne or
 * wiped-out riders are exempt). Fires once when the rider has been under
 * STALL_SPEED for STALL_HOLD_S, then re-arms.
 */
export function updateAntiStall(
  s: AntiStallState,
  speed: number,
  dt: number,
  grounded: boolean
): AntiStallResult {
  if (!grounded || speed >= STALL_SPEED) {
    s.belowT = 0;
    return { push: false, pushTo: STALL_PUSH_TO };
  }
  s.belowT += dt;
  if (s.belowT >= STALL_HOLD_S) {
    s.belowT = 0;
    s.fires += 1;
    return { push: true, pushTo: STALL_PUSH_TO };
  }
  return { push: false, pushTo: STALL_PUSH_TO };
}

// ---------------------------------------------------------------------------
// Fix 4 — Grind chain (exponential, capped)
// ---------------------------------------------------------------------------

/** grind 1 = ×1.0, grind 2 = ×1.5, grind 3 = ×2.0, +0.5 each, cap ×3.0. // TUNE(elijah) */
export const GRIND_CHAIN_STEP = 0.5;
export const GRIND_CHAIN_CAP = 3.0;

/**
 * Multiplier for the n-th grind in an unbroken air→grind→air chain (1-based).
 * n<=0 is treated as no chain (×1.0).
 */
export function grindChainMult(n: number): number {
  if (n <= 1) return 1.0;
  return Math.min(GRIND_CHAIN_CAP, 1 + GRIND_CHAIN_STEP * (n - 1));
}

export interface GrindChainState {
  /** grinds landed in the current unbroken chain */
  count: number;
  /** best chain length reached this run (telemetry) */
  best: number;
}

export function createGrindChain(): GrindChainState {
  return { count: 0, best: 0 };
}

/** Register a fresh grind lock. Returns the multiplier to apply to its points. */
export function pushGrind(s: GrindChainState): number {
  s.count += 1;
  if (s.count > s.best) s.best = s.count;
  return grindChainMult(s.count);
}

/** Break the chain — call on bail or when the rider settles on the ground. */
export function breakGrindChain(s: GrindChainState): void {
  s.count = 0;
}

// ---------------------------------------------------------------------------
// Fix 4 (visual) — next-rail highlight lookup
// ---------------------------------------------------------------------------

export interface RailLike {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  y: number;
}

/**
 * Pick the index of the nearest rail whose midpoint lies AHEAD of the rider
 * (in the forward direction) within `maxDist`. Returns -1 when none qualify.
 * Used to paint the next grind target green (THPS endless-chain read).
 */
export function pickNextRail(
  rails: readonly RailLike[],
  x: number,
  z: number,
  fx: number,
  fz: number,
  maxDist: number
): number {
  let best = -1;
  let bestD = maxDist;
  for (let i = 0; i < rails.length; i++) {
    const r = rails[i];
    const mx = (r.ax + r.bx) * 0.5;
    const mz = (r.az + r.bz) * 0.5;
    const dx = mx - x;
    const dz = mz - z;
    // Ahead test: positive projection on the forward vector.
    if (dx * fx + dz * fz <= 0) continue;
    const d = Math.hypot(dx, dz);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
