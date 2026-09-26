// stationGraders — what the camera can grade at the Movement Screen's stations, and the ONE table of numbers it grades
// against. MIRROR-COACH P3 (2026-09-26): the phase-3 grading contract.
//
// WHAT WAS WRONG. The screen had six camera checks (lib/mirror/screen.ts) and no grader for any of them:
// ScreenRunner.record had no caller, so every screen came back "Not graded yet" (P1 made that honest; P2 kept it). This
// file is the graders. It is written for two readers at once:
//   · THE CLIENT (lib/mirror/screenRunner.ts) hands it the pose frames a station's hold clock ran on — only the GOOD
//     frames, already one per camera frame (render/pose-frame-gate.ts) — and gets back one StationGrade per check.
//   · THE SERVER (lib/mirror/screenClaims.ts, lane 2) never sees a landmark: the camera never leaves the phone. It gets
//     each grade's summary numbers back from the client and re-decides the status with THE SAME decideGrade() and the
//     same table (regradeFromSummary), so a client cannot post 'pass' beside a value over the line, or a pass read from
//     twelve frames. It cannot make a posted value true; nothing without the frames can.
//
// THE CONTRACT, per check. Every value is ESTIMATED from 2-D image landmarks (MediaPipe BlazePose's 33, the order in
// lib/pose/landmarks.ts — read-only here, movement play holds lib/pose), is a median over the hold's readable frames
// (never the last frame), and is labelled estimated wherever it is shown:
//
//   shoulderLevel  front  y of 11 vs 12 over the shoulder width                   ratio, signed + = LEFT higher
//   hipLevel       front  y of 23 vs 24 over the SHOULDER width (the steadier span) ratio, signed + = LEFT higher
//   kneeWindow     front  each knee against its own hip–ankle line, in hip half-widths, through squat-audit.ts
//                         kneeInwardRatio (P1's corrected, midline-relative helper — the sign is never re-derived here)
//                                                                               ratio, the worse side, + = inside
//   headFloat      side   ear x ahead of shoulder x (the near side), over the torso length
//                                                                               ratio, + = ear ahead of the shoulder
//   heelLine       back   each ankle(27/28)→heel(29/30) line's tilt from vertical deg, the worse side, + = heel outside
//   singleLeg      front  30 s a side: the hip midpoint's sway path per second (smoothed, over torso lengths) and the
//                         free foot's touch-downs                                px-norm (torso lengths / s)
//
// WHAT THE CAMERA CANNOT GRADE, and so nothing here does: the rib angle and the breath (no rib or abdomen landmark), the
// pelvic tilt (no ASIS/PSIS landmark — the hip landmarks are joint centres, and they are read here only for LEVEL, left
// against right), the seated rotation (a coach check). Those stay with lib/mirror/selfReport.ts and the coach.
//
// 'UNREADABLE' IS NEVER 'PASS'. A check is unreadable when too few frames cleared the gates (the visibility cut, the
// image edges, the view the check needs), when the declared view is the wrong one, or when the frame-to-frame jitter is
// big enough to reach the flag line on its own ("oscillation below 2-D jitter is unreadable"). An unreadable grade
// becomes NO CheckResult (toCheckResult → null), so scoreScreen lists it as not measured and it can never read as clean.
//
// WHAT A GRADE SAYS. What the camera saw, never health: a flag is "flagged for a closer look". No grade names a
// condition, a cause or a risk (lib/share/screen.ts rules; the test runs every note through screenText).
//
// MIRRORED CAMERAS. A selfie stream flips the image and MediaPipe then labels the image-right shoulder "left" (x flipped
// AND labels swapped — lib/pose/landmarks.ts MIRROR_INDEX). Every grader here reads its direction off the body itself
// (inward = toward the other hip, forward = the way the nose and toes point, outward = away from the other ankle), so a
// mirrored stream grades the same status and value; only a one-sided finding's LEFT/RIGHT label leans on MediaPipe's
// labels, and on a mirrored stream it names the other side — which no camera-side code can know. ONE EXCEPTION since the
// MIRROR-COACH P3 review (2026-09-26): the single-leg stance checks the leg it saw against the leg the station asked for
// ('wrongLeg'), by MediaPipe's labels, so on a mirrored stream every single-leg station would read the other leg. The
// Mirror's stream is NOT mirrored (lib/pose/landmarks.ts:9-10, verified in P1), which is what makes that check usable.
//
// Pure: no DOM, no fetch, no Babylon. Runs in the browser and on the server.
import { FACE_AWAY_MAX, SIDE_WIDTH_MAX, SQUARE_MIN, VIS_MIN, checkFraming } from './framing';
import type { CheckResult, ScreenStation, StationView } from './screen';
import { MIN_HIP_HALF, SQUAT_THRESHOLDS, frontalReadable, kneeInwardRatio } from '../babylon/nexus/neuro-mirror/rules/squat-audit';
import {
  LEFT_ANKLE, LEFT_EAR, LEFT_FOOT_INDEX, LEFT_HEEL, LEFT_HIP, LEFT_KNEE, LEFT_SHOULDER, NOSE,
  RIGHT_ANKLE, RIGHT_EAR, RIGHT_FOOT_INDEX, RIGHT_HEEL, RIGHT_HIP, RIGHT_KNEE, RIGHT_SHOULDER,
} from '../pose/landmarks';

// ── the contract's types ───────────────────────────────────────────────────────────────────────────────────────────

/** One grader per camera check; the id IS the check id in lib/mirror/screen.ts (ScreenCheck.grader points here). */
export type GraderId = 'shoulderLevel' | 'hipLevel' | 'kneeWindow' | 'headFloat' | 'heelLine' | 'singleLeg';
export const GRADER_IDS: readonly GraderId[] = ['shoulderLevel', 'hipLevel', 'kneeWindow', 'headFloat', 'heelLine', 'singleLeg'];
export const isGraderId = (x: unknown): x is GraderId => typeof x === 'string' && (GRADER_IDS as readonly string[]).includes(x);

export type GradeStatus = 'pass' | 'flag' | 'unreadable';
/**
 * 'ratio' — a length over a body length (shoulder width, hip half-width, torso length); 'deg' — an image angle;
 * 'px-norm' — image travel per second over the torso length; 'cm-est' — reserved: nothing here converts to centimetres,
 * because that needs a body size the camera does not know.
 */
export type GradeUnit = 'deg' | 'cm-est' | 'ratio' | 'px-norm';

export type UnreadableReason =
  | 'wrongView'      // the station was declared (or the body stood) the wrong way for this check
  | 'noBody'         // no body in most frames
  | 'outOfFrame'     // a point the check needs was outside the image
  | 'lowVisibility'  // a point the check needs was under the visibility cut
  | 'notUpright'     // the body read tilted in the image (a tilted phone, or a lean): a level read would be the tilt
  | 'tooSmall'       // the body is too small in the image for the span this check divides by
  | 'tooFewFrames'   // under the readable-frame minimum
  | 'tooNoisy'       // the frame-to-frame jitter could reach the flag line by itself
  | 'notStarted'     // single leg: the free foot never left the floor
  | 'tooShort'       // single leg: too little time on one leg to grade thirty seconds
  // MIRROR-COACH P3 review (2026-09-26):
  | 'wrongLeg'       // single leg: the camera saw the OTHER foot up — the athlete stood on the other leg
  | 'lowRate'        // single leg: the phone read the pose too few times a second to follow a sway or a touch-down
  | 'feetTurned'     // heel line: one foot turned in or out against the other, which moves the heel point sideways
  | 'cameraMoved';   // the camera image changed shape during the hold (the phone was turned between portrait and landscape)

/** The frame a grader reads — the Mirror adapter's PoseFrame (render/pose-frame-gate.ts admits one per camera frame). */
export interface GraderPoint { x: number; y: number; z?: number; visibility?: number }
export interface GraderFrame {
  landmarks: readonly GraderPoint[];
  present?: boolean;
  timestampMs: number;
  /** The camera image's width over its height WHEN THIS FRAME WAS TAKEN (MIRROR-COACH P3 review, 2026-09-26): the runner
   *  stamps it on every frame it keeps, so a phone turned between portrait and landscape is read frame by frame (and a
   *  station whose frames disagree is 'cameraMoved'). Absent → GradeOptions.aspect. */
  aspect?: number;
}

export interface GradeOptions {
  /** The camera image's width over its height (video.videoWidth / videoHeight). Landmark x and y are fractions of
   *  different lengths, so every length and angle here is taken in image-height units after x × aspect. A frame that
   *  carries its own `aspect` is read with that one. */
  aspect?: number;
  /** singleLeg: the leg the station asked for (screen.ts ScreenStation.stance). The grade's side is always this leg,
   *  and a camera that saw the other leg up reads 'wrongLeg'. */
  stance?: 'left' | 'right';
  /** Carried onto the grade, so two single-leg grades are told apart. */
  stationId?: string;
}

/**
 * One check's grade. The first seven fields are the phase-3 contract; the rest are what the server needs to re-decide
 * it (regradeFromSummary) and what the result card shows.
 */
export interface StationGrade {
  checkId: GraderId;
  status: GradeStatus;
  /** The median read, ESTIMATED; null when unreadable. Signed per the table in the header. */
  value: number | null;
  unit: GradeUnit;
  /** Frames handed to the grader. */
  frames: number;
  /** Frames that cleared every gate. */
  readableFrames: number;
  /** One line: what the camera saw, or why it could not read. */
  note: string;
  stationId?: string;
  /** A flag's side (one-sided findings), or singleLeg's stance leg on every grade. */
  side?: 'left' | 'right';
  /** kneeWindow and heelLine: each side's median. */
  bySide?: { left: number; right: number };
  /** singleLeg: touch-downs of the free foot after it first left the floor. */
  touchDowns?: number;
  /** singleLeg: seconds the camera saw on one leg. */
  stanceSec?: number;
  /** How far the value could move from frame-to-frame jitter alone, in its own unit (singleLeg: the sway path per
   *  second that jitter alone would draw). null when unreadable before it was measured. */
  uncertainty?: number | null;
  /** The spread of the per-frame reads (interquartile range) — a body that moved through a still station. */
  spread?: number | null;
  reason?: UnreadableReason;
}

// ── THE TABLE: every threshold, cut-off and minimum the graders use, and nowhere else ───────────────────────────────
//
// FEL's own judgement, set CONSERVATIVE (a false flag costs an athlete a closer look they did not need and teaches them
// to ignore the screen; a missed small flag costs a re-screen later). No number here comes from a book or a clinical
// table. Where a number was measured, it was measured on lib/mirror/fixtures (the synth's bodies through the app's own
// virtual webcam, FIXTURE_CAMERA 640×480 at 3 m) with and without the synth's default jitter (DEFAULT_NOISE) over 10
// seeds — synthetic, not a phone; scripts/probes/_station-graders-p3.ts prints the table below. assumption: a real
// MediaPipe read is noisier than the synth's and carries biases the synth does not (clothing on the hips and knees, the
// heel point from behind); the gates that make a check UNREADABLE are sized from the data each time (uncertainty,
// spread), so a noisier phone reads unreadable rather than flagging.
export const STATION_THRESHOLDS = {
  common: {
    /** A point a check needs must be seen at least this well (MediaPipe visibility). The synth marks a clearly seen
     *  point 0.90–0.99 and one hidden behind the torso 0.30–0.45; the squat audit reads at 0.5. 0.6 is above every
     *  hidden-point level and under every seen one. */
    minVisibility: 0.6,
    /** A readable grade needs at least this many readable frames (~1 s of a 30 fps camera)… */
    minReadableFrames: 30,
    /** …and at least this share of the frames the hold ran on (a station that could read only a sliver of its hold
     *  read a moment, not a stance). */
    minReadableShare: 0.5,
    /** The image aspect when the caller does not say: the harness asks getUserMedia for 960×720. */
    defaultAspect: 4 / 3,
    /** Front level reads are taken against the BODY'S OWN VERTICAL — the line from between the ankles to between the
     *  shoulders — not the image's, so a phone propped a few degrees crooked does not tilt them: measured on the synth
     *  (P3 probe), a camera rolled 6° read a level stance 0.105 of a shoulder width off against the image, a false flag,
     *  and 0.00 against the body line. What is left is the body's own sideways lean: a 5 cm shift of the shoulders over
     *  the feet is ~2°, 0.035 of a shoulder width. assumption: a relaxed stance stays within that. Past this many
     *  degrees between that line and the image vertical (a phone badly crooked, or a real lean) nothing is read. */
    uprightMaxDeg: 10,
    /** The span a check divides by (shoulder width, torso length, heel line) must be at least this share of the image
     *  height: the fixture body's shoulder width is ~0.15 of it at 3 m, and under ~0.04 one pixel of jitter is a flag. */
    minSpan: 0.04,
    /** Neighbouring camera frames are not independent (the person and the tracker both move smoothly); the median's
     *  uncertainty counts one independent read per this many frames. Conservative: it makes 'tooNoisy' likelier. */
    framesPerIndependentRead: 3,
    /** AT THE LINE (MIRROR-COACH P3 review, 2026-09-26): a static read within this many of its own uncertainties of the
     *  flag line is 'tooNoisy', not a coin toss. Measured (review probe): a 4 cm head float reads 0.118 against the 0.12
     *  line clean and flagged on 1 of 6 jittered takes at 2× the synth's jitter and 2 of 6 at 3× — the same body, a
     *  different grade, by chance. One uncertainty is the median's own jitter-only standard error (robust() below), so the
     *  band is narrow on a steady phone (±0.003 of a shoulder width on the synth) and wide only where the read is shaky. */
    flagBand: 1,
    /** Two frames whose aspects differ by more than this were taken with the phone turned between them ('cameraMoved'):
     *  4:3 and 3:4 differ by 0.58; a stream's own size never wobbles. */
    aspectTolerance: 0.02,
    /** SERVER PLAUSIBILITY (regradeFromSummary with a station's hold): no phone's pose model runs faster than this, so a
     *  claim of more frames than holdSec × this is not a hold's frames. Generous on purpose: it only catches invention. */
    maxPoseFps: 120,
    /** …and a single-leg claim of more seconds on one leg than the hold, plus this, is not a hold either. */
    stanceSlackSec: 1,
  },
  /**
   * BORROWED LINES (MIRROR-COACH P3 review, 2026-09-26): the gates above are not the only numbers that decide
   * 'unreadable'. These are decided in other files and read here — listed so a reviewer tuning this table sees every line
   * a grade crosses. The framing lines are read-only mirrors (checkFraming uses its own constants; changing them here
   * changes nothing); the knee's frontal test IS read from here (readKnees passes them to squat-audit's frontalReadable).
   *   framingVisMin   — framing.ts: a frame whose mean visibility is under this is 'dim' (→ lowVisibility)
   *   squareMin / sideWidthMax / faceAwayMax — framing.ts: square to the lens (front, back), side-on (side), facing
   *                     away (back) — a body the wrong way round for the station is 'turned' (→ wrongView)
   *   minHipHalf, frontalMinHipSpan, frontalMaxHipDepth — squat-audit.ts: hips collapsed in x or deep apart in z are a
   *                     body turned from the lens, so no knee line is read (→ wrongView)
   */
  borrowed: {
    framingVisMin: VIS_MIN, squareMin: SQUARE_MIN, sideWidthMax: SIDE_WIDTH_MAX, faceAwayMax: FACE_AWAY_MAX,
    minHipHalf: MIN_HIP_HALF, frontalMinHipSpan: SQUAT_THRESHOLDS.frontalMinHipSpan, frontalMaxHipDepth: SQUAT_THRESHOLDS.frontalMaxHipDepth,
  },
  /** Statistics, not judgement: a normal distribution's IQR is 1.349 σ, its MAD 0.6745 σ, and a median over n
   *  independent reads has a standard error of √(π/2) σ / √n. */
  stats: { q1: 0.25, median: 0.5, q3: 0.75, iqrToSigma: 1.349, madToSigma: 1.4826, medianEfficiency: Math.sqrt(Math.PI / 2), rayleighMean: Math.sqrt(Math.PI / 2) },
  units: { degPerRad: 180 / Math.PI, msPerSec: 1000 },
  /** What a posted grade may carry (regradeFromSummary) and how long a result's detail line may be (screen.ts keeps 200). */
  limits: { stationIdChars: 32, detailChars: 200 },
  /** How the card prints a value (decimals per unit). */
  display: { ratio: 2, deg: 0, pxNorm: 2, sec: 0 },
  /** Shoulders level (front). A flag at 0.08 of a shoulder width is ~3 cm on a 40 cm span (a 4.6° tilt of the
   *  shoulder line) — over twice the ~2° body lean the read is left with, and about three times the synth's per-frame
   *  jitter (the median over a hold is steadier still: its uncertainty read 0.003). The synth: level 0.00, one shoulder
   *  2 cm high 0.05 (passes), 5 cm high 0.13. */
  shoulderLevel: { flagAt: 0.08, maxSpread: 0.2, maxUncertainty: 0.02 },
  /** Hips level (front), over the SHOULDER width: MediaPipe's hip points are learned joint centres and their spacing
   *  is the shakier span. Same line as the shoulders. */
  hipLevel: { flagAt: 0.08, maxSpread: 0.2, maxUncertainty: 0.02 },
  /** Knee inside its own hip–ankle line (front, standing), in hip half-widths. The squat audit warns at 0.35 at the
   *  bottom of a squat; a STANDING leg is nearly straight, so the same knee travel reads larger and a standing knee
   *  well inside its line is a bigger visible thing. 0.5 is ~4.5 cm on the fixture body (9 cm half-width). */
  kneeWindow: { flagAt: 0.5, maxSpread: 1.0, maxUncertainty: 0.1 },
  /** Ear ahead of the shoulder (side), in torso lengths. 0.12 is ~6 cm on a 50 cm torso; the synth's upright body
   *  reads 0.01, the head 4 cm forward 0.117–0.118 — AT the line: since the flag band (common.flagBand, review
   *  2026-09-26) it reads tooNoisy on about half the jittered takes and passes on the rest, never a coin-toss flag —
   *  and 9 cm forward 0.24. Read against
   *  the image vertical: a phone crooked by θ moves the ear (~24 cm above the shoulder) by 24·sin θ cm — 0.04 torso
   *  lengths at 5° — so the side view's own lean gate is tighter than the level reads'. */
  headFloat: { flagAt: 0.12, maxSpread: 0.25, maxUncertainty: 0.03, uprightMaxDeg: 5 },
  /** The heel line from behind: the ankle→heel segment's tilt from vertical, + = heel outside the ankle. The segment is
   *  ~8.5 cm — ~16 px at 3 m — so one frame's tilt is coarse (synth jitter: ~13° per frame); the median over a 12 s
   *  hold is not. Flagged only ONE-SIDED (the check's own finding: one heel tilts, the other does not): the worse side
   *  past flagAt AND at least asymmetryAt more than the other. A tilt both heels share is as likely the tracker's
   *  habit from behind as the feet, so it is not flagged. */
  heelLine: {
    flagAt: 10, asymmetryAt: 8, maxSpread: 40, maxUncertainty: 3,
    /** A FOOT TURNED, NOT A HEEL TILTED (MIRROR-COACH P3 review, 2026-09-26). From behind, the heel point sits behind the
     *  ankle along the camera's axis, so turning a foot about the vertical moves it sideways in the image — the review
     *  probe turned one untilted foot in by 20°/30°/40° and read heel lines of 6°/9°/11° (the last flagged). The toe
     *  (31/32) sits ~20 cm the other way, so the same turn moves it far more: each foot's turn is read as the toe's
     *  sideways offset from its heel (+ = toe outward) over the shin's length (knee to ankle, the steady span from
     *  behind). Feet turned ALIKE (a natural toe-out) read the same heel lines and pass; feet whose turns differ by more
     *  than this many shin lengths are 'feetTurned' — ~0.1 is ~12° of difference on a 25 cm foot and a 42 cm shin
     *  (0.5 sin θ), well under the ~35° that flagged on the synth, because a real heel point sits further back than the
     *  synth's 2.5 cm (assumption) and a smaller turn would flag there. */
    footTurnMaxDiff: 0.1,
  },
  /**
   * Thirty seconds on one leg (front). IN MILLISECONDS, NOT FRAMES (MIRROR-COACH P3 review, 2026-09-26): the windows were
   * frame counts sized for 30 fps, and the frame rate is the phone's pose-model rate (render/pose-frame-gate.ts admits one
   * frame per detection) — the review probe filmed the test's own flag fixture (a 3 cm, 1 Hz wobble) at 10 fps and read
   * 0.064, a PASS, and a still stance at 60 fps read tooNoisy on 6 of 6 takes. Each window is turned into frames per
   * station from the median interval between its readable frames (measureSingleLeg), so 10, 15, 30 and 60 fps grade the
   * same body the same way (stationGraders.test.ts films it at each).
   */
  singleLeg: {
    /** The free foot is UP when its ankle is this far above the stance ankle (torso lengths; ~7 cm)… */
    liftGap: 0.15,
    /** …and DOWN again when it is back within this (~3 cm) for touchMs running (hysteresis: a hovering foot's jitter
     *  cannot count touch-downs). */
    touchGap: 0.06,
    touchMs: 100,
    /** The foot-height read is a running median over this long (5 frames at 30 fps) before the lift/touch test. */
    gapMedianMs: 170,
    /** THE STANCE MUST BE ESTABLISHED before a touch-down counts (review, 2026-09-26): the first seconds of every hold
     *  are two-footed (the runner starts the clock on the first good frame), and ankle jitter crossing liftGap there,
     *  then settling, counted "the free foot came down 1 time" on 14 of 20 jittered takes at 3× the synth's limb jitter.
     *  Nothing counts until the free foot has been above armGap (~15 cm; the cue asks for the knee at hip height, which
     *  lifts the ankle ~40 cm) for armMs running. */
    armGap: 0.3,
    armMs: 500,
    /** The foot-height signal's own jitter (the running median's, from its residuals) times this must stay under the
     *  hysteresis band (liftGap − touchGap), or the touch-down count is 'tooNoisy' — decided BEFORE a touch-down can flag. */
    gapJitterMargin: 2,
    /** One touch-down is the flag: the stance was not held. */
    touchDownsFlagAt: 1,
    /** The sway path is measured between the means of consecutive blocks this long (6 frames at 30 fps: a 5 Hz path,
     *  fine for a wobble of up to ~2 Hz). Measured on the synth at 30 fps: frame by frame, jitter alone draws ~0.5 torso
     *  lengths a second; through a 9-frame moving average still 0.06; between 6-frame block means ~0.035. */
    blockMs: 200,
    /** The per-frame jitter is read from the residual off a centred moving average this wide (9 frames at 30 fps), where
     *  a slow sway leaves almost nothing. */
    smoothMs: 300,
    /** THE POSE RATE: a median interval between readable frames longer than this (~14 fps) is 'lowRate'. Measured on the
     *  synth with the windows in ms (scripts/probes/_station-graders-p3-review.ts): at 15, 30 and 60 fps a still stance
     *  passes and a 3 cm, 1 Hz wobble flags; at 10 fps a 200 ms block is two frames and the jitter floor is √3 of 30 fps's,
     *  so the wobble read tooNoisy on 6 of 6 takes and the still stance on 4 of 6 — a read the phone cannot make, said
     *  as the rate rather than as noise. */
    maxFrameMs: 70,
    /** Sway path per second over torso lengths, WITH THE JITTER TAKEN OUT (review, 2026-09-26: the raw path carried the
     *  jitter floor — a still stance printed ~0.04 against 0.013 clean, and a 1.5 cm sway under the line read 0.150 on one
     *  jittered take, a flag): value = √(path² − floor²). 0.12 is ~6 cm/s on a 50 cm torso — a visible wobble; a 3 cm,
     *  1 Hz wobble reads ~0.20. */
    swayFlagAt: 0.12,
    /** The flag line must sit this many times above what jitter alone draws, or the sway read is unreadable. */
    jitterMargin: 2,
    /** Seconds on one leg the camera must see before a clean stance can pass (of the 30 s hold). */
    minStanceSec: 20,
    /** A gap in the readable frames longer than this breaks the sway path (the stance was not seen across it). */
    maxGapMs: 500,
    /** STEPPING OFF AT THE END (review, 2026-09-26): the hold clock runs only on a good shot, so after any framing pause
     *  the athlete's own "thirty seconds" ends before the clock does, and they put the foot down — which read "the free
     *  foot came down" after 28.8 s on one leg. A last touch-down with no lift after it that begins in the station's last
     *  this-many seconds is the end of the hold, not a touch-down. FEL judgement: a count kept in the head drifts by a
     *  few seconds over thirty. Measured (review probe): a step-off 0.2 s or 0.6 s before the end passes; 3.5 s or 10 s
     *  before is a touch-down. A longer framing pause still reads as one — the runner does not say the count aloud. */
    stepOffToleranceSec: 3,
  },
} as const;

type T = typeof STATION_THRESHOLDS;
const C = STATION_THRESHOLDS.common;
const S = STATION_THRESHOLDS.stats;

/** Which view each grader reads. */
export const GRADER_VIEW: Record<GraderId, StationView> = {
  shoulderLevel: 'front', hipLevel: 'front', kneeWindow: 'front', headFloat: 'side', heelLine: 'back', singleLeg: 'front',
};
export const GRADER_UNIT: Record<GraderId, GradeUnit> = {
  shoulderLevel: 'ratio', hipLevel: 'ratio', kneeWindow: 'ratio', headFloat: 'ratio', heelLine: 'deg', singleLeg: 'px-norm',
};

/** The frames a readable grade needs out of `frames` handed in. */
export function minReadableFrames(frames: number): number {
  return Math.max(C.minReadableFrames, Math.ceil(C.minReadableShare * Math.max(0, frames)));
}

// ── small maths ────────────────────────────────────────────────────────────────────────────────────────────────────

interface P { x: number; y: number }
const px = (p: GraderPoint, aspect: number): P => ({ x: p.x * aspect, y: p.y });
/** The aspect a frame was taken at: its own when it carries one (the runner stamps it), else the station's. */
const aspectOf = (f: GraderFrame, fallback: number): number =>
  typeof f.aspect === 'number' && Number.isFinite(f.aspect) && f.aspect > 0 ? f.aspect : fallback;
const mid = (a: P, b: P): P => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

function quantile(sorted: readonly number[], q: number): number {
  if (!sorted.length) return NaN;
  const at = (sorted.length - 1) * q, lo = Math.floor(at), hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}
function median(values: readonly number[]): number {
  return quantile([...values].sort((a, b) => a - b), S.median);
}
/** The median, the interquartile range, and the median's jitter-only standard error. */
function robust(values: readonly number[]): { median: number; iqr: number; se: number } {
  const s = [...values].sort((a, b) => a - b);
  const iqr = quantile(s, S.q3) - quantile(s, S.q1);
  const independent = Math.max(1, s.length / C.framesPerIndependentRead);
  return { median: quantile(s, S.median), iqr, se: (S.medianEfficiency * (iqr / S.iqrToSigma)) / Math.sqrt(independent) };
}

// ── the per-frame gate ─────────────────────────────────────────────────────────────────────────────────────────────

type FrameRead<V> = { ok: true; v: V } | { ok: false; why: UnreadableReason };
const no = (why: UnreadableReason): { ok: false; why: UnreadableReason } => ({ ok: false, why });

/**
 * The shared gates: a body, facing the way the check reads it, and every needed point seen and inside the image. A
 * frame that is dim ALL OVER (the framing check's mean-visibility 'dim') is dim, not turned: the framing check reads a
 * face it can barely see as a face turned away, and the P3 test's dim shot came back "wrong view" until this order.
 */
function gate(f: GraderFrame, view: StationView, need: readonly number[]): UnreadableReason | null {
  if (f.present === false || !f.landmarks?.length) return 'noBody';
  const framing = checkFraming({ landmarks: f.landmarks as GraderPoint[], present: f.present }, view);
  if (framing.issues.includes('noBody')) return 'noBody';
  const points = pointsGate(f, need);
  if (points === 'outOfFrame') return points;
  if (points === 'lowVisibility' && framing.issues.includes('dim')) return points;
  if (framing.issues.includes('turned')) return 'wrongView';
  return points;
}
function pointsGate(f: GraderFrame, need: readonly number[]): UnreadableReason | null {
  let dim = false;
  for (const i of need) {
    const p = f.landmarks[i];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return 'outOfFrame';
    if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return 'outOfFrame';
    if ((p.visibility ?? 1) < C.minVisibility) dim = true;
  }
  return dim ? 'lowVisibility' : null;
}

/** Degrees the line from `low` (between the ankles) up to `high` (between the shoulders) leans from the image vertical. */
function leanDeg(high: P, low: P): number | null {
  const up = low.y - high.y;
  if (up <= 0) return null;
  return Math.atan2(Math.abs(high.x - low.x), up) * STATION_THRESHOLDS.units.degPerRad;
}

// ── the per-check reads ────────────────────────────────────────────────────────────────────────────────────────────

/** Shoulders or hips level, + = the LEFT one higher (further up the body), over the shoulder width. */
function readLevel(which: 'shoulder' | 'hip', f: GraderFrame, stationAspect: number): FrameRead<number> {
  const why = gate(f, 'front', [LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP, LEFT_ANKLE, RIGHT_ANKLE]);
  if (why) return no(why);
  const L = f.landmarks, aspect = aspectOf(f, stationAspect);
  const ls = px(L[LEFT_SHOULDER], aspect), rs = px(L[RIGHT_SHOULDER], aspect);
  const width = dist(ls, rs);
  if (width < C.minSpan) return no('tooSmall');
  const top = mid(ls, rs), feet = mid(px(L[LEFT_ANKLE], aspect), px(L[RIGHT_ANKLE], aspect));
  const lean = leanDeg(top, feet);
  if (lean === null || lean > C.uprightMaxDeg) return no('notUpright');
  // how far the left point sits UP THE BODY from the right one: along the line from the feet to the shoulders, so a
  // crooked phone (which turns that line and the shoulders together) cancels out
  const len = dist(top, feet);
  const up = { x: (top.x - feet.x) / len, y: (top.y - feet.y) / len };
  const [l, r] = which === 'shoulder' ? [ls, rs] : [px(L[LEFT_HIP], aspect), px(L[RIGHT_HIP], aspect)];
  return { ok: true, v: ((l.x - r.x) * up.x + (l.y - r.y) * up.y) / width };
}

/** Each knee against its own hip–ankle line (squat-audit.ts kneeInwardRatio), + = inside, in hip half-widths. */
function readKnees(f: GraderFrame): FrameRead<{ left: number; right: number }> {
  const why = gate(f, 'front', [LEFT_HIP, RIGHT_HIP, LEFT_KNEE, RIGHT_KNEE, LEFT_ANKLE, RIGHT_ANKLE]);
  if (why) return no(why);
  const L = f.landmarks;
  const lh = L[LEFT_HIP], rh = L[RIGHT_HIP], la = L[LEFT_ANKLE], ra = L[RIGHT_ANKLE];
  const hipHalf = Math.abs(lh.x - rh.x) / 2;
  // the audit's own frontal test (hips collapsed in x, or deep apart in z = turned from the lens): no knee line to read.
  // kneeInwardRatio would return 0 for stacked hips, which is not a straight knee — so the frame is not read at all.
  // Its lines come from the table (STATION_THRESHOLDS.borrowed — the audit's own values, listed where they are tuned).
  const B = STATION_THRESHOLDS.borrowed;
  if (hipHalf < B.minHipHalf || !frontalReadable(lh, rh, (lh.y + rh.y) / 2, (la.y + ra.y) / 2, B)) return no('wrongView');
  const midX = (lh.x + rh.x) / 2;
  return {
    ok: true,
    v: { left: kneeInwardRatio(lh, L[LEFT_KNEE], la, midX, hipHalf), right: kneeInwardRatio(rh, L[RIGHT_KNEE], ra, midX, hipHalf) },
  };
}

/**
 * The ear ahead of the shoulder, from the side, over the torso length. The NEAR side is read (a real side view marks
 * the far ear and shoulder occluded); "ahead" is the way the body faces, read from the body — the nose ahead of the
 * ear and the toes ahead of the heel — so it does not matter which shoulder is to the camera or whether the stream is
 * mirrored. The two must not disagree.
 */
function readHead(f: GraderFrame, stationAspect: number): FrameRead<number> {
  if (f.present === false || !f.landmarks?.length) return no('noBody');
  const aspect = aspectOf(f, stationAspect);
  const framing = checkFraming({ landmarks: f.landmarks as GraderPoint[], present: f.present }, 'side');
  if (framing.issues.includes('noBody')) return no('noBody');
  if (framing.issues.includes('dim')) return no('lowVisibility');
  if (framing.issues.includes('turned')) return no('wrongView');
  const L = f.landmarks;
  // the near side: the nearer in depth when the frame carries z (MediaPipe's image z, smaller = nearer), else the better
  // seen. Measured (P3 probe): choosing by visibility alone tied on the synth (every point seen alike) and fell to the
  // label, so a mirrored stream — labels swapped — read the FAR side, 0.124 against 0.118 torso lengths.
  const sumOf = (ids: readonly number[], key: 'z' | 'visibility') => ids.reduce((a, i) => a + (L[i]?.[key] ?? NaN), 0);
  const leftIds = [LEFT_EAR, LEFT_SHOULDER, LEFT_HIP], rightIds = [RIGHT_EAR, RIGHT_SHOULDER, RIGHT_HIP];
  const zl = sumOf(leftIds, 'z'), zr = sumOf(rightIds, 'z');
  const leftNear = Number.isFinite(zl) && Number.isFinite(zr) && zl !== zr ? zl < zr
    : (Number.isFinite(sumOf(leftIds, 'visibility')) ? sumOf(leftIds, 'visibility') : 0) >= (Number.isFinite(sumOf(rightIds, 'visibility')) ? sumOf(rightIds, 'visibility') : 0);
  const near = leftNear
    ? { ear: LEFT_EAR, shoulder: LEFT_SHOULDER, hip: LEFT_HIP, heel: LEFT_HEEL, toe: LEFT_FOOT_INDEX, ankle: LEFT_ANKLE, farAnkle: RIGHT_ANKLE }
    : { ear: RIGHT_EAR, shoulder: RIGHT_SHOULDER, hip: RIGHT_HIP, heel: RIGHT_HEEL, toe: RIGHT_FOOT_INDEX, ankle: RIGHT_ANKLE, farAnkle: LEFT_ANKLE };
  // THE LEAN LINE FROM ONE ANKLE (MIRROR-COACH P3 review, 2026-09-26): it read the line from between BOTH ankles, so both
  // had to clear the visibility cut — and from the side the far ankle is behind the near leg. The review probe set the
  // far ankle at 0.45–0.55 (which the runner's framing still accepts) and the head read unreadable on 6 of 6 takes, even
  // 9 cm forward. The line is taken from the better seen of the two ankles (the near one on a tie), and only that one
  // must clear the cut; standing side-on, the two sit within a few centimetres of each other along the image's x.
  const vis = (i: number) => (Number.isFinite(L[i]?.visibility) ? L[i].visibility! : 1);
  const ankle = vis(near.farAnkle) > vis(near.ankle) ? near.farAnkle : near.ankle;
  const why = pointsGate(f, [near.ear, near.shoulder, near.hip, ankle]);
  if (why) return no(why);
  const ear = px(L[near.ear], aspect), sh = px(L[near.shoulder], aspect), hip = px(L[near.hip], aspect);
  const torso = dist(sh, hip);
  if (torso < C.minSpan) return no('tooSmall');
  const lean = leanDeg(sh, px(L[ankle], aspect));
  if (lean === null || lean > STATION_THRESHOLDS.headFloat.uprightMaxDeg) return no('notUpright');
  let facing = 0;
  if (!pointsGate(f, [NOSE])) facing += Math.sign(L[NOSE].x - L[near.ear].x);
  if (!pointsGate(f, [near.heel, near.toe])) facing += Math.sign(L[near.toe].x - L[near.heel].x);
  if (facing === 0) return no('wrongView');
  return { ok: true, v: ((ear.x - sh.x) * Math.sign(facing)) / torso };
}

/**
 * Each heel line's tilt from vertical, from behind: + = the heel sits OUTSIDE its ankle (away from the other foot). And
 * each foot's TURN (MIRROR-COACH P3 review, 2026-09-26): the toe's sideways offset from its heel over the shin's length,
 * + = toe outward — the read that tells a foot turned in from a heel tilted (see heelLine.footTurnMaxDiff).
 */
function readHeels(f: GraderFrame, stationAspect: number): FrameRead<{ left: number; right: number; turnL: number; turnR: number }> {
  const why = gate(f, 'back', [LEFT_ANKLE, RIGHT_ANKLE, LEFT_HEEL, RIGHT_HEEL, LEFT_FOOT_INDEX, RIGHT_FOOT_INDEX, LEFT_KNEE, RIGHT_KNEE]);
  if (why) return no(why);
  const L = f.landmarks, aspect = aspectOf(f, stationAspect);
  const la = px(L[LEFT_ANKLE], aspect), ra = px(L[RIGHT_ANKLE], aspect);
  const midX = (la.x + ra.x) / 2;
  const tilt = (ankle: P, heel: P): number | null => {
    const out = Math.sign(ankle.x - midX);
    const down = heel.y - ankle.y;
    if (!out || down <= 0 || dist(ankle, heel) < C.minSpan / 2) return null;
    return Math.atan2((heel.x - ankle.x) * out, down) * STATION_THRESHOLDS.units.degPerRad;
  };
  const turn = (ankle: P, knee: P, heel: P, toe: P): number | null => {
    const out = Math.sign(ankle.x - midX), shin = dist(knee, ankle);
    if (!out || shin < C.minSpan) return null;
    return ((toe.x - heel.x) * out) / shin;
  };
  const lh = px(L[LEFT_HEEL], aspect), rh = px(L[RIGHT_HEEL], aspect);
  const left = tilt(la, lh), right = tilt(ra, rh);
  const turnL = turn(la, px(L[LEFT_KNEE], aspect), lh, px(L[LEFT_FOOT_INDEX], aspect));
  const turnR = turn(ra, px(L[RIGHT_KNEE], aspect), rh, px(L[RIGHT_FOOT_INDEX], aspect));
  if (left === null || right === null || turnL === null || turnR === null) return no('tooSmall');
  return { ok: true, v: { left, right, turnL, turnR } };
}

// ── measure: frames in, the summary numbers out ────────────────────────────────────────────────────────────────────

/** The numbers a grade is decided from — what the client measures and what the server gets back. */
export interface Measured {
  checkId: GraderId;
  frames: number;
  readableFrames: number;
  value: number | null;
  bySide?: { left: number; right: number };
  touchDowns?: number;
  stanceSec?: number;
  uncertainty: number | null;
  spread: number | null;
  /** Set when the measurement itself could not read (before any threshold). */
  reason?: UnreadableReason;
  side?: 'left' | 'right';
  stationId?: string;
}

/** The commonest reason frames were refused — what an unreadable grade says. */
function dominant(reasons: readonly UnreadableReason[]): UnreadableReason {
  if (!reasons.length) return 'tooFewFrames';
  const n = new Map<UnreadableReason, number>();
  for (const r of reasons) n.set(r, (n.get(r) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0][0];
}

function collect<V>(frames: readonly GraderFrame[], read: (f: GraderFrame) => FrameRead<V>): { vals: V[]; ts: number[]; refused: UnreadableReason[] } {
  const vals: V[] = [], ts: number[] = [], refused: UnreadableReason[] = [];
  for (const f of frames) {
    const r = read(f);
    if (r.ok) { vals.push(r.v); ts.push(f.timestampMs); } else refused.push(r.why);
  }
  return { vals, ts, refused };
}

function measureStatic(checkId: GraderId, frames: readonly GraderFrame[], aspect: number): Measured {
  const base = { checkId, frames: frames.length };
  const unread = (readable: number, why: UnreadableReason): Measured =>
    ({ ...base, readableFrames: readable, value: null, uncertainty: null, spread: null, reason: why });

  if (checkId === 'kneeWindow' || checkId === 'heelLine') {
    const { vals, refused } = collect<{ left: number; right: number; turnL?: number; turnR?: number }>(
      frames, checkId === 'kneeWindow' ? readKnees : (f) => readHeels(f, aspect));
    if (vals.length < minReadableFrames(frames.length)) return unread(vals.length, dominant(refused));
    // a foot turned against the other moves its heel point sideways from behind: not a heel line the camera can read
    if (checkId === 'heelLine') {
      const tl = median(vals.map((v) => v.turnL ?? 0)), tr = median(vals.map((v) => v.turnR ?? 0));
      if (Math.abs(tl - tr) > STATION_THRESHOLDS.heelLine.footTurnMaxDiff) return unread(vals.length, 'feetTurned');
    }
    const l = robust(vals.map((v) => v.left)), r = robust(vals.map((v) => v.right));
    return {
      ...base, readableFrames: vals.length, value: Math.max(l.median, r.median), bySide: { left: l.median, right: r.median },
      uncertainty: Math.max(l.se, r.se), spread: Math.max(l.iqr, r.iqr),
    };
  }
  const read = checkId === 'headFloat' ? (f: GraderFrame) => readHead(f, aspect)
    : (f: GraderFrame) => readLevel(checkId === 'shoulderLevel' ? 'shoulder' : 'hip', f, aspect);
  const { vals, refused } = collect(frames, read);
  if (vals.length < minReadableFrames(frames.length)) return unread(vals.length, dominant(refused));
  const s = robust(vals);
  return { ...base, readableFrames: vals.length, value: s.median, uncertainty: s.se, spread: s.iqr };
}

/**
 * Thirty seconds on one leg. Which foot is up is read from the frames (the higher ankle for most of the station), and
 * it must be the station's free foot: a camera that saw the other leg up reads 'wrongLeg' (MIRROR-COACH P3 review,
 * 2026-09-26 — it used to grade the leg it saw and label it with the station's, so "Left leg: … flagged" named a leg the
 * athlete never stood on, 6 of 6 review takes). Every window is in milliseconds, turned into frames from this station's
 * own median frame interval (see STATION_THRESHOLDS.singleLeg).
 */
function measureSingleLeg(frames: readonly GraderFrame[], stationAspect: number, stance: 'left' | 'right' | undefined): Measured {
  const T1 = STATION_THRESHOLDS.singleLeg;
  const base = { checkId: 'singleLeg' as const, frames: frames.length, side: stance };
  const { vals, ts, refused } = collect(frames, (f) => {
    const why = gate(f, 'front', [LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP, LEFT_ANKLE, RIGHT_ANKLE]);
    if (why) return no(why);
    const L = f.landmarks, aspect = aspectOf(f, stationAspect);
    const hip = mid(px(L[LEFT_HIP], aspect), px(L[RIGHT_HIP], aspect));
    const torso = dist(mid(px(L[LEFT_SHOULDER], aspect), px(L[RIGHT_SHOULDER], aspect)), hip);
    if (torso < C.minSpan) return no('tooSmall');
    // + = the LEFT ankle higher (smaller y); the sign is what tells the free foot from a foot still up from before
    return { ok: true, v: { hip, torso, gap: L[RIGHT_ANKLE].y - L[LEFT_ANKLE].y } };
  });
  const unread = (why: UnreadableReason, extra: Partial<Measured> = {}): Measured =>
    ({ ...base, readableFrames: vals.length, value: null, uncertainty: null, spread: null, reason: why, ...extra });
  if (vals.length < minReadableFrames(frames.length)) return unread(dominant(refused));

  // THE POSE RATE, and every window in frames at it
  const dts = ts.slice(1).map((t, i) => t - ts[i]).filter((d) => d > 0);
  const frameMs = dts.length ? median(dts) : NaN;
  if (!Number.isFinite(frameMs) || frameMs > T1.maxFrameMs) return unread('lowRate');
  const framesFor = (ms: number) => Math.max(1, Math.round(ms / frameMs));

  const torso = median(vals.map((v) => v.torso));
  // THE FREE FOOT is the one that is up for most of the station, not whichever is up this frame. MIRROR-COACH P3 live
  // proof (2026-09-26): the right-leg station counted 3 touch-downs on a body with 2 — its first frames still showed
  // the LEFT station's free foot up (the athlete has not switched yet when the new hold starts, since nothing about the
  // view changes), and putting that foot down read as the new free foot touching down: a false flag on every second
  // leg. Read by label, which a mirrored stream swaps for the whole station alike, so the choice is the same body part.
  const signed = vals.map((v) => v.gap / torso);
  const upFrames = signed.filter((g) => Math.abs(g) > T1.liftGap);
  if (!upFrames.length) return unread('notStarted');
  const freeSign = Math.sign(median(upFrames)) || 1;
  // standing on the LEFT leg, the RIGHT foot is the free one: its ankle higher, so the gap reads − (and + for the right)
  const wanted = stance === 'left' ? -1 : stance === 'right' ? 1 : freeSign;
  if (freeSign !== wanted) return unread('wrongLeg');
  // the free foot's height over the other foot, in torso lengths (negative while the OTHER foot is up), as a running
  // median (one jittered frame is not a step)
  const n = vals.length;
  const rawGap = signed.map((g) => g * freeSign);
  const k = Math.floor(framesFor(T1.gapMedianMs) / 2);
  const gap = rawGap.map((_, i) => median(rawGap.slice(Math.max(0, i - k), i + k + 1)));

  // THE STANCE IS ESTABLISHED once the free foot has been above armGap for armMs running; nothing before counts
  let armAt = -1;
  for (let i = 0, runStart = -1; i < n; i++) {
    if (gap[i] <= T1.armGap) { runStart = -1; continue; }
    if (runStart < 0 || ts[i] - ts[i - 1] > T1.maxGapMs) runStart = i;
    if (ts[i] - ts[runStart] >= T1.armMs) { armAt = runStart; break; }
  }
  if (armAt < 0) return unread('notStarted');

  // THE FOOT-HEIGHT SIGNAL'S OWN JITTER, from the established stance on: σ of the raw gap off its running median (MAD,
  // robust to the lifts and touch-downs themselves; a sample is part of its own window, so its residual shrinks by
  // √(1 − 1/window)), then the running median's σ. If that could cross the hysteresis band, no touch-down count is
  // trustworthy — decided here, before any touch-down can flag.
  const win = 2 * k + 1;
  const mad = (xs: number[]) => { const m = median(xs); return median(xs.map((x) => Math.abs(x - m))); };
  const gapResid = rawGap.slice(armAt).map((g, i) => g - gap[armAt + i]);
  const gapSigma = (mad(gapResid) * S.madToSigma) / (win > 1 ? Math.sqrt(1 - 1 / win) : 1);
  const gapMedianSigma = (S.medianEfficiency * gapSigma) / Math.sqrt(win);
  if (gapMedianSigma * T1.gapJitterMargin >= T1.liftGap - T1.touchGap) return unread('tooNoisy');

  // the free foot, from the established stance: down only after touchMs running under touchGap, up again past liftGap
  // (hysteresis)
  const touchN = framesFor(T1.touchMs);
  let lifted = true, downRun = 0, downStart = -1;
  const downs: number[] = [];                         // where each counted touch-down began
  const up: boolean[] = new Array(n).fill(false);
  for (let i = armAt; i < n; i++) {
    if (!lifted && gap[i] > T1.liftGap) { lifted = true; downRun = 0; }
    else if (lifted && gap[i] < T1.touchGap) {
      if (downRun === 0) downStart = i;
      downRun += 1;
      if (downRun >= touchN) { lifted = false; downs.push(downStart); downRun = 0; }
    } else if (lifted) downRun = 0;
    up[i] = lifted && gap[i] >= T1.touchGap;
  }

  // the hip midpoint, smoothed (centred moving average) — raw, jitter alone draws a sway
  const h = Math.floor(framesFor(T1.smoothMs) / 2), smoothN = 2 * h + 1;
  const pos = vals.map((v) => ({ x: v.hip.x / torso, y: v.hip.y / torso }));
  const smooth = pos.map((_, i) => {
    const w = pos.slice(Math.max(0, i - h), i + h + 1);
    return { x: w.reduce((a, p) => a + p.x, 0) / w.length, y: w.reduce((a, p) => a + p.y, 0) / w.length };
  });

  // runs of frames on one leg with no gap in them; the time on one leg; and the jitter residuals off the moving average
  const runs: number[][] = [];
  let liftedMs = 0, liftedFrames = 0;
  const resid: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (!up[i]) continue;
    resid.push({ x: pos[i].x - smooth[i].x, y: pos[i].y - smooth[i].y });
    liftedFrames += 1;
    const cont = i > 0 && up[i - 1] && ts[i] - ts[i - 1] > 0 && ts[i] - ts[i - 1] <= T1.maxGapMs;
    if (cont) { liftedMs += ts[i] - ts[i - 1]; runs[runs.length - 1].push(i); } else runs.push([i]);
  }
  const stanceSec = liftedMs / STATION_THRESHOLDS.units.msPerSec;
  // STEPPING OFF AT THE END: the last touch-down, with no lift after it, beginning in the station's last few seconds
  const last = downs[downs.length - 1];
  const steppedOff = last !== undefined && !lifted
    && (ts[n - 1] - ts[last]) / STATION_THRESHOLDS.units.msPerSec <= T1.stepOffToleranceSec;
  const touchDowns = downs.length - (steppedOff ? 1 : 0);

  // the sway path between consecutive BLOCK MEANS inside each run (see blockMs), per second of those steps
  const b = framesFor(T1.blockMs);
  let path = 0, pathMs = 0;
  for (const run of runs) {
    let prev: { p: P; t: number } | null = null;
    for (let j = 0; j + b <= run.length; j += b) {
      const blk = run.slice(j, j + b);
      const p = { x: blk.reduce((a, i) => a + pos[i].x, 0) / b, y: blk.reduce((a, i) => a + pos[i].y, 0) / b };
      const t = blk.reduce((a, i) => a + ts[i], 0) / b;
      if (prev) { path += dist(p, prev.p); pathMs += t - prev.t; }
      prev = { p, t };
    }
  }
  if (stanceSec <= 0 || pathMs <= 0 || resid.length < b) return unread('tooShort', { touchDowns, stanceSec });

  // what jitter ALONE would draw as the same path: the per-axis frame noise σ from the residuals (MAD — robust to the
  // sway itself; a moving average over smoothN frames leaves white noise σ√(1 − 1/smoothN) of residual), and a b-frame
  // block mean's step of white noise, σ√(2/b) per axis, b frames apart
  const shrink = smoothN > 1 ? Math.sqrt(1 - 1 / smoothN) : 1;
  const sigma = (Math.hypot(mad(resid.map((r) => r.x)), mad(resid.map((r) => r.y))) / Math.SQRT2) * S.madToSigma / shrink;
  const blocksPerSec = liftedFrames / stanceSec / b;
  const floor = blocksPerSec * sigma * Math.sqrt(2 / b) * S.rayleighMean;
  // THE JITTER TAKEN OUT of the reported sway (review, 2026-09-26): a path that is jitter and sway together is, in the
  // mean square, the sum of the two, so the sway alone is √(path² − floor²); the raw path was printed and flagged on
  const raw = path / (pathMs / STATION_THRESHOLDS.units.msPerSec);
  const value = Math.sqrt(Math.max(0, raw * raw - floor * floor));
  return { ...base, readableFrames: n, value, touchDowns, stanceSec, uncertainty: floor, spread: null };
}

/**
 * THE PHONE TURNED MID-HOLD (MIRROR-COACH P3 review, 2026-09-26). The harness read the camera's aspect once, after the
 * video started, and every length and angle here is x × aspect — the review probe graded a landscape stream at the
 * portrait aspect and read a 2.5 cm shoulder raise as 0.116 (a flag; true 0.066, a pass). The runner now stamps each
 * frame with the aspect it was taken at and the graders read each frame with its own; a station whose frames were taken
 * at two different shapes is not graded at all (the body jumps across the image as the phone turns, which a sway or a
 * level read would take for the body). */
function cameraMoved(frames: readonly GraderFrame[], fallback: number): boolean {
  let lo = Infinity, hi = -Infinity;
  for (const f of frames) { const a = aspectOf(f, fallback); lo = Math.min(lo, a); hi = Math.max(hi, a); }
  return hi - lo > C.aspectTolerance;
}

/** Measure one check over a station's frames. The declared view must be the one the check reads. */
export function measureStation(checkId: GraderId, frames: readonly GraderFrame[], view: StationView, opts: GradeOptions = {}): Measured {
  const aspect = opts.aspect && Number.isFinite(opts.aspect) && opts.aspect > 0 ? opts.aspect : C.defaultAspect;
  const unread = (reason: UnreadableReason): Measured =>
    ({ checkId, frames: frames.length, readableFrames: 0, value: null, uncertainty: null, spread: null, reason });
  const m: Measured = view !== GRADER_VIEW[checkId] ? unread('wrongView')
    : cameraMoved(frames, aspect) ? unread('cameraMoved')
    : checkId === 'singleLeg' ? measureSingleLeg(frames, aspect, opts.stance)
    : measureStatic(checkId, frames, aspect);
  if (checkId === 'singleLeg' && opts.stance) m.side = opts.stance;
  if (opts.stationId) m.stationId = opts.stationId;
  return m;
}

// ── decide: the summary numbers in, the grade out (client AND server) ──────────────────────────────────────────────

const VIEW_WORD: Record<StationView, string> = { front: 'front', side: 'side', back: 'back' };

/** Why a check was not read, in the athlete's words. */
export function unreadableLine(checkId: GraderId, reason: UnreadableReason, m?: Pick<Measured, 'readableFrames' | 'frames' | 'stanceSec'>): string {
  const need = m ? minReadableFrames(m.frames) : C.minReadableFrames;
  const say: Record<UnreadableReason, string> = {
    wrongView: `this check reads you from the ${VIEW_WORD[GRADER_VIEW[checkId]]}, and the camera saw a different view`,
    noBody: 'the camera lost you for most of it',
    outOfFrame: 'part of you was outside the shot',
    lowVisibility: 'the points it reads were not clear enough (light, or something in front of you)',
    notUpright: 'you read tilted in the shot — the phone may be crooked',
    tooSmall: 'you were too small in the shot to read this',
    tooFewFrames: `too few clear frames (${m?.readableFrames ?? 0} of the ${need} it needs)`,
    tooNoisy: 'the tracking wobbled more than the thing this check looks for',
    notStarted: 'the camera never saw your free foot come up and stay up',
    tooShort: `the camera saw ${fmt(m?.stanceSec ?? 0, STATION_THRESHOLDS.display.sec)} s on one leg and needs ${STATION_THRESHOLDS.singleLeg.minStanceSec}`,
    wrongLeg: 'the camera saw the other foot up — you stood on the other leg',
    lowRate: 'the phone read you too few times a second to follow this one',
    feetTurned: 'one foot was turned in or out more than the other, which moves the heel point from behind',
    cameraMoved: 'the phone turned during the count',
  };
  return `Not read: ${say[reason]}.`;
}

/** What to do about it — the one action the retest asks for. */
export const RETEST_HINT: Record<UnreadableReason, string> = {
  wrongView: 'Face the way the cue says for this one.',
  noBody: 'Stay in the shot for the whole count.',
  outOfFrame: 'Keep your whole body in the shot, feet included.',
  lowVisibility: 'More light if you can, and nothing in front of your legs.',
  notUpright: 'Stand tall, and prop the phone upright.',
  tooSmall: 'Come a little closer to the phone.',
  tooFewFrames: 'Hold still in the shot for the whole count.',
  tooNoisy: 'Hold as still as you can, with more light if you have it.',
  notStarted: 'Lift the free knee and hold it up.',
  tooShort: 'Get onto one leg as soon as the count starts.',
  wrongLeg: 'Stand on the leg the cue names.',
  lowRate: 'Close other apps and keep the phone plugged in, so it can keep up.',
  feetTurned: 'Toes pointing straight ahead, both feet the same.',
  cameraMoved: 'Keep the phone the same way round for the whole count.',
};

/**
 * The retest hint for one grade: RETEST_HINT, with the leg named where the grade knows it (MIRROR-COACH P3 review,
 * 2026-09-26) — "Stand on your LEFT leg." says what "the leg the cue names" leaves to the athlete across the room.
 */
export function retestHintFor(g: Pick<StationGrade, 'reason' | 'side'>): string {
  if (!g.reason) return '';
  if (g.reason === 'wrongLeg' && g.side) return `Stand on your ${g.side.toUpperCase()} leg.`;
  return RETEST_HINT[g.reason];
}

function fmt(v: number, dp: number): string {
  const s = v.toFixed(dp);
  return Number(s) === 0 ? (0).toFixed(dp) : s;   // never "-0.00"
}

/** The value in words for the card, labelled estimated. */
export function formatGradeValue(g: Pick<StationGrade, 'checkId' | 'value' | 'bySide' | 'touchDowns' | 'stanceSec'>): string {
  if (g.value === null) return '—';
  const D = STATION_THRESHOLDS.display;
  // a side is named only when the number shown is not zero ("0.00 …, left higher" read as a finding: the P3 live card)
  const shown = (v: number, dp: number) => Number(fmt(Math.abs(v), dp)) !== 0;
  const inOut = (v: number) => (shown(v, D.ratio) ? `${fmt(Math.abs(v), D.ratio)} ${v > 0 ? 'in' : 'out'}` : fmt(0, D.ratio));
  switch (g.checkId) {
    case 'shoulderLevel':
    case 'hipLevel':
      return shown(g.value, D.ratio)
        ? `${fmt(Math.abs(g.value), D.ratio)} of a shoulder width, ${g.value > 0 ? 'left' : 'right'} higher · estimated`
        : `${fmt(0, D.ratio)} of a shoulder width apart in height · estimated`;
    case 'kneeWindow':
      return `knee against its hip–ankle line, in hip half-widths: L ${inOut(g.bySide?.left ?? g.value)} · R ${inOut(g.bySide?.right ?? g.value)} · estimated`;
    case 'headFloat':
      return `ear ${fmt(Math.abs(g.value), D.ratio)} torso lengths ${g.value >= 0 ? 'ahead of' : 'behind'} the shoulder · estimated`;
    case 'heelLine':
      return `heel lines L ${fmt(g.bySide?.left ?? g.value, D.deg)}° · R ${fmt(g.bySide?.right ?? g.value, D.deg)}° from vertical (+ = heel outside the ankle) · estimated`;
    case 'singleLeg':
      return `sway ${fmt(g.value, D.pxNorm)} torso lengths a second, ${g.touchDowns ?? 0} touch-down${g.touchDowns === 1 ? '' : 's'}, ${fmt(g.stanceSec ?? 0, D.sec)} s on one leg · estimated`;
  }
}

const FLAG_TAIL = 'Flagged for a closer look.';

/**
 * THE DECISION, shared by the client (after measuring) and the server (regradeFromSummary): the thresholds are applied
 * here and only here. Unreadable before anything else, so nothing unreadable can come out as a pass.
 */
export function decideGrade(m: Measured): StationGrade {
  const unit = GRADER_UNIT[m.checkId];
  const out = (status: GradeStatus, note: string, extra: Partial<StationGrade> = {}): StationGrade => {
    const g: StationGrade = {
      checkId: m.checkId, status, value: status === 'unreadable' ? null : m.value, unit, frames: m.frames,
      readableFrames: m.readableFrames, note, uncertainty: m.uncertainty, spread: m.spread, ...extra,
    };
    if (m.stationId) g.stationId = m.stationId;
    if (m.bySide && status !== 'unreadable') g.bySide = m.bySide;
    if (m.checkId === 'singleLeg') {
      if (m.side) g.side = m.side;
      if (m.touchDowns !== undefined) g.touchDowns = m.touchDowns;
      if (m.stanceSec !== undefined) g.stanceSec = m.stanceSec;
    }
    return g;
  };
  const unreadable = (reason: UnreadableReason) => out('unreadable', unreadableLine(m.checkId, reason, m), { reason });

  if (m.reason) return unreadable(m.reason);
  if (m.readableFrames < minReadableFrames(m.frames)) return unreadable('tooFewFrames');
  if (m.value === null || !Number.isFinite(m.value)) return unreadable('tooFewFrames');
  const said = formatGradeValue(m);

  if (m.checkId === 'singleLeg') {
    const T1 = STATION_THRESHOLDS.singleLeg;
    const leg = m.side ? `${m.side === 'left' ? 'Left' : 'Right'} leg: ` : '';
    // A touch-down is read off the free foot's height (a large span), not the sway, so the sway's jitter gate below does
    // not decide it. It has its own (MIRROR-COACH P3 review, 2026-09-26 — this line used to say "jitter cannot make one",
    // and before the first real lift it could): measureSingleLeg counts touch-downs only once the stance is established,
    // and reads the whole station 'tooNoisy' (m.reason, above) when the foot-height signal's jitter could cross the
    // hysteresis band — so a count that reaches here was made by a foot, not by the tracker.
    if ((m.touchDowns ?? 0) >= T1.touchDownsFlagAt) {
      return out('flag', `${leg}the free foot came down ${m.touchDowns} time${m.touchDowns === 1 ? '' : 's'} (${said}). ${FLAG_TAIL}`);
    }
    if (m.uncertainty === null || !Number.isFinite(m.uncertainty) || m.uncertainty * T1.jitterMargin >= T1.swayFlagAt) return unreadable('tooNoisy');
    if ((m.stanceSec ?? 0) < T1.minStanceSec) return unreadable('tooShort');
    if (m.value >= T1.swayFlagAt) return out('flag', `${leg}the hips swayed clearly while you held it (${said}). ${FLAG_TAIL}`);
    return out('pass', `${leg}held steady (${said}).`);
  }

  const t = STATION_THRESHOLDS[m.checkId] as T['shoulderLevel'] | T['kneeWindow'] | T['headFloat'] | T['heelLine'];
  if (m.uncertainty === null || !Number.isFinite(m.uncertainty) || m.uncertainty > t.maxUncertainty) return unreadable('tooNoisy');
  if (m.spread === null || !Number.isFinite(m.spread) || m.spread > t.maxSpread) return unreadable('tooNoisy');

  // AT THE LINE (C.flagBand): a read within its own uncertainty of the flag line is neither — 'tooNoisy'. over/under
  // say a read is clear of the band on that side.
  const band = C.flagBand * m.uncertainty;
  const over = (v: number, line: number) => v - line >= band;
  const atLine = (v: number, line: number) => Math.abs(v - line) < band;

  switch (m.checkId) {
    case 'shoulderLevel':
    case 'hipLevel': {
      const what = m.checkId === 'shoulderLevel' ? 'shoulder' : 'hip';
      if (over(Math.abs(m.value), t.flagAt)) {
        const side = m.value > 0 ? 'left' : 'right';
        return out('flag', `Your ${side} ${what} read higher (${said}). ${FLAG_TAIL}`, { side });
      }
      if (atLine(Math.abs(m.value), t.flagAt)) return unreadable('tooNoisy');
      return out('pass', `${what === 'shoulder' ? 'Shoulders' : 'Hips'} read level (${said}).`);
    }
    case 'kneeWindow': {
      const b = m.bySide;
      if (!b) return unreadable('tooFewFrames');
      const flagged = (['left', 'right'] as const).filter((s) => over(b[s], t.flagAt));
      if (flagged.length) {
        const which = flagged.length === 1 ? `Your ${flagged[0]} knee` : 'Both knees';
        return out('flag', `${which} read inside the line from hip to ankle (${said}). ${FLAG_TAIL}`,
          flagged.length === 1 ? { side: flagged[0] } : {});
      }
      if (atLine(b.left, t.flagAt) || atLine(b.right, t.flagAt)) return unreadable('tooNoisy');
      return out('pass', `Knees read over the line from hip to ankle (${said}).`);
    }
    case 'headFloat':
      if (over(m.value, t.flagAt)) return out('flag', `Your ear read well ahead of your shoulder (${said}). ${FLAG_TAIL}`);
      if (atLine(m.value, t.flagAt)) return unreadable('tooNoisy');
      return out('pass', `Ear read over the shoulder (${said}).`);
    case 'heelLine': {
      const b = m.bySide;
      if (!b) return unreadable('tooFewFrames');
      const worse: 'left' | 'right' = b.left >= b.right ? 'left' : 'right';
      const th = STATION_THRESHOLDS.heelLine;
      // both conditions clear of the band → flag; either clearly short → pass; otherwise too close to call. The
      // left-minus-right difference carries both sides' uncertainty (√2 of one).
      const diff = Math.abs(b.left - b.right), diffBand = band * Math.SQRT2;
      if (over(b[worse], th.flagAt) && diff - th.asymmetryAt >= diffBand) {
        return out('flag', `Your ${worse} heel line read tilted and the other did not (${said}). ${FLAG_TAIL}`, { side: worse });
      }
      if (b[worse] - th.flagAt <= -band || diff - th.asymmetryAt <= -diffBand) return out('pass', `Heel lines read alike (${said}).`);
      return unreadable('tooNoisy');
    }
  }
}

/** Grade one camera check over a station's frames — the contract's entry point (the "stationId" of the brief is the
 *  grader id: frontStack carries three checks, so a station has one grade per camera check, not one grade). */
export function gradeStation(checkId: GraderId, frames: readonly GraderFrame[], view: StationView, opts: GradeOptions = {}): StationGrade {
  return decideGrade(measureStation(checkId, frames, view, opts));
}

/** Every camera check at a station, graded over the same frames. Self-report and coach checks are not the camera's. */
export function gradeScreenStation(station: ScreenStation, frames: readonly GraderFrame[], opts: Omit<GradeOptions, 'stance' | 'stationId'> = {}): StationGrade[] {
  return station.checks
    .filter((c) => c.source === 'camera' && c.grader)
    .map((c) => gradeStation(c.grader!, frames, station.view, { ...opts, stance: station.stance, stationId: station.id }));
}

// ── the server's side, and the bridge to scoreScreen ───────────────────────────────────────────────────────────────

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const count = (x: unknown): number | null => { const n = num(x); return n !== null && n >= 0 && Number.isInteger(n) ? n : null; };
const REASONS: readonly UnreadableReason[] = [
  'wrongView', 'noBody', 'outOfFrame', 'lowVisibility', 'notUpright', 'tooSmall', 'tooFewFrames', 'tooNoisy', 'notStarted', 'tooShort',
  'wrongLeg', 'lowRate', 'feetTurned', 'cameraMoved',
];

/** What the server knows about the station a claim came from, for the plausibility bounds (regradeFromSummary). */
export interface RegradeContext {
  /** The station's hold (screen.ts ScreenStation.holdSec). */
  holdSec?: number;
}

/**
 * Re-decide a grade the client posted, from its summary numbers only. The status, the note and the side are NOT read
 * from the post (a flag's side is re-derived; singleLeg's stance leg is taken, and the caller checks it against the
 * station). Returns null for anything malformed: an unknown check, a unit that is not the check's, counts that are not
 * counts or claim more readable frames than frames. A value past what the frames support is the client's word — this
 * cannot check it without the frames, and says so rather than pretending to.
 */
export function regradeFromSummary(raw: unknown, ctx: RegradeContext = {}): StationGrade | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Record<string, unknown>;
  if (!isGraderId(g.checkId) || g.unit !== GRADER_UNIT[g.checkId]) return null;
  const frames = count(g.frames), readableFrames = count(g.readableFrames);
  if (frames === null || readableFrames === null || readableFrames > frames) return null;
  // PLAUSIBILITY against the station the server already holds (MIRROR-COACH P3 review, 2026-09-26): the review posted a
  // single-leg pass on 30 frames of a 30 s hold with 20 s on one leg, and 1 000 000 s on one leg, and both were kept and
  // printed. The runner keeps one frame per camera frame the hold clock ran on, so a hold has at most holdSec × the
  // fastest pose rate frames; a stance is at most the hold; and a second on one leg needs frames in it — the grader
  // counts time only across gaps of at most maxGapMs, so readableFrames × maxGapMs bounds it. Past any bound, the numbers
  // are not a hold's: malformed. (Values still cannot be checked without the frames; these are counts.)
  const hold = typeof ctx.holdSec === 'number' && ctx.holdSec > 0 ? ctx.holdSec : null;
  if (hold !== null && frames > hold * C.maxPoseFps) return null;
  // (the stance bounds only for a claim that reads: a claim that gives up scores nothing, whatever its counts say)
  if (g.checkId === 'singleLeg' && g.value !== null && g.value !== undefined) {
    const sec = num(g.stanceSec);
    if (sec !== null && hold !== null && sec > hold + C.stanceSlackSec) return null;
    if (sec !== null && sec > (readableFrames * STATION_THRESHOLDS.singleLeg.maxGapMs) / STATION_THRESHOLDS.units.msPerSec) return null;
  }
  const m: Measured = {
    checkId: g.checkId, frames, readableFrames, value: g.value === null ? null : num(g.value),
    uncertainty: g.uncertainty === null || g.uncertainty === undefined ? null : num(g.uncertainty),
    spread: g.spread === null || g.spread === undefined ? null : num(g.spread),
  };
  if (g.value !== null && m.value === null) return null;
  if (typeof g.reason === 'string' && (REASONS as readonly string[]).includes(g.reason)) m.reason = g.reason as UnreadableReason;
  if (typeof g.stationId === 'string') m.stationId = g.stationId.slice(0, STATION_THRESHOLDS.limits.stationIdChars);
  if (g.checkId === 'kneeWindow' || g.checkId === 'heelLine') {
    const b = g.bySide as Record<string, unknown> | undefined;
    const l = num(b?.left), r = num(b?.right);
    if (l !== null && r !== null) { m.bySide = { left: l, right: r }; if (m.value !== null) m.value = Math.max(l, r); }
    else if (m.value !== null && !m.reason) return null;
  }
  if (g.checkId === 'singleLeg') {
    if (g.side === 'left' || g.side === 'right') m.side = g.side;
    const td = count(g.touchDowns), sec = num(g.stanceSec);
    if (td !== null) m.touchDowns = td;
    if (sec !== null && sec >= 0) m.stanceSec = sec;
    if (m.value !== null && !m.reason && (td === null || sec === null)) return null;
  }
  return decideGrade(m);
}

/** A grade as the screen's result: pass → stable, flag → fail (with its side), unreadable → NOTHING. */
export function toCheckResult(g: StationGrade): CheckResult | null {
  if (g.status === 'unreadable' || g.value === null) return null;
  const r: CheckResult = { checkId: g.checkId, grade: g.status === 'flag' ? 'fail' : 'stable', source: 'camera' };
  // singleLeg's side is the leg it tested, on a pass too: its two results (one per leg) are told apart by side
  // (screen.ts checkSlots). Every other check carries a side only on a one-sided flag.
  if (g.side && (g.status === 'flag' || g.checkId === 'singleLeg')) r.side = g.side;
  r.detail = formatGradeValue(g).slice(0, STATION_THRESHOLDS.limits.detailChars);
  return r;
}

export function resultsFromGrades(grades: readonly StationGrade[]): CheckResult[] {
  return grades.map(toCheckResult).filter((r): r is CheckResult => r !== null);
}
