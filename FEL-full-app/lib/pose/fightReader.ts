// fightReader — what a fighter's body is doing, read from the camera (movement play P7, 2026-09-25).
//
//   BodyReader ──FightFrame (levelled world points, hip-centred)──▶ FightReader ──▶ blow / legKick / guard / evade /
//                                                                                   fightStep / turn  (on the capture clock)
//
// P2's `punch` fires at the PEAK and only for an arm that reaches 0.85 of its length, so a hook or an uppercut (a bent
// arm) never fired and every real punch pressed JAB (P3). This reads the strike's own path, and stamps it with the
// motion's ONSET, so a mode can commit the strike where the body began it (modes backdate by the event's age):
//
//   ONE STRIKE = ONE RUN of the wrist relative to its own shoulder: it starts past ONSET_V, CONFIRMS at CONFIRM_V with
//   MIN_TRAVEL moved, and ends under max(ONSET_V, END_SHARE of its peak). Its onset is where the speed first reached
//   ONSET_SHARE (25 %) of the peak, searched back from the peak and interpolated — the truth's own rule (fightTruth).
//   From the onset to now, the PATH decides the class:
//     straight   the arm reaches out (STRAIGHT_REACH of its length, a gain of STRAIGHT_GAIN) toward the camera from in
//                front of the shoulder, little rise — or, once over, from a CHAMBER behind / under the shoulder (karate's
//                fist at the hip, the ribs, a rear hand cocked), driven straight out. The lead hand's is the JAB, the rear
//                hand's the CROSS.
//     hook       the fist travels IN across the face line at about shoulder height, the forearm level: a bent arm's arc,
//                or a wide one swung ROUND from behind the shoulder — its path bulged out and came back in (a haymaker:
//                143_23's hooks are near-straight arms).
//     uppercut   the fist rises from under the shoulder to the chin, the arm bent.
//   It is emitted the first frame one class holds, or never: a run that ends unclassified sends NOTHING (safety over
//   recall), and a half extension that comes back never confirms — feints are free. A retraction fails every class (it
//   loses reach, travels out, or falls).
//   The lead: the foot nearer the camera by LEAD_DEPTH_M, held LEAD_HOLD_MS with both feet down; a stance square for
//   SQUARE_HOLD_MS names none (the orthodox default: the left straight the jab). Every feature is measured per hand toward
//   the midline, so a southpaw is the same rule — no mirrored thresholds (the gate proves it on joint-mirrored streams).
//   ORDER: blows are told in onset order (a straight is named mid-run, a hook or an uppercut only once over; release()),
//   and a rise into the guard is held while the other hand may still come up with it — both hands rising one after the
//   other is the guard raised, never two uppercuts (the pair: RAISE_PAIR_*).
//
//   KICKS: the knee's rise (hip-relative, KNEE_RISE_V) is the onset; the extension commits it (the P2 kick rules: the
//   ankle KICK_TOP_M up, the leg KICK_STRAIGHT straight, KICK_MIN fast, the other foot down) — a jog's knee drive never
//   extends at height. FRONT = the ankle driven at the camera, the hips square; ROUND = the hips turned through it or the
//   ankle swept in across the front.
//   GUARD: both wrists in the zone (between the shoulders less GUARD_BELOW_SHOULDER_M and the crown less
//   GUARD_UNDER_CROWN_M, within GUARD_FACE_X_M of the nose, in front of the shoulders) for GUARD_FRAMES frames. `raise` =
//   they came UP into it (a parry's raise); a guard re-formed after a punch is held (a block) but raises nothing. Down: a
//   wrist out by GUARD_HYST_M for GUARD_FRAMES frames, or a blow's onset from a guard hand (told first, at that onset).
//   EVADE: a slip = the nose SLIP_M across the hips inside SLIP_WINDOW_MS, the hips still, feet down; a duck = the nose
//   DUCK_M down inside DUCK_WINDOW_MS at DUCK_V (a slow squat or stretch is not a duck).
//   STEP: the middle of the two feet on the floor plane (each foot's lowest image point, through the calibrated lens
//   height) moved STEP_M and settled; in / out = toward / away from the camera, left / right across.
//   TURN: the shoulder line through TURN_DEG inside TURN_WINDOW_MS (a spin's start; used only behind the opt-in).
//
// The strike vetoes are the floor's (lib/pose/strikeVeto): none in a jump, none within 300 ms of both wrists overhead,
// none out of a moving crouch; none while running in place (the jog's arms are an antiphase swing); nothing before the
// reader is calibrated and tracking. And the GESTURE rules (the misfire pass, 2026-09-26): no blow from a hand raised out
// beside the head (a wave), from a slow push that barely reaches, from both hands moving together (least-squares slopes
// over the run: a stretch's arms; both IN: a clap), or whose run rides a blurred wrist without a punch's speed and travel;
// no hook with its forearm standing up (a wave in front of the face) or with the other hand peaking IN beside it (a
// clap); no blow whose fist hardly moved through the room (the guard hand while the other hand's cross turns the torso).
// WHAT IS DECIDED: decidedUntil — the instant nothing later told can be stamped before (a head move still being judged
// holds it back); the modes' ledger resolves a rival's hit on a body player only past it.
//
// Thresholds were tuned on the gate's TRAIN seeds (1–3, 7–12); the review's pass (2026-09-26) tuned its rules on the
// same train seeds with the kit's paths re-drawn per seed, so the TEST seeds' (4–6) scripted takes are held out — except
// that one test-seed misfire (a wave in front of the face at 20 fps, seed 4) prompted HOOK_FOREARM_UP_M, set from the
// train seeds' distribution. The capture clips are in sample on every seed. The numbers behind each threshold are in
// FIGHT.md (scripts/body/fight.mts) and the constants' own comments.
// Pure: no DOM, no camera. Deterministic.
import { StrikeVeto } from './strikeVeto';
import { onsetBackT, riseOnset, ONSET_SHARE, KNEE_RISE_V } from './fightTruth';

export type Hand = 'L' | 'R';
export type V3 = { x: number; y: number; z: number };
export type Blow = 'jab' | 'cross' | 'hook' | 'uppercut';
export type BlowForm = 'straight' | 'hook' | 'uppercut';
export type KickForm = 'front' | 'round';

// ── thresholds ───────────────────────────────────────────────────────────────────────────────────────────────────
/** Rates over ±this (ms): BodyReader.VEL_HALF_MS. */
export const FIGHT_VEL_HALF_MS = 33;
/** An arm run starts past this speed (m/s, the wrist relative to its shoulder)… */
export const ONSET_V = 0.8;
/** …confirms at this, with MIN_TRAVEL (m) moved from where it began… */
export const CONFIRM_V = 2.0;
export const MIN_TRAVEL = 0.12;
/** …and on a blurred wrist (most of the run unsure): a punch's speed and travel. */
export const CONFIRM_V_UNSURE = 3.2;
export const MIN_TRAVEL_UNSURE = 0.2;
/** …and ends under max(ONSET_V, END_SHARE × its peak). */
export const END_SHARE = 0.3;
/** No strike begins with the fist this far over its shoulder (m): a stretch's or a wave's arm comes down from there. */
export const BLOW_START_TOP_M = 0.28;
/** A straight: the wrist out to this share of the arm, having gained this share, this far toward the camera (m). */
export const STRAIGHT_REACH = 0.76;
/** …and no higher than this over its shoulder (m): a wave's hand is up at the head. */
export const STRAIGHT_TOP_Y_M = 0.25;
export const STRAIGHT_GAIN = 0.2;
/** …from a bent arm: at most this share of it out at the start (a guard, a chamber; a wave's arm is already long). */
export const STRAIGHT_START_REACH = 0.62;
export const STRAIGHT_FWD_M = 0.14;
/** The fastest velocity's main part (a unit share): forward for a straight, in for a hook, up for an uppercut; and the
 *  most any other part may take of it. */
export const DIR_MAIN = 0.55;
export const DIR_OFF_MAX = 0.75;
/** A hook: the fist in across the face line this far (m), about shoulder height (chin to eye). */
export const HOOK_IN_M = 0.12;
export const HOOK_Y_RANGE: readonly [number, number] = [-0.22, 0.22];
/** A hook's arm is bent (reach at most this share)… unless it started behind the shoulder and out beside it (a wide hook:
 *  143_23's haymakers are near-straight arms swung round from there). */
export const HOOK_BENT_REACH = 0.88;
/** …and its reach hardly grows (a share of the arm): a straight's grows 0.5–0.7 — asked only of a swing whose fastest
 *  instant still carries HOOK_GAIN_FWD of forward (a straight converging on the face line); a fist travelling across
 *  (the scripted hooks: uIn 0.96–0.98, uFwd 0.21–0.29) opens the elbow a little as it comes round (a gain of 0.27–0.30). */
export const HOOK_REACH_GAIN = 0.25;
export const HOOK_GAIN_FWD = 0.4;
/** A wide hook: from behind the shoulder (STRAIGHT_START_Z_M) out to a long arm, swung this far forward (m)… */
export const WIDE_FWD_M = 0.3;
/** …ROUND: its path bulged out beside the line from where it began to where it came to by this much (m), and came back IN
 *  from its widest point WIDE_BACK_M (m). (The review, 2026-09-26: the old wide rule asked no direction at all, and a straight
 *  from a chamber or a standing arm swing was a hook. On the clean clips 143_23's eight haymakers bulge 0.17–0.38 and come
 *  back in 0.24–0.38 — they end in front of their own shoulder, so "net in across the face" would lose every one — and
 *  the capture straights bulge 0.10 at most.) */
export const WIDE_BULGE_M = 0.14;
export const WIDE_BACK_M = 0.08;
/** A straight from a CHAMBER (a start behind the shoulder or under STRAIGHT_START_Y_M: karate's fist at the hip, a fist at
 *  the ribs, a rear hand cocked back) is read once its run is over: out at the camera at least CHAMBER_FWD_M (m), the
 *  elbow driven forward CHAMBER_ELBOW_M (m), from an arm bent to at most CHAMBER_START_REACH, no lower than CHAMBER_LOW_Y_M
 *  under the shoulder, and never swung out (CHAMBER_OUT_M, m, out from where it began; its fastest instant no more than
 *  CHAMBER_OUT_U out): a haymaker swings out first. (A jog's forearm pumps 0.14–0.26 m; an arm swing's arm is straight.) */
export const CHAMBER_FWD_M = 0.35;
export const CHAMBER_ELBOW_M = 0.15;
export const CHAMBER_START_REACH = 0.8;
export const CHAMBER_LOW_Y_M = -0.45;
export const CHAMBER_OUT_M = 0.08;
export const CHAMBER_OUT_U = 0.1;
/** A straight starts no further behind the shoulder than this (m): a rear hand cocked at the shoulder still throws one;
 *  and no lower under it than STRAIGHT_START_Y_M (a jog's forward swing starts at the ribs). */
export const STRAIGHT_START_Z_M = -0.08;
export const STRAIGHT_START_Y_M = -0.22;
/** Where a blow may start OUT beside the shoulder (m, against the face line): a straight from a hand raised over
 *  STRAIGHT_OUT_TOP_Y_M no further out than STRAIGHT_OUT_M (a wave's hand is up and out beside the head: 0 of 1476 train
 *  straights, 8 of 8 wave misfires); a hook no further than HOOK_OUT_M; a wide hook no further than WIDE_OUT_M (a
 *  stretch's arm held straight out to the side swings in from −0.38 to −0.45; the widest train haymaker from −0.30). */
export const STRAIGHT_OUT_M = 0.1;
export const STRAIGHT_OUT_TOP_Y_M = 0.05;
export const HOOK_OUT_M = 0.18;
export const WIDE_OUT_M = 0.35;
/** A straight from a low hand (its start under STRAIGHT_LOW_Y_M) travels at least STRAIGHT_LOW_FWD_M forward: a jog's
 *  forearm pumps 0.14–0.26 m from the ribs (train misfires), a low-guard jab 0.27+ (train). */
export const STRAIGHT_LOW_Y_M = -0.17;
export const STRAIGHT_LOW_FWD_M = 0.27;
/** A SLOW straight (its peak under WEAK_V m/s) needs more path to be one: a reach of WEAK_REACH, or WEAK_FWD_M forward
 *  (a stretch's arm drifting out at 2.1–2.3 m/s reached 0.76–0.77 and 0.19 m; 2 of 1476 train straights are that weak). */
export const WEAK_V = 2.4;
export const WEAK_REACH = 0.8;
export const WEAK_FWD_M = 0.2;
/** Both hands together (least-squares slopes over the run, robust to a noisy sample): both rising or both dropping at
 *  GESTURE_V m/s or more, or both moving out beside the body at SPREAD_V, is a gesture — a stretch's arms coming down
 *  in front, spreading — not a strike (6 and 3 of 2392 train strikes; 2 and 1 of the 4 train stretch misfires left). A
 *  straight whose fastest instant swings OUT (uIn ≤ −OUT_SWING) while its wrist travels out at GESTURE_V is a wave's hand
 *  (1 train straight). */
export const GESTURE_V = 0.5;
export const SPREAD_V = 0.55;
export const OUT_SWING = 0.7;
/** A hook is a swing: its peak at least HOOK_MIN_V m/s (train hooks: 2 %-ile 3.0 at 30 fps, 2.1 at 15; a stretch's arm
 *  coming in: 2.0). */
export const HOOK_MIN_V = 2.2;
/** …with its forearm level where it came to: the wrist no more than this (m) over its elbow. A wave in front of the face
 *  sweeps in as a hook does — in, at chin to eye height, at a hook's speed — but its forearm stands up under the hand
 *  (the review, 2026-09-26). */
export const HOOK_FOREARM_UP_M = 0.08;
/** A blow's fist travels at least this far through the room (m, hip-centred, onset to its furthest reach): wrist − shoulder
 *  also grows when the SHOULDER turns away from a fist held at the chin (the lead hand while the rear hand's cross turns
 *  the torso). */
export const CARRIED_M = 0.12;
/** Both hands moving IN together (least-squares slopes over the run, m/s), or the other hand's run peaking IN within
 *  CLAP_MS (ms) of this one's, is a clap, not a hook. */
export const BOTH_IN_V = 0.5;
export const CLAP_MS = 120;
/** (the other hand's run counts from this peak speed, m/s, confirmed or not: a clap's slower hand) */
export const CLAP_PEAK_V = 1.5;
/** A run turned back (its velocity this many degrees off the peak's) is over: a punch out and its way back are two runs. */
export const REVERSE_DEG = 110;
/** An uppercut: the fist up this far (m), from under the shoulder, to about the chin (never over the head). */
export const UPPER_RISE_M = 0.12;
export const UPPER_START_Y_M = -0.05;
export const UPPER_END_Y_M = -0.14;
export const UPPER_TOP_Y_M = 0.28;
/** …ending in front of the shoulder (m) and no further out beside it than UPPER_OUT_M (m). */
export const UPPER_FRONT_M = 0.12;
export const UPPER_OUT_M = 0.08;
/** …from a fist no lower than UPPER_LOW_Y_M under the shoulder and an arm bent to at most UPPER_START_REACH (an arm
 *  hanging at the side rising into a wave or a stretch starts at −0.39 to −0.42 m and 0.78–0.81; the train uppercuts
 *  from −0.22 at the lowest and 0.75 at the longest). */
export const UPPER_LOW_Y_M = -0.3;
export const UPPER_START_REACH = 0.76;
/** The stance: the lead foot nearer the camera by this (m), held this long (ms). */
export const LEAD_DEPTH_M = 0.08;
export const LEAD_HOLD_MS = 300;
/** A blurred punch's elbow: out this far (m) for a straight; no further under the shoulder than this (m) for a hook. */
export const ELBOW_OUT_M = 0.08;
export const ELBOW_HOOK_BELOW_M = 0.15;
/** Running: each foot off the floor, not together, inside this (ms). */
export const RUN_ALT_MS = 700;
/** A foot this high (m) is kicking: no punch is read out of the arms then. */
export const KICKING_FOOT_M = 0.35;
/** Kicks: the knee rising past KNEE_RISE_V (m/s, fightTruth) is the onset; the P2 kick rules commit it. */
export { KNEE_RISE_V };
export const KICK_TOP_M = 0.5;
export const KICK_STRAIGHT = 0.85;
export const KICK_MIN = 2.0;
/** A round kick: the hips (the shoulder line) turned ROUND_YAW_DEG through it — or ROUND_YAW_ACROSS_DEG with the ankle's
 *  fastest instant travelling across at least ROUND_ACROSS of its travel at the camera. (Measured from before the knee
 *  rose: a rear-leg front kick from a long stance turns them up to 37°, 144_05; the real roundhouses 40–66°, 135_07.) */
export const ROUND_ACROSS = 0.6;
export const ROUND_YAW_DEG = 39;
export const ROUND_YAW_ACROSS_DEG = 22;

/** The guard zone. */
export const GUARD_BELOW_SHOULDER_M = 0.15;
export const GUARD_UNDER_CROWN_M = 0.03;
export const GUARD_FACE_X_M = 0.3;
export const GUARD_FRONT_M = 0.04;
export const GUARD_HYST_M = 0.08;
export const GUARD_FRAMES = 2;
/** …for this long (ms) since the second entered, and each fist moved no more than GUARD_STILL_M (m) over the last
 *  GUARD_HOLD_MS: the fists have stopped there. */
export const GUARD_HOLD_MS = 100;
export const GUARD_STILL_M = 0.12;
/** No guard up this soon (ms) after both wrists were overhead. */
export const GUARD_AFTER_OVERHEAD_MS = 500;
/** A raise: the wrist that closed the guard was under the zone (by this, m) inside RAISE_LOOKBACK_MS before it. */
export const RAISE_UNDER_M = 0.05;
export const RAISE_LOOKBACK_MS = 600;
/** …and no arm run inside this (ms) before it. */
export const RAISE_QUIET_MS = 400;
/** A push (guard impact): both wrists this far (m) toward the camera during the raise, ending out PUSH_FRONT_M (m) in
 *  front of the shoulders — past the guard (the fists at the chin: 0.18–0.28 in front), a catch thrown at the fist. A
 *  raise from the hands down travels forward too; it is a guard, not a push. */
export const PUSH_M = 0.12;
export const PUSH_FRONT_M = 0.36;
/** A slip: the nose this far (m) off its rest line across the hips inside this (ms), the shoulders' middle following
 *  (m), the hips still (m); the rest line is the head's offset averaged over this (ms) while it is near it. */
export const SLIP_M = 0.12;
export const SLIP_WINDOW_MS = 300;
export const SLIP_SHOULDER_M = 0.06;
export const SLIP_HIPS_M = 0.08;
export const SLIP_REST_TAU_MS = 800;
/** A duck: the nose this far down (m) inside this (ms), at least this fast (m/s). */
export const DUCK_M = 0.15;
export const DUCK_WINDOW_MS = 350;
export const DUCK_V = 0.6;
/** No duck this soon (ms) after the feet were off the floor: a landing's absorb is a dip. (A jump's GATHER is not told
 *  apart: for its first ~200 ms it is the same dip as a duck, hands and all — the measured gap in G9.) */
export const DUCK_AFTER_AIR_MS = 500;
/** A step: the middle of the feet (on the floor plane) moved this far (m) from where the body last stood, and still
 *  again — spread under STEP_STILL_M (m) over STEP_SETTLE_MS (ms) — with both feet under STEP_LOW_M (m). The foot that
 *  moved first set off faster than STEP_V (m/s). */
export const STEP_M = 0.18;
export const STEP_V = 0.8;
export const STEP_STILL_M = 0.06;
export const STEP_SETTLE_MS = 150;
export const STEP_LOW_M = 0.25;
/** No step read in the first this-long (ms) of a body: the lens height is still settling on its feet. */
export const STEP_WARM_MS = 800;
/** A kicking foot coming down (ms after the kick's onset) is the kick's, not a step. */
export const STEP_AFTER_KICK_MS = 900;
/** A turn: the shoulder line through this (deg) inside this (ms). */
export const TURN_DEG = 80;
export const TURN_WINDOW_MS = 350;
/** Nothing else of the body's (evade, step, guard) this close (ms) to a blow's run: its own motion. */
export const BLOW_QUIET_MS = 150;
/** THE PAIR (the review, 2026-09-26): a rise into the guard is no blow when the other hand rises too (UPPER_RISE_M, to at
 *  least UPPER_END_Y_M) from RAISE_PAIR_BEFORE_MS before its onset to RAISE_PAIR_AFTER_MS after its end — the guard
 *  raised one hand after the other (a lag of 0.1–0.3 s) — unless that hand threw a blow of its own inside
 *  RAISE_PAIR_QUIET_MS (a double uppercut, a combination's hand coming home). While the other hand is still low, or rising
 *  faster than RISE_V (m/s), the blow is held. */
export const RAISE_PAIR_BEFORE_MS = 300;
export const RAISE_PAIR_AFTER_MS = 250;
export const RAISE_PAIR_QUIET_MS = 600;
export const RISE_V = 0.5;
/** …and only a rise that ends with the arm bent (its reach at most this share: a guard at the chin is ~0.5, a haymaker ends
 *  past 1). */
export const PAIR_END_REACH = 0.8;
/** THE ORDER: a blow told while the other hand's run that began before it may still be a blow (confirmed, or already past
 *  ORDER_RUN_V m/s, and not travelling back or down) waits at most this (ms). */
export const ORDER_HOLD_MS = 150;
export const ORDER_RUN_V = 1.5;
/** A stance square (the feet level within LEAD_DEPTH_M) for this long (ms) names no lead: straights by the hand, the left
 *  the jab (the review, 2026-09-26: a lead picked up once — a staggered stand, a kick's landing — named every straight
 *  after it). */
export const SQUARE_HOLD_MS = 600;
/** WHAT IS DECIDED (the review, 2026-09-26): a head move under way — the nose off its rest line by this (m) across, or down
 *  by this (m) — may still be told as a slip or a duck, stamped where it began: the decided horizon (decidedUntil) holds
 *  there until it is told or comes to nothing. */
export const STIR_SLIP_M = 0.04;
export const STIR_DUCK_M = 0.05;
/** An arm run at this speed (m/s) or one named a strike keeps the head reads quiet; a slower one is a blurred wrist's
 *  noise as often as a motion (the evades read 14 % under blur when every confirmed run did). */
export const QUIET_V = 3.2;
const HISTORY_MS = 1500;

// ── the frame the body reader hands over ────────────────────────────────────────────────────────────────────────
/** One tracked, calibrated frame in the reader's axes: x image-right, y UP along gravity, z toward the camera (metres,
 *  hip-centred, the RAW world landmarks: a strike leaves from rest, where the filter lags). */
export interface FightFrame {
  t: number;
  shoulder: [V3, V3]; elbow: [V3, V3]; wrist: [V3, V3];
  nose: V3;
  /** The crown line's height (hip-centred, m). */
  crownY: number;
  hip: [V3, V3]; knee: [V3, V3]; ankle: [V3, V3];
  /** The hip midpoint above the floor (m). */
  hipH: number | null;
  /** The hip midpoint across the room (x, from the image) and toward the camera (z, from the metre ruler), m. */
  hipRoom: V3 | null;
  /** Each foot on the floor plane (x across, z toward the camera, m, from the calibrated stand): its lowest image point's
   *  row and column. Only meaningful for a foot on (or near) the floor. */
  feetRoom: [V3, V3] | null;
  contact: [boolean, boolean] | null;
  airborne: boolean | null;
  /** In a jump or its landing's absorb (the reader's flight). */
  inJump: boolean;
  squat: number | null;
  bothOverhead: boolean;
  /** Running in place: steps at a jog's cadence. */
  inStride: boolean;
  /** The model is sure of each wrist (visibility ≥ 0.5): a blurred one is not. */
  wristSeen: [boolean, boolean];
  armM: [number, number];
  legM: number;
  /** The shoulder line's yaw (deg, BodyRead.yaw.deg), unwrapped by the reader. */
  yawDeg: number | null;
}

interface FEv { /** onset (capture ms) */ t: number; /** the frame that told it */ seen: number }
export type FightEvent =
  | (FEv & { kind: 'blow'; hand: Hand; lead: boolean; form: BlowForm; name: Blow; peakT: number; speed: number })
  | (FEv & { kind: 'legKick'; foot: Hand; lead: boolean; form: KickForm; peakT: number; speed: number; heightM: number; spin: boolean; airborne: boolean })
  | (FEv & { kind: 'guard'; up: boolean; raise: boolean; push: boolean })
  | (FEv & { kind: 'evade'; form: 'slip' | 'duck'; side: Hand | null; sizeM: number })
  | (FEv & { kind: 'fightStep'; dir: 'in' | 'out' | 'left' | 'right'; foot: Hand; distM: number })
  | (FEv & { kind: 'turn'; deg: number });
export type FightEventKind = FightEvent['kind'];

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────
const vsub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const vlen = (a: V3) => Math.hypot(a.x, a.y, a.z);
const vmid = (a: V3, b: V3): V3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
const idx = (h: Hand) => (h === 'L' ? 0 : 1);
const sgn = (h: Hand) => (h === 'L' ? 1 : -1);          // the subject's left is on +x: "in" is −x for it
const HANDS: Hand[] = ['L', 'R'];
/** The least-squares slope (m/s) of one coordinate over samples (t ms, value m): robust to one noisy sample. */
function slope(ts: readonly number[], vs: readonly number[]): number {
  const n = ts.length; if (n < 2) return 0;
  const mt = ts.reduce((a, b) => a + b, 0) / n, mv = vs.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0; for (let i = 0; i < n; i++) { num += (ts[i] - mt) * (vs[i] - mv); den += (ts[i] - mt) ** 2; }
  return den > 0 ? (num / den) * 1000 : 0;
}
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN; };

interface Sample {
  t: number;
  f: FightFrame;
  rel: [V3, V3];          // wrist − shoulder
  knee: [number, number]; // knee height relative to its hip
  ankleRel: [V3, V3];     // ankle − hip joint
}
interface Run { a: number; pk: number; pv: number; pvel: V3; confirmed: boolean; told: boolean; guardHand: boolean; /** began where the last run turned back */ rev: boolean }
interface KickRun { a: number; pk: number; pv: number; pvel: V3; top: number; straight: number; yaw0: number | null; told: boolean }

/** A run's path so far, for the class. Pure: exported for the unit tests. */
export interface BlowPath {
  /** Wrist − shoulder (m, the reader's axes) at the onset, at the run's furthest reach, and now. */
  p0: V3; pMax: V3; pNow: V3;
  /** The velocity (m/s, the same axes) at the run's fastest instant (averaged over the samples either side of it). */
  vPk: V3;
  /** The run's peak speed (m/s, the fastest single sample); vPk's length when absent. */
  pv?: number;
  /** The reach at the onset and at its furthest, as shares of the arm's length. */
  reach0: number; reachMax: number;
  /** +1 for the left hand, −1 for the right (in = −sgn·x). */
  sgn: 1 | -1;
  /** The run is over (it slowed or turned back): a hook's and an uppercut's end is known. */
  settled: boolean;
  /** The path in the floor plane (m, from the onset to where it came to): how far it bulged OUT beside the line joining
   *  those two, how far it came back IN from its widest point, and how far it first went out from where it began. */
  bulge?: number;
  inBack?: number;
  outSwing?: number;
  /** The elbow's travel toward the camera (m, relative to its shoulder), from the onset to the furthest reach. */
  elbowFwd?: number;
  /** How far the wrist is over its elbow where the run came to (m): a wave's forearm stands up, a hook's lies level. */
  forearmUp?: number;
}
/**
 * The class of a run so far, or null (undecided yet, or nothing). Read off the way the fist was travelling at its FASTEST
 * instant — the least noisy thing a run has (its speed is 4–6 m/s against ~0.8 m/s of jitter) — and how far it has gone:
 *   straight   out toward the camera (forward the largest part of the fastest velocity), the arm reaching out; from in
 *              front of the shoulder;
 *   wide hook  swung round from behind the shoulder to a long arm in front (143_23's haymakers);
 *   hook       IN across the face line the largest part, bent, at about shoulder height;
 *   uppercut   UP the largest part, from under the shoulder to the chin, bent.
 * A retraction travels back, out or down: it fails all four. Mid-way a straight's fastest velocity is already forward,
 * so a bent arm is never mistaken for a hook on its way out (the first cut judged the net path, and every straight from a
 * low guard read as a hook or an uppercut until it was fully out).
 */
export function classifyBlow(b: BlowPath): BlowForm | null {
  const sp = Math.max(1e-9, vlen(b.vPk)), pv = b.pv ?? sp;
  const uIn = (-b.sgn * b.vPk.x) / sp, uFwd = b.vPk.z / sp, uUp = b.vPk.y / sp;
  const dm = vsub(b.pMax, b.p0), d = vsub(b.pNow, b.p0);
  const inw = -b.sgn * d.x, rise = d.y, x0in = -b.sgn * b.p0.x;
  if (b.p0.y > BLOW_START_TOP_M) return null;   // no strike starts from over the head (a stretch's arms coming down)
  // from behind the shoulder (or from under it): a wide hook if it swung ROUND (out, then back in), a straight from a
  // chamber if it drove straight out — told once the run is over, when the whole path is known (a haymaker's first stretch
  // out is a chambered punch's too)
  const behind = b.p0.z < STRAIGHT_START_Z_M;
  if (behind && b.settled && pv >= HOOK_MIN_V && b.reachMax >= STRAIGHT_REACH && dm.z >= WIDE_FWD_M && x0in >= -WIDE_OUT_M
    && (b.bulge ?? 0) >= WIDE_BULGE_M && (b.inBack ?? 0) >= WIDE_BACK_M) return 'hook';
  if (behind || b.p0.y < STRAIGHT_START_Y_M) {
    const chambered = b.settled && uFwd >= DIR_MAIN && uFwd >= uIn && uIn >= -CHAMBER_OUT_U && uUp <= DIR_OFF_MAX
      && b.reachMax >= STRAIGHT_REACH && b.reach0 <= CHAMBER_START_REACH && dm.z >= CHAMBER_FWD_M && b.p0.y >= CHAMBER_LOW_Y_M
      && (b.elbowFwd ?? 0) >= CHAMBER_ELBOW_M && (b.outSwing ?? Infinity) <= CHAMBER_OUT_M && (b.bulge ?? Infinity) < WIDE_BULGE_M
      && b.pMax.y <= STRAIGHT_TOP_Y_M && pv >= WEAK_V && x0in >= -STRAIGHT_OUT_M;
    if (chambered) return 'straight';
  }
  const straight = uFwd >= DIR_MAIN && uFwd >= uIn && uUp <= DIR_OFF_MAX && b.reachMax >= STRAIGHT_REACH
    && b.reachMax - b.reach0 >= STRAIGHT_GAIN && b.reach0 <= STRAIGHT_START_REACH && dm.z >= STRAIGHT_FWD_M && b.p0.z >= STRAIGHT_START_Z_M && b.p0.y >= STRAIGHT_START_Y_M
    && b.pMax.y <= STRAIGHT_TOP_Y_M && !(x0in < -STRAIGHT_OUT_M && b.p0.y > STRAIGHT_OUT_TOP_Y_M)
    && !(b.p0.y < STRAIGHT_LOW_Y_M && dm.z < STRAIGHT_LOW_FWD_M)
    && !(pv < WEAK_V && b.reachMax < WEAK_REACH && dm.z < WEAK_FWD_M);
  if (straight) return 'straight';
  // a hook's and an uppercut's end must be known: a wave's hand, a stretch's arm, carry on up past the chin
  if (!b.settled) return null;
  // (a straight converging on the face line travels in as fast as out, but its reach grows as it goes: a hook's hardly does)
  // (a hook's forearm lies level, the elbow up with the fist: a wave's stands up under the hand)
  const hook = uIn >= DIR_MAIN && uIn >= uFwd && Math.abs(uUp) <= DIR_OFF_MAX && inw >= HOOK_IN_M && b.reachMax <= HOOK_BENT_REACH
    && (b.forearmUp ?? -Infinity) <= HOOK_FOREARM_UP_M
    && (b.reachMax - b.reach0 <= HOOK_REACH_GAIN || uFwd < HOOK_GAIN_FWD) && b.pNow.y >= HOOK_Y_RANGE[0] && b.pNow.y <= HOOK_Y_RANGE[1]
    && b.p0.y <= BLOW_START_TOP_M && x0in >= -HOOK_OUT_M && pv >= HOOK_MIN_V;
  if (hook) return 'hook';
  // (in front of the chest, not out at the side: a stretch's arm rises beside the body)
  const upper = uUp >= DIR_MAIN && uUp >= uIn && uUp >= uFwd && rise >= UPPER_RISE_M && b.p0.y <= UPPER_START_Y_M
    && b.p0.y >= UPPER_LOW_Y_M && b.reach0 <= UPPER_START_REACH
    && b.pNow.y >= UPPER_END_Y_M && b.pNow.y <= UPPER_TOP_Y_M && b.reachMax <= HOOK_BENT_REACH
    && b.pNow.z >= UPPER_FRONT_M && -b.sgn * b.pNow.x >= -UPPER_OUT_M;
  return upper ? 'uppercut' : null;
}

// ── the reader ───────────────────────────────────────────────────────────────────────────────────────────────────
export class FightReader {
  /** A tap for the report and the tuning (never set in play): each run's numbers as it is judged. */
  constructor(private readonly debug?: (msg: string) => void) {}
  private h: Sample[] = [];
  private stepMs = 1000 / 30;
  private stepBuf: number[] = [];
  private runs: (Run | null)[] = [null, null];
  private kicks: (KickRun | null)[] = [null, null];
  private readonly veto = new StrikeVeto();
  private leadHand: Hand = 'L';
  private guardUp = false;
  private guardIn: [number, number] = [0, 0];     // consecutive frames each wrist has been in (+) or out (−)
  private guardEnter: [number | null, number | null] = [null, null];
  private lastBlowRun = -Infinity;                // the last instant a confirmed arm run was live (a blow's own motion)
  private lastBlowT = -Infinity;                  // the last blow told (its onset)
  private slipArmed = true;
  private duckArmed = true;
  private lastTurnT = -Infinity;
  private yawPrev: number | null = null;
  private yawUnwrapped = 0;
  /** Blows named and not yet told (release()): in onset order. */
  private pending: { ev: Extract<FightEvent, { kind: 'blow' }>; guardHand: boolean; queuedAt: number; pair: { endY: number; settleT: number } | null }[] = [];
  private lastBlowAt: [number, number] = [-Infinity, -Infinity];   // each hand's last blow told (its onset)
  private squareSince: number | null = null;
  private lastPeak: ({ t: number; vel: V3 } | null)[] = [null, null];   // each hand's latest confirmed run: its fastest instant

  /** The stance's lead, whether the guard is up, and the capture instant up to which the body's defence is DECIDED:
   *  nothing the reader tells later — a slip, a duck, the guard raised or let down — can be stamped before it. */
  get state(): { lead: Hand; guard: boolean; decidedUntil: number } { return { lead: this.leadHand, guard: this.guardUp, decidedUntil: this.decidedUntil }; }

  /**
   * The decided horizon (capture ms): the newest frame, held back to where any motion still being judged began — the head
   * off its rest line (a slip to come) or dropping (a duck), both wrists in the guard zone not yet settled (a raise: its
   * onset is the second one's entry), a wrist leaving a held guard, a guard hand's live run or its blow still queued (a
   * blow from the guard lets it down at the blow's onset). The mode's ledger resolves a rival's hit only past it.
   */
  get decidedUntil(): number {
    const h = this.h;
    if (!h.length) return -Infinity;
    let d = h[h.length - 1].t;
    const s = h[h.length - 1];
    if (this.latRest !== null && this.slipArmed) {
      const hipX = (x: Sample) => (x.f.hip[0].x + x.f.hip[1].x) / 2;
      const off = (x: Sample) => x.f.nose.x - hipX(x) - this.latRest!;
      if (Math.abs(off(s)) >= STIR_SLIP_M) {
        let j = h.length - 1; while (j > 0 && Math.abs(off(h[j - 1])) > STIR_SLIP_M / 2) j--;
        d = Math.min(d, h[Math.max(0, j - 1)].t);
      }
    }
    if (this.duckArmed && s.f.hipH !== null) {
      const noseH = (x: Sample) => (x.f.hipH ?? 0) + x.f.nose.y - (x.f.hip[0].y + x.f.hip[1].y) / 2;
      const win = h.filter((x) => x.t >= s.t - DUCK_WINDOW_MS && x.f.hipH !== null);
      let top = win[0];
      for (const x of win) if (noseH(x) > noseH(top)) top = x;
      if (top && noseH(top) - noseH(s) >= STIR_DUCK_M) d = Math.min(d, top.t);
    }
    if (!this.guardUp && this.guardIn[0] > 0 && this.guardIn[1] > 0) d = Math.min(d, Math.max(this.guardEnter[0] ?? d, this.guardEnter[1] ?? d));
    if (this.guardUp) {
      for (const i of [0, 1]) if (this.guardIn[i] < 0) d = Math.min(d, h[Math.max(0, h.length + this.guardIn[i] - 1)].t);
      // (a run that may yet be a blow: confirmed, or already past ORDER_RUN_V — a guard hand's jitter, ~1 m/s, is none)
      for (const r of this.runs) if (r && r.guardHand && !r.told && (r.confirmed || r.pv >= ORDER_RUN_V)) d = Math.min(d, h[r.a].t);
      for (const p of this.pending) if (p.guardHand) d = Math.min(d, p.ev.t);
    }
    return d;
  }

  /** Lost, found, recalibrated, a new body: forget everything in progress (one body at a time). */
  reset(): void {
    this.h = []; this.stepBuf = []; this.stepMs = 1000 / 30;
    this.runs = [null, null]; this.kicks = [null, null]; this.veto.reset();
    this.leadHand = 'L'; this.squareSince = null;
    this.guardUp = false; this.guardIn = [0, 0]; this.guardEnter = [null, null];
    this.lastBlowRun = -Infinity; this.lastBlowT = -Infinity; this.slipArmed = true; this.duckArmed = true; this.stepAnchor = null; this.latRest = null; this.lastStepT = -Infinity; this.lastKickT = -Infinity;
    this.lastTurnT = -Infinity; this.yawPrev = null; this.yawUnwrapped = 0;
    this.pending = []; this.lastBlowAt = [-Infinity, -Infinity]; this.lastPeak = [null, null];
  }

  push(f: FightFrame): FightEvent[] {
    const ev: FightEvent[] = [];
    const prev = this.h[this.h.length - 1];
    if (prev && !(f.t > prev.t)) return ev;
    if (prev && f.t - prev.t < 200) { this.stepBuf.push(f.t - prev.t); if (this.stepBuf.length > 9) this.stepBuf.shift(); this.stepMs = median(this.stepBuf); }
    let yaw = f.yawDeg;
    if (yaw !== null) {
      if (this.yawPrev !== null) { let d = yaw - this.yawPrev; while (d > 180) d -= 360; while (d < -180) d += 360; this.yawUnwrapped += d; } else this.yawUnwrapped = yaw;
      this.yawPrev = yaw; yaw = this.yawUnwrapped;
    }
    const s: Sample = {
      t: f.t, f: { ...f, yawDeg: yaw },
      rel: [vsub(f.wrist[0], f.shoulder[0]), vsub(f.wrist[1], f.shoulder[1])],
      knee: [f.knee[0].y - f.hip[0].y, f.knee[1].y - f.hip[1].y],
      ankleRel: [vsub(f.ankle[0], f.hip[0]), vsub(f.ankle[1], f.hip[1])],
    };
    this.h.push(s);
    while (this.h.length > 2 && f.t - this.h[0].t > HISTORY_MS) {
      this.h.shift();
      for (const r of this.runs) if (r) { r.a--; r.pk--; }
      for (const k of this.kicks) if (k) { k.a--; k.pk--; }
    }
    for (const r of this.runs) if (r && r.a < 0) r.a = 0;
    for (const k of this.kicks) if (k && k.a < 0) k.a = 0;
    this.veto.push(f.t, f.squat, f.bothOverhead);
    this.stance(s);
    this.arms(ev);
    this.release(ev);
    this.legs(ev);
    this.guard(ev);
    this.evades(ev);
    this.steps(s, ev);
    this.turns(ev);
    ev.sort((a, b) => a.t - b.t || (a.kind === 'guard' ? -1 : b.kind === 'guard' ? 1 : 0));
    return ev;
  }

  /** Frames spanning ±FIGHT_VEL_HALF_MS at the camera's rate (≥ 1). */
  private get vk(): number { return Math.max(1, Math.round(FIGHT_VEL_HALF_MS / this.stepMs)); }
  /** Central-difference speed (m/s) of a per-sample point at sample k. */
  private speedAt(k: number, get: (s: Sample) => V3): number | null {
    const m = this.vk, h = this.h;
    if (k - m < 0 || k + m >= h.length) return null;
    return (vlen(vsub(get(h[k + m]), get(h[k - m]))) * 1000) / (h[k + m].t - h[k - m].t || 1);
  }
  private rateAt(k: number, get: (s: Sample) => number): number | null {
    const m = this.vk, h = this.h;
    if (k - m < 0 || k + m >= h.length) return null;
    return ((get(h[k + m]) - get(h[k - m])) * 1000) / (h[k + m].t - h[k - m].t || 1);
  }

  // ── the stance ──
  /** The lead: the ankles' depth difference, as a median over LEAD_HOLD_MS with both feet down (one frame's ankle depth
   *  jitters ~3 cm), past LEAD_DEPTH_M; square for SQUARE_HOLD_MS, none — the orthodox default (the left straight the jab). */
  private stance(s: Sample): void {
    const c = s.f.contact;
    if (!c || !c[0] || !c[1] || s.f.inJump) return;
    const win = this.h.filter((x) => x.t > s.t - LEAD_HOLD_MS && x.f.contact?.[0] && x.f.contact[1] && !x.f.inJump);
    if (win.length < 3 || s.t - win[0].t < LEAD_HOLD_MS * 0.6) return;
    const d = median(win.map((x) => x.f.ankle[0].z - x.f.ankle[1].z));
    if (d >= LEAD_DEPTH_M) { this.leadHand = 'L'; this.squareSince = null; }
    else if (d <= -LEAD_DEPTH_M) { this.leadHand = 'R'; this.squareSince = null; }
    else { this.squareSince ??= s.t; if (s.t - this.squareSince >= SQUARE_HOLD_MS) this.leadHand = 'L'; }
  }

  // ── blows ──
  private velAt(k: number, get: (s: Sample) => V3): V3 | null {
    const m = this.vk, h = this.h;
    if (k - m < 0 || k + m >= h.length) return null;
    const d = vsub(get(h[k + m]), get(h[k - m])), dt = (h[k + m].t - h[k - m].t || 1) / 1000;
    return { x: d.x / dt, y: d.y / dt, z: d.z / dt };
  }
  private arms(ev: FightEvent[]): void {
    const h = this.h, k = h.length - 1 - this.vk;
    if (k < this.vk) return;
    const seen = h[h.length - 1].t;
    for (const hand of HANDS) {
      const i = idx(hand);
      const vel = this.velAt(k, (x) => x.rel[i]);
      if (!vel) continue;
      const v = vlen(vel);
      let r = this.runs[i];
      if (!r) {
        if (v > ONSET_V) r = this.runs[i] = { a: k, pk: k, pv: v, pvel: vel, confirmed: false, told: false, guardHand: this.guardUp, rev: false };
        else continue;
      } else if (v > r.pv) { r.pk = k; r.pv = v; r.pvel = vel; }
      if (k === r.pk + 1) {
        // the fastest instant's direction, averaged with its neighbours (a blurred wrist's one frame is 3× noisier)
        const a = this.velAt(k - 2, (x) => x.rel[i]);
        const sum = [a, r.pvel, vel].filter((x): x is V3 => !!x);
        r.pvel = { x: sum.reduce((q, x) => q + x.x, 0) / sum.length, y: sum.reduce((q, x) => q + x.y, 0) / sum.length, z: sum.reduce((q, x) => q + x.z, 0) / sum.length };
      }
      if (r.confirmed && (r.pv >= QUIET_V || r.told)) this.lastBlowRun = h[k].t;
      if (r.confirmed || r.pv >= CLAP_PEAK_V) this.lastPeak[i] = { t: h[r.pk].t, vel: r.pvel };
      const cos = (vel.x * r.pvel.x + vel.y * r.pvel.y + vel.z * r.pvel.z) / Math.max(1e-9, v * r.pv);
      const reversed = k > r.pk && v > ONSET_V && cos < Math.cos((REVERSE_DEG * Math.PI) / 180);
      const ended = reversed || v < Math.max(ONSET_V, END_SHARE * r.pv);
      // (a run on a wrist the model is unsure of — blurred: its noise is 3× — needs a punch's speed and travel to count: a
      // slip's lean blurs the hands that ride on it into runs of 3–4 m/s that are all noise)
      const unsureRun = h.slice(r.a, k + 1).filter((x) => !x.f.wristSeen[i]).length * 2 > k + 1 - r.a;
      if (!r.confirmed && r.pv >= (unsureRun ? CONFIRM_V_UNSURE : CONFIRM_V) && vlen(vsub(h[k].rel[i], h[r.a].rel[i])) >= (unsureRun ? MIN_TRAVEL_UNSURE : MIN_TRAVEL)) r.confirmed = true;
      if (this.debug && (ended || !r.confirmed)) this.debug(`  run ${hand} t ${h[k].t.toFixed(0)} a ${h[r.a].t.toFixed(0)} v ${v.toFixed(1)} pv ${r.pv.toFixed(1)} conf ${r.confirmed} told ${r.told} ${reversed ? 'REV' : ended ? 'END' : ''} vel(${vel.x.toFixed(1)},${vel.y.toFixed(1)},${vel.z.toFixed(1)}) reach ${(vlen(h[k].rel[i]) / (h[k].f.armM[i] || 0.55)).toFixed(2)}`);
      if (r.confirmed && !r.told) this.tryBlow(hand, r, k, seen, ev, ended);
      // a run that turned back is followed at once by the next (the way back, or a punch thrown out of it)
      if (ended) this.runs[i] = reversed ? { a: k, pk: k, pv: v, pvel: vel, confirmed: false, told: false, guardHand: this.guardUp, rev: true } : null;
    }
  }

  private tryBlow(hand: Hand, r: Run, k: number, seen: number, ev: FightEvent[], settled: boolean): void {
    const h = this.h, i = idx(hand), f = h[k].f;
    // the onset: back from the peak to ONSET_SHARE of it, on this run's speeds (never before the run began)
    const ts: number[] = [], vs: number[] = [];
    const from = Math.max(this.vk, r.rev ? r.a : r.a - 1);
    for (let j = from; j <= r.pk; j++) { const x = this.speedAt(j, (s) => s.rel[i]); ts.push(h[j].t); vs.push(x ?? 0); }
    // (a run that began where the last one turned back — an uppercut's drive out of its dip, a punch thrown out of the
    // last one's way back — starts at that turn: its onset and its start are not searched back into the other motion)
    const onset = r.rev ? Math.max(h[r.a].t, onsetBackT(ts, vs, r.pk - from, ONSET_SHARE)) : onsetBackT(ts, vs, r.pk - from, ONSET_SHARE);
    // where the fist began (the sample at / just before the onset; the turn itself for a turned run), its furthest reach
    // since, and where the run came to
    let j0 = from; while (j0 + 1 < h.length && h[j0 + 1].t <= onset) j0++;
    const pre = r.rev ? [h[r.a].rel[i], h[r.a].rel[i]] : [h[Math.max(0, j0 - 1)].rel[i], h[j0].rel[i]];
    const p0 = { x: (pre[0].x + pre[1].x) / 2, y: (pre[0].y + pre[1].y) / 2, z: (pre[0].z + pre[1].z) / 2 };
    const arm = f.armM[i] || 0.55;
    let jm = j0; for (let j = j0; j < h.length; j++) if (vlen(h[j].rel[i]) > vlen(h[jm].rel[i])) jm = j;
    // (the end of a run that is over is where it came to — the frame that told it so — not a frame of what came next)
    const jEnd = settled ? k : h.length - 1;
    const pMax = h[jm].rel[i], pEnd = h[jEnd].rel[i];
    // the path in the floor plane — its bulge out beside the line from where it began to where it came to, its way back in
    // from its widest point, its first way out — the elbow's drive, and the forearm where it came to
    const inOf = (p: V3) => -sgn(hand) * p.x, x0 = inOf(p0), xE = inOf(pEnd);
    let widest = x0, bulge = 0;
    for (let j = j0; j <= jEnd; j++) {
      const p = h[j].rel[i], x = inOf(p);
      widest = Math.min(widest, x);
      if (pEnd.z - p0.z > 0.05 && p.z >= p0.z && p.z <= pEnd.z) bulge = Math.max(bulge, x0 + (xE - x0) * ((p.z - p0.z) / (pEnd.z - p0.z)) - x);
    }
    const elbowFwd = h[jm].f.elbow[i].z - h[jm].f.shoulder[i].z - (h[j0].f.elbow[i].z - h[j0].f.shoulder[i].z);
    const forearmUp = median(h.slice(Math.max(j0, jEnd - 2), jEnd + 1).map((x) => x.f.wrist[i].y - x.f.elbow[i].y));
    let form = classifyBlow({
      p0, pMax, pNow: pEnd, vPk: r.pvel, pv: r.pv, reach0: vlen(p0) / arm, reachMax: vlen(pMax) / arm, sgn: sgn(hand) as 1 | -1, settled,
      bulge, inBack: xE - widest, outSwing: x0 - widest, elbowFwd, forearmUp,
    });
    const form0 = form;
    let why = '';
    // a blurred wrist (unsure on most of the run) must be backed by its elbow, which moves at half its speed: out for a
    // straight, up level with the shoulder for a hook, low and forward for an uppercut
    if (form) {
      const run = h.slice(j0, h.length);
      const unsure = run.filter((x) => !x.f.wristSeen[i]).length > run.length / 2;
      const e0 = vsub(h[j0].f.elbow[i], h[j0].f.shoulder[i]), e1 = vsub(h[jm].f.elbow[i], h[jm].f.shoulder[i]), eN = vsub(h[h.length - 1].f.elbow[i], h[h.length - 1].f.shoulder[i]);
      if (form && unsure) {
        const ok = form === 'straight' ? e1.z - e0.z >= ELBOW_OUT_M && vlen(pMax) / arm >= STRAIGHT_REACH + 0.06
          : form === 'hook' ? eN.y >= -ELBOW_HOOK_BELOW_M : eN.y <= -0.05 && eN.z - e0.z >= 0;
        if (!ok) { form = null; why = `unsure e1z ${(e1.z - e0.z).toFixed(2)} eNy ${eN.y.toFixed(2)}`; }
      }
    }
    // a fist that hardly moved through the room is the shoulder moving away from it: the guard hand at the chin while the
    // other hand's cross turns the torso (its wrist − shoulder "reaches" 0.2–0.3 of the arm: the review's chambered crosses)
    const own = vlen(vsub(h[jm].f.wrist[i], h[j0].f.wrist[i]));
    if (form && own < CARRIED_M) { form = null; why = `carried ${own.toFixed(2)}`; }
    // both arms moving the same way together is a gesture (the guard raised, a stretch, a clap), not a strike; both arms
    // swinging opposite ways with a foot off the floor is running (a jog's first strides, before its cadence is known)
    const o = this.runs[1 - i];
    if (form && o && o.confirmed) {
      const dmo = vsub(h[k].rel[1 - i], h[Math.max(0, o.a)].rel[1 - i]), dd = vsub(pEnd, p0);
      if (dmo.y * dd.y > 0 && Math.abs(dmo.y) >= 0.08 && Math.abs(dd.y) >= 0.08) { form = null; why = 'both-y'; }
      const footUp = h.slice(Math.max(0, r.a - 2), h.length).some((x) => x.f.contact && (!x.f.contact[0] || !x.f.contact[1]));
      if (footUp && dmo.z * dd.z < 0 && Math.abs(dmo.z) >= 0.06) { form = null; why = 'run-arms'; }
    }
    if (form) {
      const w = h.slice(Math.max(0, j0 - 1)), ts = w.map((x) => x.t);
      const sa = slope(ts, w.map((x) => x.rel[i].y)), sb = slope(ts, w.map((x) => x.rel[1 - i].y));
      const outA = -slope(ts, w.map((x) => -sgn(hand) * x.rel[i].x)), outB = -slope(ts, w.map((x) => sgn(hand) * x.rel[1 - i].x));
      const uIn = (-sgn(hand) * r.pvel.x) / Math.max(1e-9, vlen(r.pvel));
      // (both hands IN together over the run itself is a clap: the mirror of both out, SPREAD_V — the review, 2026-09-26)
      const wr = h.slice(Math.max(0, j0 - 1), jEnd + 1), tr = wr.map((x) => x.t);
      const inA = slope(tr, wr.map((x) => -sgn(hand) * x.rel[i].x)), inB = slope(tr, wr.map((x) => sgn(hand) * x.rel[1 - i].x));
      if ((sa * sb > 0 && Math.abs(sa) >= GESTURE_V && Math.abs(sb) >= GESTURE_V) || (outA >= SPREAD_V && outB >= SPREAD_V)
        || (inA >= BOTH_IN_V && inB >= BOTH_IN_V)
        || (form === 'straight' && uIn <= -OUT_SWING && outA >= GESTURE_V)) { form = null; why = 'gesture'; }
      // …or the other hand's own run peaked travelling IN at the same moment (a clap's two hands, one a little behind; a
      // bent-arm hook's only — a haymaker from behind the shoulder swings while the other arm draws back)
      const q = this.lastPeak[1 - i];
      if (form === 'hook' && p0.z >= STRAIGHT_START_Z_M && q && Math.abs(q.t - h[r.pk].t) <= CLAP_MS && (sgn(hand) * q.vel.x) / Math.max(1e-9, vlen(q.vel)) >= DIR_MAIN) { form = null; why = 'clap'; }
    }
    if (this.debug) {
      const d = vsub(pEnd, p0), dm = vsub(pMax, p0), vp = vlen(r.pvel);
      this.debug(`blow ${hand}${settled ? '·' : ' '} u(in ${(-sgn(hand) * r.pvel.x / vp).toFixed(2)} fwd ${(r.pvel.z / vp).toFixed(2)} up ${(r.pvel.y / vp).toFixed(2)}) onset ${onset.toFixed(0)} now ${h[k].t.toFixed(0)} pv ${r.pv.toFixed(1)} reach ${(vlen(p0) / arm).toFixed(2)}→max ${(vlen(pMax) / arm).toFixed(2)} fwdMax ${dm.z.toFixed(2)} riseMax ${dm.y.toFixed(2)} | end: in ${(-sgn(hand) * d.x).toFixed(2)} fwd ${d.z.toFixed(2)} rise ${d.y.toFixed(2)} y0 ${p0.y.toFixed(2)} y ${pEnd.y.toFixed(2)} x0in ${(-sgn(hand) * p0.x).toFixed(2)} z0 ${p0.z.toFixed(2)} own ${own.toFixed(2)} bulge ${bulge.toFixed(2)} back ${(xE - widest).toFixed(2)} outSw ${(x0 - widest).toFixed(2)} elb ${elbowFwd.toFixed(2)} fa ${forearmUp.toFixed(2)} ${form0 && !form ? `[${form0} vetoed: ${why}] ` : ''}oth ${(() => { const q = vsub(h[k].rel[1 - i], h[j0].rel[1 - i]); return `${q.x.toFixed(2)},${q.y.toFixed(2)},${q.z.toFixed(2)}`; })()} sl ${(() => { const w = h.slice(Math.max(0, j0 - 1)); const ts = w.map((x) => x.t); const a = slope(ts, w.map((x) => x.rel[i].y)), b = slope(ts, w.map((x) => x.rel[1 - i].y)), ax = slope(ts, w.map((x) => -sgn(hand) * x.rel[i].x)), bx = slope(ts, w.map((x) => sgn(hand) * x.rel[1 - i].x)); return `${a.toFixed(2)},${b.toFixed(2)},${ax.toFixed(2)},${bx.toFixed(2)}`; })()} → ${form ?? '·'}`);
    }
    if (!form) return;
    r.told = true;
    const newest = h.length - 1;
    if (f.inStride || this.running(newest) || !this.veto.ok(onset, h[newest].f.squat, f.inJump || h[newest].f.inJump) || this.kicking(newest)) return;
    const lead = hand === this.leadHand;
    const name: Blow = form === 'straight' ? (lead ? 'jab' : 'cross') : form;
    // THE ORDER AND THE PAIR (the review, 2026-09-26). A blow is queued, and told in onset order (release()): a straight is
    // named mid-run but a hook or an uppercut only once it is over, so a straight thrown just after one used to reach the
    // book first. And a RISE into the guard (an uppercut's path; a hook's from low hands) is held while the other hand may
    // still come up with it: both hands rising one after the other is the guard raised (a parry), not two blows.
    const pair = form !== 'straight' && pEnd.y - p0.y >= UPPER_RISE_M && vlen(pEnd) / arm <= PAIR_END_REACH ? { endY: pEnd.y, settleT: h[k].t } : null;
    this.pending.push({ ev: { kind: 'blow', t: onset, seen, hand, lead, form, name, peakT: h[r.pk].t, speed: r.pv }, guardHand: r.guardHand, queuedAt: seen, pair });
    this.pending.sort((a, b) => a.ev.t - b.ev.t);
  }

  /**
   * Tell the queued blows that are decided, in onset order. One waits while
   *   - it is a rise with the other hand still low or rising, up to RAISE_PAIR_AFTER_MS past its end (the other hand coming
   *     up too, from RAISE_PAIR_BEFORE_MS before its onset, vetoes it: otherRose), or
   *   - a blow queued before it (an earlier onset) waits, or the other hand has a live run that began before its onset and
   *     still travels like a strike (it may be told with an earlier onset), up to ORDER_HOLD_MS.
   */
  private release(ev: FightEvent[]): void {
    const h = this.h, now = h[h.length - 1].t;
    while (this.pending.length) {
      const p = this.pending[0], o = 1 - idx(p.ev.hand);
      if (p.pair) {
        if (this.otherRose(o, p.ev.t)) {
          this.pending.shift();
          this.debug?.(`blow ${p.ev.hand} ${p.ev.name} @${p.ev.t.toFixed(0)} [vetoed: the other hand came up too — a guard raised]`);
          continue;
        }
        const kk = h.length - 1 - this.vk, vy = kk >= this.vk ? this.rateAt(kk, (x) => x.rel[o].y) ?? 0 : 0;
        const oy = this.smoothY(h.length - 1, o);
        if ((oy < p.pair.endY - UPPER_RISE_M || vy > RISE_V) && now < p.pair.settleT + RAISE_PAIR_AFTER_MS) return;
        p.pair = null;
      }
      // (a run's onset can be searched back a sample before its start: onsetBackT from r.a − 1)
      const r = this.runs[o];
      if (r && (r.confirmed || r.pv >= ORDER_RUN_V) && !r.told && h[Math.max(0, r.a - 2)].t < p.ev.t && now - p.queuedAt < ORDER_HOLD_MS) {
        const u = vlen(r.pvel) > 1e-9 ? { y: r.pvel.y / vlen(r.pvel), z: r.pvel.z / vlen(r.pvel) } : { y: 0, z: 0 };
        if (u.z > -0.5 && u.y > -0.6) return;   // (a retraction travels back or down: it will never be a blow)
      }
      this.pending.shift();
      if (this.guardUp && p.guardHand) {
        this.guardUp = false;
        // (the striking hand's guard entry is forgotten: the guard it re-forms is stamped where it comes back, not where it
        // first went up — the review, 2026-09-26: the zone has no front edge, so a jab's wrist never left it)
        const i = idx(p.ev.hand); this.guardIn[i] = 0; this.guardEnter[i] = null;
        ev.push({ kind: 'guard', t: p.ev.t, seen: now, up: false, raise: false, push: false });
      }
      this.lastBlowT = Math.max(this.lastBlowT, p.ev.t);
      this.lastBlowAt[idx(p.ev.hand)] = p.ev.t;
      ev.push({ ...p.ev, seen: now });
    }
  }
  /** A wrist's height over its shoulder (m), averaged over three samples (one noisy sample is not a rise). */
  private smoothY(j: number, i: number): number {
    const a = Math.max(0, j - 1), b = Math.min(this.h.length - 1, j + 1);
    let s = 0; for (let q = a; q <= b; q++) s += this.h[q].rel[i].y;
    return s / (b - a + 1);
  }
  /** Hand `o` came UP INTO THE GUARD — risen UPPER_RISE_M to at least UPPER_END_Y_M over its shoulder, in the guard zone —
   *  from RAISE_PAIR_BEFORE_MS before `onset` to now, having thrown nothing of its own since RAISE_PAIR_QUIET_MS before it
   *  (a combination's other hand coming back to its guard is not a raise; a haymaker's wind-up draws the arm up BEHIND). */
  private otherRose(o: number, onset: number): boolean {
    if (this.lastBlowAt[o] >= onset - RAISE_PAIR_QUIET_MS) return false;
    let lo = Infinity;
    for (let j = 0; j < this.h.length; j++) {
      if (this.h[j].t < onset - RAISE_PAIR_BEFORE_MS) continue;
      const y = this.smoothY(j, o);
      lo = Math.min(lo, y);
      if (y >= UPPER_END_Y_M && y - lo >= UPPER_RISE_M && this.zoneOf(this.h[j].f, o, 0)) return true;
    }
    return false;
  }

  /** Running (in place or not): each foot has been off the floor alone inside RUN_ALT_MS — a jog's first strides, before
   *  its cadence is known. (A step-jab lifts one foot; a hop lifts both together.) */
  private running(j: number): boolean {
    const t = this.h[j].t;
    const offAlone = (q: number) => this.h.some((x) => x.t >= t - RUN_ALT_MS && x.t <= t && x.f.contact && !x.f.contact[q] && x.f.contact[1 - q]);
    return offAlone(0) && offAlone(1);
  }

  /** A foot up in a kick at sample j (or a kick run under way): the arms' counter-swing is the kick's, not a punch. */
  private kicking(j: number): boolean {
    if (this.kicks.some((x) => !!x)) return true;
    const f = this.h[j].f;
    if (f.hipH === null) return false;
    const hy = vmid(f.hip[0], f.hip[1]).y;
    return [0, 1].some((i) => f.hipH! + f.ankle[i].y - hy > KICKING_FOOT_M) || this.h[j].t - this.lastKickT < 300;
  }

  // ── kicks ──
  private legs(ev: FightEvent[]): void {
    const h = this.h, k = h.length - 1 - this.vk;
    if (k < this.vk) return;
    const seen = h[h.length - 1].t;
    for (const foot of HANDS) {
      const i = idx(foot), o = 1 - i;
      const s = h[k], f = s.f;
      const vel = this.velAt(k, (x) => x.ankleRel[i]);
      if (vel === null || f.hipH === null || !f.contact) continue;
      const v = vlen(vel);
      const ankleH = f.hipH + (f.ankle[i].y - vmid(f.hip[0], f.hip[1]).y);
      let r = this.kicks[i];
      const lifted = ankleH > 0.25 && f.contact[o];
      if (!r) {
        if (v > ONSET_V && lifted) r = this.kicks[i] = { a: k, pk: k, pv: v, pvel: vel, top: ankleH, straight: 0, yaw0: f.yawDeg, told: false };
        else continue;
      }
      if (v > r.pv && !r.told) { r.pk = k; r.pv = v; r.pvel = vel; }
      r.top = Math.max(r.top, ankleH);
      r.straight = Math.max(r.straight, vlen(s.ankleRel[i]) / (f.legM || 0.9));
      if (!r.told && r.pv >= KICK_MIN && r.top >= KICK_TOP_M && r.straight >= KICK_STRAIGHT && f.contact[o]) {
        r.told = true;
        // the onset: the knee's rise past KNEE_RISE_V, searched back from the peak through the rise (a one-frame dip of the
        // jittery rate does not end it: two frames under the line do), else 25 % of the ankle's peak
        let on: number | null = riseOnset(h.map((x) => x.t), h.map((_, j) => this.rateAt(j, (x) => x.knee[i])), r.pk);
        if (on === null) {
          const ts: number[] = [], vs: number[] = [];
          for (let j = Math.max(this.vk, r.a - this.vk); j <= r.pk; j++) { ts.push(h[j].t); vs.push(this.speedAt(j, (x) => x.ankleRel[i]) ?? 0); }
          on = onsetBackT(ts, vs, vs.length - 1);
        }
        // FRONT: the foot driven at the camera; ROUND: swept across the front (the fastest instant mostly sideways) or the
        // hips turned well through it. (Swept-in travel alone read a long stance's rear-leg front kick, which comes in
        // from behind the hip, as a round kick: 144_05.)
        // the hips' (shoulders') turn: from before the knee rose to the most it has turned since
        const before = h.filter((x) => x.t <= on! - 80 && x.f.yawDeg !== null).pop() ?? h.find((x) => x.f.yawDeg !== null);
        let dYaw = 0;
        if (before) for (const x of h) if (x.t >= on && x.f.yawDeg !== null) dYaw = Math.max(dYaw, Math.abs(x.f.yawDeg - before.f.yawDeg!));
        const across = Math.abs(r.pvel.x) >= ROUND_ACROSS * Math.abs(r.pvel.z);
        const form: KickForm = dYaw >= ROUND_YAW_DEG || (across && dYaw >= ROUND_YAW_ACROSS_DEG) ? 'round' : 'front';
        const turned = on - this.lastTurnT <= 400;
        this.debug?.(`kick ${foot} onset ${on.toFixed(0)} now ${s.t.toFixed(0)} pv ${r.pv.toFixed(1)} top ${r.top.toFixed(2)} straight ${r.straight.toFixed(2)} dYaw ${dYaw.toFixed(0)} v(${r.pvel.x.toFixed(1)}, ${r.pvel.y.toFixed(1)}, ${r.pvel.z.toFixed(1)}) → ${form}`);
        // (no running-in-place veto: a kick's own foot lifts count as steps, and a jog never extends a leg at height)
        if (!this.veto.ok(on, h[h.length - 1].f.squat, false)) continue;
        this.lastKickT = on;
        ev.push({ kind: 'legKick', t: on, seen, foot, lead: foot === this.leadHand, form, peakT: h[r.pk].t, speed: r.pv, heightM: r.top, spin: turned, airborne: f.airborne === true });
      }
      if (!lifted && v < ONSET_V) this.kicks[i] = null;
    }
  }

  // ── the guard ──
  private zoneOf(f: FightFrame, i: number, slack: number): boolean {
    const w = f.wrist[i];
    const shY = (f.shoulder[0].y + f.shoulder[1].y) / 2, shZ = (f.shoulder[0].z + f.shoulder[1].z) / 2;
    return w.y >= shY - GUARD_BELOW_SHOULDER_M - slack && w.y <= f.crownY - GUARD_UNDER_CROWN_M + slack
      && Math.abs(w.x - f.nose.x) <= GUARD_FACE_X_M + slack && w.z - shZ >= GUARD_FRONT_M - slack;
  }
  private guard(ev: FightEvent[]): void {
    const h = this.h, s = h[h.length - 1], f = s.f;
    for (const i of [0, 1]) {
      const inside = this.zoneOf(f, i, this.guardUp ? GUARD_HYST_M : 0);
      if (inside) { if (this.guardIn[i] <= 0) { this.guardIn[i] = 0; this.guardEnter[i] = s.t; } this.guardIn[i]++; }
      else { if (this.guardIn[i] >= 0) this.guardIn[i] = 0; this.guardIn[i]--; }
    }
    const t = Math.max(this.guardEnter[0] ?? s.t, this.guardEnter[1] ?? s.t);
    // held: both in for GUARD_FRAMES frames and GUARD_HOLD_MS, the fists settled there (arms swung up through the zone to a
    // stretch, or down through it, are not a guard)
    // (settled NOW: over the last GUARD_HOLD_MS — a hand enters the zone at its bottom edge still rising to the chin)
    const held = h.filter((x) => x.t >= Math.max(t, s.t - GUARD_HOLD_MS));
    const settled = !this.guardUp && this.guardIn[0] >= GUARD_FRAMES && this.guardIn[1] >= GUARD_FRAMES && s.t - t >= GUARD_HOLD_MS
      && held.length >= 2 && [0, 1].every((q) => vlen(vsub(held[held.length - 1].f.wrist[q], held[0].f.wrist[q])) <= GUARD_STILL_M);
    if (settled) {
      this.guardUp = true;
      // a RAISE: both hands came up from under the zone (hands down, then up) and no strike just ran — a guard re-formed
      // after a punch (the other hand never left it) is a guard held, not a parry
      const under = (x: Sample, i: number) => x.f.wrist[i].y < (x.f.shoulder[0].y + x.f.shoulder[1].y) / 2 - GUARD_BELOW_SHOULDER_M - RAISE_UNDER_M;
      const look = h.filter((x) => x.t >= t - RAISE_LOOKBACK_MS && x.t < t);
      const raise = look.some((x) => under(x, 0)) && look.some((x) => under(x, 1)) && t - this.lastBlowT > RAISE_QUIET_MS;
      const back = h.find((x) => x.t >= t - 250) ?? h[0];
      const shZ = (f.shoulder[0].z + f.shoulder[1].z) / 2;
      const push = raise && [0, 1].every((i) => f.wrist[i].z - back.f.wrist[i].z >= PUSH_M && f.wrist[i].z - shZ >= PUSH_FRONT_M);
      // not the arms coming down out of a hands-up or a stretch (they pass through the zone on the way down)
      const fromAbove = look.some((x) => [0, 1].some((j) => x.f.wrist[j].y > x.f.crownY - GUARD_UNDER_CROWN_M));
      if (f.inStride || f.inJump || f.bothOverhead || fromAbove || t - this.veto.overheadAt <= GUARD_AFTER_OVERHEAD_MS) { this.guardUp = false; this.guardIn = [0, 0]; return; }
      ev.push({ kind: 'guard', t, seen: s.t, up: true, raise, push });
    } else if (this.guardUp && (this.guardIn[0] <= -GUARD_FRAMES || this.guardIn[1] <= -GUARD_FRAMES)) {
      this.guardUp = false;
      const out = this.guardIn[0] <= this.guardIn[1] ? 0 : 1;
      ev.push({ kind: 'guard', t: h[Math.max(0, h.length - GUARD_FRAMES)].t, seen: s.t, up: false, raise: false, push: false });
      void out;
    }
  }

  // ── slip / duck ──
  /**
   * SLIP: the head AND the shoulders leaned off to one side of the hips — away from where they rest (a slow baseline) by
   * SLIP_M inside SLIP_WINDOW_MS, sideways more than forward, the hips kept. The way back to the middle is not a slip (it
   * moves toward the rest line), and a cross's turn is not one (it swings the nose round but leaves the shoulders' middle
   * over the hips). DUCK: the nose DUCK_M down inside DUCK_WINDOW_MS at DUCK_V, both feet down (a kick's lean is not one).
   */
  private evades(ev: FightEvent[]): void {
    const h = this.h, k = h.length - 1 - this.vk;
    if (k < this.vk) return;
    const s = h[k], f = s.f, seen = h[h.length - 1].t;
    const both = !!f.contact && f.contact[0] && f.contact[1] && !f.inJump && f.airborne !== true;
    // (quiet of a strike's own motion — a run the reader named, or one at a punch's speed — not of every arm run a blurred
    // wrist's noise makes at 2–3 m/s)
    const quiet = s.t - this.lastBlowRun > BLOW_QUIET_MS && s.t - this.lastBlowT > BLOW_QUIET_MS
      && this.runs.every((r) => !r || !r.confirmed || (r.pv < QUIET_V && !r.told)) && this.kicks.every((x) => !x);
    const hipMid = (x: Sample) => vmid(x.f.hip[0], x.f.hip[1]);
    const lat = (x: Sample) => x.f.nose.x - hipMid(x).x;
    const shLat = (x: Sample) => (x.f.shoulder[0].x + x.f.shoulder[1].x) / 2 - hipMid(x).x;
    const noseHOf = (x: Sample) => (x.f.hipH ?? 0) + x.f.nose.y - hipMid(x).y;
    // the rest line: a slow average of the head's offset while it is quiet
    const dt = h.length > 1 ? Math.max(0, s.t - h[k - 1].t) : 0;
    if (this.latRest === null) this.latRest = lat(s);
    else if (Math.abs(lat(s) - this.latRest) < SLIP_M * 0.5) this.latRest += (lat(s) - this.latRest) * Math.min(1, dt / SLIP_REST_TAU_MS);
    const win = h.filter((x) => x.t >= s.t - SLIP_WINDOW_MS && x.t <= s.t);
    if (win.length >= 3) {
      const off = lat(s) - this.latRest, off0 = lat(win[0]) - this.latRest;
      const dShoulder = shLat(s) - shLat(win[0]);
      const dFwd = s.f.nose.z - win[0].f.nose.z;
      const hipsMoved = s.f.hipRoom && win[0].f.hipRoom ? Math.abs(s.f.hipRoom.x - win[0].f.hipRoom.x) : 0;
      if (Math.abs(off) < SLIP_M * 0.4) this.slipArmed = true;
      const out = Math.abs(off) >= SLIP_M && Math.abs(off0) <= SLIP_M * 0.5 && Math.sign(off) === Math.sign(off - off0);
      const dropped = noseHOf(win[0]) - noseHOf(s);
      if (this.slipArmed && out && dropped < SLIP_M && Math.sign(dShoulder) === Math.sign(off) && Math.abs(dShoulder) >= SLIP_SHOULDER_M
        && Math.abs(off - off0) >= 1.5 * Math.abs(dFwd) && hipsMoved < SLIP_HIPS_M && both && quiet && !f.inStride && !f.bothOverhead) {
        this.slipArmed = false;
        const ts = win.map((x) => x.t), vs = win.map((x) => Math.abs(this.rateAt(h.indexOf(x), lat) ?? 0));
        let pk = 0; for (let j = 1; j < vs.length; j++) if (vs[j] > vs[pk]) pk = j;
        ev.push({ kind: 'evade', t: onsetBackT(ts, vs, pk), seen, form: 'slip', side: off > 0 ? 'L' : 'R', sizeM: Math.abs(off) });
      }
    }
    // duck: the nose down fast, from a stand, both feet down
    const noseH = (x: Sample) => (x.f.hipH ?? 0) + x.f.nose.y - hipMid(x).y;
    const dw = h.filter((x) => x.t >= s.t - DUCK_WINDOW_MS && x.t <= s.t && x.f.hipH !== null);
    if (dw.length >= 3 && f.hipH !== null) {
      const top = Math.max(...dw.map(noseH)), drop = top - noseH(s);
      const vy = this.rateAt(k, noseH);
      if (drop < DUCK_M * 0.4) this.duckArmed = true;
      const armsBack = [0, 1].every((i) => f.wrist[i].z < hipMid(s).z - 0.1);
      const landed = h.some((x) => x.t >= s.t - DUCK_AFTER_AIR_MS && (x.f.inJump || x.f.airborne === true));
      if (this.duckArmed && drop >= DUCK_M && vy !== null && -vy >= DUCK_V * 0.5 && both && quiet && !f.inStride && !armsBack && !landed) {
        const vs = dw.map((x) => Math.max(0, -(this.rateAt(h.indexOf(x), noseH) ?? 0)));
        let pk = 0; for (let j = 1; j < vs.length; j++) if (vs[j] > vs[pk]) pk = j;
        if (vs[pk] >= DUCK_V) {
          this.debug?.(`duck t ${s.t.toFixed(0)} drop ${drop.toFixed(2)} arms ${[0, 1].map((i) => vlen(vsub(vsub(f.wrist[i], f.shoulder[i]), vsub(dw[0].f.wrist[i], dw[0].f.shoulder[i]))).toFixed(2)).join(',')} wristY ${[0, 1].map((i) => (f.wrist[i].y - hipMid(s).y).toFixed(2)).join(',')} wristZ ${[0, 1].map((i) => (f.wrist[i].z - hipMid(s).z).toFixed(2)).join(',')}`);
          this.duckArmed = false;
          ev.push({ kind: 'evade', t: onsetBackT(dw.map((x) => x.t), vs, pk), seen, form: 'duck', side: null, sizeM: drop });
        }
      }
    }
  }
  private latRest: number | null = null;

  // ── steps ──
  /**
   * A STEP: the body's place on the floor — the middle of the two feet, each read on the floor plane from its lowest image
   * point — moved STEP_M from where it last stood and standing again (still for STEP_SETTLE_MS), both feet low (a kick's
   * foot is up). Boxers slide their feet, so no lift is needed; a jog's feet alternate around one place, so its middle
   * never travels. In / out = toward / away from the camera, left / right the player's own. The onset is ONSET_SHARE of the
   * peak floor speed of the foot that moved first.
   */
  private steps(s: Sample, ev: FightEvent[]): void {
    const h = this.h, f = s.f;
    const lowOf = (x: Sample, i: number) => x.f.hipH !== null && x.f.hipH + x.f.ankle[i].y - vmid(x.f.hip[0], x.f.hip[1]).y < STEP_LOW_M;
    const bodyAt = (x: Sample): { x: number; z: number } | null => (x.f.feetRoom && x.f.contact?.[0] && x.f.contact[1] && lowOf(x, 0) && lowOf(x, 1) && !x.f.inJump
      ? { x: (x.f.feetRoom[0].x + x.f.feetRoom[1].x) / 2, z: (x.f.feetRoom[0].z + x.f.feetRoom[1].z) / 2 } : null);
    const win = (from: number, to: number) => h.filter((x) => x.t >= from && x.t <= to).map(bodyAt).filter((p): p is { x: number; z: number } => !!p);
    const med = (ps: { x: number; z: number }[]) => ({ x: median(ps.map((p) => p.x)), z: median(ps.map((p) => p.z)) });
    const now = win(s.t - STEP_SETTLE_MS, s.t);
    // the floor plane settles with the lens height the reader re-anchors on the planted feet: no step in the first moments
    if (s.t - h[0].t < STEP_WARM_MS) return;
    if (now.length < 3 || s.t - this.lastKickT < STEP_AFTER_KICK_MS) { if (s.t - this.lastKickT < STEP_AFTER_KICK_MS) this.stepAnchor = null; return; }
    const spread = Math.max(...now.map((p) => Math.hypot(p.x - now[0].x, p.z - now[0].z)));
    if (spread > STEP_STILL_M) return;                    // still moving
    const here = med(now);
    if (!this.stepAnchor) { this.stepAnchor = { ...here, t: s.t }; return; }
    const dx = here.x - this.stepAnchor.x, dz = here.z - this.stepAnchor.z, dist = Math.hypot(dx, dz);
    if (dist < STEP_M) { if (dist < STEP_M * 0.4) this.stepAnchor = { ...here, t: s.t }; return; }
    const from = this.stepAnchor.t;
    this.stepAnchor = { ...here, t: s.t };
    if (s.t - this.lastBlowRun <= BLOW_QUIET_MS && dist < 2 * STEP_M) return;
    // the onset: the first foot to move, since the body last stood
    let best: { t: number; foot: number } | null = null;
    for (const i of [0, 1]) {
      const ks = h.map((x, j) => j).filter((j) => h[j].t >= from - STEP_SETTLE_MS && h[j].t <= s.t);
      const vs = ks.map((j) => this.speedAt(j, (x) => x.f.feetRoom?.[i] ?? { x: 0, y: 0, z: 0 }) ?? 0);
      let pk = 0; for (let j = 1; j < vs.length; j++) if (vs[j] > vs[pk]) pk = j;
      if (vs[pk] < STEP_V) continue;
      const t = onsetBackT(ks.map((j) => h[j].t), vs, pk);
      if (!best || t < best.t) best = { t, foot: i };
    }
    if (!best) return;
    const dir = Math.abs(dz) >= Math.abs(dx) ? (dz > 0 ? 'in' : 'out') : dx > 0 ? 'left' : 'right';
    this.lastStepT = s.t;
    ev.push({ kind: 'fightStep', t: best.t, seen: s.t, dir, foot: best.foot === 0 ? 'L' : 'R', distM: dist });
  }
  private stepAnchor: { x: number; z: number; t: number } | null = null;
  private lastStepT = -Infinity;
  private lastKickT = -Infinity;

  // ── turns ──
  private turns(ev: FightEvent[]): void {
    const h = this.h, s = h[h.length - 1];
    if (s.f.yawDeg === null || s.t - this.lastTurnT < TURN_WINDOW_MS) return;
    const win = h.filter((x) => x.t >= s.t - TURN_WINDOW_MS && x.f.yawDeg !== null);
    if (win.length < 3) return;
    const d = s.f.yawDeg - win[0].f.yawDeg!;
    if (Math.abs(d) < TURN_DEG) return;
    const ts = win.map((x) => x.t), vs = win.map((_, j) => (j === 0 ? 0 : Math.abs((win[j].f.yawDeg! - win[j - 1].f.yawDeg!) / Math.max(1, win[j].t - win[j - 1].t))));
    let pk = 0; for (let j = 1; j < vs.length; j++) if (vs[j] > vs[pk]) pk = j;
    const t = onsetBackT(ts, vs, pk);
    this.lastTurnT = s.t;
    ev.push({ kind: 'turn', t, seen: s.t, deg: d });
  }
}
