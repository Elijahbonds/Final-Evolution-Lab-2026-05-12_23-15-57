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
  /** DRIBBLE GEARS (2026-09-17): the walking dribble (06_01, ~1.2 leg/s) and the jogging dribble (78_10, ~4.5 leg/s), scaled by the
   *  same calibration as `run` (3.6 for a 5.9 leg/s capture → 0.61 m/s per leg/s). */
  walk?: number;
  jog?: number;
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
export const HOOPS_STRIDE: StrideRef = { run: 3.6, slide: 2.0, walk: 0.72, jog: 2.8 };

/**
 * The same references for the CAPTURED hoops loops (HOOPS MOVEMENT, 2026-09-15) — the hero and the AI both run CMU 78
 * strides now, and a capture's stride is its own: bball_mc_run covers 3.9 leg lengths in its 0.65 s window, played in
 * 0.6 s, where the authored run was keyed for 3.6 m/s. Calibrated with scripts/probes/_footplant-probe.mts (see the
 * sweep in the HOOPS-MOVEMENT commit), `?strideRun=` / `?strideSlide=` override both tables for that sweep.
 */
export const HOOPS_STRIDE_CAPTURE: StrideRef = { run: 3.6, slide: 2.0, walk: 0.72, jog: 2.8 };

/** `?strideRun=4.8&strideSlide=2.4` — the calibration sweep's knob. Read once. */
const STRIDE_OVERRIDE: Partial<StrideRef> = (() => {
  try {
    if (typeof window === 'undefined') return {};
    const q = new URLSearchParams(window.location.search);
    const num = (k: string) => { const v = Number(q.get(k)); return q.get(k) !== null && v > 0 ? v : undefined; };
    return { run: num('strideRun'), slide: num('strideSlide') };
  } catch { return {}; }
})();
export function strideRef(captured: boolean): StrideRef {
  const base = captured ? HOOPS_STRIDE_CAPTURE : HOOPS_STRIDE;
  return { run: STRIDE_OVERRIDE.run ?? base.run, slide: STRIDE_OVERRIDE.slide ?? base.slide, walk: base.walk, jog: base.jog };
}

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
export type StrideKind = 'run' | 'slide' | 'walk' | 'jog' | 'none';

/**
 * Is this state LOCOMOTION, and against which reference?
 *
 * An allowlist for the same reason DynamicPosture uses one: rate-scaling a SHOT would change the meter's timing and
 * rate-scaling a knockdown would make a body fall at the wrong speed. Only states whose feet are walking.
 */
export function strideKindFor(state: string): StrideKind {
  switch (state) {
    case 'drive': case 'sprint_dribble': case 'run': case 'crossover':
      return 'run';
    case 'speed_dribble': return 'jog';        // DRIBBLE GEARS: the jog loop is its own capture now
    case 'walk_dribble': return 'walk';
    case 'defend_slide': case 'defend_slide_right':
    // HOOPS-DEPTH S7 (2026-09-23): the defensive states added AFTER this list (DEFENSE-LOOK 09-17, THE CRAB WALK FIX 09-19) were never
    // on it, so they played at a fixed rate whatever the body's speed — the foot-plant probe put every planted-foot skate in a live
    // 1v1 on a defence clip (closeout 53, backpedal 36 of 353). They are all shuffles but the closeout, which is a sprint.
    case 'defend_slide_hard': case 'defend_slide_hard_right': case 'defend_backpedal':
    case 'carry_slide': case 'carry_slide_right': case 'carry_back':
      return 'slide';
    case 'closeout': return 'run';
    default:
      return 'none';
  }
}

/** The rate for a state at a speed, or null when the state's rate must not be touched. */
export function rateFor(state: string, speed: number, ref: StrideRef = HOOPS_STRIDE): number | null {
  const kind = strideKindFor(state);
  if (kind === 'none') return null;
  return strideRate(speed, kind === 'run' ? ref.run : kind === 'slide' ? ref.slide : kind === 'walk' ? (ref.walk ?? ref.run * 0.2) : (ref.jog ?? ref.run * 0.78));
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
    case 'dash': case 'run': case 'run_back': ref = COMBAT_STRIDE.dash; break;
    default: return null;                      // strikes, blocks, reactions, the floor: choreography
  }
  const sign = authoredRatio < 0 ? -1 : 1;
  return strideRate(speed, ref) * sign;
}

// ── THE GAIT SPLIT — the fix the note below asked for (2026-09-13) ──────────────────────────────────────
//
// The note below (kept, because it is the measurement that led here) concluded that the residue was a BUDGET
// problem with two honest fixes: author a real stepping cycle, or move the root slower while a stance clip
// plays. It missed a third, and the third was already sitting in the tree: there is a RUN clip, referenced at
// 4.0 m/s, used only when an explicit dash input fires. Free locomotion never reached it.
//
// So a fighter travelling at 3.4 m/s was being animated with a GUARD STEP — a clip that covers 0.6 m/s of
// ground — and no playback rate can close a 5.7× gap. The answer is not a faster stance, it is a different
// gait, and it is what the sport actually looks like: you guard-step when you are spacing at range and you
// RUN when you are closing distance. Nobody guard-steps across a ring at jogging speed.
//
// The threshold is not a taste call — it is exactly where the guard step runs out of rate.

/** The fastest ground speed a guard step can cover before it becomes a fast-forward. 0.6 × 1.85 = 1.11 m/s. */
export const GUARD_STEP_CEILING = COMBAT_STRIDE.walk * RATE_MAX;

/** Which gait a body moving at `speed` should be in. */
export function combatGait(speed: number): 'step' | 'run' {
  return Math.abs(speed) > GUARD_STEP_CEILING ? 'run' : 'step';
}

// ── WHAT IS STILL UNRESOLVED, MEASURED 2026-09-13 ───────────────────────────────────────────────────────
//
// The gait split above is correct on its own terms — a body at 3.4 m/s belongs in a run clip, not a guard
// step — and the tree now reaches `run` / `run_back` on ~1400 of ~3900 moving frames in a live karate_vs.
// It did NOT close the skate, and chasing it turned up a contradiction that should be resolved before
// anyone retunes these numbers:
//
//   · scripts/probes/_footplant-probe.mts, with its planted test corrected (see below), measures the STANCE
//     foot travelling 0.0386 m/frame against a root of 0.0502 — 77%.
//   · scripts/probes/_clip-stride-measure.mts, playing each clip at rate 1 on a frozen root, measures the
//     clips covering: run 1.11 m/s, karate_guard_step 1.95, karate_shuffle_left 1.70 — three times the
//     references declared in COMBAT_STRIDE (0.6 / 0.5 / 4.0), and in BOTH directions.
//   · those two cannot both be right. If the guard step really covers 1.95 m/s then declaring it 0.6 pins
//     the rate at RATE_MAX and the clip covers 1.95 × 1.85 = 3.6 m/s — which is the root speed, and the
//     skate should be small. It is not.
//
// So one of the three (the plant test, the clip measurement, or the matcher's reach) is lying, and a retune
// on top of an unresolved contradiction would be a guess wearing a measurement's clothes. The numbers are
// recorded here so the next pass starts from them rather than re-deriving them.
//
// NOTE ON THE PLANT TEST, because it cost a wrong conclusion: it used to call a foot planted on HEIGHT
// alone. In a walk both feet stay low, so that is a fair proxy; in a RUN the swing foot passes through low
// altitude at full speed, so the metric counted a correctly-animated swing as a skate and therefore
// REWARDED shuffling over running. It now requires low + stance (the lower foot) + not rising.
//
// ── WHY COMBAT USED TO SLIDE ────────────────────────────────────────────────────────────────────────────
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
