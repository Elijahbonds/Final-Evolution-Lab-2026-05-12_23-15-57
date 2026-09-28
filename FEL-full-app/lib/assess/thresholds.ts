// thresholds — every number Mirror Assess scores with, in ONE versioned register (spec §13).
//
// OWNER DEFAULT (lane brief, 2026-09-28): every threshold, weight and band lives here and nowhere else, each one
// carrying where it came from and whether Elijah has signed it off. None has. The values are the spec's starting
// guesses ([TUNE-EJ], FEL-MIRROR-REALTIME-SPEC §4–§5) or numbers the repo already uses and itself marks TUNE(elijah)
// (valgus 0.35/0.70, lateral 0.3, confidence 0.6, the 12→40 in jump map, the 24 Hz gate). A number reused from the
// repo is NOT more trustworthy for being reused: it was never checked on a real athlete either (spec §13).
//
// WHAT THE VERSION IS FOR. A stored assessment records THRESHOLDS_VERSION, so when a band is re-tuned after the
// gold-standard capture (spec §12 Phase 1) an old 64 and a new 64 are never compared as if they meant the same thing.
// Bump it on ANY value change here.
//
// WHAT "PROVISIONAL" MEANS. A score is provisional while any threshold it used has signedOff: false — today, every
// score. The UI tags each one (isProvisional), and docs/MIRROR-ASSESS-THRESHOLDS.md is the sign-off sheet.
//
// Pure data: no DOM, no Prisma.

export const THRESHOLDS_VERSION = 'jump-screen-0.1-provisional';
export const PROTOCOL_VERSION = 'jump-screen-1.0';

/** Where a number came from: the spec's [TUNE-EJ] guess, or a value the repo already carries as TUNE(elijah). */
export type ThresholdSource = 'spec-TUNE-EJ' | 'repo-TUNE(elijah)';

/**
 * A metric's score band. `good` scores 100, `poor` scores 0, linear between (direction read from which is larger).
 * `fault` is the line past which the metric is a FAULT for the 0–3 score, compared with `faultOp`
 * (value `faultOp` fault → fault). A null fault means the metric never faults.
 */
export interface Band {
  good: number;
  poor: number;
  fault: number | null;
  faultOp: '<' | '<=' | '>' | '>=' | null;
}

export interface Threshold<V = number> {
  value: V;
  source: ThresholdSource;
  /** Every entry is false until Elijah signs the register (docs/MIRROR-ASSESS-THRESHOLDS.md). */
  signedOff: boolean;
  /** The spec section it comes from. */
  spec: string;
  unit: string;
  /** What it is, in a line. */
  label: string;
  /** For a repo value: where the repo keeps it. */
  repo?: string;
}

const spec = <V>(value: V, specRef: string, unit: string, label: string): Threshold<V> =>
  ({ value, source: 'spec-TUNE-EJ', signedOff: false, spec: specRef, unit, label });
const repo = <V>(value: V, specRef: string, unit: string, label: string, where: string): Threshold<V> =>
  ({ value, source: 'repo-TUNE(elijah)', signedOff: false, spec: specRef, unit, label, repo: where });
const band = (good: number, poor: number, fault: number | null, faultOp: Band['faultOp']): Band => ({ good, poor, fault, faultOp });

/**
 * THE REGISTER. Keys are stable ids: a stored result lists the ids it used, and the docs table is keyed by them.
 * "lane default" in a label marks a number the spec does not give (rep segmentation, a weight it left open) — chosen
 * here, still [TUNE-EJ], still unsigned.
 */
export const THRESHOLDS = {
  // ── gates (spec §3.1, §3.2, §8) ──
  'gate.minConfidence': repo(0.6, '§3.2', 'share 0–1', 'Below this confidence a test is "not scored", never guessed', 'lib/mirror/assessment.ts MIN_GRADEABLE_CONFIDENCE'),
  'gate.minPoseHz': repo(24, '§3.1', 'Hz', 'Pose-rate gate: under it the device check says so', 'lib/pose/modelChoice.ts MIN_CAMERA_FPS'),
  'gate.jumpFps': spec(50, '§3.1, §4 T5', 'Hz', 'Jump timing: under this pose rate the CMJ is flagged and contact timing is not scored'),
  'gate.visibility': spec(0.5, '§3.1', 'visibility 0–1', 'Per-landmark visibility for tracking'),
  'gate.visibilityScoring': spec(0.65, '§3.1', 'visibility 0–1', 'Per-landmark visibility for a scoring frame'),
  'gate.minValidReps': spec(3, '§4 rules', 'reps', 'Fewer valid reps than this caps the test at 1/3 and writes no PRQ'),
  'gate.absenceRestartMs': repo(6000, '§8', 'ms', 'Out of frame this long restarts the test', 'lib/mirror/screenRunner.ts ABANDON_MS'),

  // ── calibration (spec §3.3) ──
  'calib.frontMs': spec(3000, '§3.3', 'ms', 'Standing still facing the camera'),
  'calib.sideMs': spec(2000, '§3.3', 'ms', 'Standing still side-on'),
  'calib.maxSway': spec(0.02, '§3.3', 'body-height fraction', 'Lane default: hip sway allowed during a calibration hold'),

  // ── geometry (spec §3.2) ──
  'geom.heelRise': spec(0.015, '§3.2', 'body-height fraction', 'Heel lifts above its calibrated floor line by more than this'),
  'geom.lensHfovDeg': spec(60, '§3.2', 'deg', 'Lane default: lens width the FPPA parallax correction assumes (a knee moving toward the lens)'),
  'geom.heelRiseRepo': repo(0.012, '§4 T1', 'image-height units', 'Reference only (not read by the scorer): the guided squat\'s heel line; ≈ geom.heelRise at 80% frame fill', 'lib/babylon/nexus/neuro-mirror/rules/squat-audit.ts heelRiseWarnPx'),

  // ── rep segmentation (lane defaults, §4 rules) ──
  't1.repEnter': spec(0.1, '§4 rules', 'hip drop / standing hip height', 'Lane default: a squat rep starts past this hip drop'),
  't1.repExit': spec(0.05, '§4 rules', 'hip drop / standing hip height', 'Lane default: …and ends back under this'),
  't1.repMinPeak': spec(0.15, '§4 rules', 'hip drop / standing hip height', 'Lane default: a dip shallower than this (~45° of knee bend) is not a rep; a shallow squat past it IS one, and scores low on depth'),
  't2.repRise': spec(6, '§4 T2', 'deg', 'Lane default: a knee-to-wall rock is a tibia swing of at least this'),
  't3.repEnter': spec(20, '§4 T3', 'deg knee flexion', 'Lane default: a single-leg squat rep starts past this'),
  't3.repExit': spec(12, '§4 T3', 'deg knee flexion', 'Lane default: …and ends back under this'),
  't3.repMinPeak': spec(30, '§4 T3', 'deg knee flexion', 'Lane default: shallower than this is not a rep'),

  // ── T1 overhead squat (spec §4 T1) ──
  't1.depthKneeFlex': spec(band(110, 70, 80, '<'), '§4 T1', 'deg', 'Depth: knee flexion at the bottom (side)'),
  't1.hipCrease': repo(band(0, 0.15, 0, '>'), '§4 T1', 'thigh-length fraction above the knee', 'Hip crease vs knee line at the bottom (side); counts for 0–3 only, weight 0', 'squat-audit.ts depth01 knee line'),
  't1.trunkTibia': spec(band(10, 35, 25, '>'), '§4 T1', 'deg', 'Trunk angle minus tibia angle at the bottom (side)'),
  't1.shoulderFlex': spec(band(170, 140, 150, '<'), '§4 T1', 'deg', 'Arms stay overhead: shoulder flexion (side)'),
  't1.heelRiseReps': repo(band(0, 1, 1, '>='), '§4 T1', 'reps', 'Reps where a heel rose (side); any rep is a fault', 'squat-audit.ts heelRise'),
  't1.valgus': repo(band(0.15, 0.7, 0.35, '>='), '§4 T1', 'hip half-widths', 'Knee-inside ratio at the bottom (front), each knee', 'squat-audit.ts valgusWarn 0.35 / valgusFault 0.70'),
  't1.lateralShift': repo(band(0.1, 0.4, 0.3, '>='), '§4 T1', 'hip widths', 'Lateral weight shift from the standing line (front)', 'squat-audit.ts lateralWarn 0.3'),
  't1.weights': spec({ depthKneeFlex: 25, trunkTibia: 15, shoulderFlex: 15, heelRise: 15, valgusLeft: 10, valgusRight: 10, lateralShift: 10 }, '§4 T1', 'weight', 'T1 metric weights (valgus 20 split 10 per knee)'),

  // ── T2 ankle dorsiflexion (spec §4 T2) ──
  't2.tibia': spec(band(42, 30, 35, '<'), '§4 T2', 'deg', 'Tibia angle from vertical at max knee-forward, heel down'),
  't2.lrDiff': spec(band(3, 8, 5, '>='), '§4 T2', 'deg', 'Left–right tibia difference: asymmetry flag at the fault line'),

  // ── T3 single-leg squat (spec §4 T3) ──
  't3.fppa': spec(band(5, 20, 10, '>'), '§4 T3', 'deg', 'FPPA (valgus) at the deepest point, minus standing baseline'),
  't3.pelvicDrop': spec(band(3, 12, 8, '>'), '§4 T3', 'deg', 'Contralateral pelvic drop, minus standing baseline'),
  't3.trunkLean': spec(band(5, 20, 12, '>'), '§4 T3', 'deg', 'Lateral trunk lean at the deepest point'),
  't3.depth': spec(band(60, 30, 45, '<'), '§4 T3', 'deg', 'Depth reached (knee flexion)'),
  't3.balanceReps': spec(band(0, 2, 1, '>='), '§4 T3', 'reps', 'Reps with a touch-down or hop; any caps the test at 1/3'),
  't3.weights': spec({ fppa: 40, pelvicDrop: 25, trunkLean: 20, depth: 15 }, '§4 T3', 'weight', 'T3 metric weights'),
  't3.reps': spec(5, '§4 T3', 'reps', 'Reps asked for, each side'),

  // ── T5 countermovement jump (spec §4 T5) ──
  't5.contactLine': spec(0.02, '§3.2', 'body-height fraction', 'A foot below this height is on the floor (flight ends at the first foot down)'),
  't5.airLine': repo(0.035, '§3.2', 'body-height fraction', 'Both feet above this = airborne (hysteresis over the contact line)', 'lib/irl/dunkTracker.ts AIRBORNE_RISE 0.03 image units, restated per body height'),
  't5.flightMinMs': repo(180, '§4 T5', 'ms', 'A shorter flight is a hop, not a jump', 'lib/irl/dunkTracker.ts MIN_FLIGHT_MS'),
  't5.flightMaxMs': repo(1200, '§4 T5', 'ms', 'A longer flight is refused (the camera lost the feet)', 'lib/irl/dunkTracker.ts MAX_FLIGHT_MS'),
  't5.maxHeightCm': repo(130, '§4 T5', 'cm', 'Heights over this are refused', 'lib/irl/dunkTracker.ts MAX_VERTICAL_CM'),
  't5.nominalHeightM': spec(1.6, '§4 T5', 'm nose to floor', 'Lane default: the body height a flight\'s sanity check assumes when there are no world landmarks (a flight\'s feet must rise half what its air time needs)'),
  't5.landingWindowMs': spec(300, '§4 T5', 'ms', 'Landing metrics read the peak within this long of touchdown'),
  't5.landingFlex': spec(band(0.25, 0.1, 0.1, '<='), '§4 T5', 'hip drop / standing hip height', 'Landing knee-flexion proxy: stiff landing at the fault line'),
  't5.landingValgus': spec(band(5, 20, 10, '>'), '§4 T5', 'deg', 'Landing FPPA at peak flexion, minus standing baseline (T3 bands)'),
  't5.landingSymMs': spec(band(17, 50, 50, '>='), '§4 T5', 'ms', 'Left/right touchdown gap (1 frame / 3 frames at 60 fps); only scored at ≥ 50 fps'),
  't5.cvPct': spec(band(5, 12, 12, '>='), '§4 T5', '%', 'Height variation across the three jumps: flagged, not scored'),
  't5.weights': spec({ landingFlex: 40, landingValgusLeft: 20, landingValgusRight: 20, landingSym: 20 }, '§4 T5', 'weight', 'Lane default: CMJ quality weights (the spec gives none)'),
  't5.armSwingWrist': spec(0, '§4 T5 (Q3)', 'image-height units above the shoulder line', 'Lane default: a wrist above the shoulder line in flight means the hands left the hips; the jump is not the standard'),

  // ── scoring and roll-up (spec §4 rules, §5) ──
  'score.meanWorst': repo({ mean: 0.7, worst: 0.3 }, '§4 rules', 'weight', 'Test score = 0.7·weighted mean + 0.3·worst metric', 'lib/mirror/assessment.ts assessSquat'),
  'score.bands03': spec({ three: 80, two: 50 }, '§4 rules', 'score', '0–3: 3 ≥ 80 with no fault; 2 at 50–79 or any fault; 1 under 50'),
  'score.asymmetryPoints': spec(15, '§4 rules', 'points', 'Asymmetry flag when |L − R| test scores differ by this'),
  'mqs.flagPenalty': spec(5, '§5.1', 'points', 'MQS loses this per asymmetry flag'),
  'mqs.maxFlags': spec(3, '§5.1', 'flags', 'At most this many flags count'),
  'mqs.minTests': spec(3, '§5.1', 'tests', 'Fewer scored tests: no MQS'),
  'grade.bands': repo({ elite: 80, primed: 60, ready: 40 }, '§5.1', 'score', 'ELITE / PRIMED / READY / RECOVERING', 'lib/prq.ts prqGrade, lib/mirror/assessment.ts gradeOf'),

  // ── PRQ writes (spec §5.2, lane brief) ──
  'prq.verticalJump': repo({ floor: 12, ceiling: 40 }, '§5.2', 'in', 'Power axis: CMJ height 12 in → 0, 40 in → 100', 'lib/profile/scanToSnapshot.ts verticalJump'),
  'prq.ankleDorsiflexionDeg': spec({ floor: 30, ceiling: 45 }, '§4 T2, §5.2', 'deg', 'Flexibility input: tibia angle 30° → 0, 45° → 100'),
  'prq.flexWeights': spec({ t2: 0.625, t1Mobility: 0.375 }, '§5.2 (renormalized, no T4)', 'weight', 'Flexibility = 0.625·T2 axis + 0.375·T1 mobility'),

  // ── live coaching (spec §8) ──
  'cue.minGapMs': spec(2500, '§8', 'ms', 'Lane default: at most one spoken cue per this long'),
  'ui.miniResultMs': spec(3000, '§8', 'ms', 'Per-test mini-result on screen'),
} as const;

export type ThresholdId = keyof typeof THRESHOLDS;
export const THRESHOLD_IDS = Object.keys(THRESHOLDS) as ThresholdId[];

/** The value of a threshold, typed by its id. */
export function th<K extends ThresholdId>(id: K): (typeof THRESHOLDS)[K]['value'] {
  return THRESHOLDS[id].value;
}

/** A band threshold's value (throws on a non-band id: a typo here must not score silently). */
export function bandOf(id: ThresholdId): Band {
  const v = THRESHOLDS[id].value as unknown;
  if (!v || typeof v !== 'object' || !('good' in v) || !('poor' in v)) throw new Error(`[assess] ${id} is not a band`);
  return v as Band;
}

/** True while any of these thresholds is unsigned — today, always. Every score shown carries the "Provisional" tag then. */
export function isProvisional(ids: readonly ThresholdId[]): boolean {
  return ids.length === 0 || ids.some((id) => !THRESHOLDS[id]?.signedOff);
}

/** The label every provisional score carries. */
export const PROVISIONAL_LABEL = 'Provisional';
