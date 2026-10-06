// gait — the knee of an authored stepping cycle (MOVEMENT POLISH, 2026-10-06).
//
// Owner: "We need to polish up some of the movements still" — running + turning first: foot sliding, stiff starts and stops.
//
// THE AUTHORED GAITS MOONWALKED. Four code-built loops share one shape — the base `walk` and `run` (baseClips.locomotion, under
// `walk_forward`, `run_forward`, `run_backward`, `sprint_forward`, the strafes' and a dozen sports' aliases), the fighter's
// `karate_guard_step` and the carrier's `football_carry_run`: thighs keyed L = −T·sin φ, R = +T·sin φ about the bind frame's X
// (negative X flexes the thigh FORWARD: seated.ts, "UpLeg[0] NEGATIVE raises the thigh toward the chest"), and each knee folded
// as `base + amp·(1 − cos φ)` for the left, `(1 − cos(φ + π))` for the right. That puts the left knee's fold at φ = π, where the
// left thigh is sweeping BACK — so the foot lifted as it went back under the body and came forward low, along the floor.
// Measured on the hero (scripts/probes/_movement-probe.ts `clips`, the foot's velocity along the travel relative to the root,
// split by height): the run's LOW foot moved FORWARD at +1.4 / +2.3 m/s and its high foot back; the walk +0.24 / +0.62; the
// guard step +0.93 / +1.53. The captured `bball_mc_run` (a person, the control) reads −2.2 / −1.9 m/s low and +1.4 high. With
// the low foot racing forward FootPlanting could never plant (its swing check refuses a foot moving forward), and a Sprint
// runner's planted foot travelled 222% of the body's own step (5.2 cm a frame at a walk, 28 cm at a sprint).
//
// The knee folds while its thigh swings FORWARD (the foot is carried up and through) and is near straight while the thigh
// sweeps back under the body (the stance). Same amplitude, same base, same timing of every other key: the cycle's half-phase
// moves from one knee to the other.

/** The two knees' flexion (degrees) at phase `phi` of a cycle whose thighs are keyed L = −T·sin φ, R = +T·sin φ (bind-frame X,
 *  negative = forward). Each knee is `base` at mid-stance and `base + 2·amp` at mid-swing, when its thigh passes vertical
 *  swinging forward (φ = 0 for the left, π for the right). */
export function gaitKnees(phi: number, base: number, amp: number): { L: number; R: number } {
  const c = Math.cos(phi);
  return { L: base + amp * (1 + c), R: base + amp * (1 - c) };
}

/** The forward swing velocity of each thigh at phase `phi` (d/dφ of the forward flexion: L = T·sin φ, R = −T·sin φ), per unit T.
 *  Positive = the thigh is swinging forward. For tests: the knee must fold most where this is largest. */
export function thighSwing(phi: number): { L: number; R: number } {
  const c = Math.cos(phi);
  return { L: c, R: -c };
}
