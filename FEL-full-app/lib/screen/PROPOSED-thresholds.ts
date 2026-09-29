// PROPOSED — pending Elijah (NASM-CES/PES) approval. NOT FINAL. Every threshold, band, weight and drill cue the screen uses
// lives here. Nothing in this file has been signed off.
//
// SCREEN-SHIP (2026-09-29). This is the Quick Screen's one register (Mirror Assess, lib/assess; PR #20). It was
// lib/assess/thresholds.ts, which now only re-exports it. Where each number came from is on the entry itself:
//
//   'spec-TUNE-EJ'                      a starting guess from FEL-MIRROR-REALTIME-SPEC §4–§5, or a lane default the spec
//                                       leaves open (its label starts "Lane default")
//   'repo-TUNE(elijah)'                 a number the repo already used and marks TUNE(elijah); never checked on an athlete
//   'research-advisor-draft-2026-09-28' Research & Advisor's draft cutoffs and drill cues (the FEL Quick Screen draft,
//                                       ~/Claude/inbox/SCREEN-PROPOSED-thresholds-draft.md, sha256 5f888177…); drawn from
//                                       common screen practice, NOT validated for phone-camera tracking
//   'Screening Squad 2026-09-28'        the Screening Squad's amendments (AMENDMENTS 2, 21:40 PT)
//
// Where the draft gives a value it replaces PR #20's guess; where it is silent PR #20's value stays with its own tag.
// No number here is invented: a check the draft names that no metric measures is kept as PROPOSED data only
// (status 'TODO-no-metric', never scored or shown), and a check the Squad hid is 'hidden-v1'.
//
// THRESHOLDS_VERSION. A result records it, so a re-tuned band never makes an old reading look comparable. Bump it on ANY
// value change here. 0.1-provisional → 0.2-proposed (SCREEN-SHIP) changed: the draft's mapped bands, t1.valgus (Squad),
// the rep counts (3 per check), and the grading literals moved in from the graders (same values).
//
// THE THREE BANDS. PR #20 scores a metric on a line from `good` (100) to `poor` (0) and calls a FAULT past `fault`. The
// draft grades in three words instead. Each graded check carries `bands3`: Green while the value is on the good side of
// `green`, Red once it is past `red`, Yellow between; the UI reads the word from here, never from a score. For a MAPPED
// entry the band was rebuilt from the draft: good = the Green→Yellow edge, fault = the Yellow→Red line (faultOp matches
// the draft's wording: "over 20" is `> 20`), and poor = PR #20's poor unless it fell inside the new Yellow, in which case
// it is the Red line (the score reaches 0 where Red starts; no new number).
//
// Pure data: no DOM, no Prisma. Movement Screen (PR #22) thresholds are listed at the bottom, re-exported, unchanged.

export const PROPOSED_HEADER = 'PROPOSED — pending Elijah (NASM-CES/PES) approval. NOT FINAL.';
export const THRESHOLDS_VERSION = 'jump-screen-0.2-proposed';
export const PROTOCOL_VERSION = 'jump-screen-1.0';

/** Where a number came from (see the header). */
export type ThresholdSource = 'spec-TUNE-EJ' | 'repo-TUNE(elijah)' | 'research-advisor-draft-2026-09-28' | 'Screening Squad 2026-09-28';
export const SOURCES: readonly ThresholdSource[] = ['spec-TUNE-EJ', 'repo-TUNE(elijah)', 'research-advisor-draft-2026-09-28', 'Screening Squad 2026-09-28'];

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

export type Cmp = '<' | '<=' | '>' | '>=';
export type BandWord = 'green' | 'yellow' | 'red';

/** Green while `value green.op green.at`; Red once `value red.op red.at`; Yellow otherwise. */
export interface Bands3 {
  green: { op: Cmp; at: number };
  red: { op: Cmp; at: number };
  /** The draft's own words for each band on this check ("under 10°", "10 to 20°", "over 20°"). */
  words: Record<BandWord, string>;
  /** The drill cue a Yellow or Red shows (one cue per check). */
  cue: string;
  /** Where the cue came from (the draft's, or PR #20's placeholder library when the draft is silent). */
  cueSource: ThresholdSource;
}

export interface Threshold<V = number> {
  value: V;
  source: ThresholdSource;
  /** Every entry is false until Elijah signs the register (docs/MIRROR-ASSESS-THRESHOLDS.md). */
  signedOff: false;
  /** The spec section (or draft) it comes from. */
  spec: string;
  unit: string;
  /** What it is, in a line. */
  label: string;
  /** For a repo value: where the repo keeps it. */
  repo?: string;
  /** For a graded check: the three bands and its drill cue. */
  bands3?: Bands3;
}

const spec = <V>(value: V, specRef: string, unit: string, label: string, bands3?: Bands3): Threshold<V> =>
  ({ value, source: 'spec-TUNE-EJ', signedOff: false, spec: specRef, unit, label, ...(bands3 ? { bands3 } : {}) });
const repo = <V>(value: V, specRef: string, unit: string, label: string, where: string, bands3?: Bands3): Threshold<V> =>
  ({ value, source: 'repo-TUNE(elijah)', signedOff: false, spec: specRef, unit, label, repo: where, ...(bands3 ? { bands3 } : {}) });
const draft = <V>(value: V, specRef: string, unit: string, label: string, bands3?: Bands3): Threshold<V> =>
  ({ value, source: 'research-advisor-draft-2026-09-28', signedOff: false, spec: specRef, unit, label, ...(bands3 ? { bands3 } : {}) });
const squad = <V>(value: V, specRef: string, unit: string, label: string, bands3?: Bands3): Threshold<V> =>
  ({ value, source: 'Screening Squad 2026-09-28', signedOff: false, spec: specRef, unit, label, ...(bands3 ? { bands3 } : {}) });
const band = (good: number, poor: number, fault: number | null, faultOp: Band['faultOp']): Band => ({ good, poor, fault, faultOp });
const b3 = (green: [Cmp, number], red: [Cmp, number], words: [string, string, string], cue: string, cueSource: ThresholdSource = 'research-advisor-draft-2026-09-28'): Bands3 =>
  ({ green: { op: green[0], at: green[1] }, red: { op: red[0], at: red[1] }, words: { green: words[0], yellow: words[1], red: words[2] }, cue, cueSource });

// ── the draft's drill cues, verbatim (one per check) ──
export const DRAFT_CUES = {
  ohsKneeCave: 'Band lateral walks, clamshells, goblet squat with knees pushed out',
  ohsForwardLean: 'Calf and hip flexor stretch, goblet squat to a box',
  ohsArmsForward: 'Wall slides, lat stretch, foam roll upper back',
  ohsHeelLift: 'Ankle mobility (see knee-to-wall drills)',
  ohsDepth: 'Box squats, lowering the box over time',
  kneeWallShin: 'Knee-to-wall rocks, banded ankle mobilization, calf stretch',
  kneeWallGap: 'Extra sets on the tighter side',
  slsKneeCave: 'Step-downs with knee over the middle toes, banded glute work',
  slsHipDrop: 'Side planks, single-leg glute bridge',
  slsTrunkLean: 'Single-leg balance holds, split squats',
  slsGap: 'Lead with the weaker side',
  jumpLandingKneeCave: 'Snap-down landings, drop-and-stick holds',
  jumpStiffLanding: '"Land quiet" drills, box landings',
  jumpWeightShift: 'Single-leg hops and sticks',
} as const;

/**
 * PR #20's §7.2 draft drill library (why.ts "Fix:" hints), names only and every one a placeholder: moved here unchanged.
 * The Quick Screen shows the draft's cue for a check; this library is the fallback only where the draft is silent
 * (lateral shift), and still feeds PR #20's per-metric reasons.
 */
export const PLACEHOLDER_TAG = '[PLACEHOLDER DRILL]';
export interface DrillHint { label: string; drill: string; placeholder: true }
const drill = (name: string): DrillHint => ({ label: `${PLACEHOLDER_TAG} ${name}`, drill: name, placeholder: true });
export const PR20_DRILLS = {
  ankle: [drill('Knee-to-wall rocks'), drill('Slant-board calf raises')],
  arms: [drill('Wall slides with exhale'), drill('Half-kneeling thoracic rotation')],
  squatPattern: [drill('Goblet squat hold'), drill('Heel-elevated tempo squat')],
  knee: [drill('Banded lateral walks'), drill('Step-down from a low box')],
  pelvis: [drill('Single-leg RDL to target'), drill('Side plank')],
  balance: [drill('Single-leg stance with reach')],
  landing: [drill('Snap-downs'), drill('Box drop-to-stick')],
  landingSides: [drill('Single-leg hop-to-stick')],
  shift: [drill('Split squat, slow tempo')],
} as const;

/**
 * THE REGISTER. Keys are stable ids: a result lists the ids it used, and the docs table is keyed by them.
 * "Lane default" in a label marks a number the spec does not give — chosen by PR #20, still unsigned.
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
  'calib.accept': spec({ spanShare: 0.9, frameShare: 0.6, minFrames: 5, minBodyHeight: 0.2 }, '§3.3', 'share / frames / image height', 'Lane default: a hold counts when it spans 90% of its time with 60% of its frames usable (at least 5), and the body is over 0.2 of the image tall (moved from calibration.ts)'),

  // ── geometry (spec §3.2) ──
  'geom.heelRise': spec(0.015, '§3.2', 'body-height fraction', 'Heel lifts above its calibrated floor line by more than this'),
  'geom.lensHfovDeg': spec(60, '§3.2', 'deg', 'Lane default: lens width the FPPA parallax correction assumes (a knee moving toward the lens)'),
  'geom.heelRiseRepo': repo(0.012, '§4 T1', 'image-height units', 'Reference only (not read by the scorer): the guided squat\'s heel line; ≈ geom.heelRise at 80% frame fill', 'lib/babylon/nexus/neuro-mirror/rules/squat-audit.ts heelRiseWarnPx'),
  'geom.nominalBodyHeight': spec(0.7, '§3.2', 'image-height units', 'Lane default: the body height the live heel check assumes before any calibration (moved from runner.ts)'),

  // ── rep segmentation (lane defaults, §4 rules) ──
  't1.repEnter': spec(0.1, '§4 rules', 'hip drop / standing hip height', 'Lane default: a squat rep starts past this hip drop'),
  't1.repExit': spec(0.05, '§4 rules', 'hip drop / standing hip height', 'Lane default: …and ends back under this'),
  't1.repMinPeak': spec(0.15, '§4 rules', 'hip drop / standing hip height', 'Lane default: a dip shallower than this (~45° of knee bend) is not a rep; a shallow squat past it IS one, and scores low on depth'),
  't1.bottomWindow': spec(0.7, '§4 T1', 'share of the rep\'s peak hip drop', 'Lane default: the frames a squat\'s "bottom" is read over (moved from the T1 grader)'),
  't2.repRise': spec(6, '§4 T2', 'deg', 'Lane default: a knee-to-wall rock is a tibia swing of at least this'),
  't2.heelFloorPercentile': spec(0.9, '§4 T2', 'percentile', 'Lane default: the heel\'s own floor line over the test is its 90th-percentile y (moved from the T2 grader and the runner)'),
  't3.repEnter': spec(20, '§4 T3', 'deg knee flexion', 'Lane default: a single-leg squat rep starts past this'),
  't3.repExit': spec(12, '§4 T3', 'deg knee flexion', 'Lane default: …and ends back under this'),
  't3.repMinPeak': spec(30, '§4 T3', 'deg knee flexion', 'Lane default: shallower than this is not a rep'),
  't3.bottomWindow': spec(0.9, '§4 T3', 'share of the rep\'s peak knee flexion', 'Lane default: the frames a single-leg squat\'s deepest point is read over (moved from the T3 grader)'),

  // ── reps asked for (AMENDMENTS 2: three per check, graded on the median rep) ──
  't1.reps': squad(3, 'A2-2', 'reps', 'Reps asked for, each view'),
  't2.reps': squad(3, 'A2-2', 'reps', 'Rocks asked for, each side'),
  't3.reps': squad(3, 'A2-2', 'reps', 'Reps asked for, each side (was 5, spec §4 T3)'),
  't5.reps': squad(3, 'A2-2', 'jumps', 'Jumps asked for; the best one is the personal best, the landings are graded on the median'),

  // ── T1 overhead squat (spec §4 T1; draft §1) ──
  't1.depthKneeFlex': spec(band(110, 70, 80, '<'), '§4 T1', 'deg', 'Depth: knee flexion at the bottom (side). Draft "Depth" row, LABELS ONLY (the draft gives no numbers)',
    b3(['>=', 110], ['<', 80], ['thighs at parallel or lower', 'a bit above parallel', 'well above parallel'], DRAFT_CUES.ohsDepth)),
  't1.hipCrease': repo(band(0, 0.15, 0, '>'), '§4 T1', 'thigh-length fraction above the knee', 'Hip crease vs knee line at the bottom (side); counts for 0–3 only, weight 0', 'squat-audit.ts depth01 knee line'),
  't1.trunkTibia': draft(band(15, 35, 30, '>'), 'draft §1', 'deg', 'Forward lean: trunk angle minus tibia angle at the bottom (side)',
    b3(['<', 15], ['>', 30], ['under 15° difference', '15 to 30°', 'over 30°'], DRAFT_CUES.ohsForwardLean)),
  't1.shoulderFlex': draft(band(170, 140, 155, '<'), 'draft §1', 'deg', 'Arms fall forward: shoulder flexion ∠(hip, shoulder, wrist), 180 = arm in the torso line; the draft\'s deviation d = 180 − this (Green d < 10, Red d > 25)',
    b3(['>', 170], ['<', 155], ['under 10° off the torso line', '10 to 25°', 'over 25°'], DRAFT_CUES.ohsArmsForward)),
  't1.heelRiseReps': draft(band(0, 1, 1, '>='), 'draft §1', 'reps', 'Heel lift: reps where a heel rose (side); any rep is Red',
    b3(['<=', 0], ['>=', 1], ['none', 'n/a', 'any lift'], DRAFT_CUES.ohsHeelLift)),
  't1.valgus': squad(band(0.4, 0.8, 0.8, '>'), 'A2-1', 'hip half-widths', 'Knees cave in: knee-inside ratio at the bottom (front), each knee. The draft\'s 10°/20° are degrees and are NOT used for this metric',
    b3(['<', 0.4], ['>', 0.8], ['under 0.4 hip half-widths', '0.4 to 0.8', 'over 0.8'], DRAFT_CUES.ohsKneeCave)),
  't1.lateralShift': repo(band(0.1, 0.4, 0.3, '>='), '§4 T1', 'hip widths', 'Lateral weight shift from the standing line (front). The draft is silent: PR #20\'s band', 'squat-audit.ts lateralWarn 0.3',
    b3(['<=', 0.1], ['>=', 0.3], ['0.1 hip widths or less', '0.1 to 0.3', '0.3 or more'], PR20_DRILLS.shift[0].drill, 'spec-TUNE-EJ')),
  't1.weights': spec({ depthKneeFlex: 25, trunkTibia: 15, shoulderFlex: 15, heelRise: 15, valgusLeft: 10, valgusRight: 10, lateralShift: 10 }, '§4 T1', 'weight', 'T1 metric weights (valgus 20 split 10 per knee)'),

  // ── T2 ankle dorsiflexion, knee to wall (spec §4 T2; draft §2) ──
  't2.tibia': draft(band(38, 30, 30, '<'), 'draft §2', 'deg', 'Shin angle from vertical at max knee-forward, heel down (10 cm from the wall ≈ 35–38°)',
    b3(['>=', 38], ['<', 30], ['38° or more', '30 to 37°', 'under 30°'], DRAFT_CUES.kneeWallShin)),
  't2.lrDiff': draft(band(5, 8, 8, '>'), 'draft §2', 'deg', 'Left vs right shin-angle gap: the asymmetry flag at the Red line',
    b3(['<', 5], ['>', 8], ['under 5°', '5 to 8°', 'over 8°'], DRAFT_CUES.kneeWallGap)),

  // ── T3 single-leg squat (spec §4 T3; draft §3) ──
  't3.fppa': draft(band(10, 20, 20, '>'), 'draft §3', 'deg', 'Knee caves in: FPPA at the deepest point, minus the standing baseline',
    b3(['<', 10], ['>', 20], ['under 10°', '10 to 20°', 'over 20°'], DRAFT_CUES.slsKneeCave)),
  't3.pelvicDrop': draft(band(5, 12, 10, '>'), 'draft §3', 'deg', 'Hip drops on the free-leg side, minus the standing baseline',
    b3(['<', 5], ['>', 10], ['under 5°', '5 to 10°', 'over 10°'], DRAFT_CUES.slsHipDrop)),
  't3.trunkLean': draft(band(10, 20, 15, '>'), 'draft §3', 'deg', 'Trunk leans sideways at the deepest point',
    b3(['<', 10], ['>', 15], ['under 10°', '10 to 15°', 'over 15°'], DRAFT_CUES.slsTrunkLean)),
  't3.lrGap': squad(band(5, 10, 10, '>'), 'A2-1', 'deg', 'Left vs right gap on any check: the worst |L − R| of the per-side medians of t3.fppa, t3.pelvicDrop and t3.trunkLean (all degrees), computed on the phone',
    b3(['<', 5], ['>', 10], ['under 5°', '5 to 10°', 'over 10°'], DRAFT_CUES.slsGap)),
  't3.lrGapHalfWidths': squad(band(0.2, 0.4, 0.4, '>'), 'A2-1', 'hip half-widths', 'The same gap for a metric in hip half-widths. UNUSED: no T3 metric is in hip half-widths'),
  't3.depth': spec(band(60, 30, 45, '<'), '§4 T3', 'deg', 'Depth reached (knee flexion). Not a Quick Screen check (the draft has no row); PR #20\'s score only'),
  't3.balanceReps': spec(band(0, 2, 1, '>='), '§4 T3', 'reps', 'Reps with a touch-down or hop; any caps the test at 1/3 (an unfinished check for the clean-screen rule)'),
  't3.weights': spec({ fppa: 40, pelvicDrop: 25, trunkLean: 20, depth: 15 }, '§4 T3', 'weight', 'T3 metric weights'),

  // ── T5 countermovement jump (spec §4 T5; draft §4) ──
  't5.contactLine': spec(0.02, '§3.2', 'body-height fraction', 'A foot below this height is on the floor (flight ends at the first foot down)'),
  't5.airLine': repo(0.035, '§3.2', 'body-height fraction', 'Both feet above this = airborne (hysteresis over the contact line)', 'lib/irl/dunkTracker.ts AIRBORNE_RISE 0.03 image units, restated per body height'),
  't5.flightMinMs': repo(180, '§4 T5', 'ms', 'A shorter flight is a hop, not a jump', 'lib/irl/dunkTracker.ts MIN_FLIGHT_MS'),
  't5.flightMaxMs': repo(1200, '§4 T5', 'ms', 'A longer flight is refused (the camera lost the feet)', 'lib/irl/dunkTracker.ts MAX_FLIGHT_MS'),
  't5.maxHeightCm': repo(130, '§4 T5', 'cm', 'Heights over this are refused', 'lib/irl/dunkTracker.ts MAX_VERTICAL_CM'),
  't5.nominalHeightM': spec(1.6, '§4 T5', 'm nose to floor', 'Lane default: the body height a flight\'s sanity check assumes when there are no world landmarks (a flight\'s feet must rise half what its air time needs)'),
  't5.flightDetect': spec(
    { plantedSpeed: 0.45, plantedMs: 66, plantedMinShare: 0.5, floorFrames: 12, runLevel: 0.03, minRunFrames: 3, lookbackMs: 800, edgeSpanMs: 50, edgeTop: 0.15, edgeSlackMs: 17, settleMs: 130, settleFrames: 3, settleRise: 3, searchMs: 3000, limitSlackMs: 1500, apexDrop: 0.05, riseShare: 0.5 },
    '§4 T5', 'body heights / ms / frames', 'Lane default: the flight finder (planted-foot speed and window, floor-run level and length, edge fit span/top/slack, step-settle window, search limits, the landing\'s apex drop, and the half-rise sanity share), measured on the synthetic and recorded CMJs (moved from t5-cmj.ts)'),
  't5.landingWindowMs': spec(300, '§4 T5', 'ms', 'Landing metrics read the peak within this long of touchdown'),
  't5.landingFlex': spec(band(0.25, 0.1, 0.1, '<='), '§4 T5', 'hip drop / standing hip height', 'Stiff landing: the landing knee-flexion proxy. Draft "Stiff landing" row, LABELS ONLY (the draft gives no numbers)',
    b3(['>=', 0.25], ['<=', 0.1], ['soft landing', 'somewhat stiff', 'locked knees'], DRAFT_CUES.jumpStiffLanding)),
  't5.landingValgus': draft(band(10, 20, 20, '>'), 'draft §4', 'deg', 'Landing knees cave in: landing FPPA at peak flexion, minus the standing baseline',
    b3(['<', 10], ['>', 20], ['under 10°', '10 to 20°', 'over 20°'], DRAFT_CUES.jumpLandingKneeCave)),
  't5.landingSymMs': spec(band(17, 50, 50, '>='), '§4 T5', 'ms', 'Left/right touchdown gap (1 frame / 3 frames at 60 fps); only scored at ≥ 50 fps. Timing, NOT the draft\'s weight shift (hidden in v1)'),
  't5.cvPct': spec(band(5, 12, 12, '>='), '§4 T5', '%', 'Height variation across the three jumps: flagged, not scored'),
  't5.weights': spec({ landingFlex: 40, landingValgusLeft: 20, landingValgusRight: 20, landingSym: 20 }, '§4 T5', 'weight', 'Lane default: CMJ quality weights (the spec gives none)'),
  't5.armSwingWrist': spec(0, '§4 T5 (Q3)', 'image-height units above the shoulder line', 'Lane default: a wrist above the shoulder line in flight means the hands left the hips; the jump is not the standard'),

  // ── scoring and roll-up (spec §4 rules, §5) ──
  'score.bestOf': spec(3, '§4 rules', 'reps', 'A metric is the median of the best this-many valid reps (moved from reps.ts)'),
  'score.peakWindowMs': spec(100, '§4 rules', 'ms', 'Lane default: a rep\'s extreme is the median over ± this long around its extreme frame (moved from reps.ts)'),
  'score.meanWorst': repo({ mean: 0.7, worst: 0.3 }, '§4 rules', 'weight', 'Test score = 0.7·weighted mean + 0.3·worst metric', 'lib/mirror/assessment.ts assessSquat'),
  'score.bands03': spec({ three: 80, two: 50 }, '§4 rules', 'score', '0–3: 3 ≥ 80 with no fault; 2 at 50–79 or any fault; 1 under 50'),
  'score.asymmetryPoints': spec(15, '§4 rules', 'points', 'Asymmetry flag when |L − R| test scores differ by this'),
  'mqs.flagPenalty': spec(5, '§5.1', 'points', 'MQS loses this per asymmetry flag'),
  'mqs.maxFlags': spec(3, '§5.1', 'flags', 'At most this many flags count'),
  'mqs.minTests': spec(3, '§5.1', 'tests', 'Fewer scored tests: no MQS'),
  'grade.bands': repo({ elite: 80, primed: 60, ready: 40 }, '§5.1', 'score', 'ELITE / PRIMED / READY / RECOVERING', 'lib/prq.ts prqGrade, lib/mirror/assessment.ts gradeOf'),

  // ── PRQ writes (spec §5.2; NO server saves in SCREEN-SHIP, A2-3) ──
  'prq.verticalJump': repo({ floor: 12, ceiling: 40 }, '§5.2', 'in', 'Power axis: CMJ height 12 in → 0, 40 in → 100', 'lib/profile/scanToSnapshot.ts verticalJump'),
  'prq.ankleDorsiflexionDeg': spec({ floor: 30, ceiling: 45 }, '§4 T2, §5.2', 'deg', 'Flexibility input: tibia angle 30° → 0, 45° → 100'),
  'prq.flexWeights': spec({ t2: 0.625, t1Mobility: 0.375 }, '§5.2 (renormalized, no T4)', 'weight', 'Flexibility = 0.625·T2 axis + 0.375·T1 mobility'),

  // ── the live flow (spec §8) ──
  'run.maxAttempts': spec({ T1: 6, T2: 7, T3: 8, T5: 6 }, '§8', 'reps per part', 'Lane default: attempts before a part ends anyway, so a heel that keeps lifting cannot trap the athlete (moved from runner.ts)'),
  'run.maxMs': spec({ T1: 60000, T2: 60000, T3: 60000, T5: 90000 }, '§8', 'ms per part', 'Lane default: active time before a part ends anyway (moved from runner.ts)'),
  'cue.minGapMs': spec(2500, '§8', 'ms', 'Lane default: at most one spoken cue per this long'),
  'cue.slowerRepMs': spec(800, '§8', 'ms', 'Lane default: a rep quicker than this is told "Slower." (tempo, allowed by the spec; moved from runner.ts)'),
  'ui.miniResultMs': spec(3000, '§8', 'ms', 'Per-test "done" card on screen'),
  'ui.timing': spec({ countdownMs: 3000, markMs: 1200, cueRepeatMs: 8000, jumpScanMs: 500, jumpSettleMs: 400 }, '§8', 'ms', 'Lane default: the 3-2-1, how long a rep\'s colour holds, a repeated cue\'s quiet time, and how often / how long after landing the live jump counter reads (moved from runner.ts)'),
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

/** A graded check's three bands (throws when the id has none). */
export function bands3Of(id: ThresholdId): Bands3 {
  const b = (THRESHOLDS[id] as Threshold<unknown>).bands3;
  if (!b) throw new Error(`[assess] ${id} has no three bands`);
  return b;
}

const cmp = (v: number, op: Cmp, at: number): boolean =>
  op === '<' ? v < at : op === '<=' ? v <= at : op === '>' ? v > at : v >= at;

/** The band word for a value, from the data: Red is checked first, then Green, else Yellow. Null when unread. */
export function bandWordOf(value: number | null | undefined, b: Bands3): BandWord | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (cmp(value, b.red.op, b.red.at)) return 'red';
  if (cmp(value, b.green.op, b.green.at)) return 'green';
  return 'yellow';
}

/** True while any of these thresholds is unsigned — today, always. Every score shown carries the preview label then. */
export function isProvisional(ids: readonly ThresholdId[]): boolean {
  return ids.length === 0 || ids.some((id) => !THRESHOLDS[id]?.signedOff);
}

/** The label every score, band and cue carries while it rests on this file (the brief's wording). */
export const PROVISIONAL_LABEL = 'PROPOSED · preview';
export const PREVIEW_LINE = 'Scoring thresholds are proposed and pending coach approval';

/** The draft's band words (Red is "priority to work on", never anything harsher). */
export const BAND_WORDS: Record<BandWord, string> = {
  green: 'Good to go',
  yellow: 'Worth working on',
  red: 'Priority to work on',
};

/** Top priorities the results screen shows (draft: "the top 1 to 2 priorities only"). */
export const TOP_PRIORITIES = 2;

// ── the Quick Screen's checks: the draft's rows, mapped to PR #20's metrics (the CHECK → METRIC MAP) ──

export type CheckId =
  | 'ohs.kneeCave' | 'ohs.forwardLean' | 'ohs.armsForward' | 'ohs.heelLift' | 'ohs.depth' | 'ohs.lateralShift'
  | 'ktw.shinAngle' | 'ktw.lrGap'
  | 'sls.kneeCave' | 'sls.hipDrop' | 'sls.trunkLean' | 'sls.lrGap'
  | 'jump.landingKneeCave' | 'jump.stiffLanding' | 'jump.landingWeightShift' | 'jump.height';

export type CheckMap = 'MAPPED' | 'LABELS ONLY' | 'TODO' | 'HIDDEN' | 'NO BAND';
export type CheckStatus = 'graded' | 'TODO-no-metric' | 'hidden-v1' | 'personal-best';

export interface ScreenCheck {
  id: CheckId;
  test: 'T1' | 'T2' | 'T3' | 'T5';
  /** Plain words, for the card and the lane line ("your top flag: knees cave in"). */
  name: string;
  /** The draft's row, verbatim. */
  draftRow: string;
  map: CheckMap;
  status: CheckStatus;
  /** The register entry whose three bands grade it (null: not graded). */
  thresholdId: ThresholdId | null;
  /** PR #20 metric ids it reads (per side: left first). A computed check names its inputs. */
  metrics: readonly string[];
  sided: boolean;
  /** PR #20's metric weight, for the priorities' tie-break (0: none). */
  weight: number;
  /** For TODO / hidden rows: the draft's words and cue, kept as PROPOSED data only. */
  draftOnly?: { words: Record<BandWord, string>; cue: string };
  note?: string;
}

const w1 = THRESHOLDS['t1.weights'].value, w3 = THRESHOLDS['t3.weights'].value, w5 = THRESHOLDS['t5.weights'].value;

/** In CHECK ORDER (A3-3): T1, then T2, then T3, then T5. */
export const SCREEN_CHECKS: readonly ScreenCheck[] = [
  { id: 'ohs.kneeCave', test: 'T1', name: 'Knees cave in (overhead squat)', draftRow: 'Knees cave in (knee angle from the front)', map: 'MAPPED', status: 'graded', thresholdId: 't1.valgus', metrics: ['valgusLeft', 'valgusRight'], sided: true, weight: w1.valgusLeft + w1.valgusRight, note: 'Screening Squad cutoffs in hip half-widths; each knee graded, the worse one counts' },
  { id: 'ohs.forwardLean', test: 'T1', name: 'Forward lean (overhead squat)', draftRow: 'Forward lean (chest compared with shin angle)', map: 'MAPPED', status: 'graded', thresholdId: 't1.trunkTibia', metrics: ['trunkTibia'], sided: false, weight: w1.trunkTibia },
  { id: 'ohs.armsForward', test: 'T1', name: 'Arms fall forward (overhead squat)', draftRow: 'Arms fall forward (compared with torso line)', map: 'MAPPED', status: 'graded', thresholdId: 't1.shoulderFlex', metrics: ['shoulderFlex'], sided: false, weight: w1.shoulderFlex, note: 'geometry.shoulderFlexion is ∠(hip, shoulder, wrist): the arm against the torso line (proved in lib/screen/checks.test.ts)' },
  { id: 'ohs.heelLift', test: 'T1', name: 'Heels lift (overhead squat)', draftRow: 'Heels lift', map: 'MAPPED', status: 'graded', thresholdId: 't1.heelRiseReps', metrics: ['heelRise'], sided: false, weight: w1.heelRise },
  { id: 'ohs.depth', test: 'T1', name: 'Squat depth (overhead squat)', draftRow: 'Depth', map: 'LABELS ONLY', status: 'graded', thresholdId: 't1.depthKneeFlex', metrics: ['depthKneeFlex'], sided: false, weight: w1.depthKneeFlex, note: 'PR #20\'s knee-flexion band with the draft\'s words; the hip-crease line (t1.hipCrease) stays PR #20 detail' },
  { id: 'ohs.lateralShift', test: 'T1', name: 'Weight shifts to one side (overhead squat)', draftRow: '(not in the draft: PR #20 scores it)', map: 'LABELS ONLY', status: 'graded', thresholdId: 't1.lateralShift', metrics: ['lateralShift'], sided: false, weight: w1.lateralShift, note: 'the draft is silent: PR #20\'s band and its placeholder cue' },
  { id: 'ktw.shinAngle', test: 'T2', name: 'Ankle range (knee to wall)', draftRow: 'Shin angle', map: 'MAPPED', status: 'graded', thresholdId: 't2.tibia', metrics: ['tibia'], sided: true, weight: 100 },
  { id: 'ktw.lrGap', test: 'T2', name: 'Left vs right ankle gap (knee to wall)', draftRow: 'Left vs right gap', map: 'MAPPED', status: 'graded', thresholdId: 't2.lrDiff', metrics: ['lrDiff'], sided: false, weight: 0 },
  { id: 'sls.kneeCave', test: 'T3', name: 'Knee caves in (single-leg squat)', draftRow: 'Knee caves in', map: 'MAPPED', status: 'graded', thresholdId: 't3.fppa', metrics: ['fppa'], sided: true, weight: w3.fppa },
  { id: 'sls.hipDrop', test: 'T3', name: 'Hip drops (single-leg squat)', draftRow: 'Hip drops on the free-leg side', map: 'MAPPED', status: 'graded', thresholdId: 't3.pelvicDrop', metrics: ['pelvicDrop'], sided: true, weight: w3.pelvicDrop },
  { id: 'sls.trunkLean', test: 'T3', name: 'Trunk leans sideways (single-leg squat)', draftRow: 'Trunk leans sideways', map: 'MAPPED', status: 'graded', thresholdId: 't3.trunkLean', metrics: ['trunkLean'], sided: true, weight: w3.trunkLean },
  { id: 'sls.lrGap', test: 'T3', name: 'Left vs right gap (single-leg squat)', draftRow: 'Left vs right gap on any check', map: 'MAPPED', status: 'graded', thresholdId: 't3.lrGap', metrics: ['fppa', 'pelvicDrop', 'trunkLean'], sided: false, weight: 0, note: 'computed on the phone: the worst |L − R| of the three per-side medians, all degrees' },
  { id: 'jump.landingKneeCave', test: 'T5', name: 'Knees cave in on landing (jump)', draftRow: 'Landing knees cave in', map: 'MAPPED', status: 'graded', thresholdId: 't5.landingValgus', metrics: ['landingValgusLeft', 'landingValgusRight'], sided: true, weight: w5.landingValgusLeft + w5.landingValgusRight },
  { id: 'jump.stiffLanding', test: 'T5', name: 'Stiff landing (jump)', draftRow: 'Stiff landing (little knee bend on landing)', map: 'LABELS ONLY', status: 'graded', thresholdId: 't5.landingFlex', metrics: ['landingFlex'], sided: false, weight: w5.landingFlex, note: 'PR #20\'s hip-drop proxy band with the draft\'s words' },
  { id: 'jump.landingWeightShift', test: 'T5', name: 'Landing weight shift (jump)', draftRow: 'Landing left vs right weight shift', map: 'HIDDEN', status: 'hidden-v1', thresholdId: null, metrics: [], sided: false, weight: 0,
    draftOnly: { words: { green: 'even', yellow: 'slight shift', red: 'clear shift' }, cue: DRAFT_CUES.jumpWeightShift }, note: 'AMENDMENTS 2: not graded, not shown, not counted (PR #20\'s landingSymMs is touchdown timing, not a weight shift)' },
  { id: 'jump.height', test: 'T5', name: 'Jump height', draftRow: 'Jump height (no Red band for height)', map: 'NO BAND', status: 'personal-best', thresholdId: null, metrics: [], sided: false, weight: 0, note: 'shown as a personal best to beat, never Green/Yellow/Red; unit waits on Question 3 (PR #20 shows inches)' },
];

export const checkById = (id: CheckId): ScreenCheck => {
  const c = SCREEN_CHECKS.find((x) => x.id === id);
  if (!c) throw new Error(`[screen] no check ${id}`);
  return c;
};

/** The checks that get a band word, a card, and may drive a priority or a lane. */
export const GRADED_CHECKS: readonly ScreenCheck[] = SCREEN_CHECKS.filter((c) => c.status === 'graded');

/** The cue a check shows (its three bands' cue). */
export const cueOf = (id: CheckId): string => {
  const c = checkById(id);
  return c.thresholdId ? bands3Of(c.thresholdId).cue : c.draftOnly?.cue ?? '';
};

// ── the Movement Screen (PR #22, lib/mirror): LISTED here, unchanged, NOT re-tuned by this file ──
//
// Its grades show on /play/mirror (station-results.tsx, mirror-harness.tsx) and its cues in
// components/mirror/screen-next-steps.tsx, which carries the "PROPOSED · preview" label. Every value is mirror-coach's,
// equally unsigned. Listed, not moved (moving them is mirror-coach's call), and not re-exported: a re-export would pull
// mirror-coach's server-side modules (Prisma types, wallet rules) into the Quick Screen's client bundle.
// lib/screen/PROPOSED-thresholds.test.ts imports each named export from its file and pins the values quoted below.

/** The Movement Screen's user-visible grade and cue sources, by name (for the sign-off sheet). */
export const MOVEMENT_SCREEN_REGISTER = [
  { name: 'STATION_THRESHOLDS', where: 'lib/mirror/stationGraders.ts', what: 'every station\'s flag line, spread and uncertainty limits (shoulder/hip level 0.08, knee window 0.5, head float 0.12, heel line 10° / asym 8°, single-leg sway 0.12 and touch-downs 1)' },
  { name: 'MIN_GRADEABLE_CONFIDENCE, gradeOf', where: 'lib/mirror/assessment.ts', what: '0.6 confidence; ELITE 80 / PRIMED 60 / READY 40 (and non-exported bands at L93–97)' },
  { name: 'triageFor, the score penalties', where: 'lib/mirror/screen.ts', what: '≥3 flags see a specialist, ≥1 address first; −22 one-sided / −15 / −6 borderline (not exported)' },
  { name: 'MIN_READABLE_CAMERA_CHECKS / STATIONS', where: 'lib/mirror/screenClaims.ts', what: '3 checks / 2 stations for a screen to count' },
  { name: 'MIN_CHECKS_FOR_REWARD', where: 'lib/mirror/screenReward.ts', what: '3 checks for the reward' },
  { name: 'LUNGE_THRESHOLDS', where: 'lib/mirror/lungeAudit.ts', what: 'kneeInWarn 0.30, hipDropWarn 0.18, torsoDriftWarn 0.40, wobbleWarn 0.035 (TUNE)' },
  { name: 'CORRECTIVE_BLOCK, fixFor, FIX (screen.ts)', where: 'lib/mirror/screenCorrectives.ts, lib/mirror/screen.ts', what: 'the corrective blocks and FIX lines shown in "What to work on"' },
  { name: 'CORRECTIVE_REST_SECONDS, DOSE', where: 'lib/coach/mirrorToProgram.ts', what: '30 s rest; the coach draft\'s doses (not exported)' },
] as const;
