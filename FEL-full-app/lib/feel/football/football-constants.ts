/**
 * lib/feel/football/football-constants.ts
 * =======================================
 * M10 Row A — Street Football (synth approximation) tuning constants.
 *
 * STATUS: SYNTH APPROXIMATION. Street Football is the ONE lineup surface that
 * shipped with NO donor JS reference and NO existing playable component — it
 * lived only as anim clips (lib/anim/clip-registry.ts fb*), an anim-state-machine
 * flow, a story zone ('gridiron'), and an over-shoulder camera rig. Per the M10
 * firewall ("if a row needs something no core provides, STOP and flag — never
 * fork a core") this build does NOT fork any core: it COMPOSES the proven
 * Court/free-3D locomotion foundation (CourtCore → LocomotionController + jump)
 * and layers an ORIGINAL, deterministic abstracted-tackler + juke-evade system
 * on top. The signature moment from the lineup spec is reproduced: "juke
 * rotation broke 80yd for a TD vs live tackles."
 *
 * Every value here is new scaffolding for an unshipped surface, so every value
 * is marked // TUNE(elijah) — there are no ported/RESERVED donor coefficients
 * to preserve for this mode.
 */

export const FOOTBALL_TUNING = {
  /** Downfield distance to the end zone, in yards (= world units on -Z). // TUNE(elijah) */
  fieldLengthYd: 80,
  /** Lateral half-width of the running lane (world units). // TUNE(elijah) */
  laneHalfWidth: 8,
  /** Extra downfield run-out world units past the goal line for bounds. // TUNE(elijah) */
  endZoneMargin: 6,

  /** Sprint speed multiplier applied to the shared movement.runSpeed (6.0 m/s). // TUNE(elijah) */
  sprintScale: 1.45,

  /** Number of abstracted tacklers seeded down the field. // TUNE(elijah) */
  tacklerCount: 9,
  /** Downfield yard of the FIRST tackler (give the runner a clean start). // TUNE(elijah) */
  firstTacklerYd: 10,
  /** Downfield yard of the LAST tackler (leave a run-in to the end zone). // TUNE(elijah) */
  lastTacklerYd: 72,
  /** Contact radius (world units): inside this a tackler brings the runner down. // TUNE(elijah) */
  tackleRadius: 1.7,
  /** Evade engagement reach (world units): during an active evade window a
   * defender crossed within this lateral/downfield range is juked past (a
   * successful juke moves you laterally clear, so it is wider than tackleRadius).
   * // TUNE(elijah) */
  evadeReach: 2.7,

  /** Juke: how long the lateral-dash evade window stays open (seconds). // TUNE(elijah) */
  jukeWindowS: 0.42,
  /** Juke: lateral steer authority forced during the dash (stick units, 0..1). // TUNE(elijah) */
  jukeSteer: 1.0,
  /** Spin: brief pass-through-a-defender evade window (seconds). // TUNE(elijah) */
  spinWindowS: 0.34,
  /** Stiff-arm: short close-range single-tackle negation window (seconds). // TUNE(elijah) */
  stiffArmWindowS: 0.26,

  /** Score: points banked per downfield yard gained. // TUNE(elijah) */
  pointsPerYard: 5,
  /** Score: bonus per tackler evaded (juke/spin/stiff-arm/hurdle). // TUNE(elijah) */
  pointsPerEvade: 40,
  /** Score: flat bonus for reaching the end zone (touchdown). // TUNE(elijah) */
  touchdownBonus: 600,

  /** Input buffer window for juke/spin/stiff-arm presses (ms). // TUNE(elijah) */
  evadeBufferMs: 150,
} as const;

export type FootballTuning = typeof FOOTBALL_TUNING;

export default FOOTBALL_TUNING;
