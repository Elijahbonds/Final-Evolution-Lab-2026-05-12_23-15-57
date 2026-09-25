// bodyTargets — what a body target asks for, and what a body event has to be to answer it (movement play, phase 9,
// 2026-09-24).
//
// The cue lane (danceTracks.ts) and the judge (DanceCore.ts) were built for a press: any tap scored any pending step.
// A body is not a button. A jump must not score a punch target, the left hand must not score the right hand's target,
// and a hand has to be IN the zone it was asked to touch. This is the vocabulary the lane, the judge and the drills
// share. The dance chart keeps working untouched: a step with no move (or move 'tap') still takes any press.
//
// Pure: no DOM, no camera, no Babylon.

/** What the body is asked to do. 'tap' is a press (pad, key, touch screen): the dance chart's steps. */
export type MoveKind =
  | 'tap'
  | 'touch'        // a hand (or foot, or knee) into a zone on the self-view
  | 'jump'         // the take-off
  | 'land'         // the landing; with a hold, the stick
  | 'squat'        // the bottom of a dip or squat
  | 'step'         // a foot strike (running in place, a shuffle, a plant)
  | 'penultimate'  // the approach's long, low second-to-last step
  | 'knee'         // a knee driven up to hip height
  | 'punch'
  | 'kick'
  | 'hold';        // still, in the position (a balance, a stance)

export const MOVE_KINDS: readonly MoveKind[] = ['tap', 'touch', 'jump', 'land', 'squat', 'step', 'penultimate', 'knee', 'punch', 'kick', 'hold'];

/**
 * The part of the body a target is for. 'hands' = either hand (or both); 'feet' = both feet together (a two-foot
 * take-off, landing or stance). One foot is footL / footR: the brief's list had no single foot, but a one-foot take-off,
 * a single-leg stick and a step all need a side. L / R are the PLAYER's own left and right.
 */
export type Limb = 'handL' | 'handR' | 'hands' | 'feet' | 'footL' | 'footR' | 'kneeL' | 'kneeR' | 'hips';

export const LIMBS: readonly Limb[] = ['handL', 'handR', 'hands', 'feet', 'footL', 'footR', 'kneeL', 'kneeR', 'hips'];

/**
 * Where a target sits on the SELF-VIEW: the mirrored corner picture the player sees of themselves (0..1, y down).
 * Mirrored like a mirror, so the player's left hand is on the view's LEFT. Camera landmarks are not mirrored (the
 * left shoulder is on the image's right, lib/pose/landmarks.ts), so positions go through imageToSelfView first.
 */
export interface CueZone { x: number; y: number; limb: Limb }

/** A camera landmark position (image, unmirrored) → the self-view the zones are drawn on. */
export function imageToSelfView(x: number, y: number): { x: number; y: number } {
  return { x: 1 - x, y };
}

/**
 * Which limbs each move can be asked of. null = the move names no limb (any body part answers). Chart tests hold every
 * target to this, so a chart cannot ask for a punch with the feet.
 *
 * Only limbs an event can actually carry are listed: a target no event can answer is a guaranteed MISS. The body
 * reader's dip names no limb (lib/drills/fromReader.ts), so a squat takes none; a rest names what bears the weight
 * (feet, or one foot), never the hips.
 */
export const MOVE_LIMBS: Record<MoveKind, readonly (Limb | null)[]> = {
  tap: [null],
  touch: ['handL', 'handR', 'hands', 'footL', 'footR', 'kneeL', 'kneeR'],
  jump: ['feet', 'footL', 'footR'],
  land: ['feet', 'footL', 'footR'],
  squat: [null],
  step: ['footL', 'footR'],
  penultimate: ['footL', 'footR'],
  knee: ['kneeL', 'kneeR'],
  punch: ['handL', 'handR', 'hands'],
  kick: ['footL', 'footR'],
  hold: [null, 'feet', 'footL', 'footR'],
};

/**
 * Does an event's limb answer a target's? A target with no limb takes any. 'hands' takes either hand; a two-hand event
 * ('hands') answers a one-hand target. Feet are strict: a two-foot landing does not answer a single-leg stick, and one
 * foot does not answer a two-foot take-off — that difference is the drill.
 */
export function limbSatisfies(target: Limb | undefined, event: Limb | undefined): boolean {
  if (!target) return true;
  if (!event) return false;
  if (target === event) return true;
  if (target === 'hands') return event === 'handL' || event === 'handR';
  if (target === 'handL' || target === 'handR') return event === 'hands';
  return false;
}

/** The other side's limb (a drill run "the other way", or a left-footed jumper). */
export function mirrorLimb(l: Limb): Limb {
  switch (l) {
    case 'handL': return 'handR';
    case 'handR': return 'handL';
    case 'footL': return 'footR';
    case 'footR': return 'footL';
    case 'kneeL': return 'kneeR';
    case 'kneeR': return 'kneeL';
    default: return l;
  }
}

export function mirrorZone(z: CueZone): CueZone {
  return { x: 1 - z.x, y: z.y, limb: mirrorLimb(z.limb) };
}

// ── zones ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A limb is "in" a zone within this radius, in FRAME HEIGHTS. At the space check's play fill (the body 0.40–0.53 of the
 * frame's height, map:space-drills-ui §3) one frame height is ~3–4 m of room, so 0.08 is ~25–30 cm: a hand on the
 * target for a player who stands where the space check put them, give or take the framing's 0.18 centre tolerance
 * (lib/mirror/framing.ts) and a 20 % spread in reach between a kid and an adult. The wrist landmark sits ~8 cm short of
 * the hand's middle; the radius absorbs it. TUNE on the owner's recording.
 */
export const ZONE_RADIUS_H = 0.08;
/** Width / height of the self-view: PoseSource asks for 640×480 (lib/input/poseSource.ts). x is scaled by it so the
 *  zone is round on screen, not stretched sideways. */
export const SELF_VIEW_ASPECT = 640 / 480;

export function inZone(zone: { x: number; y: number }, x: number, y: number, aspect: number = SELF_VIEW_ASPECT): boolean {
  return Math.hypot((x - zone.x) * aspect, y - zone.y) <= ZONE_RADIUS_H;
}

// ── how each move is timed ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * How much wider than a press each move's windows are. A beat is a clean instant for a foot strike, a take-off or a
 * punch (1×). Some moves have no sharp instant:
 *   land   1.5  the landing comes a flight after the take-off, and the flight is the player's own effort: a 0.45 vs
 *               0.55 s flight moves it ±50 ms before any timing error.
 *   squat  2    the bottom of a controlled 2-s descent sits within 1 cm of its lowest point for about ±0.2 s (a cosine
 *               ease of 0.4 m: y ≈ 0.25·dt² m), so "the bottom" is a ±0.2 s smear, not an instant.
 *   hold   5    getting into a position is not a beat: GOOD at ±1 s reads as "within a second of the cue".
 */
export const MOVE_WINDOW_SCALE: Record<MoveKind, number> = {
  tap: 1, touch: 1, jump: 1, land: 1.5, squat: 2, step: 1, penultimate: 1, knee: 1, punch: 1, kick: 1, hold: 5,
};
export const MAX_WINDOW_SCALE = Math.max(...Object.values(MOVE_WINDOW_SCALE));

/**
 * The body reader stamps an event at the instant it HAPPENED (the capture clock), but it can only know it some time
 * later, so a target must stay open past its window long enough for a back-dated event to arrive.
 *   0.25 s  most moves: confirmed 3–5 frames after the fact (100–170 ms at 30 fps: a take-off once the hips rise, a step
 *           once the foot settles) plus capture and inference, 66 ± 8 ms in the fixtures' latency model
 *           (lib/pose/__fixtures__, synth latencyMs).
 *   land    + LAND_PAIR_SEC: a one-foot landing waits that long for the other foot before it is judged one-footed.
 *   squat   + 0.3 s: the bottom is known only once the hips have turned back up ~2 cm (BodyReader DIP_TURN_M), about
 *           0.3 s on a slow rise (same cosine as above).
 *   hold    + 0.7 s: rest is confirmed only once it has lasted; the app's stillness bar is FramingGate's 700 ms
 *           (lib/mirror/framing.ts).
 *   penultimate  + 1.5 s: named only at the take-off, looking back up to 1.5 s (BodyReader PENULT_WINDOW_MS).
 */
export const EVENT_ARRIVAL_SEC = 0.25;
/**
 * Both feet down within this (s) is a two-foot landing: the body reader's rule for a two-foot TAKE-OFF (TWO_FOOT_MS,
 * 100 ms) and the fixtures' own truth for a two-foot landing (synth.ts twoFootMs). At 30 fps a two-foot landing's second
 * foot is often a frame to three behind the first: the owner's jump_two_foot_low puts it 0–67 ms behind and
 * jump_two_foot_high 34–102 ms (frame times; the truth calls all seven two-footed), so "the same frame" (the reader's
 * own LAND_BOTH_MS, 34 ms) calls four of the seven one-footed.
 */
export const LAND_PAIR_SEC = 0.1;
export const MOVE_LATE_GRACE_SEC: Record<MoveKind, number> = {
  tap: 0, touch: EVENT_ARRIVAL_SEC, jump: EVENT_ARRIVAL_SEC, land: EVENT_ARRIVAL_SEC + LAND_PAIR_SEC, squat: EVENT_ARRIVAL_SEC + 0.3,
  step: EVENT_ARRIVAL_SEC, penultimate: EVENT_ARRIVAL_SEC + 1.5, knee: EVENT_ARRIVAL_SEC, punch: EVENT_ARRIVAL_SEC,
  kick: EVENT_ARRIVAL_SEC, hold: EVENT_ARRIVAL_SEC + 0.7,
};

/**
 * The late grace a target needs. A squat HELD at the bottom is not answered by the reader's dip: the dip is told only
 * once the hips turn back up (BodyReader DIP_TURN_M), which is after the pause, and it is stamped at the lowest sample,
 * which is anywhere in a flat bottom. It is answered by the body coming to rest low instead (DrillRunner), so it waits
 * as long as a hold does for its rest to be confirmed.
 */
export function lateGraceFor(move: MoveKind, holdSec?: number): number {
  return move === 'squat' && holdSec ? MOVE_LATE_GRACE_SEC.hold : MOVE_LATE_GRACE_SEC[move];
}

/** A body event as the judge takes it: the move, the limb, and where the limb was on the self-view (for zones). */
export interface BodyHit { move: MoveKind; limb?: Limb; x?: number; y?: number }
