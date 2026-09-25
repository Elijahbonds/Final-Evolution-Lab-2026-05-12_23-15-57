// BodyReader — what the body is doing, read from the camera's pose frames (movement play, phase 2, 2026-09-24).
//
//   PoseFrame ──One Euro──▶ per-frame state (BodyRead) + events (BodyEvent), every instant on the CAPTURE clock
//
// It replaces the gesture table's guesses (poseControl: a hip rise is "A") with the body's own facts: when the feet
// left the floor and came back, one foot or two, how high, when the arm struck and the shot released. Modes (phase 3
// on) turn those into verbs; the dunk grades the slam against the jump's own apex, so the camera's latency cancels.
// Each event carries `t` (when it happened, capture clock) and `seen` (the frame that told it): a take-off is known
// 1–3 frames after it happened, a small hop's only once it has flown MIN_FLIGHT_MS.
//
// HOW HEIGHTS ARE READ. One camera cannot see the floor under a foot nearer or further than the hips (the owner's
// staggered stance puts a foot ~0.3 m nearer the lens and ~11 cm lower in the image). So the hips carry the floor:
//   hip height   H = lensH − (hip image y − the horizon row) × cos(pitch) × the live metre ruler (the torso's world
//                height over its image height, which follows the body as it steps nearer or further: the owner's dunk
//                moves 3.3 → 2.7 → 3.0 m). The horizon row is the image centre on a level lens, higher on one
//                looking down (the calibration's pitch)
//   foot height  H − that foot's lowest point below the hips in the WORLD landmarks (metric, so depth-free), read
//                along gravity through the pitch
//   lensH        from the calibration, then re-anchored on every planted foot: its lowest point IS the floor
// Without world landmarks a foot falls back to its image floor line; a foot wholly out of the frame is not read.
//
// WHEN THE FLOOR IS WRONG (a tilted lens, a stand taken badly, heavy jitter) the contact lines can sit under planted
// feet, and a landing nobody sees merged the next jump into one 2.7 m "flight" (the adversarial review). So the
// floor is re-levelled on the lower foot whenever the body is plainly supported without a foot read down: a flight
// past its top whose hips fall below the take-off and stop (it landed: the touch-down is searched on the feet's own
// fall), no flight lasting beyond MAX_FLIGHT_MS, and feet and hips held still with no foot down (SETTLE_MS).
//
// EDGES. A take-off is the last foot leaving, a landing the first foot down, each where it crosses its own level + 1 cm
// (the ground truth's rule). A foot's height jitters ~1.5 cm a frame, so the crossing is searched on a 5-frame median
// (which keeps a flat-then-ramp kink where it is) and the straddling pair is picked 2.5 cm up, then followed down.
//
// RULES the fixtures set (lib/pose/BodyReader.test.ts grades every one):
//   • a jump has BOTH feet off the floor and the body LAUNCHED: the hips left fast (JUMP_V0_SURE), or rose, topped out
//     and flew MIN_FLIGHT_MS. A jog's double-floats (82–123 ms, 2–4 cm of hip) and a video solve floating both feet
//     while the hips sink into a gather are not jumps;
//   • one foot when the other left > TWO_FOOT_MS before the last;
//   • an edge-on body (a turning dunk) is not dropped: the calibration's rulers are held and the hips and feet are read
//     through it;
//   • a body missing > LOST_MS is `lost`, and `found` when it is back. Absence is unknown, never zero: every field of a
//     frame without a body is null. A jump in the air when the body is lost (a big jump out of the top of the frame)
//     is held: found still in the air, it is landed as usual; found on the floor, it is dropped (no landing made up).
//     A touch-down already seen when the body is lost is a landing: it is told from the frames held;
//   • a landing is told LAND_SETTLE_MS after its touch-down, or at once when the feet leave again first (a rebound);
//   • every rate is taken over the same time at any camera rate (VEL_HALF_MS), and every edge search spans enough
//     frames at 24 fps; a frame older than the last one read is ignored.
//
// Pure: no DOM, no camera. Deterministic.
import {
  NOSE, LEFT_EAR, RIGHT_EAR, LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP, CORE_POINTS, type Wm, type PoseFrame,
} from './landmarks';
import { OneEuro, PoseFilter, type OneEuroParams, IMAGE_EURO, WORLD_EURO } from './oneEuro';
import {
  StillnessGate, calibrate, footDropW, footInFrame, footLowImg, hipMidImg, shoulderMidImg, median, sd, rulerY, downW,
  tiltOf, FOOT, ARM, SEEN_VIS, LEVEL, type Tilt, type Calibration, type CalibrationResult, type FootSide,
} from './calibrate';

const G = 9.81;

// ── presence ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** A body missing this long (ms) is lost: the brief's ~300 ms, 9 camera frames — longer than any blink of the model. */
export const LOST_MS = 300;

// ── the floor and the rulers ─────────────────────────────────────────────────────────────────────────────────────

/**
 * The image row level with the lens (y, 0..1) on a level lens: the centre (poseSource's 640×480, the synth's). A lens
 * pitched θ down puts it FOCAL_Y × tan θ higher; what a wrong row costs is (row offset) × (ruler change): the 12° lens
 * the review built is 0.24 rows off, 5 cm of hip for a 10 % change of depth.
 */
export const HORIZON_Y = 0.5;
/**
 * The lens's focal length in image heights (fy / height), which one view cannot measure (a body twice as far on a lens
 * twice as long looks the same). 1.155 is a 60°-wide lens at 4:3 (the synth's, a typical webcam); a 70° phone lens is
 * 0.95. Only the pitched horizon row uses it: ±20 % moves the 12° lens's row ±0.05 (~1 cm per 10 % depth change).
 */
export const FOCAL_Y = 1.155;
/**
 * The live ruler: the median of the torso's per-frame ruler over this many frames (one frame's jitters ~4 %). A ruler
 * held from the owner's dunk calibration (taken 3.3 m out) read its flight, 3.0 m out, 9 % long.
 */
export const RULER_FRAMES = 5;
/** …and never further than this share from the calibrated ruler (a torso half out of the frame reads nonsense). */
export const RULER_SPAN = 0.35;
/**
 * The floor re-anchors on every planted foot, pulling the lens height toward the world skeleton's hips-above-the-foot
 * with this time constant (ms) — ~8 frames, enough to average the drop's jitter, short enough to settle inside one
 * approach step. A foot counts as planted only with REANCHOR_HINDSIGHT frames of contact after it (the filtered
 * contact lets go a frame or two after a toe-off, and those frames would drag the floor up with the toe). It takes out
 * the calibration's own error (the owner's dunk, calibrated mid-approach, read its hips 5 cm low for the whole take)
 * and any drift; nothing is pulled in the air.
 */
export const REANCHOR_TAU_MS = 250;
export const REANCHOR_HINDSIGHT = 2;

// ── feet and flight ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The jump's contact lines: a foot is OFF above FOOT_OFF_M, back ON below FOOT_ON_M (its One Euro'd height). A planted
 * foot reads 0 ± ~0.7 cm after the re-anchor (±1.5 cm for a foot on its toes beside a flat one); the truth's own line is
 * 3.5 cm (synth.ts contactM). Swept 3.5–5 cm on four noise draws of the fixtures: 5 / 3.5 lost no jump and read no
 * foot wrong; 3.5 / 2.5 lost 2–3 jumps a draw to jitter. The instants come from the edge search, not from these lines.
 */
export const FOOT_OFF_M = 0.05;
export const FOOT_ON_M = 0.035;
/** An edge is where a foot crosses its own level + this (m): the truth's own rule (synth.ts REFINE_M). */
export const REFINE_M = 0.01;
/**
 * The edge search (liftAt / downAt) runs from EDGE_BEFORE_MS before the contact change (the filtered contact lets go
 * 1–2 frames after the foot does) to EDGE_AFTER_MS after it. A take-off's level is the foot's median over STANCE_MS of
 * stance, a landing's the median of its first LANDED_FRAMES on the floor. The straddling pair is picked at +EDGE_PICK_M
 * (1.7 σ of a foot's 1.5 cm jitter; an edge foot moves 3–10 cm a frame) on an EDGE_MEDIAN-frame running median, and its
 * line followed to +REFINE_M. On a noise-free rebuild of every fixture this puts take-offs within 15 ms and landings
 * within 19 ms of the truth, save the owner's two DeepMotion oddities (a foot hovering 3.7 cm, +50 ms; a hop, +30 ms).
 * The search always reaches back EDGE_BEFORE_FRAMES frame steps too, and takes a pair that straddles its start: at
 * 24 fps with one frame missed, 110 ms held no pair, and the take-off fell back to the frame that saw it (+116 ms,
 * −15 cm of height).
 */
export const EDGE_BEFORE_MS = 110;
export const EDGE_BEFORE_FRAMES = 3.5;
export const EDGE_AFTER_MS = 40;
export const STANCE_MS = 170;
export const LANDED_FRAMES = 3;
export const EDGE_PICK_M = 0.025;
export const EDGE_MEDIAN = 5;
/** A landing is told this long (ms) after the touch-down is seen: three frames on the floor give its level. */
export const LAND_SETTLE_MS = 100;
/** Both feet down within this (ms) of each other is a two-foot landing: one frame at 30 fps. */
export const LAND_BOTH_MS = 34;
/**
 * The other foot left more than this before the last one (ms): a one-foot take-off. The truth draws the line at 100 ms
 * (synth.ts twoFootMs), but its own two-foot take-offs leave 8–96 ms apart (the owner's approach 96) and its one-foot
 * ones 308–840 ms apart (a free leg driven up early); a lift instant jitters ~15–20 ms, so 100 ms read a 67 ms two-foot
 * take-off as one-foot. 150 ms sits in the gap.
 */
export const TWO_FOOT_MS = 150;
/**
 * A flight is a jump at once when the take-off speed the hips show is at least this (m/s): v²/2g = 16.5 cm, a 0.37 s
 * flight. At 1.6 an approach stride of the owner's (0.2 s, 8 cm of hip) passed on one noise draw; a jog's
 * double-float shows ≤ 1.0.
 */
export const JUMP_V0_SURE = 1.8;
/**
 * Otherwise it is a jump once it has flown this long (ms) with the hips risen JUMP_RISE_M and past their top: the
 * truth's own floor for a jump (synth.ts minJumpMs, minRiseM). A running stride's flight is ~0.1–0.2 s.
 */
export const MIN_FLIGHT_MS = 250;
export const JUMP_RISE_M = 0.04;
/** …and only if the hips were rising over its first LAUNCH_MS (a launch), not still sinking into a gather. */
export const LAUNCH_MS = 100;
/** The apex is fitted once the hips have fallen this far (m) from their highest: ~80 ms past a ballistic top. */
export const APEX_CONFIRM_M = 0.03;
/** The apex parabola is fitted to the hip samples this close (ms) to the highest one. */
export const APEX_FIT_MS = 130;
/**
 * A touch-down in a flight only counts with the hips back within this (m) of their take-off height, and not climbing
 * faster than LAND_MAX_VY (m/s): a body lands falling. The owner's dunk hovers a foot 3 cm under hips rising 2.6 m/s.
 */
export const LAND_HIP_MARGIN_M = 0.15;
export const LAND_MAX_VY = 0.5;
/**
 * Past the top the hips only fall until a foot takes the weight: a jump whose hips have come down at least
 * LAND_DROP_SHARE of the way from their top to their take-off height and are no longer falling faster than
 * LAND_STOP_VY (m/s) has landed, whatever the contact lines say. In the air, past the apex call (3 cm under the top,
 * ~80 ms on) ballistic hips fall at ≥ 0.8 m/s and faster every frame; a touch-down stops them at the bottom of the
 * absorb. (The owner's video-solved hop drifts down at only 0.46 m/s just before its feet land: −0.5 cut it 2 frames
 * early, so the line is at nearly stopped.)
 * (A foot read 4–8 cm up on a tilted lens or a bad floor never crossed FOOT_ON_M, and the next jump's push was taken
 * for the same flight's climb: 118 cm.) Halfway, not "under the take-off": on that lens the take-off's hips read 10 cm
 * low and the landing's 4 cm high.
 */
export const LAND_DROP_SHARE = 0.5;
export const LAND_STOP_VY = -0.2;
/**
 * A floor is re-levelled on feet at rest only: the lower foot's raw height moving slower than this (m/s, its slope over
 * the last FOOT_REST_FRAMES). A foot in the air moves ≥ 1 m/s; a planted one's slope reads 0.14 m/s of jitter (0.28 at
 * twice the synth's noise, where a range test on 3 frames refused every landing and the next jump was never seen).
 */
export const FOOT_REST_V = 0.5;
export const FOOT_REST_FRAMES = 5;
/**
 * No flight lasts longer (ms): a 1.1 s flight is a 1.48 m jump (g·t²/8), past any standing vertical (elite ~1.2 m,
 * 0.99 s; the owner's best take 0.9 s). Longer "flights" are a floor read too low.
 */
export const MAX_FLIGHT_MS = 1100;
/**
 * No foot down for SETTLE_MS while the lower foot and the hips hold still (SD under SETTLE_SD_M, filtered) is a body
 * standing on a floor read too low: a ballistic body moves ≥ 3 cm (SD) over any 300 ms, a planted one ~0.3–0.8 cm.
 */
export const SETTLE_MS = 300;
export const SETTLE_SD_M = 0.012;
/**
 * A dip: the hips at least this far (m) below the standing height, then turning up by DIP_TURN_M. A jog bounces 3 cm;
 * the book's gather wants the hips low (The Art of Dunking ch. 7: "gather depth near 90°", ~30–40 cm).
 */
export const DIP_MIN_M = 0.06;
export const DIP_TURN_M = 0.02;
/** Squat depth 1 = the hips lowered this share of the leg: a parallel squat puts the hip at about knee height. */
export const SQUAT_FULL_SHARE = 0.45;
/**
 * The standing hip height (dips, squat, the penultimate's depth are read below it) starts at the calibration's and
 * rises to any taller stand held still on both feet for STAND_HOLD_MS (the filtered hips within STAND_RANGE_M): a
 * stand taken in a ready crouch read every dip 15 cm shallow and a 20 cm gather as none. Longer than a calf raise at
 * the top of a squat (0.4 s held in the review's stream); it never lowers (a crouch held is not a stand).
 */
export const STAND_HOLD_MS = 600;
export const STAND_RANGE_M = 0.02;
/** …by at least this (m): the hips' read at a still stand wanders ~1 cm with the floor's re-anchor, a crouch is ≥ 5 cm. */
export const STAND_RAISE_M = 0.03;

// ── rates ────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Every rate (the arm events, kicks, the hips' speed) is a difference over ±this (ms): ±1 frame at 30 fps, ±2 at 60.
 * By frame count, 60 fps halved the span and doubled the speed noise: 19 punches, strikes and releases with no truth
 * on the 12 takes (raw world wrist jitter 1.5 cm over 33 ms is 0.7 m/s against a 2.5 m/s punch).
 */
export const VEL_HALF_MS = 33;

// ── steps ────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Steps are read on their own lines (stepTrack), lower than the jump's: a foot lifted STEP_LIFT_M above its own stance
 * level for STEP_MIN_SWING_MS, then back within STEP_DOWN_M — or under the lift line and still (STEP_STILL_V). A
 * sideways walk lifts its feet only 3–6 cm for 0.4–0.6 s (shuffle_lateral), a jog 9–20 cm for ~0.3 s and plants them
 * anywhere from 0 to 4 cm (CMU's sloppy feet); a planted foot's filtered jitter (~0.7 cm, 3.5 σ under the line) crosses
 * it for a frame or two at most. The stance level follows the planted foot (STANCE_TAU_MS), within ±STANCE_CLAMP_M.
 */
export const STEP_LIFT_M = 0.025;
export const STEP_DOWN_M = 0.015;
export const STEP_MIN_SWING_MS = 100;
export const STEP_STILL_V = 0.25;
export const STANCE_TAU_MS = 400;
export const STANCE_CLAMP_M = 0.025;
/** Cadence is read over the last this-many steps, all inside CADENCE_WINDOW_MS. */
export const CADENCE_STEPS = 4;
export const CADENCE_WINDOW_MS = 2500;
/** The penultimate is looked for among the steps this long (ms) before the take-off: an approach's last 3–4 steps. */
export const PENULT_WINDOW_MS = 1500;

// ── arms and legs ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * "Overhead" = the wrist above the ears plus this (m): the truth's line is the Head joint + 0.15 m, and the synth's ears
 * sit 0.07 m above that joint, so the crown is ears + 0.08 m.
 */
export const HEAD_LINE_ABOVE_EARS_M = 0.08;
/**
 * Arm events' minimum peak speeds (m/s, the wrist relative to its shoulder): the truth's (synth.ts DEFAULT_GT), except
 * the release's: a set shot's slow push reads ~15 % under the truth through the One Euro (its cutoff stays low at
 * 1 m/s), so the truth's 0.8 m/s is 0.7 here.
 */
export const STRIKE_MIN = 1.5;
export const REACH_MIN = 1.5;
export const RELEASE_MIN = 0.7;
export const PUNCH_MIN = 2.5;
/** The push around the release's fastest frame: down to this share of it. */
export const RELEASE_REGION = 0.6;
/**
 * The release's overhead stretch starts this far (m) under the head line: a set point sits right at the crown, and
 * the line itself (ears + 8 cm, from jittery world points) wobbles ~2 cm, which put the dribble jumper's set point
 * under it and made its push a "reach".
 */
export const RELEASE_LINE_TOL_M = 0.03;
/** A release is told this long (ms) after its fastest push (or when the arm comes down): a follow-through holds ~0.5 s. */
export const RELEASE_SETTLE_MS = 250;
/** A punch is an extension run (radial speed above this, m/s) that reaches PUNCH_REACH of the arm within PUNCH_REACH_MS. */
export const PUNCH_RUN_V = 1.0;
export const PUNCH_REACH = 0.85;
export const PUNCH_REACH_MS = 150;
/**
 * A punch's speed is read on the RAW world points: it leaves from rest, where the One Euro lags most (the filtered
 * reach put the noise-free jab's peak 1–2 frames late).
 */
export const PUNCH_RAW = true;
/** A kick: the ankle past KICK_LIFT_M, topping KICK_TOP_M, the leg near straight, swung at KICK_MIN (m/s): synth.ts DEFAULT_GT. */
export const KICK_LIFT_M = 0.3;
export const KICK_TOP_M = 0.5;
export const KICK_MIN = 2.0;
export const KICK_STRAIGHT = 0.85;

/** How much history the reader keeps (ms): the longest look-back (the cadence window). */
const HISTORY_MS = 3000;

// ── types ────────────────────────────────────────────────────────────────────────────────────────────────────────

export type Hand = 'L' | 'R';
export type { FootSide } from './calibrate';
export interface V3 { x: number; y: number; z: number }

/**
 * The rulers the reads are measured with: the calibration's, held (an edge-on body does not change them), with the live
 * metre ruler and the live standing hip height (lifted by a taller stand than the calibration's).
 */
export type Rulers = Pick<Calibration, 'mPerX' | 'mPerY' | 'shoulderWidth' | 'shoulderWidthM' | 'hipHeightM' | 'legLengthM' | 'centreX' | 'hipY' | 'floorY'>;

export interface FootRead {
  /** Height of the foot's lowest point above the floor (m). */
  heightM: number;
  contact: boolean;
}
export interface WristRead {
  /** Image position (0..1, y down). */
  x: number;
  y: number;
  /** Height above the floor (m); null until calibrated. */
  heightM: number | null;
  /** Position relative to its shoulder (m; x image-right, y UP, z toward the camera). */
  rel: V3;
  /** Velocity relative to its shoulder (m/s, same axes): the arm's own swing, whatever the body does; null on the first frames. */
  vRel: V3 | null;
  /** Velocity in the room (m/s, same axes): the arm plus the body under it; null until calibrated. */
  vWorld: V3 | null;
  /** Above the head line (the crown). */
  overhead: boolean;
}
export interface BodyRead {
  /** Capture time (ms). */
  t: number;
  present: boolean;
  /** Mean visibility of the core points; null without a body. */
  conf: number | null;
  calibrated: boolean;
  /** A body is here and readable (hips and feet): true through an edge-on turn, false when absent or unsure. */
  tracking: boolean;
  rulers: Rulers | null;
  /** The hip midpoint: image (filtered), metres above the floor, vertical speed (m/s, up +). */
  hip: { x: number; y: number; heightM: number | null; vy: number | null } | null;
  feet: { L: FootRead; R: FootRead } | null;
  /** Both feet off the floor. */
  airborne: boolean | null;
  /**
   * Knee height relative to its own hip (m, up +: −thigh standing, 0 = thigh level) and the drive in thighs (0 standing
   * … 1 thigh level: the book's knee drive), null until calibrated.
   */
  knee: { L: { relHipM: number; drive: number | null }; R: { relHipM: number; drive: number | null } } | null;
  wrist: { L: WristRead; R: WristRead } | null;
  /** Elbow angles (deg, 180 = straight). */
  elbowDeg: { L: number; R: number } | null;
  /**
   * sideSw: the hips' offset from the calibrated centre in shoulder widths (+ = toward the player's own right).
   * trunkDeg: the torso's tilt in the image plane (+ = shoulders toward the player's right); trunkFwdDeg: toward the
   * camera (+ = leaning in toward the lens, from the world landmarks, along gravity; null without them).
   */
  lean: { sideSw: number; trunkDeg: number; trunkFwdDeg: number | null } | null;
  /** 0 standing … 1 a parallel squat (null in the air). */
  squat: number | null;
  /**
   * The torso's turn: widthRatio = the shoulders' span across the lens / their span facing it (~cos yaw); nearSide =
   * the shoulder nearer the camera (null when square to it); deg = the yaw from the world shoulders (0 facing, ±90
   * edge-on, ±180 back to the camera; + = turned to the player's left).
   */
  yaw: { widthRatio: number; nearSide: Hand | null; deg: number } | null;
}

interface Ev { t: number; /** capture time of the frame that produced the event */ seen: number }
export type BodyEvent =
  /**
   * v0: the hips' launch speed (m/s), a gravity-fixed parabola through the flight's frames so far (an early guess for
   * a big jump told 2 frames in, exact for a small one told near its top); predictedHeightM = v0²/2g. The landing's
   * heightM (from the flight time) is the measured one.
   */
  | (Ev & { kind: 'takeoff'; feet: 'one' | 'two'; foot: FootSide | 'both'; v0: number; predictedHeightM: number })
  | (Ev & { kind: 'apex'; hipM: number; riseM: number })
  | (Ev & { kind: 'land'; flightMs: number; heightM: number; firstFoot: FootSide | 'both' })
  | (Ev & { kind: 'dip'; depthM: number })
  | (Ev & { kind: 'step'; foot: FootSide; cadenceHz: number | null })
  | (Ev & { kind: 'penultimate'; foot: FootSide; depthM: number; contactMs: number })
  | (Ev & { kind: 'reach'; hand: Hand; speed: number })
  /**
   * airborne: both feet were off the floor at the strike's instant (null when the feet were not read). A slam is a
   * strike in the air; the arms swung down from overhead as the feet land are a strike too (the truth's), on the floor.
   */
  | (Ev & { kind: 'strike'; hand: Hand; speed: number; airborne: boolean | null })
  /** airborne: a jump shot's release (in the air) or a set shot's (on the floor); null when the feet were not read. */
  | (Ev & { kind: 'release'; hand: Hand; speed: number; airborne: boolean | null })
  | (Ev & { kind: 'punch'; hand: Hand; speed: number })
  | (Ev & { kind: 'kick'; foot: FootSide; speed: number })
  | (Ev & { kind: 'lost'; lastSeen: number })
  | (Ev & { kind: 'found'; goneMs: number });
export type BodyEventKind = BodyEvent['kind'];

export interface BodyReaderOptions {
  /** Start calibrated (the space check's calibration). */
  calibration?: Calibration;
  /** Take the first still window as the calibration when there is none (default true). */
  autoCalibrate?: boolean;
  /** One Euro parameters; false = read the raw landmarks. */
  filter?: { image?: OneEuroParams; world?: OneEuroParams } | false;
}

// ── internals ────────────────────────────────────────────────────────────────────────────────────────────────────

/** One present frame's numbers, kept for look-backs. Raw = the landmarks as they came; f = through the One Euro. */
interface Sample {
  t: number;
  hipRaw: number | null;              // hip midpoint above the floor (m), from the raw landmarks
  hip: number | null;                 // …through the One Euro
  hipY: number;                       // raw hip midpoint image y
  dropRaw: [number, number] | null;   // each foot's lowest point below the hips (world, m)
  footRaw: [number, number] | null;   // each foot's height above the floor (m), raw
  foot: [number, number] | null;      // …filtered
  contact: [boolean, boolean] | null;
  relY: [number, number] | null;      // wrist above its shoulder (world, m, up +)
  wristUp: [number, number] | null;   // wrist above the hip midpoint (m)
  wristSeen: [boolean, boolean] | null; // the model is sure of the wrist (in frame, not hidden)
  headUp: number | null;              // the crown line above the hip midpoint (m)
  reach: [number, number] | null;     // |wrist − shoulder| (m), filtered
  reachRaw: [number, number] | null;  // …raw: a punch starts from rest, where the filter lags most
  ankle: [V3, V3] | null;             // world ankles relative to the hips (m, y UP)
  kneeStraight: [number, number] | null;
  wristRel: [V3, V3] | null;          // wrist − its shoulder (m, the reader's axes)
  wristRoom: [V3, V3] | null;         // wrist in the room: hips' image offset × ruler + world (m); null uncalibrated
}

interface FlightState {
  tOff: number;
  feet: 'one' | 'two';
  foot: FootSide | 'both';
  hipOff: number;
  confirmed: boolean;
  apexDone: boolean;
  topHip: number;
  /** When the (filtered) contact saw the first foot back down; the landing is told LAND_SETTLE_MS later. */
  downDet: number | null;
  /** When each foot was first seen back down in this landing (it may bounce up again before the landing is told). */
  downFoot: [number | null, number | null];
  /** The apex's instant once told. */
  apexT: number | null;
  /** The body was lost for a while in this flight (held through it): the apex is fitted across the gap. */
  gap: boolean;
}

interface StepRec { foot: FootSide; tDown: number; tUp: number | null; minHip: number }

interface ArmRun { dir: 1 | -1; bestV: number; bestT: number; high: boolean; startHigh: boolean; emitted: boolean }

const SIDES: FootSide[] = ['L', 'R'];
const HANDS: Hand[] = ['L', 'R'];
const idx = (s: FootSide | Hand) => (s === 'L' ? 0 : 1);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** Least-squares slope (per ms → per s) of ys over ts. */
function slope(ts: number[], ys: number[]): number | null {
  const n = ts.length;
  if (n < 2) return null;
  const mt = ts.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (ts[i] - mt) * (ys[i] - my); den += (ts[i] - mt) ** 2; }
  return den > 0 ? (num / den) * 1000 : null;
}

/** Least-squares parabola y = a + b·τ + c·τ² (τ in s about t0): the vertex (t ms, y), or null when it does not bend down. */
function vertex(ts: number[], ys: number[], t0: number): { t: number; y: number } | null {
  const n = ts.length;
  if (n < 3) return null;
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, y0 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) {
    const x = (ts[i] - t0) / 1000, y = ys[i];
    s0 += 1; s1 += x; s2 += x * x; s3 += x ** 3; s4 += x ** 4; y0 += y; y1 += x * y; y2 += x * x * y;
  }
  // normal equations [s0 s1 s2; s1 s2 s3; s2 s3 s4]·[a b c] = [y0 y1 y2], by Cramer
  const det3 = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const M = [[s0, s1, s2], [s1, s2, s3], [s2, s3, s4]], D = det3(M);
  if (Math.abs(D) < 1e-12) return null;
  const a = det3([[y0, s1, s2], [y1, s2, s3], [y2, s3, s4]]) / D;
  const b = det3([[s0, y0, s2], [s1, y1, s3], [s2, y2, s4]]) / D;
  const c = det3([[s0, s1, y0], [s1, s2, y1], [s2, s3, y2]]) / D;
  if (!(c < 0)) return null;
  const x = -b / (2 * c);
  return { t: t0 + x * 1000, y: a + b * x + c * x * x };
}

/**
 * Least-squares launch of a body under gravity through (τ ms after t0, y m) samples: y = y0 + v·τ − g·τ²/2. With y0
 * given it fits v alone (a line through the origin); without, both. The vertex follows: τ = v/g, y0 + v²/2g.
 */
function ballistic(ts: number[], ys: number[], t0: number, y0: number | null): { v: number; y0: number } | null {
  const n = ts.length;
  if (n < (y0 === null ? 2 : 1)) return null;
  let s1 = 0, s2 = 0, sy = 0, sty = 0;
  for (let i = 0; i < n; i++) {
    const x = (ts[i] - t0) / 1000, z = ys[i] + (G * x * x) / 2;   // take gravity out: z = y0 + v·x
    s1 += x; s2 += x * x; sy += z; sty += x * z;
  }
  if (y0 !== null) return s2 > 0 ? { v: (sty - y0 * s1) / s2, y0 } : null;
  const den = n * s2 - s1 * s1;
  if (!(Math.abs(den) > 1e-12)) return null;
  const v = (n * sty - s1 * sy) / den;
  return { v, y0: (sy - v * s1) / n };
}

const sub = (a: Wm, b: Wm): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (v: V3) => Math.hypot(v.x, v.y, v.z);
/**
 * World (y down, z away, turned with the camera) → the reader's axes: x image-right, y UP along gravity, z toward the
 * camera level with the floor (the lens pitch taken out).
 */
const lev = (v: V3, t: Tilt): V3 => ({ x: v.x, y: -downW(v, t), z: -(v.z * t.c - v.y * t.s) });
const angleDeg = (a: V3, b: V3) => {
  const d = (a.x * b.x + a.y * b.y + a.z * b.z) / Math.max(1e-9, len(a) * len(b));
  return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI;
};

// ── the reader ───────────────────────────────────────────────────────────────────────────────────────────────────

export class BodyReader {
  private cal: Calibration | null = null;
  private readonly gate = new StillnessGate();
  private readonly filt: PoseFilter | null;
  private readonly auto: boolean;
  private hist: Sample[] = [];
  private lastSeen: number | null = null;
  private lastT: number | null = null;
  private lastRead: BodyRead | null = null;
  private lost = false;
  /** A flight was held through a loss: the first frame back decides whether it is still in the air. */
  private resumed = false;
  /** A jump in the air lost sight of its feet (out of the frame): the first frame they are back decides. */
  private blind = false;
  // the camera's frame step (ms, the median of the last few), which turns VEL_HALF_MS into frames
  private stepMs = 1000 / 30;
  private stepBuf: number[] = [];
  // the rulers in play: the live metre ruler (per image height), the lens height the hips are read from, the lens
  // pitch and the image row level with the lens
  private mLive = 0;
  private mBuf: number[] = [];
  private lensH = 0;
  private tilt: Tilt = LEVEL;
  private horizonY = HORIZON_Y;
  /** The standing hip height (m): the calibration's, lifted by a taller stand held still (STAND_HOLD_MS). */
  private standH = 0;
  // feet
  private contact: [boolean, boolean] | null = null;
  private liftDet: [number, number] = [-Infinity, -Infinity];
  private plantT: [number, number] = [-Infinity, -Infinity];
  private stanceH: [number, number] = [0, 0];
  private swing: ({ det: number; jumped: boolean } | null)[] = [null, null];
  private flight: FlightState | null = null;
  private lastLand = -Infinity;
  private steps: StepRec[] = [];
  // dip
  private dip: { t: number; h: number } | null = null;
  private dipArmed = true;
  // arms
  private vRun: (ArmRun | null)[] = [null, null];
  private highRun: ({ emitted: boolean; pts: { t: number; v: number }[]; slowing: boolean } | null)[] = [null, null];
  private punch: ({ bestV: number; bestT: number; emitted: boolean } | null)[] = [null, null];
  private kick: ({ bestV: number; bestT: number; straight: number; top: number; emitted: boolean } | null)[] = [null, null];
  private footEuro: [OneEuro, OneEuro] = [new OneEuro(WORLD_EURO), new OneEuro(WORLD_EURO)];

  constructor(readonly opts: BodyReaderOptions = {}) {
    this.auto = opts.autoCalibrate ?? true;
    this.filt = opts.filter === false ? null : new PoseFilter(opts.filter?.image ?? IMAGE_EURO, opts.filter?.world ?? WORLD_EURO);
    if (opts.calibration) this.setCalibration(opts.calibration);
  }

  get calibration(): Calibration | null { return this.cal; }

  /** Calibrate now on the still window the reader has been keeping (or refuse, saying why). */
  calibrate(): CalibrationResult {
    const r = calibrate([...this.gate.window]);
    if (r.ok) this.setCalibration(r.cal);
    return r;
  }
  /** Drop the rulers; the next still window (auto) or calibrate() takes new ones. */
  recalibrate(): void { this.cal = null; this.gate.reset(); this.resetMotion(); }
  /** Use a calibration taken elsewhere (the space check's). */
  setCalibration(cal: Calibration): void {
    this.cal = cal;
    this.mLive = cal.mPerY; this.mBuf = [];
    this.tilt = tiltOf(cal.pitchDeg);
    this.horizonY = HORIZON_Y - FOCAL_Y * (this.tilt.s / this.tilt.c);
    this.lensH = cal.hipHeightM + (cal.hipY - this.horizonY) * cal.mPerY * this.tilt.c;
    this.standH = cal.hipHeightM;
    this.resetMotion();
  }
  /** Back to new: no calibration (unless one was given), no history. */
  reset(): void {
    this.cal = null;
    this.gate.reset();
    this.filt?.reset();
    this.lastSeen = null; this.lastT = null; this.lastRead = null; this.lost = false;
    this.stepMs = 1000 / 30; this.stepBuf = [];
    this.tilt = LEVEL; this.horizonY = HORIZON_Y;
    this.resetMotion();
    if (this.opts.calibration) this.setCalibration(this.opts.calibration);
  }

  private resetMotion(): void {
    this.hist = [];
    this.contact = null; this.liftDet = [-Infinity, -Infinity]; this.plantT = [-Infinity, -Infinity]; this.stanceH = [0, 0]; this.swing = [null, null];
    this.flight = null; this.lastLand = -Infinity; this.steps = []; this.dip = null; this.dipArmed = true; this.resumed = false; this.blind = false;
    this.vRun = [null, null]; this.highRun = [null, null]; this.punch = [null, null]; this.kick = [null, null];
    this.footEuro[0].reset(); this.footEuro[1].reset();
  }

  read(frame: PoseFrame): { read: BodyRead; events: BodyEvent[] } {
    const ev: BodyEvent[] = [];
    const t = frame.t;
    // a frame older than (or the same as) the last one read: its news is already told, and read out of order it made
    // the history run backwards (a swapped pair moved a take-off 32 ms and its height 13 cm)
    if (this.lastT !== null && !(t > this.lastT)) return { read: this.lastRead ?? this.absent(t), events: ev };
    this.lastT = t;
    // ── presence ──
    if (!frame.present || !frame.image.length) {
      if (!this.lost && this.lastSeen !== null && t - this.lastSeen > LOST_MS) this.markLost(t, t, ev);
      this.gate.add(frame);
      return { read: (this.lastRead = this.absent(t)), events: ev };
    }
    // frames that never came (a stalled camera) count as absence too
    if (!this.lost && this.lastSeen !== null && t - this.lastSeen > LOST_MS) this.markLost(this.lastSeen + LOST_MS, t, ev);
    if (this.lost) {
      ev.push({ kind: 'found', t, seen: t, goneMs: t - (this.lastSeen ?? t) });
      this.lost = false;
      // a jump held through the loss flies on only if it still can
      if (this.flight && t - this.flight.tOff > MAX_FLIGHT_MS) this.resetMotion();
      else if (this.flight) { this.flight.gap = true; this.resumed = true; }
    }
    const prevT = this.hist.length ? this.hist[this.hist.length - 1].t : null;
    if (prevT !== null && t - prevT < 200) {
      this.stepBuf.push(t - prevT);
      if (this.stepBuf.length > 9) this.stepBuf.shift();
      this.stepMs = median(this.stepBuf);
    }
    this.lastSeen = t;
    // the still window is judged only while it can still calibrate; afterwards it is only kept (calibrate())
    if (!this.cal && this.auto) {
      const r = this.gate.push(frame);
      if (r.ok) this.setCalibration(r.cal);
    } else this.gate.add(frame);

    const f = this.filt ? this.filt.filter(frame) : frame;
    if (this.cal) this.updateRuler(frame);
    const s = this.sample(frame, f);
    this.hist.push(s);
    while (this.hist.length > 2 && t - this.hist[0].t > HISTORY_MS) this.hist.shift();

    if (this.cal && s.foot && s.footRaw && s.hip !== null) {
      this.feetAndFlight(s, ev);
      this.reanchor();
    } else if (this.flight?.confirmed && !this.flight.downDet) this.blind = true;
    this.arms(ev);
    if (this.cal) this.kicks(ev);
    ev.sort((a, b) => a.t - b.t);
    return { read: (this.lastRead = this.buildRead(frame, f, s)), events: ev };
  }

  private markLost(at: number, seen: number, ev: BodyEvent[]): void {
    // REVIEW (2026-09-24): a touch-down already seen is a landing, told now from the frames held before they are
    // dropped: a stall or a dropout inside its LAND_SETTLE_MS threw it away, a take-off that never landed (and the
    // measured jump with it). Told before 'lost', so the events stay in time order on the absent-frame path.
    if (this.flight?.confirmed && this.flight.downDet !== null) this.landingDue(seen, ev, true);
    ev.push({ kind: 'lost', t: at, seen, lastSeen: this.lastSeen ?? at });
    this.lost = true;
    this.filt?.reset();
    this.footEuro[0].reset(); this.footEuro[1].reset();
    // a jump in the air is held (a big jump out of the top of the frame comes back down into it); anything else in
    // progress is unknown now
    if (this.flight?.confirmed && !this.flight.downDet) return;
    this.resetMotion();
  }

  /** Frames spanning ±VEL_HALF_MS at the camera's rate (≥ 1). */
  private get vk(): number { return Math.max(1, Math.round(VEL_HALF_MS / this.stepMs)); }
  /**
   * The last 2·vk + 1 present samples: 2·VEL_HALF_MS at the camera's rate (3 at 30 fps, 5 at 60). By count, not by
   * time, so a missed frame widens the span instead of leaving a two-point slope of raw jitter.
   */
  private recent(): Sample[] { return this.hist.slice(-(2 * this.vk + 1)); }

  private absent(t: number): BodyRead {
    return {
      t, present: false, conf: null, calibrated: !!this.cal, tracking: false, rulers: this.rulers(), hip: null, feet: null,
      airborne: null, knee: null, wrist: null, elbowDeg: null, lean: null, squat: null, yaw: null,
    };
  }

  private rulers(): Rulers | null {
    const c = this.cal;
    return c ? {
      mPerX: this.mLive * (c.mPerX / c.mPerY), mPerY: this.mLive, shoulderWidth: c.shoulderWidth, shoulderWidthM: c.shoulderWidthM,
      hipHeightM: this.standH, legLengthM: c.legLengthM, centreX: c.centreX, hipY: c.hipY, floorY: c.floorY,
    } : null;
  }

  // ── rulers ──

  /**
   * The live ruler, from the torso (world height ÷ image height) while shoulders and hips are seen inside the frame.
   * An edge-on torso still has its height, so a turn does not move it; a torso leaving the frame holds the last one.
   */
  private updateRuler(raw: PoseFrame): void {
    const c = this.cal!, im = raw.image;
    const seen = [LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP].every((i) => im[i].v >= SEEN_VIS && im[i].y >= 0 && im[i].y <= 1);
    const m = seen ? rulerY(raw) : null;
    if (m === null || Math.abs(m / c.mPerY - 1) > RULER_SPAN) return;
    this.mBuf.push(m);
    if (this.mBuf.length > RULER_FRAMES) this.mBuf.shift();
    this.mLive = median(this.mBuf);
  }

  /** Pull the lens height toward the world skeleton's hips-above-the-planted-feet, judged with a little hindsight. */
  private reanchor(): void {
    const h = this.hist, n = h.length, k = n - 1 - REANCHOR_HINDSIGHT;
    if (k < 1 || this.flight) return;
    const s = h[k];
    if (!s.dropRaw) return;
    const planted = [0, 1].filter((i) => h.slice(k - 1).every((x) => x.contact?.[i]));
    if (!planted.length) return;
    const drop = planted.reduce((a, i) => a + s.dropRaw![i], 0) / planted.length;
    const lensObs = drop + (s.hipY - this.horizonY) * this.mLive * this.tilt.c;
    const a = 1 - Math.exp(-(s.t - h[k - 1].t) / REANCHOR_TAU_MS);
    this.lensH += a * (lensObs - this.lensH);
  }

  /**
   * The floor was read `by` metres too low (planted feet read that high): lower every height by it at once, the kept
   * history too (the edge searches look back across the change), and let the foot filters start from the new level.
   */
  private relevel(by: number, s: Sample): void {
    this.lensH -= by;
    for (const x of this.hist) {
      if (x.hipRaw !== null) x.hipRaw -= by;
      if (x.hip !== null) x.hip -= by;
      if (x.footRaw) { x.footRaw[0] -= by; x.footRaw[1] -= by; }
      if (x.foot) { x.foot[0] -= by; x.foot[1] -= by; }
      if (x.wristRoom) { x.wristRoom[0].y -= by; x.wristRoom[1].y -= by; }
    }
    this.footEuro[0].reset(); this.footEuro[1].reset();
    this.stanceH = [0, 0];
    const now: [boolean, boolean] = [s.foot![0] < FOOT_OFF_M, s.foot![1] < FOOT_OFF_M];
    for (const i of [0, 1]) if (now[i] && !this.contact?.[i]) this.plantT[i] = s.t;
    s.contact = now;
    this.contact = now;
  }

  // ── per-frame numbers ──

  private hipHeight(f: PoseFrame): number | null {
    return this.cal ? this.lensH - (hipMidImg(f.image).y - this.horizonY) * this.mLive * this.tilt.c : null;
  }

  private sample(raw: PoseFrame, f: PoseFrame): Sample {
    const c = this.cal;
    const hipRaw = this.hipHeight(raw), hip = this.hipHeight(f);
    const tl = this.tilt;
    // a leg out of the frame from the knee down is unknown, not guessed: MediaPipe's points there are its extrapolation
    // from nothing (the review's player stepping 1.4 m nearer after the stand read every frame's feet as "known")
    const feetSeen = footInFrame(raw.image, 'L') && footInFrame(raw.image, 'R');
    const drops = (fr: PoseFrame) => (fr.world ? SIDES.map((sd) => footDropW(fr, sd, tl)!) as [number, number] : null);
    const dropRaw = drops(raw);
    // without world landmarks: each foot against its own image floor line
    const heights = (fr: PoseFrame, hp: number | null, d: [number, number] | null): [number, number] | null => {
      if (!c || hp === null || !feetSeen) return null;
      return d ? [hp - d[0], hp - d[1]] : SIDES.map((sd) => (c.floorY[sd] - footLowImg(fr.image, sd)) * this.mLive) as [number, number];
    };
    const s: Sample = {
      t: raw.t, hipRaw, hip, hipY: hipMidImg(raw.image).y, dropRaw,
      footRaw: heights(raw, hipRaw, dropRaw), foot: null, contact: null,
      relY: null, wristUp: null, wristSeen: null, headUp: null, reach: null, reachRaw: null, ankle: null, kneeStraight: null, wristRel: null, wristRoom: null,
    };
    // the contact signal: each foot's raw height through its own One Euro. (A height made of separately filtered hips
    // and feet undershoots when their lags differ: a foot hovering 4.5 cm up read 2.4 cm and "landed".)
    if (s.footRaw) s.foot = [this.footEuro[0].filter(s.footRaw[0], raw.t), this.footEuro[1].filter(s.footRaw[1], raw.t)];
    const w = f.world;
    if (w) {
      // every up is gravity's up: a lens pitched 13° otherwise reads 22 % of an arm's reach toward it as a lift
      const ears = [LEFT_EAR, RIGHT_EAR].filter((i) => f.image[i].v >= SEEN_VIS);
      const earD = ears.length ? ears.reduce((a, i) => a + downW(w[i], tl), 0) / ears.length : downW(w[NOSE], tl);
      s.headUp = -earD + HEAD_LINE_ABOVE_EARS_M;
      s.relY = HANDS.map((h) => downW(w[ARM[h].shoulder], tl) - downW(w[ARM[h].wrist], tl)) as [number, number];
      s.wristUp = HANDS.map((h) => -downW(w[ARM[h].wrist], tl)) as [number, number];
      s.wristSeen = HANDS.map((h) => raw.image[ARM[h].wrist].v >= SEEN_VIS) as [boolean, boolean];
      s.reach = HANDS.map((h) => len(sub(w[ARM[h].wrist], w[ARM[h].shoulder]))) as [number, number];
      const wr = raw.world;
      if (wr) s.reachRaw = HANDS.map((h) => len(sub(wr[ARM[h].wrist], wr[ARM[h].shoulder]))) as [number, number];
      s.ankle = SIDES.map((sd) => lev(w[FOOT[sd].ankle], tl)) as [V3, V3];
      s.kneeStraight = c ? SIDES.map((sd) => len(sub(w[FOOT[sd].ankle], w[FOOT[sd].hip])) / c.legLengthM) as [number, number] : null;
      s.wristRel = HANDS.map((h) => lev(sub(w[ARM[h].wrist], w[ARM[h].shoulder]), tl)) as [V3, V3];
      if (c && hip !== null) {
        const hx = (hipMidImg(f.image).x - c.centreX) * this.mLive * (c.mPerX / c.mPerY);   // the hips' travel across the room
        s.wristRoom = HANDS.map((h) => {
          const u = lev(w[ARM[h].wrist], tl);
          return { x: hx + u.x, y: hip + u.y, z: u.z };
        }) as [V3, V3];
      }
    }
    return s;
  }

  // ── feet, flight, steps, dips ──

  /**
   * A foot's raw height at sample k through a running median of EDGE_MEDIAN frames: a median keeps a flat-then-ramp
   * kink exactly where it is (median(0, 0, 0, 5, 10) = 0, median(0, 0, 5, 10, 15) = 5) and drops lone spikes, where a
   * mean smeared a 0.7 → 9.6 cm toe-off a frame early.
   */
  private footAt(k: number, i: number): number | undefined {
    const h = this.hist, b = h[k]?.footRaw?.[i];
    if (b === undefined || EDGE_MEDIAN < 3) return b;
    // the widest odd window (up to EDGE_MEDIAN) centred on k that the kept samples allow
    for (let r = (EDGE_MEDIAN - 1) >> 1; r >= 1; r--) {
      const win: number[] = [];
      for (let d = -r; d <= r; d++) { const v = h[k + d]?.footRaw?.[i]; if (v !== undefined) win.push(v); }
      if (win.length === 2 * r + 1) return median(win);
    }
    return b;
  }

  /**
   * The instant a foot crossed its level + REFINE_M between two samples. The PAIR is picked where it crossed the level +
   * EDGE_PICK_M instead (1.7 σ of a foot's jitter above its level, so one noisy frame does not pick the wrong pair), and
   * that pair's line is then followed down to the +REFINE_M crossing — at most a frame beyond the pair.
   */
  private edge(a: { t: number; h: number }, b: { t: number; h: number }, level: number): number {
    const dt = b.t - a.t, target = level + REFINE_M;
    const u = Math.abs(b.h - a.h) > 1e-6 ? (target - a.h) / (b.h - a.h) : 0.5;
    return a.t + Math.max(-1, Math.min(1, u)) * dt;
  }

  /**
   * When a foot left the floor: its last rise through its own stance level (the median of its planted heights, so the
   * floor's offset under this foot cancels). `det` is when the (filtered) contact let go: the lift is in the frames
   * just before it.
   */
  /** How far back (ms) an edge search looks: EDGE_BEFORE_MS, or EDGE_BEFORE_FRAMES frames at a slow camera. */
  private get edgeBefore(): number { return Math.max(EDGE_BEFORE_MS, EDGE_BEFORE_FRAMES * this.stepMs); }

  private liftAt(i: number, det: number): number {
    const h = this.hist, before = this.edgeBefore;
    const planted = h.filter((x) => x.t >= this.plantT[i] && x.t < det && x.t >= det - STANCE_MS && x.footRaw).map((x) => x.footRaw![i]);
    const level = planted.length ? median(planted) : 0;
    for (let k = h.length - 1; k > 0; k--) {
      if (h[k].t > det + EDGE_AFTER_MS) continue;
      if (h[k].t < det - before) break;               // a pair straddling the window's start is still searched
      const a = this.footAt(k - 1, i), b = this.footAt(k, i);
      if (a !== undefined && b !== undefined && a <= level + EDGE_PICK_M && b > level + EDGE_PICK_M) {
        return this.edge({ t: h[k - 1].t, h: a }, { t: h[k].t, h: b }, level);
      }
    }
    return det;
  }

  /** When a foot reached the floor: its first fall through the level it landed at (the first frames on the floor). */
  private downAt(i: number, det: number): number {
    const h = this.hist, before = this.edgeBefore;
    const landed = h.filter((x) => x.t >= det && x.footRaw).slice(0, LANDED_FRAMES).map((x) => x.footRaw![i]);
    const level = landed.length ? median(landed) : 0;
    for (let k = 1; k < h.length; k++) {
      if (h[k].t < det - before) continue;
      if (h[k - 1].t > det + EDGE_AFTER_MS) break;
      const a = this.footAt(k - 1, i), b = this.footAt(k, i);
      if (a !== undefined && b !== undefined && a > level + EDGE_PICK_M && b <= level + EDGE_PICK_M) {
        return this.edge({ t: h[k - 1].t, h: a }, { t: h[k].t, h: b }, level);
      }
    }
    return det;
  }

  /**
   * A landing no contact line saw: each foot's first fall, after `from`, through the level it rests at NOW (its last
   * LANDED_FRAMES), as downAt reads one — relative to the foot's own level, so a floor read wrong does not move it.
   */
  private fallAt(i: number, from: number): { t: number; level: number } | null {
    const h = this.hist;
    const rest = h.slice(-LANDED_FRAMES).map((x) => x.footRaw?.[i]).filter((v): v is number => v !== undefined);
    if (!rest.length) return null;
    const level = median(rest);
    for (let k = 1; k < h.length; k++) {
      if (h[k].t <= from) continue;
      const a = this.footAt(k - 1, i), b = this.footAt(k, i);
      if (a !== undefined && b !== undefined && a > level + EDGE_PICK_M && b <= level + EDGE_PICK_M) {
        return { t: this.edge({ t: h[k - 1].t, h: a }, { t: h[k].t, h: b }, level), level };
      }
    }
    return null;
  }

  private hipAt(t: number): number {
    const h = this.hist;
    for (let k = h.length - 1; k > 0; k--) {
      if (h[k - 1].t <= t && t <= h[k].t && h[k - 1].hipRaw !== null && h[k].hipRaw !== null) {
        return lerp(h[k - 1].hipRaw!, h[k].hipRaw!, (t - h[k - 1].t) / (h[k].t - h[k - 1].t || 1));
      }
    }
    return h[h.length - 1].hipRaw ?? 0;
  }

  /** Take-off from both feet's lift instants: the last foot to leave, one foot when the other left TWO_FOOT_MS before. */
  private settleTakeoff(fl: FlightState): void {
    const lifts = [0, 1].map((i) => this.liftAt(i, this.liftDet[i]));
    const last = lifts[0] >= lifts[1] ? 0 : 1;
    const one = Math.abs(lifts[0] - lifts[1]) > TWO_FOOT_MS;
    fl.tOff = lifts[last];
    fl.feet = one ? 'one' : 'two';
    fl.foot = one ? SIDES[last] : 'both';
    fl.hipOff = this.hipAt(fl.tOff);
  }

  private feetAndFlight(s: Sample, ev: BodyEvent[]): void {
    const foot = s.foot!, hip = s.hip!;
    const prev = this.contact;
    const now: [boolean, boolean] = prev
      ? [prev[0] ? foot[0] <= FOOT_OFF_M : foot[0] < FOOT_ON_M, prev[1] ? foot[1] <= FOOT_OFF_M : foot[1] < FOOT_ON_M]
      : [foot[0] < FOOT_OFF_M, foot[1] < FOOT_OFF_M];
    let fl = this.flight;
    // a flight that has not come down yet: a foot "down" while the hips are still well above the take-off, or still
    // climbing before the top, is jitter or a video solve's foot hovering under a rising body (the owner's dunk), not
    // a landing. (Past the top a climb is a push off the floor: that body has landed.)
    if (fl && !fl.downDet && (now[0] || now[1])) {
      const vy = this.hipVy();
      if ((fl.confirmed && hip > fl.hipOff + LAND_HIP_MARGIN_M) || (!fl.apexDone && vy !== null && vy > LAND_MAX_VY)) { now[0] = false; now[1] = false; }
    }
    // the first frame back after a loss held in the air: a foot already down came down unseen, and no landing is made up
    if (this.resumed) {
      this.resumed = false;
      if (fl && !fl.downDet && (now[0] || now[1])) { this.flight = fl = null; this.lastLand = s.t; }
    }
    // the feet back in the frame after a jump lost them (a landing near the lens): already down, the landing is read
    // from the hips, which stayed in view, back through their take-off height
    if (this.blind) {
      this.blind = false;
      if (fl?.confirmed && !fl.downDet && (now[0] || now[1])) { this.forceLand(fl, s, ev); fl = null; }
    }
    s.contact = now;
    this.contact = now;
    const touched: FootSide[] = [];
    for (const sd of SIDES) {
      const i = idx(sd);
      if (!prev) { if (now[i]) this.plantT[i] = s.t; continue; }
      if (prev[i] && !now[i]) this.liftDet[i] = s.t;
      if (!prev[i] && now[i]) { touched.push(sd); this.plantT[i] = s.t; }
    }
    // REVIEW (2026-09-24): both feet off again while a landing is still settling (a rebound or a pogo, 60–100 ms on the
    // toes) is the next take-off, so that landing is told now from the frames held. Its open flight (or one closed on
    // this very frame but still read as open) refused the take-off, and a jump off a short contact went unread: no
    // take-off, no landing.
    const offNow = !!prev && (prev[0] || prev[1]) && !now[0] && !now[1];
    this.landingDue(s.t, ev, offNow);
    fl = this.flight;                                           // the landing told closes the flight

    // take-off: both feet just came off
    if (offNow && !fl) {
      fl = this.flight = {
        tOff: s.t, feet: 'two', foot: 'both', hipOff: hip, confirmed: false, apexDone: false, topHip: hip, downDet: null,
        downFoot: [null, null], apexT: null, gap: false,
      };
      this.settleTakeoff(fl);
      this.dip = null;
    }
    if (fl && !fl.downDet && !now[0] && !now[1]) {
      fl.topHip = Math.max(fl.topHip, s.hipRaw ?? hip);
      if (!fl.confirmed) {
        const v0 = this.takeoffSpeed(fl);
        // at once when the hips left fast; otherwise once the flight has lasted, risen, and turned over (a video solve's
        // squat with the feet floating ends with the hips still climbing: rising, never falling). Either way the hips
        // rose as the feet left: calibrated on the owner's real stand, his gather floated both feet 0.5 s while the
        // hips sank, and "left fast" was their climb OUT of the gather — a false jump that swallowed the dunk.
        const turned = (s.hipRaw ?? hip) < fl.topHip - APEX_CONFIRM_M;
        if ((v0 >= JUMP_V0_SURE || (s.t - fl.tOff >= MIN_FLIGHT_MS && fl.topHip - fl.hipOff >= JUMP_RISE_M && turned)) && this.launched(fl)) {
          fl.confirmed = true;
          this.settleTakeoff(fl);                               // with the frames since, the lift instants firm up
          const vL = this.launchSpeed(fl);
          ev.push({ kind: 'takeoff', t: fl.tOff, seen: s.t, feet: fl.feet, foot: fl.foot, v0: vL, predictedHeightM: (vL * vL) / (2 * G) });
          this.penultimate(fl, s.t, ev);
        }
      }
      if (fl.confirmed && !fl.apexDone && (s.hipRaw ?? hip) < fl.topHip - APEX_CONFIRM_M) this.apex(fl, s.t, ev);
    }
    if (touched.length) {
      const fromAir = !!fl && !fl.downDet && !(prev![0] || prev![1]);
      if (fl?.confirmed && (fromAir || fl.downDet)) for (const sd of touched) fl.downFoot[idx(sd)] ??= s.t;
      if (fl && fromAir) {
        if (fl.confirmed) {
          // the landing is told LAND_SETTLE_MS later, once the frames after the touch-down can pin its instant
          if (!fl.apexDone) this.apex(fl, s.t, ev);
          fl.downDet = s.t;
          this.landingDue(s.t, ev);
        } else this.flight = null;
      }
    } else if (fl && !fl.downDet && (now[0] || now[1])) this.flight = null;   // one foot never left: no flight after all
    // a landing no contact line saw: past the top the hips only fall until a foot takes the weight — so hips well down
    // from the top and no longer falling (stopped, or climbing into the next jump) have landed. A "flight" longer than
    // any jump is closed at the hips' return through the take-off height, or dropped.
    fl = this.flight;
    if (fl && !fl.downDet) {
      const vy = this.hipVy();
      const past = fl.confirmed && fl.apexDone;
      const down = past && vy !== null && vy > LAND_STOP_VY && (s.hipRaw ?? hip) < fl.topHip - LAND_DROP_SHARE * (fl.topHip - fl.hipOff);
      // …or held still since the top: no ballistic body does that for SETTLE_MS (a tilted lens read the owner's planted
      // foot 11 cm up, standing on it 0.4 s after his hop, and that "flight" swallowed the dunk after it)
      if (down || (past && s.t - (fl.apexT ?? fl.tOff) >= SETTLE_MS && this.stillFor(s, SETTLE_MS))) this.forceLand(fl, s, ev);
      else if (s.t - fl.tOff > MAX_FLIGHT_MS) {
        const back = fl.confirmed ? this.hipCross(fl.hipOff, fl.apexT ?? fl.tOff) : null;
        if (back !== null) this.tellLand(fl, back, null, s.t, ev);
        this.flight = null;
      }
    }
    if (!this.flight?.confirmed && !s.contact[0] && !s.contact[1]) this.floorCheck(s);
    this.stepTrack(s, ev);
    if (s.contact[0] || s.contact[1]) { this.dipCheck(s, ev); this.standCheck(s); }
  }

  /**
   * Tell a landing the contact lines missed (see feetAndFlight) — the body is on the floor now — then re-level the
   * floor the feet rest on.
   */
  private forceLand(fl: FlightState, s: Sample, ev: BodyEvent[]): void {
    if (!fl.apexDone) this.apex(fl, s.t, ev);
    const from = fl.apexT ?? fl.tOff;
    const falls = [0, 1].map((i) => this.fallAt(i, from));
    const firstI = falls[0] && (!falls[1] || falls[0].t <= falls[1].t) ? 0 : falls[1] ? 1 : -1;
    // no fall to be seen on either foot: the hips back through their take-off height (a body lands about as extended
    // as it left)
    const tLand = firstI >= 0 ? falls[firstI]!.t : this.hipCross(fl.hipOff, from) ?? s.t;
    const other = firstI >= 0 ? falls[1 - firstI] : null;
    this.tellLand(fl, tLand, firstI < 0 || (other && other.t - tLand <= LAND_BOTH_MS) ? 'both' : SIDES[firstI], s.t, ev);
    this.flight = null;
    // the floor under feet at rest: a jump "landed" by a jolt in the stream (the stand → take splice) leaves it be
    const lowI = s.foot![0] <= s.foot![1] ? 0 : 1;
    const rest = this.hist.slice(-FOOT_REST_FRAMES).filter((x) => x.footRaw);
    const v = slope(rest.map((x) => x.t), rest.map((x) => x.footRaw![lowI]));
    if (v === null || !(Math.abs(v) < FOOT_REST_V)) return;
    const levels = falls.filter((x): x is { t: number; level: number } => !!x).map((x) => x.level);
    this.relevel(levels.length ? Math.min(...levels) : Math.min(s.footRaw![0], s.footRaw![1]), s);
  }

  private tellLand(fl: FlightState, tLand: number, firstFoot: FootSide | 'both' | null, seen: number, ev: BodyEvent[]): void {
    const T = (tLand - fl.tOff) / 1000;
    ev.push({ kind: 'land', t: tLand, seen, flightMs: T * 1000, heightM: (G * T * T) / 8, firstFoot: firstFoot ?? 'both' });
    this.lastLand = tLand;
  }

  /** When the raw hips first fell through `level` after `from` (interpolated), or null. */
  private hipCross(level: number, from: number): number | null {
    const h = this.hist;
    for (let k = 1; k < h.length; k++) {
      const a = h[k - 1], b = h[k];
      if (b.t <= from || a.hipRaw === null || b.hipRaw === null) continue;
      if (a.hipRaw >= level && b.hipRaw < level) return lerp(a.t, b.t, (a.hipRaw - level) / (a.hipRaw - b.hipRaw || 1));
    }
    return null;
  }

  /**
   * No foot down and no jump in the air: if feet and hips have held still for SETTLE_MS, or no foot has been down for
   * MAX_FLIGHT_MS, the body stands on a floor read too low — re-level on the lower foot (its median held still, or the
   * low tenth of its heights while moving: a jogging foot is down most of the time).
   */
  /**
   * The samples of the last `ms` if the hips and the lower foot (filtered) held still over them (SETTLE_SD_M), else
   * null. The lower foot only: a body standing on one foot lets the other drift (the owner after his hop).
   */
  private stillFor(s: Sample, ms: number): Sample[] | null {
    const h = this.hist;
    if (h[0].t > s.t - ms) return null;
    const win = h.filter((x) => x.t >= s.t - ms && x.foot && x.footRaw && x.hip !== null);
    return win.length >= 3
      && Math.max(sd(win.map((x) => Math.min(x.foot![0], x.foot![1]))), sd(win.map((x) => x.hip!))) < SETTLE_SD_M ? win : null;
  }

  private floorCheck(s: Sample): void {
    const h = this.hist;
    let a = h.length - 1;
    while (a > 0 && h[a - 1].contact && !h[a - 1].contact![0] && !h[a - 1].contact![1]) a--;
    const span = s.t - h[a].t;
    if (span < SETTLE_MS) return;
    const win = this.stillFor(s, SETTLE_MS);
    if (!win && span < MAX_FLIGHT_MS) return;
    const still = !!win;
    const run = win ?? h.slice(a).filter((x) => x.footRaw);
    const low = run.map((x) => Math.min(x.footRaw![0], x.footRaw![1])).sort((p, q) => p - q);
    const by = still ? median(low) : low[Math.floor(0.1 * (low.length - 1))];
    if (this.flight && !this.flight.confirmed) this.flight = null;
    this.relevel(by, s);
  }

  /** A taller stand held still on both feet lifts the standing hip height (STAND_HOLD_MS). */
  private standCheck(s: Sample): void {
    const h = this.hist;
    if (this.flight || !s.contact![0] || !s.contact![1] || h[0].t > s.t - STAND_HOLD_MS) return;
    let lo = Infinity, hi = -Infinity;
    const hips: number[] = [];
    for (let k = h.length - 1; k >= 0 && h[k].t >= s.t - STAND_HOLD_MS; k--) {
      const x = h[k];
      if (!x.contact?.[0] || !x.contact[1] || x.hip === null) return;
      lo = Math.min(lo, x.hip); hi = Math.max(hi, x.hip); hips.push(x.hip);
    }
    if (hi - lo > STAND_RANGE_M) return;
    const m = median(hips);
    if (m > this.standH + STAND_RAISE_M) this.standH = m;
  }

  /**
   * Steps, apart from the jump's contact lines: a foot's (filtered) height STEP_LIFT_M above its own stance level for
   * STEP_MIN_SWING_MS, then back within STEP_DOWN_M of it, is a step — unless a jump flew in between (that is a
   * landing). The stance level follows the planted foot (STANCE_TAU_MS), held within ±STANCE_CLAMP_M of the floor.
   */
  private stepTrack(s: Sample, ev: BodyEvent[]): void {
    const foot = s.foot!, hip = s.hip!;
    const dt = s.t - (this.hist[this.hist.length - 2]?.t ?? s.t);
    for (const sd of SIDES) {
      const i = idx(sd), rel = foot[i] - this.stanceH[i];
      const sw = this.swing[i];
      if (!sw) {
        // the level follows the planted foot, not a foot on its way up (a shuffle's slow 4 cm lift was chased away)
        if (rel < STEP_DOWN_M) {
          const a = 1 - Math.exp(-dt / STANCE_TAU_MS);
          this.stanceH[i] = Math.max(-STANCE_CLAMP_M, Math.min(STANCE_CLAMP_M, this.stanceH[i] + a * (foot[i] - this.stanceH[i])));
        }
        if (rel > STEP_LIFT_M) {
          const lift = this.liftAt(i, s.t);
          this.swing[i] = { det: s.t, jumped: false };
          const open = this.steps.filter((r) => r.foot === sd && r.tUp === null).pop();
          if (open) open.tUp = lift;
        }
        continue;
      }
      if (this.flight?.confirmed) sw.jumped = true;
      // down: back on its own level — or below the lift line and still (a level taken from an earlier stance can sit
      // a centimetre or two off where this foot lands: the jog's feet plant anywhere from 0 to 4 cm)
      const h2 = this.hist.slice(-3).map((x) => x.foot?.[i]);
      const still = h2.length === 3 && h2.every((x) => x !== undefined)
        && Math.abs(h2[2]! - h2[1]!) * 1000 / Math.max(1, dt) < STEP_STILL_V && Math.abs(h2[1]! - h2[0]!) * 1000 / Math.max(1, dt) < STEP_STILL_V;
      if (rel >= STEP_DOWN_M && !(rel < STEP_LIFT_M && still)) continue;
      this.swing[i] = null;
      if (sw.jumped || s.t - sw.det < STEP_MIN_SWING_MS) continue;
      const tDown = this.downAt(i, s.t);
      this.steps.push({ foot: sd, tDown, tUp: null, minHip: hip });
      ev.push({ kind: 'step', t: tDown, seen: s.t, foot: sd, cadenceHz: this.cadence() });
    }
    // the hips' low over the step in progress (the penultimate's depth)
    const cur = this.steps[this.steps.length - 1];
    if (cur && !this.flight) cur.minHip = Math.min(cur.minHip, hip);
    while (this.steps.length && s.t - this.steps[0].tDown > HISTORY_MS) this.steps.shift();
  }

  /**
   * Tell a landing once LAND_SETTLE_MS of frames have followed its touch-down — or at once (`force`) with the frames
   * already held, when no more are coming for it: the feet leave again (a rebound) or the body is lost. `now` is the
   * capture time of the frame that tells it.
   */
  private landingDue(now: number, ev: BodyEvent[], force = false): void {
    const fl = this.flight;
    if (!fl?.downDet || (!force && now - fl.downDet < LAND_SETTLE_MS)) return;
    const det = fl.downDet;
    // each foot that came down: when; the first is the landing
    const downs = [0, 1].map((i) => (fl.downFoot[i] !== null ? this.downAt(i, fl.downFoot[i]!) : null));
    const firstI = downs[0] !== null && (downs[1] === null || downs[0] <= downs[1]) ? 0 : 1;
    const tLand = downs[firstI] ?? det;
    const other = downs[1 - firstI];
    const T = (tLand - fl.tOff) / 1000;
    ev.push({
      kind: 'land', t: tLand, seen: now, flightMs: T * 1000, heightM: (G * T * T) / 8,
      firstFoot: other !== null && other - tLand <= LAND_BOTH_MS ? 'both' : SIDES[firstI],
    });
    this.lastLand = tLand;
    this.flight = null;
  }

  /**
   * The hips went UP as the feet left: their slope over the flight's first LAUNCH_MS. A body launched into the air
   * rises from the first instant; the owner's approach has both feet floated 30–50 cm while the hips were still
   * sinking into the gather (−0.7 m/s), which later "rose" 7 cm on the way out of it.
   */
  private launched(fl: FlightState): boolean {
    const h = this.hist.filter((x) => x.hipRaw !== null);
    let a = h.findIndex((x) => x.t >= fl.tOff - 20), b = h.findIndex((x) => x.t > fl.tOff + LAUNCH_MS);
    if (a < 0) return false;
    if (b < 0) b = h.length;
    // a frame or two missed at the take-off leaves the window one sample or none: reach one sample further each way
    // (with frames 12–13 of jump_two_foot_high missed, a 0.3 m jump was never confirmed)
    if (b - a < 3) { a = Math.max(0, a - 1); b = Math.min(h.length, b + 1); }
    const early = h.slice(a, b);
    const v = slope(early.map((x) => x.t), early.map((x) => x.hipRaw!));
    return v !== null && v > 0;
  }

  /** The hips' vertical speed over the last 2·VEL_HALF_MS of raw samples (m/s, up +). */
  private hipVy(): number | null {
    const r = this.recent().filter((x) => x.hipRaw !== null);
    return slope(r.map((x) => x.t), r.map((x) => x.hipRaw!));
  }

  /**
   * The take-off speed the hips show (m/s), for CONFIRMING a jump: the larger of their speed around the take-off and
   * what their climb since implies (v0² = v² + 2g·Δh, ballistic). A video solve's hips can keep rising after the feet
   * leave; the climb catches it. (The larger of two noisy guesses reads high — a ballistic 0.90 m jump read 1.05 m —
   * so the event's v0 is launchSpeed's; JUMP_V0_SURE was tuned on this one and stays on it.)
   */
  private takeoffSpeed(fl: FlightState): number {
    const around = this.hist.filter((x) => x.t >= fl.tOff - 70 && x.hipRaw !== null);
    const v = slope(around.map((x) => x.t), around.map((x) => x.hipRaw!)) ?? 0;
    const vNow = this.hipVy() ?? 0;
    const rise = (this.hist[this.hist.length - 1].hipRaw ?? fl.hipOff) - fl.hipOff;
    const e = vNow * vNow + 2 * G * rise;
    return Math.max(v, e > 0 ? Math.sqrt(e) : 0);
  }

  /**
   * The launch speed (m/s): a gravity-fixed parabola from the hips at the take-off instant through every airborne frame
   * so far. Unbiased on a ballistic body (the scripted 0.90 m jump reads 0.89–0.93 m two frames in); a video solve whose
   * hips climb at a steady 2.6 m/s after the feet leave (the owner's DeepMotion takes) still reads low, and only the
   * landing's flight time says how high those went.
   */
  private launchSpeed(fl: FlightState): number {
    const air = this.hist.filter((x) => x.t > fl.tOff && x.hipRaw !== null);
    const b = ballistic(air.map((x) => x.t), air.map((x) => x.hipRaw!), fl.tOff, fl.hipOff);
    return b ? Math.max(0, b.v) : this.takeoffSpeed(fl);
  }

  private apex(fl: FlightState, seen: number, ev: BodyEvent[]): void {
    fl.apexDone = true;
    const air = this.hist.filter((x) => x.t >= fl.tOff && x.hipRaw !== null);
    if (!air.length) return;
    const top = air.reduce((b, x) => (x.hipRaw! > b.hipRaw! ? x : b));
    const near = air.filter((x) => Math.abs(x.t - top.t) <= APEX_FIT_MS);
    const v = vertex(near.map((x) => x.t), near.map((x) => x.hipRaw!), top.t);
    const ok = v && v.t >= near[0].t && v.t <= near[near.length - 1].t;
    let tA = ok ? v!.t : top.t, hA = ok ? v!.y : top.hipRaw!;
    // the top was in a gap (the body out of the frame): the parabola under gravity through both sides of it
    const b = fl.gap ? ballistic(air.map((x) => x.t), air.map((x) => x.hipRaw!), fl.tOff, null) : null;
    if (b && b.v > 0) { tA = fl.tOff + (b.v / G) * 1000; hA = b.y0 + (b.v * b.v) / (2 * G); }
    fl.apexT = tA;
    ev.push({ kind: 'apex', t: tA, seen, hipM: hA, riseM: hA - fl.hipOff });
  }

  /** The approach's lowest-hip step before the plant: steps since the last landing, inside PENULT_WINDOW_MS. */
  private penultimate(fl: FlightState, seen: number, ev: BodyEvent[]): void {
    const steps = this.steps.filter((r) => r.tDown > this.lastLand && r.tDown < fl.tOff && fl.tOff - r.tDown <= PENULT_WINDOW_MS);
    if (steps.length < 2) return;
    // the final step (the plant) is the last touch-down; the penultimate is the lower-hip of the two before it
    const p = steps.slice(-3, -1).reduce((b, r) => (r.minHip < b.minHip ? r : b));
    ev.push({ kind: 'penultimate', t: p.tDown, seen, foot: p.foot, depthM: this.standH - p.minHip, contactMs: (p.tUp ?? fl.tOff) - p.tDown });
  }

  private cadence(): number | null {
    const last = this.steps.filter((r) => r.tDown > this.lastLand).slice(-(CADENCE_STEPS + 1));
    if (last.length < 3) return null;
    const span = last[last.length - 1].tDown - last[0].tDown;
    if (span <= 0 || span > CADENCE_WINDOW_MS) return null;
    return ((last.length - 1) * 1000) / span;
  }

  private dipCheck(s: Sample, ev: BodyEvent[]): void {
    const h = s.hip!, stand = this.standH;
    if (h > stand - DIP_MIN_M / 2) this.dipArmed = true;
    if (!this.dipArmed) return;
    if (h < stand - DIP_MIN_M && (!this.dip || h < this.dip.h)) this.dip = { t: s.t, h };
    if (this.dip && h > this.dip.h + DIP_TURN_M) {
      // the bottom, refined on the raw samples around it
      const d = this.dip;
      const near = this.hist.filter((x) => Math.abs(x.t - d.t) <= 100 && x.hipRaw !== null);
      const v = vertex(near.map((x) => x.t), near.map((x) => -x.hipRaw!), d.t);
      const tB = v && v.t >= near[0].t && v.t <= near[near.length - 1].t ? v.t : d.t;
      ev.push({ kind: 'dip', t: tB, seen: s.t, depthM: stand - d.h });
      this.dip = null;
      this.dipArmed = false;
    }
  }

  // ── arms ──

  /** Central-difference rate (per s) at sample k of a per-sample number, over ±vk frames (±VEL_HALF_MS). */
  private dAt(k: number, get: (s: Sample) => number | null | undefined): number | null {
    const h = this.hist, m = this.vk;
    if (k < m || k + m >= h.length) return null;
    const a = get(h[k - m]), b = get(h[k + m]);
    if (a == null || b == null) return null;
    return ((b - a) * 1000) / (h[k + m].t - h[k - m].t || 1);
  }

  /** Both feet off the floor at the sample nearest t (null when that sample's feet were not read). */
  private airAt(t: number): boolean | null {
    let b: Sample | null = null;
    for (const x of this.hist) if (!b || Math.abs(x.t - t) < Math.abs(b.t - t)) b = x;
    return b?.contact ? !b.contact[0] && !b.contact[1] : null;
  }

  private overAt(k: number, i: number): boolean | null {
    const s = this.hist[k];
    return s?.wristUp && s.headUp !== null ? s.wristUp[i] > s.headUp : null;
  }

  /**
   * The arm events, read vk frames behind the newest (a centred difference needs the frames after). Every speed is the
   * wrist relative to its own shoulder, so a body falling from a jump does not read as a slam.
   */
  private arms(ev: BodyEvent[]): void {
    const h = this.hist;
    const k = h.length - 1 - this.vk;
    if (k < this.vk) return;
    const s = h[k], seen = h[h.length - 1].t;
    for (const hand of HANDS) {
      const i = idx(hand);
      const v = this.dAt(k, (x) => x.relY?.[i]);
      const over = this.overAt(k, i);
      if (v === null || over === null) continue;
      // strike (a downward swing) and reach (an upward drive): one per swing, at its fastest
      const dir: 1 | -1 = v >= 0 ? 1 : -1;
      let run = this.vRun[i];
      if (!run || run.dir !== dir) {
        if (run && !run.emitted) this.endSwing(run, hand, seen, ev);
        // the turning frame (the swing's top or bottom) belongs to both runs: a slam whose wrist only just clears the
        // head line does so on the frame it turns
        const before = this.overAt(k - 1, i) ?? over;
        run = this.vRun[i] = { dir, bestV: Math.abs(v), bestT: s.t, high: over || (dir === -1 && before), startHigh: before && over, emitted: false };
      } else if (Math.abs(v) > run.bestV) { run.bestV = Math.abs(v); run.bestT = s.t; }
      run.high ||= over;
      // well past a peak fast enough to count, the swing is readable before it ends (a slow drift first does not count:
      // the owner's arm drifts down overhead at 0.6 m/s before the hammer)
      if (!run.emitted && run.high && run.bestV >= Math.min(STRIKE_MIN, REACH_MIN) && Math.abs(v) < 0.5 * run.bestV) this.endSwing(run, hand, seen, ev);
      this.release(k, i, hand, !!s.wristUp && s.headUp !== null && s.wristUp[i] > s.headUp - RELEASE_LINE_TOL_M, ev);
      this.punchAt(k, i, hand, ev);
    }
  }

  private endSwing(run: ArmRun, hand: Hand, seen: number, ev: BodyEvent[]): void {
    run.emitted = true;
    if (!run.high) return;
    if (run.dir === -1 && run.bestV >= STRIKE_MIN) ev.push({ kind: 'strike', t: run.bestT, seen, hand, speed: run.bestV, airborne: this.airAt(run.bestT) });
    if (run.dir === 1 && !run.startHigh && run.bestV >= REACH_MIN) ev.push({ kind: 'reach', t: run.bestT, seen, hand, speed: run.bestV });
  }

  /**
   * release: an upward push made with the wrist already overhead (a shot from its set point). Its speeds are gathered
   * over the overhead stretch — not while the arm is only slowing from the reach that brought it up there — and the
   * push is the run around the fastest one down to RELEASE_REGION of it; the release is that run's speed-weighted
   * middle. (A set shot's push is a plateau of ~1 m/s over 4–5 frames: its single fastest frame is whichever the
   * jitter picked, 3 frames early on the jumpshot fixture; the plateau's middle lands within one.) Told when the arm
   * comes back down or RELEASE_SETTLE_MS after the fastest push.
   */
  private release(k: number, i: number, hand: Hand, over: boolean, ev: BodyEvent[]): void {
    const h = this.hist;
    const v = this.dAt(k, (x) => x.relY?.[i]);
    let hr = this.highRun[i];
    const flush = () => {
      if (!hr || hr.emitted) return;
      hr.emitted = true;
      const pts = hr.pts;
      if (!pts.length) return;
      const top = pts.reduce((b, p, j) => (p.v > pts[b].v ? j : b), 0);
      if (pts[top].v < RELEASE_MIN) return;
      let a = top, b = top;
      while (a > 0 && pts[a - 1].v >= RELEASE_REGION * pts[top].v) a--;
      while (b < pts.length - 1 && pts[b + 1].v >= RELEASE_REGION * pts[top].v) b++;
      let sw = 0, st = 0;
      for (let j = a; j <= b; j++) { sw += pts[j].v; st += pts[j].v * pts[j].t; }
      ev.push({ kind: 'release', t: st / sw, seen: h[h.length - 1].t, hand, speed: pts[top].v, airborne: this.airAt(st / sw) });
    };
    if (!over || v === null) { if (!over) { flush(); this.highRun[i] = null; } return; }
    if (!hr) {
      // the stretch's first frame is never the push (it is the reach arriving), and until the arm speeds up again it
      // is only slowing from that reach
      hr = this.highRun[i] = { emitted: false, pts: [], slowing: true };
      return;
    }
    if (hr.emitted) return;
    if (hr.slowing) {
      const vPrev = this.dAt(k - 1, (x) => x.relY?.[i]);
      if (vPrev !== null && v < vPrev) return;               // still the reach's tail
      hr.slowing = false;
    }
    // a wrist out of the frame or hidden is 3× noisier: its jitter makes pushes of its own
    if (!h[k].wristSeen?.[i]) return;
    hr.pts.push({ t: h[k].t, v: Math.max(0, v) });
    const top = hr.pts.reduce((b, p) => (p.v > b.v ? p : b));
    if (top.v >= RELEASE_MIN && h[k].t - top.t >= RELEASE_SETTLE_MS) flush();
  }

  /** punch: an extension away from the shoulder at punching height that ends near full reach. */
  private punchAt(k: number, i: number, hand: Hand, ev: BodyEvent[]): void {
    const h = this.hist;
    const vr = this.dAt(k, (x) => (PUNCH_RAW ? x.reachRaw : x.reach)?.[i]);
    const armLen = this.cal?.armM[hand] ?? null;
    let p = this.punch[i];
    if (vr !== null && vr > PUNCH_RUN_V) {
      if (!p) p = this.punch[i] = { bestV: vr, bestT: h[k].t, emitted: false };
      else if (vr > p.bestV && !p.emitted) { p.bestV = vr; p.bestT = h[k].t; }
    }
    if (!p) return;
    if (!p.emitted && armLen) {
      const at = h.find((x) => x.t === p!.bestT);
      const far = Math.max(...h.filter((x) => x.t >= p!.bestT && x.t <= p!.bestT + PUNCH_REACH_MS).map((x) => x.reach?.[i] ?? 0));
      const height = !!at?.wristUp && at.headUp !== null && at.wristUp[i] < at.headUp && at.wristUp[i] > 0;
      if (p.bestV >= PUNCH_MIN && far >= PUNCH_REACH * armLen && height) {
        p.emitted = true;
        ev.push({ kind: 'punch', t: p.bestT, seen: h[h.length - 1].t, hand, speed: p.bestV });
      }
    }
    if ((vr === null || vr <= PUNCH_RUN_V) && h[k].t - p.bestT > PUNCH_REACH_MS) this.punch[i] = null;
  }

  /**
   * kick: the ankle's fastest swing (relative to the hips) in a lift past KICK_LIFT_M with the other foot down, once the
   * leg has come near straight and the foot has topped KICK_TOP_M — told as the swing slows, not when the leg comes down.
   */
  private kicks(ev: BodyEvent[]): void {
    const h = this.hist, m = this.vk;
    const k = h.length - 1 - m;
    if (k < m) return;
    const s = h[k];
    if (!s.ankle || s.hip === null || !s.contact) return;
    for (const sd of SIDES) {
      const i = idx(sd), o = 1 - i;
      const a = h[k - m].ankle?.[i], b = h[k + m].ankle?.[i];
      if (!a || !b) continue;
      const speed = (len({ x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }) * 1000) / (h[k + m].t - h[k - m].t || 1);
      const ankleH = s.hip + s.ankle[i].y;
      const lifted = ankleH > KICK_LIFT_M && s.contact[o];
      let kk = this.kick[i];
      if (!lifted) { this.kick[i] = null; continue; }
      if (!kk) kk = this.kick[i] = { bestV: speed, bestT: s.t, straight: 0, top: 0, emitted: false };
      if (speed > kk.bestV && !kk.emitted) { kk.bestV = speed; kk.bestT = s.t; }
      kk.straight = Math.max(kk.straight, s.kneeStraight?.[i] ?? 0);
      kk.top = Math.max(kk.top, ankleH);
      if (!kk.emitted && speed < 0.5 * kk.bestV && kk.bestV >= KICK_MIN && kk.straight >= KICK_STRAIGHT && kk.top >= KICK_TOP_M) {
        kk.emitted = true;
        ev.push({ kind: 'kick', t: kk.bestT, seen: h[h.length - 1].t, foot: sd, speed: kk.bestV });
      }
    }
  }

  // ── the per-frame read ──

  private buildRead(raw: PoseFrame, f: PoseFrame, s: Sample): BodyRead {
    const cal = this.cal, im = f.image, w = f.world;
    const conf = CORE_POINTS.reduce((a: number, i) => a + raw.image[i].v, 0) / CORE_POINTS.length;
    const hipsSeen = raw.image[LEFT_HIP].v >= SEEN_VIS && raw.image[RIGHT_HIP].v >= SEEN_VIS;
    const hm = hipMidImg(im), tl = this.tilt;
    const rec = this.recent();
    const vy = cal && rec.length >= 3 ? slope(rec.map((x) => x.t), rec.map((x) => x.hip ?? NaN)) : null;
    const read: BodyRead = {
      t: raw.t, present: true, conf, calibrated: !!cal, tracking: !!cal && hipsSeen && !!s.foot, rulers: this.rulers(),
      hip: { x: hm.x, y: hm.y, heightM: s.hip, vy: vy !== null && Number.isFinite(vy) ? vy : null },
      feet: s.foot && s.contact ? { L: { heightM: s.foot[0], contact: s.contact[0] }, R: { heightM: s.foot[1], contact: s.contact[1] } } : null,
      airborne: s.contact ? !s.contact[0] && !s.contact[1] : null,
      knee: null, wrist: null, elbowDeg: null, lean: null, squat: null, yaw: null,
    };
    const ru = read.rulers;
    if (cal && ru) {
      const sm = shoulderMidImg(im);
      const trunkDeg = (Math.atan2(-(sm.x - hm.x) * ru.mPerX, (hm.y - sm.y) * ru.mPerY) * 180) / Math.PI;
      // (unknown without world landmarks: 0 would say "upright")
      let trunkFwdDeg: number | null = null;
      if (w) {
        const ms = { x: (w[LEFT_SHOULDER].x + w[RIGHT_SHOULDER].x) / 2, y: (w[LEFT_SHOULDER].y + w[RIGHT_SHOULDER].y) / 2, z: (w[LEFT_SHOULDER].z + w[RIGHT_SHOULDER].z) / 2 };
        const mh = { x: (w[LEFT_HIP].x + w[RIGHT_HIP].x) / 2, y: (w[LEFT_HIP].y + w[RIGHT_HIP].y) / 2, z: (w[LEFT_HIP].z + w[RIGHT_HIP].z) / 2 };
        const tr = lev(sub(ms, mh), tl);
        trunkFwdDeg = (Math.atan2(tr.z, tr.y) * 180) / Math.PI;
      }
      read.lean = { sideSw: (-(hm.x - cal.centreX) * ru.mPerX) / cal.shoulderWidthM, trunkDeg, trunkFwdDeg };
      read.squat = s.hip !== null && !read.airborne
        ? Math.max(0, Math.min(1, (this.standH - s.hip) / (SQUAT_FULL_SHARE * cal.legLengthM))) : null;
    }
    if (w) {
      const sh = sub(w[LEFT_SHOULDER], w[RIGHT_SHOULDER]);
      const away = sh.z * tl.c - sh.y * tl.s;          // the shoulder line's depth, level with the floor
      const widthRatio = cal && ru ? (Math.abs(im[LEFT_SHOULDER].x - im[RIGHT_SHOULDER].x) * ru.mPerX) / cal.shoulderWidthM : Math.abs(sh.x) / Math.max(1e-9, len(sh));
      const deg = (Math.atan2(away, sh.x) * 180) / Math.PI;
      const nearSide: Hand | null = Math.abs(away) < 0.05 ? null : away > 0 ? 'R' : 'L';
      read.yaw = { widthRatio, nearSide, deg };
      const thigh = cal?.thighM ?? null;
      const knee = (sd: FootSide) => {
        const relHipM = downW(w[FOOT[sd].hip], tl) - downW(w[FOOT[sd].knee], tl);
        return { relHipM, drive: thigh ? 1 + relHipM / thigh : null };
      };
      read.knee = { L: knee('L'), R: knee('R') };
      const elbow = (hd: Hand) => angleDeg(sub(w[ARM[hd].shoulder], w[ARM[hd].elbow]), sub(w[ARM[hd].wrist], w[ARM[hd].elbow]));
      read.elbowDeg = { L: elbow('L'), R: elbow('R') };
      const wr = (hd: Hand): WristRead => {
        const i = idx(hd);
        return {
          x: im[ARM[hd].wrist].x, y: im[ARM[hd].wrist].y,
          heightM: s.hip !== null && s.wristUp ? s.hip + s.wristUp[i] : null,
          rel: s.wristRel![i], vRel: this.backVel((x) => x.wristRel?.[i]),
          vWorld: this.backVel((x) => x.wristRoom?.[i]),
          overhead: !!s.wristUp && s.headUp !== null && s.wristUp[i] > s.headUp,
        };
      };
      read.wrist = { L: wr('L'), R: wr('R') };
    }
    return read;
  }

  /** Velocity (per s) over the last 2·VEL_HALF_MS: the per-frame read has no future frame to centre on. */
  private backVel(get: (s: Sample) => V3 | null | undefined): V3 | null {
    const h = this.hist, n = h.length;
    if (n < 2) return null;
    const j = Math.max(0, n - 1 - 2 * this.vk);
    const a = get(h[j]), b = get(h[n - 1]);
    if (!a || !b) return null;
    const dt = (h[n - 1].t - h[j].t) / 1000;
    return dt > 0 ? { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt, z: (b.z - a.z) / dt } : null;
  }
}

/** Every read and event of a stream, in order (tests, probes). */
export function replay(frames: PoseFrame[], opts: BodyReaderOptions = {}): { reads: BodyRead[]; events: BodyEvent[]; calibration: Calibration | null } {
  const r = new BodyReader(opts);
  const reads: BodyRead[] = [], events: BodyEvent[] = [];
  for (const f of frames) {
    const out = r.read(f);
    reads.push(out.read);
    events.push(...out.events);
  }
  return { reads, events, calibration: r.calibration };
}

