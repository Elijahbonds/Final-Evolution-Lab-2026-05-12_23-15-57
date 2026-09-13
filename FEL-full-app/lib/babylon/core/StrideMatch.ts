// STRIDE MATCHING — the feet keep up with the body (2026-09-12).
//
// Part of the aesthetics-of-movement pass, and the half of it that dynamic posture cannot fix: a body that banks
// beautifully while its shoes skate across the floor still reads as weightless. That skate is the single biggest
// thing separating 2K's weight from a mobile game's.
//
// MEASURED FIRST, because this is the kind of thing it is easy to invent a fix for without a problem. A probe bound
// the hero's foot bones in a live 1v1 and sampled them for 3000 frames:
//
//     the body travelled      0.0771 m per frame
//     a foot that was DOWN    0.0292 m per frame   — 38% of the body's motion
//
// A genuinely planted foot should travel approximately nothing. The cause is not the foot planter: FootPlanting is
// mounted on every character already and works, but its pin budget (maxDrift 0.32 m) is spent in about four frames
// at a 4.6 m/s run, so it cannot absorb a mismatch this large. The cause is that the run clip plays at ONE cadence
// for EVERY speed — BasketballAnimTree plays a loop when the STATE changes and never touches its rate again — so at
// any speed except the one the clip was authored for, the feet and the floor disagree.
//
// The fix is the standard one: scale the clip's playback rate with the body's actual speed, so one stride covers the
// ground the body actually covers. Then the foot planter only has to absorb what is left.
//
// Pure maths, so the curve is tunable and testable without a scene.

/** The speed, in m/s, at which a clip's own stride matches the ground. */
export interface StrideRef {
  /** Authored speed of the run loop. */
  run: number;
  /** Authored speed of a defensive shuffle, which is much slower than a run. */
  slide: number;
}

/**
 * Reference speeds for the hoops clip set.
 *
 * These are the speeds the clips look correct at, not the speeds the modes move at — and `run` is CALIBRATED, not
 * guessed. Swept against the foot-slide probe in a live 1v1, reading a planted foot's travel as a fraction of the
 * body's:
 *
 *     reference 3.0 m/s -> 55.7%      reference 4.2 m/s -> 29.9%      reference 5.4 m/s -> 47.7%
 *
 * 4.2 is a clear minimum of the three. Picking it by eye and leaving it would have been a coin flip between a
 * constant that helps and one that makes the skate worse, which is what reference 3.0 does.
 */
export const HOOPS_STRIDE: StrideRef = { run: 4.2, slide: 2.0 };

/**
 * Rate limits.
 *
 * A clip pushed past these stops reading as running and starts reading as a cartoon, so the planter absorbs the
 * remainder instead. Below 1 a slow body takes slow steps, which is correct; the floor exists so a nearly-stopped
 * body does not freeze mid-stride.
 */
export const RATE_MIN = 0.55, RATE_MAX = 1.85;

/**
 * The playback rate a loop should run at to cover the ground the body is covering.
 *
 * `speed` is the body's planar speed in m/s, `ref` the speed the clip was authored for.
 */
export function strideRate(speed: number, ref: number): number {
  if (!(ref > 0) || !Number.isFinite(speed)) return 1;
  const want = Math.abs(speed) / ref;
  return Math.max(RATE_MIN, Math.min(RATE_MAX, want));
}

/** Which reference a locomotion state is measured against. */
export type StrideKind = 'run' | 'slide' | 'none';

/**
 * Is this state LOCOMOTION, and against which reference?
 *
 * An allowlist for the same reason DynamicPosture uses one: rate-scaling a SHOT would change the meter's timing and
 * rate-scaling a knockdown would make a body fall at the wrong speed. Only states whose feet are walking.
 */
export function strideKindFor(state: string): StrideKind {
  switch (state) {
    case 'drive': case 'speed_dribble': case 'run': case 'crossover':
      return 'run';
    case 'defend_slide': case 'defend_slide_right':
      return 'slide';
    default:
      return 'none';
  }
}

/** The rate for a state at a speed, or null when the state's rate must not be touched. */
export function rateFor(state: string, speed: number, ref: StrideRef = HOOPS_STRIDE): number | null {
  const kind = strideKindFor(state);
  if (kind === 'none') return null;
  return strideRate(speed, kind === 'run' ? ref.run : ref.slide);
}

/**
 * Smooth the rate.
 *
 * A rate that jumps frame to frame makes a stride stutter, which looks worse than the skate it is fixing. The body's
 * own speed is already smoothed by its movement controller, but a state change can move the reference, so the rate
 * itself is eased too.
 */
export class StrideRateFilter {
  private rate = 1;
  constructor(private readonly tau = 0.1) {}
  /** Advance toward `target` and return the rate to apply. */
  step(target: number, dt: number): number {
    const k = Math.min(1, Math.max(0, dt) / Math.max(1e-4, this.tau));
    this.rate += (target - this.rate) * k;
    return this.rate;
  }
  /** A state change or a teleport: adopt the rate rather than sliding to it. */
  set(rate: number): void { this.rate = rate; }
  get value(): number { return this.rate; }
}
