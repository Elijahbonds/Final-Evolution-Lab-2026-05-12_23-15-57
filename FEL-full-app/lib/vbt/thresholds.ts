// lib/vbt/thresholds.ts — VBT (2026-10-25): every number the bar-speed tool decides with.
//
// ALL NEW, each flagged "(new)". None is a game-feel number: like lib/coach/readiness/thresholds.ts these are measurement
// and coaching rules, so they are plain constants, not feel-panel knobs (the feel panel only reaches playtest game runs,
// and /train/velocity is not one). docs/VBT-BENCHMARK.md says where the literature ones come from; the rest are the
// lane's starting values, measured on the synthetic bench (lib/vbt/bench.ts) where the bench can measure them.
//
// Pure data.

/** (new, owner-named) The plate the scale is read from: a standard bumper's diameter (m). */
export const PLATE_DIAMETER_M = 0.45;

/**
 * (new) Stature shares of the near-side trunk + thigh + shank (shoulder → hip → knee → ankle), from the Drillis–Contini
 * segment table (shoulder 0.818 H, hip 0.530, knee 0.285, ankle 0.039): the pose ruler when no plate is found.
 */
export const SEGMENT_STATURE_SHARE = 0.818 - 0.039;
/** (new) One SD of that share between people (relative): body proportions differ by a few per cent. */
export const POSE_SCALE_SD = 0.035;
/** (new) One SD of the plate ruler (relative), before the fit's own spread: plates run 445–450 mm. */
export const PLATE_SCALE_SD = 0.008;

/** (new) Position jitter, one SD, in image heights: MediaPipe's wrist/hip on a still body, and a fitted plate centre. */
export const POSE_JITTER = 0.004;
export const PLATE_JITTER = 0.0012;
/** (new) The hand is not the bar (the wrist rolls, the grip slips): a relative SD added to a pose-tracked bar speed. */
export const POSE_BAR_SD = 0.04;

/** (new) The smoothing half-window (ms) for velocity: at least this, and at least SMOOTH_FRAMES frame periods. */
export const SMOOTH_HALF_MS = 45;
export const SMOOTH_FRAMES = 2.5;

/** (new) A rising run is a rep candidate while the bar rises faster than this (m/s). */
export const V_EDGE = 0.05;
/** (new) A rep's edges are read where the bar is this far off its bottom / top — the larger of EDGE_MIN_M, EDGE_ROM_SHARE
 *  of the range and 3 SD of the smoothed position — then carried to zero speed under a constant acceleration (2δ / v). */
export const EDGE_MIN_M = 0.01;
export const EDGE_ROM_SHARE = 0.04;
/** (new) …and counts only if its peak reaches this (m/s): a 1RM bench's peak is ≈ 0.25 m/s. */
export const V_PEAK_MIN = 0.1;
/** (new) Two upward spans this close (ms), with no drop of more than MERGE_DROP_M between, are one rep (a sticking point). */
export const MERGE_GAP_MS = 350;
export const MERGE_DROP_M = 0.03;
/** (new) A bottom pause shorter than this (ms) after a lowering is a bounce (touch-and-go). */
export const BOUNCE_MS = 120;
/** (new) A rep whose range is under this share of the set's own range is a partial: shown, not counted. */
export const PARTIAL_SHARE = 0.7;

/** (new) The standard gravity used for the propulsive phase (m/s²). */
export const G = 9.81;

/** (new) The default velocity-loss stop line (%), per Pareja-Blanco 2017's 20 % condition; a coach may set 5–50. */
export const LOSS_STOP_PCT = { min: 5, max: 50, default: 20 } as const;
/** (new) The auto-stop cue waits for at least this many counted reps. */
export const LOSS_MIN_REPS = 2;

/** (new) A load-velocity line needs at least this many distinct loads, this far apart (kg). */
export const LV_MIN_LOADS = 2;
export const LV_MIN_LOAD_GAP_KG = 5;
/** (new) The MVT's own spread between people (m/s, 1 SD): the e1RM band always carries it. */
export const MVT_SD = 0.035;
/** (new) Loads are suggested in this step (kg): the smallest common pair of change plates. */
export const LOAD_STEP_KG = 2.5;

/** (new) Med ball: a throw's wrist speed must peak over this (m/s), and fall by this share within RELEASE_FALL_MS after. */
export const MB_MIN_SPEED = 2;
export const RELEASE_FALL_SHARE = 0.25;
export const RELEASE_FALL_MS = 120;
/** (new) The ball leaves faster than the wrist moves: a relative SD added to the release speed. */
export const RELEASE_MODEL_SD = 0.1;

/** (new) The warm-up readiness read: the same lift at a load within this share of the baseline's (±). */
export const READINESS_LOAD_TOL = 0.025;
/** (new) …from the first this-many counted reps of the warm-up set. */
export const READINESS_REPS = 3;
/** (new) The body's own day-to-day spread of bar speed at a fixed load (relative, 1 SD): ≈ 3–5 % in the literature. */
export const BAR_SPEED_CV = 0.04;
