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
 * These are the speeds the clips look correct at, not the speeds the modes move at — and `run` is CALIBRATED against
 * the foot-slide probe, as a planted foot's travel over the body's, in a live 1v1:
 *
 *     2.9 -> 39.2%     3.3 -> 31.5%     3.6 -> 31.5%     4.2 -> 33.9%     4.8 -> 35.2%
 *
 * 3.6 is the floor (and the lowest absolute median of the pair) — though 3.3 and 3.6 are within run-to-run noise of
 * each other, and a later run at 3.6 read 25.5%, so treat these as a band of roughly 25-32% rather than exact
 * figures. Worth recording WHY this moved from the 4.2 that an
 * earlier sweep picked: that sweep ran while the stride matcher was overwriting the alias's own rate instead of
 * multiplying it, and `bball_dribble_run` is `['run', 0.9]`. Violating that 0.9 happened to read 29.9% — slightly
 * better than this — but it was disobeying an authoring decision about how the run should look to win a metric.
 * Honouring the alias and calibrating on top of it is the correct trade, and it costs about 1.5 points.
 */
export const HOOPS_STRIDE: StrideRef = { run: 3.6, slide: 2.0 };

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

// ── COMBAT ───────────────────────────────────────────────────────────────────────────────────────────────
// The fighting tree has real locomotion loops — a guard step, two lock-on shuffles and a dash — and like the hoops
// tree it plays them on a STATE CHANGE and never touches the rate again. Same skate, same fix.

/**
 * Authored speeds for the combat clip set.
 *
 * A guard step and a lock-on shuffle are TINY — a fighter's feet barely travel, which is the point of a stance. These
 * are measured-order-of-magnitude figures, not guesses at a run: my first pass used 1.9 / 1.6, and doubling them moved
 * the measured foot slide by 1.5 percentage points, because the references were the wrong SIZE rather than slightly
 * off. See the note on combat's residue below.
 */
export const COMBAT_STRIDE = { walk: 0.6, strafe: 0.5, dash: 4.0 } as const;

/**
 * The rate for a combat state, PRESERVING THE SIGN of the clip's authored ratio.
 *
 * `walk_back` is the guard step played at speedRatio −1 — the same cadence, backwards, because a fighter giving ground
 * steps back rather than walking forward away from you. A rate-matcher that returns a positive number would make a
 * retreating fighter WALK FORWARD while travelling backwards, which is worse than the skate it is fixing.
 */
export function combatRateFor(state: string, speed: number, authoredRatio = 1): number | null {
  let ref: number;
  switch (state) {
    case 'walk': case 'walk_back': ref = COMBAT_STRIDE.walk; break;
    case 'strafe_left': case 'strafe_right': ref = COMBAT_STRIDE.strafe; break;
    case 'dash': ref = COMBAT_STRIDE.dash; break;
    default: return null;                      // strikes, blocks, reactions, the floor: choreography
  }
  const sign = authoredRatio < 0 ? -1 : 1;
  return strideRate(speed, ref) * sign;
}

// ── WHY COMBAT STILL SLIDES, AND WHAT WOULD FIX IT ───────────────────────────────────────────────────────
// Measured in a live karate_vs: the root travels 0.054 m per frame (~3.2 m/s) while a DOWN foot travels 0.037 — 69%.
// Rate matching is reaching those frames: a dev counter showed the tree in a stride state on 95% of moving frames
// (walk 1376, strafe_left 1392, strafe_right 725, walk_back 433, refused:idle 219). So the matcher works and the
// residue is not a wiring bug.
//
// The residue is a BUDGET problem. A guard step covers on the order of half a metre per second of its own cadence; the
// mode moves the root at ~3 m/s. Covering that needs a rate around 6, and RATE_MAX is 1.85 — deliberately, because a
// stance clip played six times over stops reading as a fighter and starts reading as a fast-forward. So the honest
// ceiling here is roughly a third of the gap, and the rest is not fixable by a playback rate:
//
//   · author a real stepping cycle for the fighting locomotion (the proper fix), or
//   · move the root slower while a stance clip is the one playing.
//
// Recorded rather than tuned around, because raising RATE_MAX to "fix" the number would trade a skate for a
// fast-forward, which is a worse-looking bug that is harder to name.
