/**
 * lib/feel/football-cam.ts
 *
 * PHASE 9 / Handoff PART 5.2 (Football camera) — PURE camera-director math shared
 * by components/games/football-3d.tsx and scripts/football-cam-tests.ts.
 *
 * Two responsibilities, both pure (no clock, no THREE, no DOM):
 *   1. Field-of-view law: football runs a WIDE 65° FOV (vs basketball's tight
 *      50°) so the player can read defensive lanes forming downfield.
 *   2. Stacked-tackle broadcast cut: when STACK_MIN+ defenders converge on the
 *      runner, briefly cut to an overhead/behind "broadcast" framing so the
 *      player sees the gap before contact, then blend back to the chase cam.
 */

// TUNE(elijah) — field-of-view law (degrees).
export const FOOTBALL_FOV = 65;
export const BASKETBALL_FOV = 50;

// TUNE(elijah) — stacked-tackle detection + broadcast-cut protocol.
export const STACK_MIN = 3;            // defenders converging to trigger the cut
export const CONVERGE_RADIUS_YD = 12;  // closing radius that counts as "converging"
export const CUT_DURATION_S = 0.5;     // how long the broadcast framing holds
export const CUT_COOLDOWN_S = 2;       // lockout after a cut (== the 2s convergence window)

export interface DefenderLike {
  /** Downfield yard (world -Z magnitude) where the defender sits. */
  yd: number;
  /** Lateral world X. */
  x: number;
  /** True once the runner has evaded/passed this defender. */
  cleared: boolean;
}

export interface RunnerLike {
  x: number;
  /** World Z (yards gained = -z). */
  z: number;
}

/**
 * Count uncleared defenders that are AHEAD of the runner (downfield) and within
 * CONVERGE_RADIUS_YD planar yards — i.e. actively converging for a stack tackle.
 */
export function countConverging(
  defenders: DefenderLike[],
  runner: RunnerLike,
  radiusYd: number = CONVERGE_RADIUS_YD,
): number {
  if (!defenders || defenders.length === 0) return 0;
  let n = 0;
  for (const d of defenders) {
    if (d.cleared) continue;
    const dz = d.yd + runner.z; // downfield gap (yards = -z): positive => ahead
    if (dz < 0) continue;       // already behind the runner
    const dx = runner.x - d.x;
    if (Math.hypot(dz, dx) <= radiusYd) n++;
  }
  return n;
}

export interface BroadcastCutState {
  active: boolean;
  /** Remaining seconds the cut holds. */
  timer: number;
  /** Remaining lockout seconds before another cut may fire. */
  cooldown: number;
}

export function makeBroadcastCutState(): BroadcastCutState {
  return { active: false, timer: 0, cooldown: 0 };
}

/**
 * Advance the broadcast-cut state machine by dt seconds given how many
 * defenders are currently converging. Mutates and returns the same object.
 *
 * - Fires when convergingCount >= STACK_MIN and no cut is active / cooling down.
 * - Holds for CUT_DURATION_S, then enters a CUT_COOLDOWN_S lockout.
 */
export function updateBroadcastCut(
  state: BroadcastCutState,
  convergingCount: number,
  dt: number,
): BroadcastCutState {
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
  if (state.cooldown > 0) state.cooldown = Math.max(0, state.cooldown - step);

  if (state.active) {
    state.timer = Math.max(0, state.timer - step);
    if (state.timer <= 0) {
      state.active = false;
      state.cooldown = CUT_COOLDOWN_S;
    }
  } else if (convergingCount >= STACK_MIN && state.cooldown <= 0) {
    state.active = true;
    state.timer = CUT_DURATION_S;
  }
  return state;
}

/**
 * Eased 0..1 blend toward the broadcast framing. 0 = pure chase cam,
 * 1 = full broadcast. Rises quickly as the cut fires and falls as it expires.
 */
export function broadcastBlend(state: BroadcastCutState): number {
  if (!state.active) return 0;
  const linear = CUT_DURATION_S > 0 ? state.timer / CUT_DURATION_S : 0;
  // smoothstep on how much time is LEFT so it fades out toward the end
  const t = Math.max(0, Math.min(1, linear));
  return t * t * (3 - 2 * t);
}
