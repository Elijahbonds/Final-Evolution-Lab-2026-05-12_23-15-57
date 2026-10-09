// rideReader — the body read the boards and the racers ride on (movement play P8, 2026-09-26).
//
//   PoseFrame + BodyRead + events ──▶ RideReader (owned by ChannelReader) ──▶ BodyChannels.ride: RideRead
//
// What P3 steered the boards with, `lean.sideSw`, is the hips' image offset from the calibration's centre: a
// TRANSLATION, not a lean. A step sideways reads as full steer, and in a side-on stance it reads a weight shift toward
// the nose or the tail as strongly as a toe or heel lean (PLAN-P8 §1.3, measured: ±0.18–0.27 either way at 45°). This
// reader measures the moves a rider really makes, in the WORLD landmarks (metres, depth included), in the rider's own
// frame:
//   stance   side-on (20–70° off square, held still 700 ms) or square (held 3 s, the fallback): the lead measured from
//            the shoulder nearer the lens, never chosen — regular = left foot forward, goofy = right; kept through a 'lost'
//            for the same body's return, followed within ±25° while no turn is going, its axes re-taken (its neutral kept)
//            from a still hold off the edges further off in the same lead;
//   carve    the centre of the trunk and legs over the feet along the stance's body normal (the toe / heel lean), in
//            leg lengths past the rider's own neutral (unread while a hand is overhead). Translation-free: a shuffle moves
//            body and feet together and reads ~0; a nose / tail shift moves along the board, square to the normal, and
//            reads ~0 (measured ≤ 0.02 m at 0–75°); a crouch moves the hips back and the chest forward and reads ~0;
//   grab     a wrist below its own knee (the hand at the board's edge), the edge from the same normal;
//   turn     the shoulders' yaw from the stance, unwrapped, with the camera's LEFT / RIGHT LABEL FLIP rejected by
//            continuity (a 180° jump in one frame is a label swap, never a turn); a QUARTER is ≥ 75° inside 600 ms;
//   wheel    both wrists gripping at chest height, elbows bent: the wrist line's tilt;
//   wings    both arms out, nearly straight, near shoulder height: the wing line's tilt (bank) and height (pitch: the symmetric
//            part past the wings' own level, taken as they open);
//   trimRate how fast the crouch is changing (surf's pump); kneeDrive (high knees); lift (the last foot-off on the ground,
//            for a mode's own step path); trunkFwdDeg (the dip at the tape).
// Every field is null / false when unread (hidden, not tracking, uncalibrated, no stance). ABSENCE IS NEVER ZERO AND
// NEVER A PRESS (the P2 rule). The clock is read.t, the capture clock.
//
// A label flip corrects the whole frame before anything else reads it (the flip is found on the raw shoulders, before
// any filter could smear the swap into a sweep), and the corrected points go through their own One Euro (the reader's
// world parameters). Pure: no DOM, no camera. Deterministic.
import {
  LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_ELBOW, RIGHT_ELBOW, LEFT_WRIST, RIGHT_WRIST, LEFT_HIP, RIGHT_HIP, LEFT_KNEE,
  RIGHT_KNEE, LEFT_ANKLE, RIGHT_ANKLE, LEFT_HEEL, RIGHT_HEEL, LEFT_FOOT_INDEX, RIGHT_FOOT_INDEX, MIRROR_INDEX,
  type PoseFrame, type Wm,
} from './landmarks';
import type { BodyRead, BodyEvent } from './BodyReader';
import { tiltOf, downW, SEEN_VIS, STILL_TORSO_SD_M, STILL_ANKLE_SD_M, CAL_WINDOW_MS, sd, type Calibration, type Tilt } from './calibrate';
import { OneEuro, WORLD_EURO } from './oneEuro';

// ── thresholds (PLAN-P8 §2, §5; [est.] where the plan says so, fixed on the train seeds in rideGate.test) ─────────────

/** The stance band: yaw this far off square (deg) is side-on. The synth tracks to 75° (measured, PLAN-P8 §1.3). */
export const STANCE_MIN_DEG = 20;
export const STANCE_MAX_DEG = 70;
/** Held still this long (ms) takes a side-on stance: calibrate.ts's own window. */
export const STANCE_HOLD_MS = CAL_WINDOW_MS;
/** A stance hold's shoulders turn no more than this (deg, the SD of the yaw's 5-frame running mean over the hold — the
 *  other channels' rule: at 1.5× noise a still 45° stance reads 1–3°, the tail of a 90° turn inside the window tens). */
export const STILL_YAW_SD_DEG = 5;
/** A square stand held still this long (ms) is taken as the fallback ("side-on works best"). */
export const SQUARE_HOLD_MS = 3000;
/** While riding, the stance's yaw follows the rider this slowly (ms) — grounded, no turn going, within ±FOLLOW_DEG. */
export const FOLLOW_TAU_MS = 3000;
export const FOLLOW_DEG = 25;
/** "No turn going" (review fix, 2026-09-26): the shoulders' yaw rate over the last FOLLOW_RATE_MS under this (deg/s), and no
 *  quarter since the last rest. (The first build gated the follow on |turn| < TURN_REST_DEG as well: with a stance that IS
 *  the offset, so the follow stopped at 15°, and a rider who squared up 22–35° toward the screen stayed off-stance for good —
 *  no quarter either way from there, and a nose / tail shift leaking into the carve: measured, 0 quarters in 12 / 12 cells at
 *  26 and 30°.) Squaring up over 1.5 s is ~20°/s; a quarter-turn is 150°/s and more; a still stance's filtered yaw jitters
 *  up to ~25°/s over this window at 1.5× noise. */
export const FOLLOW_RATE_DPS = 45;
export const FOLLOW_RATE_MS = 250;
/** A re-axis (a still hold in the stance's lead more than TURN_REST_DEG off its axis, review fix) needs the hold settled: the
 *  mean yaw of its second half within this (deg) of its first half's. A 15°/s turn drifts ~5° across a 700 ms hold; a still
 *  body's filtered yaw ~1° at 1.5× noise. */
export const REAXIS_DRIFT_DEG = 3;
/** The neutral re-centres this slowly (ms), and only while the carve is inside CARVE_OFF (a held edge is never eaten). */
export const NEUTRAL_TAU_MS = 6000;
/** The carve's hysteresis (leg lengths): the floor engages past ON and lets go under OFF (PLAN-P8 §5's 0.065 / 0.045 est.,
 *  moved up by the train seeds: the resting centre's p99 read 0.66 × 0.065 at 1× noise and up to 0.99 × at 1.5× on a
 *  30° stance at 15 fps — rideGate's G1 margin). A 4° lean (0.076) sits on the line: 8° reads half a stick, 12° full. */
export const CARVE_ON = 0.07;
export const CARVE_OFF = 0.05;
/** A grab: the wrist this far BELOW its own knee (m) turns it on, back above the knee by GRAB_OFF_M turns it off. */
export const GRAB_ON_M = 0.05;
export const GRAB_OFF_M = 0.10;
export const GRAB_DWELL_MS = 80;
/** A grab let go of cannot start again for this long (ms). */
export const GRAB_REFRACTORY_MS = 400;
/** The grab's edge: the wrist this far (m) toward the toes or the heels of the feet's middle, along the body normal. */
export const GRAB_EDGE_M = 0.06;
/** A quarter-turn: the shoulders this far (deg) off the stance within QUARTER_MS of leaving ±TURN_REST_DEG (the plan's 70° est.
 *  read a 60° backside turn from a 60° stance — the back to the lens — as a quarter at 15 fps and 1.5× noise; a real 90° reads
 *  87–88°). R-F6, the full grid on the train seeds 11 / 17 / 23 (48 cells each): the plan's 500 ms est. missed CMU 91_46's jump
 *  turn in 12 cells; 600 finds it in all 48 (91_56 and the 180–360° hop turns too), with the carves at 0 and a turn in place
 *  (~140°/s) a quarter in 4 of 48 (69_18); 700 also found 83_51's slow 90° hop (600 ms from 15° to 75°) in 24, but read
 *  69_18 in 12. */
export const QUARTER_DEG = 75;
export const QUARTER_MS = 600;
export const TURN_REST_DEG = 15;
/** A frame-to-frame jump of the raw shoulder yaw past this (deg) is a left / right label swap, not a turn. */
export const FLIP_JUMP_DEG = 90;
/** Without a stance the turn is read from a baseline that follows the rider this slowly (ms) while no turn is going… */
export const BASE_TAU_MS = 1500;
/** …and is let go to follow again once a turn has been held this long (ms): a player who stays turned has turned. */
export const BASE_REBASE_MS = 2000;
/** The wheel: one elbow bent at least to WHEEL_ELBOW_MAX (deg) and neither locked past WHEEL_ELBOW_LOCK (a 60° turn
 *  straightens the low arm to ~170°, measured on the scripted wheel; a forward stretch locks both), the wrists this far
 *  apart (m), facing the lens within WHEEL_FACING_DEG. */
export const WHEEL_ELBOW_MAX = 140;
export const WHEEL_ELBOW_LOCK = 176;
/** …and no higher than this (m) over the shoulder line: a wheel is held at the chest (a fighter's guard, at the chin, gripped
 *  86 frames of punch_kick at +0.1). */
export const WHEEL_HIGH_M = 0.02;
/** …while a wheel already gripped may ride this high (m over the shoulder line): CMU 80_38 drives with the wheel at the
 *  shoulders, one hand over the take's line every other second, and lost the grip mid-turn on it (R-F6). */
export const WHEEL_HIGH_KEEP_M = 0.15;
export const WHEEL_SPAN_M: readonly [number, number] = [0.15, 0.7];
export const WHEEL_FACING_DEG = 35;
/** The wheel's hands: no lower than this share of the torso above the hips, and at least this far (m) in front of the
 *  shoulders (a 60° turn puts the low hand at the belly; hands on the hips are at the sides, not in front). */
export const WHEEL_LOW_TORSO = 0.1;
export const WHEEL_MEAN_TORSO = 0.35;
export const WHEEL_AHEAD_M = 0.12;
/** The wheel is gripped after GRIP_ON_MS of both hands TAKING it (the grip pose below) and let go after GRIP_OFF_MS
 *  without both on it; one hand gone holds the last angle ONE_HAND_MS. (R-F2: 200 → 300 ms, with the grip pose.) */
export const GRIP_ON_MS = 300;
export const GRIP_OFF_MS = 250;
export const ONE_HAND_MS = 400;
/**
 * TAKING THE WHEEL (PLAN-P8 R-F2). The first build's grip, both hands in the wheel band, pressed GAS on real arms that
 * were never on a wheel: the owner's two-foot dunk (GAS, STEER 0.5 and a DRIFT), punch_kick's guard (GAS, STEER −0.3 /
 * +0.2), two jump takes (GAS) — replayed offline through the kart row. So the grip only STARTS on the pose a wheel is TAKEN
 * in, held GRIP_ON_MS: the band, the two hands at about one depth in front of the chest (a guard is staggered, one fist
 * ahead), their midpoint on the sternum across the body (a swing passes off to one side), no hand swinging (a gather's or
 * a jump's arm swing), and the wheel STRAIGHT when the take begins (a kart's wheel is centred when the hands go on it; it
 * may turn after). Once gripped, the band alone keeps it and reads the angle — a driver turns the wheel at up to ~2 m/s
 * of hand speed and ±44° (CMU 80_38) and must not lose the grip or the steer.
 * Measured (train seeds 11 / 17 / 23; the 12 P1 takes are fixed streams): the STRAIGHT take is what the P1 negatives need
 * — without it the owner's dunk_elijah_one_foot and jump_two_foot_low stands (both hands up in front of the chest, still,
 * the wrist line tilted 16–19°) take the wheel; the plan's 0.12 m depth match and 0.6 m/s speed limit bought nothing on
 * them and cost the second real driver (80_38: hands 0.14 m apart in depth at the median, never slow) its grip entirely,
 * so they are 0.2 m and 2.5 m/s (a swing guard, not a stillness rule).
 */
export const WHEEL_DEPTH_MATCH_M = 0.2;
export const WHEEL_CENTRE_M = 0.15;
export const WHEEL_SPEED_MAX = 2.5;
export const WHEEL_SPEED_MS = 150;
/** …and the two hands' midpoint (the wheel's centre) moving no faster than this (m/s). */
export const WHEEL_CENTRE_SPEED_MAX = 0.4;
/** The wheel's tilt (deg) the take must START inside: taken straight. */
export const WHEEL_TAKE_LEVEL_DEG = 10;
/** A take survives a gap this long (ms) in its pose (a missed wrist, one frame out of the band): a driver's hands jitter. */
export const WHEEL_TAKE_GAP_MS = 150;
/** Wings: elbows at least this straight (deg), each wrist ≥ WING_REACH arm lengths from its shoulder and ≥ WING_OUT out
 *  to the side, within ±WING_ELEV_DEG of the shoulder line. (R-F6: the plan's 130° elbow read NO wings on real arms held
 *  out — CMU 132_01's balancing walk holds them at 111–148°, the birds at 90–135°: real arms out keep soft elbows, and a
 *  0.8-arm reach already means an elbow past ~107°.) */
export const WING_ELBOW_MIN = 110;
export const WING_REACH = 0.8;
export const WING_OUT = 0.5;
export const WING_ELEV_DEG = 45;
export const WINGS_ON_MS = 200;
export const WINGS_OFF_MS = 250;
/** The wings OPEN only on still arms — both wrists slower than this (m/s, over WHEEL_SPEED_MS) through WINGS_ON_MS: a
 *  pilot holds the wings out; a both-arms wave (CMU 143_25) sweeps them through the wing band and climbed the plane at
 *  full pitch, and a bird's flap banked it 0.6 (still at 1.0 m/s: train seeds 11 / 17 / 23). Once open, the pose alone keeps them. */
export const WING_SPEED_MAX = 0.6;
/**
 * THE WINGS' OWN LEVEL (review fix, 2026-09-26). The first build read the climb as the wrists' absolute elevation off the
 * shoulder line — level for the scripted arms, but real arms held out sit BELOW it: CMU 132_01 ("arms out level") read
 * p50 −6°, 132_09 −11°, and the plane dived through most of the gas. So the wings take their own neutral elevation when they
 * open (the mean over the opening dwell, within ±WING_NEUTRAL_MAX_DEG: a pilot who opens pitched far up or down is asking
 * for it), re-centred slowly (NEUTRAL_TAU_MS) while the climb sits inside WING_REST_DEG (the floor's PITCH_OFF_DEG, pinned
 * equal in rideReader.test) — and the climb is the SYMMETRIC part: the mean elevation past neutral, less half the two arms'
 * difference, so one arm raised (132_05: a bank, +20° mean) climbs nothing, and a banked climb climbs by what both share.
 */
export const WING_NEUTRAL_MAX_DEG = 15;
export const WING_REST_DEG = 6;
/** …the two arms' difference counts past this much (deg): two arms held out are never quite level with each other. */
export const WING_TILT_SLACK_DEG = 3;
/**
 * A STEP is real when its foot swung at least this high (m, the foot's peak since its previous step, on the ground):
 * measured on the scripted streams at 1.5× the synth's noise, the P2 reader's steps with no body stepping peak at ≤ 4.6 cm
 * (a still stand, idle sway, a lean), a walk in place at ≥ 6.0, run_in_place at ≥ 6.0, a shuffle at 3.6–6.1.
 */
export const STEP_SWING_M = 0.05;
/** Running = at least this many real steps inside RUNNING_MS. */
export const RUNNING_STEPS = 2;
export const RUNNING_MS = 1500;
/** …the last of them no longer ago than this (ms, the stride channel's own STRIDE_ZERO_MS). */
export const RUNNING_LAST_MS = 700;
/** The real steps' rate is read over this long (ms): the reader's own CADENCE_WINDOW_MS. */
export const STEP_HZ_WINDOW_MS = 2500;
// High knees' own rate (`kneeHz`, review fix 2026-09-26) is the step rate as it stood at EACH of the last two real steps, the
// lower: at 15 fps the P2 reader can tell a march's first two lifts 100 ms apart, and CMU 91_19 (knees to the hip at ~1.3
// steps/s) read 2.56 steps/s off that pair for one step and held Free Run's SPRINT (seed 41). Merging near steps instead
// (counting a pair under 120 ms apart once) cost the scripted high knees a real step told 82 ms after another, and their SPRINT
// flickered off mid-run in 4 of the train seeds' 48 cells. The run's own rate (`stepHz`) keeps every real step as it was:
// merging halved run_in_place's (a jog's contacts are told in bursts 60–100 ms apart).
/** The carve's own One Euro (after the points' filters): the centre's jitter at 15 fps and 1.5× noise read p99 1.2 × CARVE_ON
 *  on idle sway before it (a false steer); a lean's speed opens the cutoff. Units: leg lengths. */
export const CARVE_EURO = { minCutoff: 0.8, beta: 3, dCutoff: 1 } as const;
/** The trim rate is the squat's slope over this much of the latest history (ms)… */
export const TRIM_WINDOW_MS = 150;
/** The legs' fold is smoothed first (its own One Euro, squat units): at 1.5× noise its raw 100 ms slope swung ±1 /s standing
 *  still, over TRIM_ON for 2–3 frames (seed 23). */
export const FOLD_EURO = { minCutoff: 1.2, beta: 2, dCutoff: 1 } as const;
/** …read only with both feet down this long (ms): a pump is a compress and extend on planted feet, a jog is not one. */
export const TRIM_STEP_MS = 600;
/** The trim's unit: the legs folded (1 − hip-to-ankle over the leg length) by this share per unit — squat's own scale (a
 *  hip drop of 0.45 leg lengths is 1), so a 1.2 Hz pump of an 18 cm crouch peaks near 1.7 /s. */
export const TRIM_FOLD_PER_UNIT = 0.45;
/** …nor this long (ms) after a landing: its absorb (land +53 / +115 ms on the fixtures) and the stand back up out of it. */
export const TRIM_LAND_MS = 900;
/** Knee drive is the highest over this much of the ground history (ms): about two jogging steps. */
export const KNEE_WINDOW_MS = 700;
/** High knees need a knee driven past this within the last KNEE_RECENT_MS (a stop ends them at once). */
export const KNEE_RECENT_DRIVE = 0.5;
export const KNEE_RECENT_MS = 400;

// ── types ────────────────────────────────────────────────────────────────────────────────────────────────────────

type Side = 'L' | 'R';
export interface Vec2 { x: number; z: number }
export interface Stance {
  kind: 'side' | 'square';
  /** The foot forward: the shoulder nearer the lens at the take (null on the square fallback). */
  lead: Side | null;
  /** The shoulders' yaw at the take (deg, the reader's: 0 facing, + turned to the player's left). */
  yawDeg: number;
  /** The body's normal (toward the toes) and the board's axis (toward the lead foot), horizontal, levelled. */
  n: Vec2;
  b: Vec2;
  /** The rider's own neutral carve (leg lengths), taken over the hold. */
  neutral: number;
  /** When it was taken (capture ms). */
  t: number;
}
export interface RideRead {
  stance: Stance | null;
  /** The take's progress, 0…1 (the READY card's ring); 1 once taken. */
  stanceHold01: number;
  /** Leg lengths past neutral, + toward the toes (square: + toward the player's right); null unread. */
  carve: number | null;
  /** The steer that carve means: + = a right turn. Toe = right for a left lead, left for a right lead. */
  steerSign: 1 | -1;
  grab: { wrist: Side; hand: 'lead' | 'rear'; edge: 'toe' | 'heel' | null; since: number } | null;
  turn: {
    /** The shoulders' yaw off the stance (or the baseline), unwrapped (deg, + = turned to the player's left). */
    deg: number;
    rateDps: number;
    /** The last quarter: fs = the chest opened toward the lens, bs = the back turned to it; `side` = which way the player
     *  turned (L = to their left); `seq` counts them, so a polling mode never takes one twice. */
    quarter: { dir: 'fs' | 'bs'; side: Side; t: number; seq: number } | null;
  };
  /** + = clockwise (a right turn). grip is debounced; the angle is null while not gripped. */
  wheel: { grip: boolean; angleDeg: number | null; since: number };
  /** bank: the wrist line's tilt (+ = right wing down). pitch: the climb — the arms' mean elevation past the wings' own level
   *  (taken as they open), less half their difference (one arm raised is a bank); + = up. */
  wings: { on: boolean; bankDeg: number | null; pitchDeg: number | null };
  /** How fast the legs are folding (squat's units per s, off the legs' length; + compressing); null in the air, stepping,
   *  landing, or unread. */
  trimRate: number | null;
  /** The highest knee drive (thighs: 0 standing … 1 level) over the last ~two steps on the ground; null unread. */
  kneeDrive: number | null;
  /** A knee was driven at least KNEE_RECENT_DRIVE within the last KNEE_RECENT_MS (the window's max outlives a stop). */
  kneeDriveRecent: boolean;
  /** The last instant each foot was seen off the floor on the ground (capture ms; −Infinity never). */
  lift: { L: number; R: number };
  /** Each foot's peak height (m) in the swing of its LATEST told step (on the ground, since the step before it): a told step is
   *  real at ≥ STEP_SWING_M. Read with the step's own packet. */
  swing: { L: number; R: number };
  /** Running in place: RUNNING_STEPS real steps inside RUNNING_MS (the stride channel counts every told step, a still stand's
   *  jittered ones included at 1.5× noise). */
  running: boolean;
  /** The step rate (steps/s) over the last real steps (≥ 4 inside 2.5 s, the reader's cadence rule): the stride channel's
   *  rate counts a noisy stand's jittered steps too; null under four real steps. */
  stepHz: number | null;
  /** The same rate as it stood at each of the last two real steps, the lower: high knees' (one step's rate off a march's lifts
   *  told in a pair is not a sprint); null under two such rates. */
  kneeHz: number | null;
  trunkFwdDeg: number | null;
  /** The camera has the labels swapped right now (the reader has swapped them back). */
  flipped: boolean;
}

export const NO_RIDE: RideRead = Object.freeze({
  stance: null, stanceHold01: 0, carve: null, steerSign: 1, grab: null,
  turn: { deg: 0, rateDps: 0, quarter: null }, wheel: { grip: false, angleDeg: null, since: -Infinity },
  wings: { on: false, bankDeg: null, pitchDeg: null }, trimRate: null, kneeDrive: null, kneeDriveRecent: false, lift: { L: -Infinity, R: -Infinity },
  swing: { L: 0, R: 0 }, running: false, stepHz: null, kneeHz: null,
  trunkFwdDeg: null, flipped: false,
}) as RideRead;

// ── geometry ─────────────────────────────────────────────────────────────────────────────────────────────────────

interface P3 { x: number; y: number; z: number }
const TRACKED = [
  LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_ELBOW, RIGHT_ELBOW, LEFT_WRIST, RIGHT_WRIST, LEFT_HIP, RIGHT_HIP,
  LEFT_KNEE, RIGHT_KNEE, LEFT_ANKLE, RIGHT_ANKLE, LEFT_HEEL, RIGHT_HEEL, LEFT_FOOT_INDEX, RIGHT_FOOT_INDEX,
] as const;
/** World (x right, y down, z away, turned with the camera) → levelled: x right, y UP along gravity, z TOWARD the camera. */
const lev = (v: Wm, t: Tilt): P3 => ({ x: v.x, y: -downW(v, t), z: -(v.z * t.c - v.y * t.s) });
const sub = (a: P3, b: P3): P3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mid = (a: P3, b: P3): P3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
const len = (v: P3) => Math.hypot(v.x, v.y, v.z);
const DEG = 180 / Math.PI;
const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const angleAt = (a: P3, o: P3, c: P3): number => {
  const u = sub(a, o), v = sub(c, o);
  const d = (u.x * v.x + u.y * v.y + u.z * v.z) / Math.max(1e-9, len(u) * len(v));
  return Math.acos(Math.max(-1, Math.min(1, d))) * DEG;
};
/** The centre of mass of the trunk and the legs (the arms left out). */
function centre(P: Pose): P3 {
  const trunk = mid(mid(P.hip[0], P.hip[1]), mid(P.sh[0], P.sh[1]));
  const thigh = mid(mid(P.hip[0], P.knee[0]), mid(P.hip[1], P.knee[1]));
  const shank = mid(mid(P.knee[0], P.ank[0]), mid(P.knee[1], P.ank[1]));
  return { x: 0.6 * trunk.x + 0.24 * thigh.x + 0.16 * shank.x, y: 0.6 * trunk.y + 0.24 * thigh.y + 0.16 * shank.y, z: 0.6 * trunk.z + 0.24 * thigh.z + 0.16 * shank.z };
}
/** The raw shoulder yaw, BodyReader's formula (0 facing, + = the left shoulder away from the lens), on world points. */
function shoulderYaw(w: readonly Wm[], ls: number, rs: number, t: Tilt): number {
  const sh = { x: w[ls].x - w[rs].x, y: w[ls].y - w[rs].y, z: w[ls].z - w[rs].z };
  const away = sh.z * t.c - sh.y * t.s;
  return Math.atan2(away, sh.x) * DEG;
}
/** The body's left axis for a shoulder yaw (levelled x, z), and its normal (toward the chest). */
export const leftAxis = (yawDeg: number): Vec2 => ({ x: Math.cos(yawDeg / DEG), z: -Math.sin(yawDeg / DEG) });
export const normalOf = (l: Vec2): Vec2 => ({ x: -l.z, z: l.x });
const dot2 = (p: P3, v: Vec2) => p.x * v.x + p.z * v.z;
/** A horizontal unit vector's yaw (the inverse of leftAxis). */
const yawOfLeft = (l: Vec2): number => Math.atan2(-l.z, l.x) * DEG;

/** The latest ms of samples (oldest first) — a ring with a time horizon. */
class Recent<T extends { t: number }> {
  items: T[] = [];
  constructor(private readonly ms: number) {}
  push(x: T): void {
    this.items.push(x);
    while (this.items.length > 2 && x.t - this.items[0].t > this.ms) this.items.shift();
  }
  clear(): void { this.items = []; }
}

interface Pose {
  sh: [P3, P3]; el: [P3, P3]; wr: [P3, P3]; hip: [P3, P3]; knee: [P3, P3]; ank: [P3, P3];
  wristSeen: [boolean, boolean];
}
interface StillSample { t: number; v: number[]; ok: boolean; yaw: number; yawU: number; lead: Side | null; left: Vec2; d: P3 }

const ramp01 = (v: number, lo: number, hi: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));

// ── the reader ───────────────────────────────────────────────────────────────────────────────────────────────────

export class RideReader {
  private filt: OneEuro[][] = [];
  private cal: Calibration | null = null;
  private tilt: Tilt = tiltOf(0);
  private lastT: number | null = null;
  // the label flip, on the raw shoulders
  private flipped = false;
  private rawYawU: number | null = null;
  private rawYawT = -Infinity;
  // the stance
  private stance: Stance | null = null;
  /** The stance's shoulder yaw on the same unwrapped clock as the reader's yaw (a turn past 180° stays signed). */
  private stYawU = 0;
  private window = new Recent<StillSample>(SQUARE_HOLD_MS + 200);
  private sideFrom: number | null = null;
  private sideLead: Side | null = null;
  private squareFrom: number | null = null;
  private hold01 = 0;
  /** The stance a 'lost' dropped (review fix, 2026-09-26): the same body back in the same lead within ±FOLLOW_DEG of it gets it
   *  back as it was, neutral and axes — never a new neutral learned off whatever it holds on its return (a held edge was one:
   *  the rider then had to lean the other way to go straight for the rest of the run). Cleared by reset (a new body). */
  private kept: Stance | null = null;
  // the turn
  private yawU: number | null = null;
  private yawPrev: { t: number; u: number } | null = null;
  /** The unwrapped yaw over the last FOLLOW_RATE_MS (the follow's "no turn going"). */
  private yawTrail = new Recent<{ t: number; u: number }>(FOLLOW_RATE_MS);
  private base: number | null = null;
  private outsideFrom: number | null = null;
  private insideAt = -Infinity;
  private armed = true;
  private quarter: RideRead['turn']['quarter'] = null;
  private lastTurnDeg = 0;
  private seq = 0;
  // the grab
  private grabState: { wrist: Side; since: number; downFrom: number } | null = null;
  private grabCand: { wrist: Side; from: number } | null = null;
  private grabEndAt = -Infinity;
  // the wheel and the wings
  private gripRaw = false;
  private grip = false;
  private gripSince = -Infinity;
  private gripFlipAt = -Infinity;
  private lastAngle: number | null = null;
  private lastBothAt = -Infinity;
  /** R-F2: the wrists' recent positions (levelled m), for the grip pose's speed rule; when the grip pose began. */
  private wristTrail = new Recent<{ t: number; L: P3; R: P3 }>(3 * WHEEL_SPEED_MS);
  private takeFrom: number | null = null;
  private takeLast = -Infinity;
  private wingsRaw = false;
  private wings = false;
  private wingsFlipAt = -Infinity;
  private lastWing: { bank: number; pitch: number } | null = null;
  /** The wings' own level (WING_NEUTRAL_MAX_DEG): the mean elevation over the opening dwell, then re-centred at rest. */
  private wingNeutral: number | null = null;
  private wingOpen = { sum: 0, n: 0 };
  private wingT = -Infinity;
  // the rest
  private squats = new Recent<{ t: number; s: number }>(3 * TRIM_WINDOW_MS);
  private knees = new Recent<{ t: number; d: number }>(KNEE_WINDOW_MS);
  private kneeRecent = false;
  private lift: { L: number; R: number } = { L: -Infinity, R: -Infinity };
  private stepAt = -Infinity;
  private peak: { L: number; R: number } = { L: 0, R: 0 };
  private lastSwing: { L: number; R: number } = { L: 0, R: 0 };
  /** Real steps: when (capture ms) and the jump time accumulated by then (their ages are counted on the ground only). */
  private realSteps: { t: number; j: number }[] = [];
  private jumpMs = 0;
  private heldHz: number | null = null;
  /** The step rate as it stood at each of the last two real steps (kneeHz). */
  private stepRates: (number | null)[] = [];
  private runningNow = false;
  private inJumpNow = false;
  private carveEuro = new OneEuro(CARVE_EURO);
  private foldEuro = new OneEuro(FOLD_EURO);
  private landAt = -Infinity;

  /** One camera frame. `inJump` is the channels' (a told jump or an untold float, and its landing absorb). */
  step(read: BodyRead, events: readonly BodyEvent[], frame: PoseFrame | undefined, inJump: boolean, cal: Calibration | null): RideRead {
    const t = read.t;
    if (cal !== this.cal) { this.setCalibration(cal); }
    // (a lost body drops everything it was doing — but its stance is kept for the same body's return: `kept`)
    if (events.some((e) => e.kind === 'lost')) this.dropBody(true);
    const dtMs = this.lastT === null ? 0 : Math.max(0, t - this.lastT);
    this.lastT = t;
    if (this.inJumpNow) this.jumpMs += dtMs;   // the time since the last frame belongs to the state that frame left
    this.inJumpNow = inJump;
    const trunkFwdDeg = read.lean?.trunkFwdDeg ?? null;
    if (!cal || !read.present || !frame?.present || !frame.world || !frame.image.length || !read.tracking) {
      return this.out(null, trunkFwdDeg, null, null, null);
    }
    const tl = this.tilt;
    // ── the label flip (raw shoulders, before any filter) ──
    const rawYaw = shoulderYaw(frame.world, LEFT_SHOULDER, RIGHT_SHOULDER, tl);
    if (this.rawYawU === null || t - this.rawYawT > 300) { this.rawYawU = rawYaw; this.flipped = false; }
    else {
      let c = rawYaw + (this.flipped ? 180 : 0);
      let d = wrap180(c - this.rawYawU);
      if (Math.abs(d) > FLIP_JUMP_DEG) { this.flipped = !this.flipped; c += 180; d = wrap180(c - this.rawYawU); }
      this.rawYawU += d;
    }
    this.rawYawT = t;
    const idx = (i: number) => (this.flipped ? MIRROR_INDEX[i] : i);
    // ── the corrected, filtered, levelled points ──
    const at = (i: number): P3 => {
      const w = frame.world![idx(i)];
      const f = (this.filt[i] ??= [new OneEuro(WORLD_EURO), new OneEuro(WORLD_EURO), new OneEuro(WORLD_EURO)]);
      return lev({ x: f[0].filter(w.x, t), y: f[1].filter(w.y, t), z: f[2].filter(w.z, t) }, tl);
    };
    const pts: Record<number, P3> = {};
    for (const i of TRACKED) pts[i] = at(i);
    const seen = (i: number) => frame.image[idx(i)].v >= SEEN_VIS;
    const P: Pose = {
      sh: [pts[LEFT_SHOULDER], pts[RIGHT_SHOULDER]], el: [pts[LEFT_ELBOW], pts[RIGHT_ELBOW]], wr: [pts[LEFT_WRIST], pts[RIGHT_WRIST]],
      hip: [pts[LEFT_HIP], pts[RIGHT_HIP]], knee: [pts[LEFT_KNEE], pts[RIGHT_KNEE]], ank: [pts[LEFT_ANKLE], pts[RIGHT_ANKLE]],
      wristSeen: [seen(LEFT_WRIST), seen(RIGHT_WRIST)],
    };
    // the filtered shoulder yaw, unwrapped (levelled z is toward the lens: away = −Δz)
    const shv = sub(P.sh[0], P.sh[1]);
    const yawNow = Math.atan2(-shv.z, shv.x) * DEG;
    this.yawU = this.yawU === null ? yawNow : this.yawU + wrap180(yawNow - this.yawU);
    const yawU = this.yawU;
    const yawWrapped = wrap180(yawU);
    this.yawTrail.push({ t, u: yawU });
    // the body's left axis from both lines (hips + shoulders), horizontal
    const lv = { x: (P.hip[0].x - P.hip[1].x) + shv.x, z: (P.hip[0].z - P.hip[1].z) + shv.z };
    const ll = Math.hypot(lv.x, lv.z) || 1;
    const left: Vec2 = { x: lv.x / ll, z: lv.z / ll };
    const hipM = mid(P.hip[0], P.hip[1]), ankM = mid(P.ank[0], P.ank[1]);
    // THE CARVE'S POINT: the body's centre of mass without the arms (trunk 0.6, thighs 0.24, shanks 0.16 — the segment
    // shares, arms out: a swinging arm is balance, not a lean). A crouch pushes the hips back and the chest forward and the
    // knees over the toes, and its centre stays over the feet; the hips alone read a 20 cm crouch as a heel lean (−0.35
    // stick, measured on the scripted crouch); a toe / heel lean moves the whole body over the ankles.
    const com = centre(P);
    const d = sub(com, ankM);
    const leg = cal.legLengthM;

    // ── the stance ──
    this.takeStance(t, read, frame, P, yawWrapped, yawU, left, d, leg, inJump);
    const st = this.stance;

    // ── the carve ──
    let carve: number | null = null;
    // a hand overhead is a celebration, a wave or a stretch, not a ride: the carve is unread (a side bend over planted feet
    // moves the centre as far as a lean does — the scripted stretch read 0.067 leg lengths, over CARVE_ON; and the stretch's
    // forward fold in the stance, 56° of chest with ONE wrist still over the head, read 0.10 and steered 0.3 for 130 ms
    // while the rule wanted both — the live probe's quiet stance, measured offline first)
    const overhead = !!(read.wrist?.L.overhead || read.wrist?.R.overhead);
    if (st && !overhead) {
      const raw = st.kind === 'side' ? dot2(d, st.n) / leg : -dot2(d, leftAxisOfStance(st)) / leg;
      carve = this.carveEuro.filter(raw - st.neutral, t);
      if (!inJump && dtMs > 0) {
        // the neutral re-centres only inside the dead band (a held edge is never eaten)
        if (Math.abs(carve) < CARVE_OFF) st.neutral += (raw - st.neutral) * Math.min(1, dtMs / NEUTRAL_TAU_MS);
        // the stance follows the rider (riders square up to look at the screen) within ±FOLLOW_DEG, never through a turn: no
        // turn going is the shoulders slow (FOLLOW_RATE_DPS) and no quarter since the last rest (review fix: |turn| < 15° here
        // stopped the follow at 15°, since with a stance the turn IS the offset)
        const off = yawU - this.stYawU;
        if (st.kind === 'side' && Math.abs(off) <= FOLLOW_DEG && this.armed && Math.abs(this.yawRate(t)) <= FOLLOW_RATE_DPS) {
          const k = Math.min(1, dtMs / FOLLOW_TAU_MS);
          this.stYawU += off * k;
          st.yawDeg = wrap180(this.stYawU);
          const ax = yawOfLeft(leftAxisOfStance(st));
          const nextLeft = leftAxis(ax + wrap180(yawOfLeft(left) - ax) * k);
          st.n = normalOf(nextLeft);
          st.b = st.lead === 'R' ? { x: -nextLeft.x, z: -nextLeft.z } : nextLeft;
        }
      }
    }

    // ── the turn ──
    this.turnStep(t, yawU, inJump, dtMs);
    const turnDeg = this.turnDeg(yawU);
    const rate = this.yawPrev && t > this.yawPrev.t ? ((yawU - this.yawPrev.u) * 1000) / (t - this.yawPrev.t) : 0;
    this.yawPrev = { t, u: yawU };

    // ── the grab ──
    const n = st ? st.n : normalOf(left);
    const lead: Side = st?.lead ?? 'L';
    this.grabStep(t, P, ankM, n);
    const grab = this.grabState ? {
      wrist: this.grabState.wrist, hand: (this.grabState.wrist === lead ? 'lead' : 'rear') as 'lead' | 'rear',
      edge: this.edgeOf(P.wr[this.grabState.wrist === 'L' ? 0 : 1], ankM, n), since: this.grabState.since,
    } : null;

    // ── the wheel and the wings ──
    const facing = Math.abs(yawWrapped) <= WHEEL_FACING_DEG;
    this.wheelStep(t, P, cal, facing, left, inJump);
    this.wingsStep(t, P, cal, facing, left);

    // ── the rest ──
    // (the lift first: a foot off the floor on the ground now makes this a step, and a stepping body's hips bob — a jog
    // in place read as surf trim strokes on run_in_place, 16 of them, before this)
    if (read.feet && !inJump) for (const f of ['L', 'R'] as const) if (!read.feet[f].contact) this.lift[f] = t;
    // each foot's swing since its own last told step (a max over a window let a jittered step 100 ms after a real one borrow
    // the real one's 11 cm)
    if (read.feet && !inJump) for (const f of ['L', 'R'] as const) this.peak[f] = Math.max(this.peak[f], read.feet[f].heightM);
    let newReal = false;
    for (const ev of events) {
      if (ev.kind !== 'step') continue;
      this.lastSwing[ev.foot] = this.peak[ev.foot];
      this.peak[ev.foot] = 0;
      // (every real step counts, however close to the last: the P2 reader tells a jog's two contacts in bursts 60–100 ms apart —
      // run_in_place, a true 3.1 steps/s — so merging near steps halved its rate; it also tells a march's first two lifts
      // 100 ms apart, which runs Free Run at 0.68 of the stick for a second at 15 fps, R-F6, reported)
      if (this.lastSwing[ev.foot] >= STEP_SWING_M) { this.realSteps.push({ t: ev.t, j: this.jumpMs }); newReal = true; }
    }
    this.realSteps = this.realSteps.filter((x) => this.groundAge(x, t) <= STEP_HZ_WINDOW_MS);
    if (newReal) this.stepRates = [...this.stepRates, this.stepHz()].slice(-2);   // (kneeHz: the rate as it stood at this step)
    for (const ev of events) {
      if (ev.kind === 'step') this.stepAt = Math.max(this.stepAt, ev.t);   // (a shuffle's 3–6 cm lifts pass under the contact line, not the step's)
      if (ev.kind === 'land') this.landAt = Math.max(this.landAt, ev.t);
    }
    let trimRate: number | null = null;
    // no trim while stepping, nor through a landing's absorb and the stand back up out of it (the landing's, not a pump)
    const stepping = t - Math.max(this.lift.L, this.lift.R, this.stepAt) < TRIM_STEP_MS || t - this.landAt < TRIM_LAND_MS;
    // THE TRIM is read off the LEGS' own length (hip → ankle, world, both legs' mean), not the squat: a calf raise lifts the
    // ankles with the body (its heels coming down read a 0.9 /s "compress" off the squat, seeds 23 and 41), a pump folds the
    // legs. (The knee ANGLE is the same fold, but ill-conditioned near straight: it read ±1 /s of jitter standing still.)
    if (!inJump && read.airborne === false && !stepping) {
      const fold = (1 - (len(sub(P.hip[0], P.ank[0])) + len(sub(P.hip[1], P.ank[1]))) / (2 * leg)) / TRIM_FOLD_PER_UNIT;
      this.squats.push({ t, s: this.foldEuro.filter(fold, t) });
      // over TRIM_WINDOW_MS, or the last three frames when the camera is slower than that (15 fps: 66 ms a frame)
      const recent = this.squats.items.filter((q) => t - q.t <= TRIM_WINDOW_MS);
      trimRate = slopePerS(recent.length >= 3 ? recent : this.squats.items.slice(-3).filter((q) => t - q.t <= 3 * TRIM_WINDOW_MS));
    } else { this.squats.clear(); this.foldEuro.reset(); }
    let kneeDrive: number | null = null;
    if (read.knee && !inJump) {
      const kd = Math.max(read.knee.L.drive ?? -Infinity, read.knee.R.drive ?? -Infinity);
      if (Number.isFinite(kd)) this.knees.push({ t, d: kd });
    }
    if (this.knees.items.length) kneeDrive = Math.max(...this.knees.items.filter((q) => t - q.t <= KNEE_WINDOW_MS).map((q) => q.d));
    this.kneeRecent = this.knees.items.some((q) => t - q.t <= KNEE_RECENT_MS && q.d >= KNEE_RECENT_DRIVE);

    return this.out({ carve, grab, turnDeg, rate }, trunkFwdDeg, trimRate, kneeDrive, true);
  }

  /** A new body (lost, a recalibration): nothing it did is carried over. */
  reset(): void {
    this.filt = []; this.lastT = null;
    this.flipped = false; this.rawYawU = null; this.rawYawT = -Infinity;
    this.dropBody();
    this.kept = null;
  }

  get currentStance(): Stance | null { return this.stance; }

  // ── internals ──

  private setCalibration(cal: Calibration | null): void {
    this.cal = cal;
    this.tilt = tiltOf(cal?.pitchDeg ?? 0);
    this.reset();
  }

  /** Everything the body was doing, dropped; `keepStance` (a 'lost'): its stance kept for its return (`kept`). */
  private dropBody(keepStance = false): void {
    if (keepStance && this.stance) this.kept = { ...this.stance, n: { ...this.stance.n }, b: { ...this.stance.b } };
    this.stance = null; this.window.clear(); this.sideFrom = null; this.sideLead = null; this.squareFrom = null; this.hold01 = 0;
    this.yawU = null; this.yawPrev = null; this.yawTrail.clear(); this.base = null; this.outsideFrom = null; this.insideAt = -Infinity; this.armed = true;
    this.quarter = null; this.lastTurnDeg = 0;
    this.grabState = null; this.grabCand = null; this.grabEndAt = -Infinity;
    this.gripRaw = false; this.grip = false; this.gripSince = -Infinity; this.gripFlipAt = -Infinity; this.lastAngle = null; this.lastBothAt = -Infinity;
    this.wristTrail.clear(); this.takeFrom = null; this.takeLast = -Infinity;
    this.wingsRaw = false; this.wings = false; this.wingsFlipAt = -Infinity; this.lastWing = null;
    this.wingNeutral = null; this.wingOpen = { sum: 0, n: 0 }; this.wingT = -Infinity;
    this.squats.clear(); this.knees.clear(); this.kneeRecent = false; this.lift = { L: -Infinity, R: -Infinity }; this.stepAt = -Infinity; this.landAt = -Infinity;
    this.peak = { L: 0, R: 0 }; this.lastSwing = { L: 0, R: 0 }; this.realSteps = []; this.jumpMs = 0; this.heldHz = null; this.stepRates = []; this.runningNow = false; this.inJumpNow = false; this.carveEuro.reset(); this.foldEuro.reset();
    for (const f of this.filt) if (f) for (const e of f) e.reset();
  }

  /** The stance take (PLAN-P8 §2.3): a still hold side-on (or square for SQUARE_HOLD_MS); a still hold in the other
   *  lead re-takes it (riding switch); a square stance is upgraded by a side-on hold. */
  private takeStance(t: number, read: BodyRead, frame: PoseFrame, P: Pose, yaw: number, yawU: number, left: Vec2, d: P3, leg: number, inJump: boolean): void {
    const ru = read.rulers!;
    const im = frame.image;
    const ix = (i: number) => (this.flipped ? MIRROR_INDEX[i] : i);
    const imMid = (a: number, b: number) => ({ x: (im[ix(a)].x + im[ix(b)].x) / 2, y: (im[ix(a)].y + im[ix(b)].y) / 2 });
    const hm = imMid(LEFT_HIP, RIGHT_HIP), sm = imMid(LEFT_SHOULDER, RIGHT_SHOULDER);
    // the feet as their MIDPOINT: side-on, the far ankle is hidden behind the near leg and comes back unsure (3× the jitter in
    // the synth's model, as in the model's) — calibrate.ts's per-ankle rule failed every 30° stance at 1.5× noise (seed 41),
    // and the stance was taken later, mid-lean, with the lean for its neutral
    const am = imMid(LEFT_ANKLE, RIGHT_ANKLE);
    const v = [hm.x * ru.mPerX, hm.y * ru.mPerY, sm.x * ru.mPerX, sm.y * ru.mPerY, am.x * ru.mPerX, am.y * ru.mPerY];
    // the lead: the shoulder nearer the lens, confirmed by the nearer ankle (levelled z is toward the lens)
    const shAway = -(P.sh[0].z - P.sh[1].z), ankAway = -(P.ank[0].z - P.ank[1].z);
    const shNear: Side | null = Math.abs(shAway) < 0.05 ? null : shAway > 0 ? 'R' : 'L';
    const ankNear: Side | null = Math.abs(ankAway) < 0.02 ? null : ankAway > 0 ? 'R' : 'L';
    const a = Math.abs(yaw);
    const sideOk = a >= STANCE_MIN_DEG && a <= STANCE_MAX_DEG && shNear !== null && shNear === ankNear;
    const squareOk = a < STANCE_MIN_DEG;
    const ok = !inJump && read.airborne === false;
    this.window.push({ t, v, ok, yaw, yawU, lead: sideOk ? shNear : null, left, d });
    // the runs: side-on in one lead, or square, continuously
    if (ok && sideOk) { if (this.sideFrom === null || this.sideLead !== shNear) { this.sideFrom = t; this.sideLead = shNear; } }
    else { this.sideFrom = null; this.sideLead = null; }
    if (ok && squareOk) { if (this.squareFrom === null) this.squareFrom = t; } else this.squareFrom = null;

    // THE SAME BODY BACK (review fix, 2026-09-26): the stance a 'lost' dropped comes back as it was — its neutral, its axes —
    // the moment the body stands side-on in that lead again within ±FOLLOW_DEG of it (square again, for the square fallback).
    // Re-taken from a still hold instead, it learned its neutral off whatever the body held on its return: a held 8° edge
    // read 0.18 leg lengths (toe) or −0.08 (heel) against a true ~0.05, and the rest after steered 0.4–0.55 the other way in
    // 12 of 12 measured cells (both leads, toe and heel, 30 fps 1× / 1.5× flip, 15 fps 1.5× flip); with no dropout, 0.
    const k = this.kept;
    if (!this.stance && k && ok && (k.kind === 'side' ? sideOk && shNear === k.lead && Math.abs(wrap180(yaw - k.yawDeg)) <= FOLLOW_DEG : squareOk)) {
      this.stance = { ...k, t };
      this.kept = null;
      this.stYawU = yawU + wrap180(k.yawDeg - yaw);
      this.hold01 = 1;
      this.base = null; this.armed = true; this.insideAt = t; this.outsideFrom = null;
      return;
    }
    const st = this.stance;
    // …and a SETTLED side-on hold in the SAME lead further than TURN_REST_DEG off the stance's axis re-takes the axes (review
    // fix): a rider who squared up 22°+ toward the screen stayed off-stance for good — no quarter from there, and a nose / tail
    // shift steering off the old normal. Settled = still, and the yaw not drifting across the hold (REAXIS_DRIFT_DEG): CMU
    // 134_03's skater turns his whole body 30° through a carve at ~15°/s, "still" by the stance's own rule, and re-taken
    // mid-turn the axes moved under a heel carve that then missed its ON line in 8 of the train seeds' 48 cells. It keeps
    // the neutral and re-arms the quarter from there.
    const reaxis = !!st && st.kind === 'side' && this.sideFrom !== null && st.lead === this.sideLead && Math.abs(yawU - this.stYawU) > TURN_REST_DEG;
    const wantSide = this.sideFrom !== null && (!st || st.kind === 'square' || st.lead !== this.sideLead || reaxis);
    const wantSquare = this.squareFrom !== null && !st;
    if (!wantSide && !wantSquare) { this.hold01 = st ? 1 : 0; return; }
    const need = wantSide ? STANCE_HOLD_MS : SQUARE_HOLD_MS;
    const from = wantSide ? this.sideFrom! : this.squareFrom!;
    const still = this.stillOver(t, STANCE_HOLD_MS);
    const run = t - from;
    this.hold01 = st ? 1 : Math.min(still ? 1 : 0.9, run / need);
    if (!(run >= need - 20 && still)) return;
    // TAKEN: the axes and the neutral from the hold's own frames
    const hold = this.window.items.filter((q) => t - q.t <= STANCE_HOLD_MS);
    let lx = 0, lz = 0, yawSum = 0;
    for (const q of hold) { lx += q.left.x; lz += q.left.z; yawSum += q.yawU; }
    // (a re-axis whose hold, on the whole, sits inside the rest band of the axis it has, or still turns, is no re-axis — nor
    // one held on an edge: its mean carve on the axes it has past half the OFF line is a carve going, not a new rest. The
    // drift rule alone is noise-bound at 15 fps: CMU 134_03's whole-body turn through its heel carve reads ~9°/s on the
    // filtered shoulders, and on seed 23 at 15 fps the axes were re-taken inside it and the carve missed in all 8 cells.
    // Measured on the candidate holds, every seed × fps × noise × flip: 134_03's |mean carve| 0.043 median, all 26 over
    // CARVE_OFF / 2; the squared-up still holds 22–35° ≤ 0.019)
    const edge = reaxis ? hold.reduce((s, q) => s + dot2(q.d, st!.n), 0) / (hold.length * leg) - st!.neutral : 0;
    if (reaxis && (Math.abs(yawSum / hold.length - this.stYawU) <= TURN_REST_DEG || Math.abs(yawDrift(hold)) > REAXIS_DRIFT_DEG || Math.abs(edge) > CARVE_OFF / 2)) return;
    const ll = Math.hypot(lx, lz) || 1;
    const L: Vec2 = { x: lx / ll, z: lz / ll };
    const kind = wantSide ? 'side' : 'square';
    const lead = wantSide ? this.sideLead : null;
    const n = normalOf(L);
    const b = lead === 'R' ? { x: -L.x, z: -L.z } : L;
    // THE NEUTRAL: the hold's own mean — unless this body already had a stance in this lead (a re-axis, or one a 'lost' dropped
    // that did not come back inside the follow band): then that stance's neutral, kept. The centre's offset along the normal
    // turns with the body, so the same body's neutral is its own whatever its axes; a hold's mean is also whatever edge the
    // rider was holding (review fix — the slow re-centre inside the dead band still trims it at rest)
    const prev = kind === 'side' ? [st, this.kept].find((s) => s?.kind === 'side' && s.lead === lead) ?? null : null;
    const neutral = prev ? prev.neutral : hold.reduce((s, q) => s + (kind === 'side' ? dot2(q.d, n) : -dot2(q.d, L)), 0) / (hold.length * leg);
    this.kept = null;
    this.stYawU = yawSum / hold.length;
    this.stance = { kind, lead, yawDeg: wrap180(this.stYawU), n, b, neutral, t };
    this.hold01 = 1;
    // a new stance is a new rest for the turn
    this.base = null; this.armed = true; this.insideAt = t; this.outsideFrom = null;
  }

  /** calibrate.ts's stillness over the last `ms`: each track's running mean (5 frames) moves less than the limits. */
  private stillOver(t: number, ms: number): boolean {
    const w = this.window.items.filter((q) => t - q.t <= ms);
    if (w.length < 6 || t - w[0].t < ms * 0.85) return false;
    const runMean = (k: number) => {
      const xs = w.map((q) => q.v[k]), out: number[] = [];
      for (let i = 0; i < xs.length; i++) { const a = Math.max(0, i - 2), b = Math.min(xs.length, i + 3); let s = 0; for (let j = a; j < b; j++) s += xs[j]; out.push(s / (b - a)); }
      return sd(out);
    };
    const torso = Math.max(runMean(0), runMean(1), runMean(2), runMean(3));
    const feet = Math.max(runMean(4), runMean(5));
    // …and the SHOULDERS still in yaw: a turn in place hardly moves the torso's midpoint, and a frontside quarter-turn from a
    // 30° stance ends side-on the other way — its hold was re-taken as a switch stance 734 ms after the turn entered the band
    const yawSd = sd(w.map((_, i) => { const a = Math.max(0, i - 2), b = Math.min(w.length, i + 3); let s2 = 0; for (let j = a; j < b; j++) s2 += w[j].yawU; return s2 / (b - a); }));
    return torso <= STILL_TORSO_SD_M && feet <= STILL_ANKLE_SD_M && yawSd <= STILL_YAW_SD_DEG;
  }

  /** The shoulders' yaw rate over the last FOLLOW_RATE_MS (deg/s; 0 until the trail spans a third of it). */
  private yawRate(t: number): number {
    const a = this.yawTrail.items[0], b = this.yawTrail.items[this.yawTrail.items.length - 1];
    if (!a || !b || t - a.t < FOLLOW_RATE_MS / 3) return 0;
    return ((b.u - a.u) * 1000) / (b.t - a.t);
  }

  private turnDeg(yawU: number): number {
    if (this.stance) return yawU - this.stYawU;
    return this.base === null ? 0 : yawU - this.base;
  }

  /** The quarter-turn (PLAN-P8 §2.4): ≥ QUARTER_DEG off the rest within QUARTER_MS of leaving ±TURN_REST_DEG. */
  private turnStep(t: number, yawU: number, inJump: boolean, dtMs: number): void {
    if (!this.stance) {
      // the baseline follows the rider while no turn is going (and rebases once a turn has been held BASE_REBASE_MS)
      if (this.base === null) this.base = yawU;
      const off = yawU - this.base;
      if (Math.abs(off) <= TURN_REST_DEG) { if (!inJump) this.base += off * Math.min(1, dtMs / BASE_TAU_MS); this.outsideFrom = null; }
      else if (this.outsideFrom === null) this.outsideFrom = t;
      else if (t - this.outsideFrom > BASE_REBASE_MS && !inJump) { this.base = yawU; this.outsideFrom = null; }
    }
    const deg = this.turnDeg(yawU);
    const a = Math.abs(deg);
    if (a <= TURN_REST_DEG) { this.insideAt = t; this.armed = true; return; }
    if (this.armed && a >= QUARTER_DEG && t - this.insideAt <= QUARTER_MS) {
      this.armed = false;
      const leadSign = this.stance?.lead === 'R' ? 1 : -1;   // a regular rider's stance yaw is negative
      const dir: 'fs' | 'bs' = Math.sign(deg) === -leadSign ? 'fs' : 'bs';
      this.quarter = { dir, side: deg > 0 ? 'L' : 'R', t, seq: ++this.seq };
    }
  }

  private grabStep(t: number, P: Pose, ankM: P3, n: Vec2): void {
    const below = (i: 0 | 1) => P.knee[i].y - P.wr[i].y;   // + = the wrist under its knee
    const g = this.grabState;
    if (g) {
      const i = g.wrist === 'L' ? 0 : 1;
      if (below(i) < -GRAB_OFF_M) { this.grabState = null; this.grabCand = null; this.grabEndAt = t; }
      return;
    }
    // one grab per reach: the legs extending for the landing drop the knees past a hand still on its way up (a second
    // "grab" 130 ms after the first let go, on every scripted grab hop)
    if (t - this.grabEndAt < GRAB_REFRACTORY_MS) { this.grabCand = null; return; }
    const cand = ([0, 1] as const).filter((i) => below(i) >= GRAB_ON_M).sort((x, y) => below(y) - below(x))[0];
    if (cand === undefined) { this.grabCand = null; return; }
    const w: Side = cand === 0 ? 'L' : 'R';
    if (!this.grabCand || this.grabCand.wrist !== w) this.grabCand = { wrist: w, from: t };
    if (t - this.grabCand.from >= GRAB_DWELL_MS) this.grabState = { wrist: w, since: t, downFrom: this.grabCand.from };
    void ankM; void n;
  }

  private edgeOf(wr: P3, ankM: P3, n: Vec2): 'toe' | 'heel' | null {
    const e = dot2(sub(wr, ankM), n);
    return e > GRAB_EDGE_M ? 'toe' : e < -GRAB_EDGE_M ? 'heel' : null;
  }

  private wheelStep(t: number, P: Pose, cal: Calibration, facing: boolean, left: Vec2, inJump: boolean): void {
    const hipM = mid(P.hip[0], P.hip[1]), shM = mid(P.sh[0], P.sh[1]);
    const lo = hipM.y + WHEEL_LOW_TORSO * cal.torsoM;
    const n = normalOf(left);
    const elbow = [angleAt(P.sh[0], P.el[0], P.wr[0]), angleAt(P.sh[1], P.el[1], P.wr[1])];
    const handOk = (i: 0 | 1, high: number) => {
      const ahead = dot2(sub(P.wr[i], P.sh[i]), n);   // a wheel is held IN FRONT (hands on the hips are not a wheel)
      return P.wristSeen[i] && elbow[i] <= WHEEL_ELBOW_LOCK && P.wr[i].y >= lo && P.wr[i].y <= shM.y + high && ahead >= WHEEL_AHEAD_M;
    };
    // (the band to KEEP a wheel reaches higher than the band to take one)
    const okL = handOk(0, this.grip ? WHEEL_HIGH_KEEP_M : WHEEL_HIGH_M), okR = handOk(1, this.grip ? WHEEL_HIGH_KEEP_M : WHEEL_HIGH_M);
    const span = Math.hypot(P.wr[0].x - P.wr[1].x, P.wr[0].y - P.wr[1].y, P.wr[0].z - P.wr[1].z);
    // …and the two hands' MEAN height at the chest (a 60° turn drops one hand to the belly, never both: CMU 141_13's relaxed
    // hands hanging forward at the thighs, elbows soft, gripped a "wheel" for 1.5 s on the low band alone)
    const meanUp = (P.wr[0].y + P.wr[1].y) / 2 >= hipM.y + WHEEL_MEAN_TORSO * cal.torsoM;
    const both = facing && okL && okR && meanUp && Math.min(elbow[0], elbow[1]) <= WHEEL_ELBOW_MAX && span >= WHEEL_SPAN_M[0] && span <= WHEEL_SPAN_M[1];
    if (both) {
      // the wrist line's tilt against the SHOULDERS' (a torso leaning with the wheel centred turns nothing)
      const wrist = Math.atan2(P.wr[0].y - P.wr[1].y, Math.hypot(P.wr[0].x - P.wr[1].x, P.wr[0].z - P.wr[1].z)) * DEG;
      const sh = Math.atan2(P.sh[0].y - P.sh[1].y, Math.hypot(P.sh[0].x - P.sh[1].x, P.sh[0].z - P.sh[1].z)) * DEG;
      this.lastAngle = wrist - sh;
      this.lastBothAt = t;
    }
    // TAKING it (R-F2): the band, plus the hands at one depth, centred on the sternum, and slow — held GRIP_ON_MS
    this.wristTrail.push({ t, L: P.wr[0], R: P.wr[1] });
    const old = this.wristTrail.items.find((q) => t - q.t <= WHEEL_SPEED_MS * 1.5 && t - q.t >= WHEEL_SPEED_MS * 0.66);
    const speed = (a: P3, b: P3, dt: number) => len(sub(a, b)) / Math.max(1e-3, dt / 1000);
    // (no hand swinging — and the wheel's CENTRE steady: turning a wheel moves the hands round its centre, in opposite
    // directions; an arm swing or an arm-circle stretch carries both hands the same way at once)
    const slow = !!old && speed(P.wr[0], old.L, t - old.t) <= WHEEL_SPEED_MAX && speed(P.wr[1], old.R, t - old.t) <= WHEEL_SPEED_MAX
      && speed(mid(P.wr[0], P.wr[1]), mid(old.L, old.R), t - old.t) <= WHEEL_CENTRE_SPEED_MAX;
    const depth = Math.abs(dot2(sub(P.wr[0], P.sh[0]), n) - dot2(sub(P.wr[1], P.sh[1]), n));
    const across = Math.abs(dot2(sub(mid(P.wr[0], P.wr[1]), shM), left));
    // (the wheel is taken STRAIGHT: the take starts on a level wheel, then may turn — a driver's first move; and standing: a
    // jump's landing brought jump_two_foot_low's hands through the grip pose, 3 frames into its absorb)
    const takes = !inJump && both && slow && depth <= WHEEL_DEPTH_MATCH_M && across <= WHEEL_CENTRE_M;
    const level = Math.abs(this.lastAngle ?? Infinity) <= WHEEL_TAKE_LEVEL_DEG;
    if (takes && (this.takeFrom !== null || level)) { this.takeFrom ??= t; this.takeLast = t; } else if (t - this.takeLast > WHEEL_TAKE_GAP_MS) this.takeFrom = null;
    if (!this.grip) {
      if (takes && this.takeFrom !== null && t - this.takeFrom >= GRIP_ON_MS) { this.grip = true; this.gripSince = t; this.gripRaw = true; this.gripFlipAt = t; }
      return;
    }
    // …and KEEPING it: the band (or one hand for ONE_HAND_MS); let go after GRIP_OFF_MS without
    const held = both || (facing && (okL || okR) && t - this.lastBothAt <= ONE_HAND_MS);
    if (held !== this.gripRaw) { this.gripRaw = held; this.gripFlipAt = t; }
    if (!this.gripRaw && t - this.gripFlipAt >= GRIP_OFF_MS) { this.grip = false; this.gripSince = t; this.takeFrom = null; }
  }

  private wingsStep(t: number, P: Pose, cal: Calibration, facing: boolean, left: Vec2): void {
    const dtMs = Number.isFinite(this.wingT) ? Math.max(0, t - this.wingT) : 0;
    this.wingT = t;
    const arm = (i: 0 | 1) => {
      const S = P.sh[i], W = P.wr[i], v = sub(W, S), r = len(v);
      const armM = i === 0 ? cal.armM.L : cal.armM.R;
      const out = (i === 0 ? 1 : -1) * (v.x * left.x + v.z * left.z);
      const elev = Math.asin(Math.max(-1, Math.min(1, v.y / Math.max(1e-6, r)))) * DEG;
      const elbow = angleAt(S, P.el[i], W);
      return { ok: P.wristSeen[i] && elbow >= WING_ELBOW_MIN && r >= WING_REACH * armM && out >= WING_OUT * armM && Math.abs(elev) <= WING_ELEV_DEG, elev };
    };
    const L = arm(0), R = arm(1);
    const on = facing && L.ok && R.ok;
    const elev = (L.elev + R.elev) / 2;
    if (on) {
      // the climb (WING_NEUTRAL_MAX_DEG): the symmetric part past the wings' own level — one arm raised is a bank, not a climb
      const m = elev - (this.wingNeutral ?? elev);
      this.lastWing = {
        bank: Math.atan2(P.wr[0].y - P.wr[1].y, P.wr[0].x - P.wr[1].x) * DEG,
        pitch: Math.sign(m) * Math.max(0, Math.abs(m) - Math.max(0, Math.abs(L.elev - R.elev) / 2 - WING_TILT_SLACK_DEG)),
      };
      // the level re-centres slowly while the wings rest inside the climb's dead band (a held climb is never eaten)
      if (this.wings && this.wingNeutral !== null && Math.abs(m) < WING_REST_DEG) this.wingNeutral += (elev - this.wingNeutral) * Math.min(1, dtMs / NEUTRAL_TAU_MS);
    }
    // opening needs the arms still (the wrist trail is the wheel's, pushed just before this)
    const old = this.wristTrail.items.find((q) => t - q.t <= WHEEL_SPEED_MS * 1.5 && t - q.t >= WHEEL_SPEED_MS * 0.66);
    const still = !!old && len(sub(P.wr[0], old.L)) / ((t - old.t) / 1000) <= WING_SPEED_MAX && len(sub(P.wr[1], old.R)) / ((t - old.t) / 1000) <= WING_SPEED_MAX;
    const raw = on && (this.wings || still);
    if (raw !== this.wingsRaw) { this.wingsRaw = raw; this.wingsFlipAt = t; this.wingOpen = { sum: 0, n: 0 }; }
    if (!this.wings && raw) { this.wingOpen.sum += elev; this.wingOpen.n++; }
    if (!this.wings && this.wingsRaw && t - this.wingsFlipAt >= WINGS_ON_MS) {
      this.wings = true;
      // the wings' own level: where the arms were held through the opening dwell
      const mean = this.wingOpen.n ? this.wingOpen.sum / this.wingOpen.n : elev;
      this.wingNeutral = Math.max(-WING_NEUTRAL_MAX_DEG, Math.min(WING_NEUTRAL_MAX_DEG, mean));
    }
    if (this.wings && !this.wingsRaw && t - this.wingsFlipAt >= WINGS_OFF_MS) { this.wings = false; this.wingNeutral = null; }
  }

  /** A real step's age on the ground (ms): the time since it, less the time spent in jumps since. */
  private groundAge(x: { t: number; j: number }, now: number): number { return now - x.t - (this.jumpMs - x.j); }

  /** The real steps' rate (the last up to 5 inside STEP_HZ_WINDOW_MS; at least 4). */
  private stepHz(): number | null {
    const s = this.realSteps.map((x) => x.t).sort((a, b) => a - b).slice(-5);
    if (s.length < 4 || s[s.length - 1] <= s[0]) return null;
    return ((s.length - 1) * 1000) / (s[s.length - 1] - s[0]);
  }

  private out(
    m: { carve: number | null; grab: RideRead['grab']; turnDeg: number; rate: number } | null,
    trunkFwdDeg: number | null, trimRate: number | null, kneeDrive: number | null, tracked: true | null,
  ): RideRead {
    const st = this.stance;
    const now = this.lastT ?? 0;
    // (and the last real step still recent: a jittered step after a stop revives the stride channel's hold, never this) —
    // HELD through a body jump, as the stride channel is (a run-up's flight is not a stop: Free Run's RUN went to 0 at the
    // landing of dunk_approach_two_foot, 7 ms inside the jump)
    if (!this.inJumpNow) {
      const ages = this.realSteps.map((x) => this.groundAge(x, now));
      this.runningNow = ages.filter((a) => a <= RUNNING_MS).length >= RUNNING_STEPS && Math.min(...ages) <= RUNNING_LAST_MS;
      // the rate is held while running (a run-up's oldest step ageing out of the window at the take-off is not a stop)
      const hz = this.stepHz();
      if (hz !== null) this.heldHz = hz;
      if (!this.runningNow) { this.heldHz = null; this.stepRates = []; }
    }
    const running = this.runningNow;
    const steerSign: 1 | -1 = st?.kind === 'side' && st.lead === 'R' ? -1 : 1;
    return {
      stance: st ? { ...st, n: { ...st.n }, b: { ...st.b } } : null,
      stanceHold01: this.hold01,
      carve: m?.carve ?? null,
      steerSign,
      grab: m?.grab ?? null,
      // (an unread frame holds the turn where it was: a missed detection is not a snap back to the stance)
      turn: { deg: m ? (this.lastTurnDeg = m.turnDeg) : this.lastTurnDeg, rateDps: m?.rate ?? 0, quarter: this.quarter },
      wheel: { grip: tracked ? this.grip : false, angleDeg: tracked && this.grip ? this.lastAngle : null, since: this.gripSince },
      wings: tracked && this.wings && this.lastWing ? { on: true, bankDeg: this.lastWing.bank, pitchDeg: this.lastWing.pitch } : { on: false, bankDeg: null, pitchDeg: null },
      trimRate, kneeDrive, kneeDriveRecent: tracked ? this.kneeRecent : false,
      lift: { ...this.lift },
      swing: { ...this.lastSwing },
      running,
      stepHz: running ? this.heldHz : null,
      kneeHz: running && this.stepRates.length === 2 && this.stepRates.every((x) => x !== null) ? Math.min(...(this.stepRates as number[])) : null,
      trunkFwdDeg,
      flipped: this.flipped,
    };
  }
}

/** The stance's left axis (the regular board axis): b for a left lead, −b for a right one, b on the square fallback. */
function leftAxisOfStance(st: Stance): Vec2 {
  return st.lead === 'R' ? { x: -st.b.x, z: -st.b.z } : st.b;
}

/** The yaw's drift across a hold (deg): its second half's mean less its first half's. */
function yawDrift(hold: readonly { t: number; yawU: number }[]): number {
  if (hold.length < 4) return 0;
  const mid = (hold[0].t + hold[hold.length - 1].t) / 2;
  const a = hold.filter((q) => q.t < mid), b = hold.filter((q) => q.t >= mid);
  const mean = (xs: readonly { yawU: number }[]) => xs.reduce((s2, q) => s2 + q.yawU, 0) / xs.length;
  return a.length && b.length ? mean(b) - mean(a) : 0;
}

/** Least-squares slope (per s) of s over t (ms); null under three samples. */
function slopePerS(q: readonly { t: number; s: number }[]): number | null {
  if (q.length < 3) return null;
  const n = q.length, mt = q.reduce((a, x) => a + x.t, 0) / n, ms = q.reduce((a, x) => a + x.s, 0) / n;
  let num = 0, den = 0;
  for (const x of q) { num += (x.t - mt) * (x.s - ms); den += (x.t - mt) ** 2; }
  return den > 0 ? (num / den) * 1000 : null;
}

/** The ride controls' own ramps (ON/OFF hysteresis handled by the floor): exported for the gate and the floor. */
export const ride01 = ramp01;
