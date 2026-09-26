// spaceCheck — the SPACE CHECK before body play (movement play, phase 4, 2026-09-24).
//
// Owner's setup: a living room with about 2 m of floor, a laptop or a propped phone, jumping in place. Before a body
// drives a game, the camera has to see enough of it for a jump, a side-step and an arms-up reach to be read, and the
// body has to stand still once so the rulers can be taken (lib/pose/calibrate.ts). lib/mirror/framing.ts already asks
// "is the shot good enough to grade a squat?"; this is the same question with a PLAY profile:
//
//   body present        framing's rule (5 of the 9 core points seen)
//   feet + floor        both ankles and both foot indexes seen, the lower ankle high enough to leave a strip of floor
//   head                the nose inside the top of the frame
//   square              the shoulders square to the lens, read from depth (world landmarks), not from the image spans
//   fill band           nose → ankle as a share of the frame: far enough for the headroom, near enough to measure
//   side range          a 1 m side-step either way keeps the hips, shoulders and ankles in the frame
//   light               mean visibility, and a luma histogram the UI samples (too dark / backlit)
//   HEADROOM            arms overhead: room above the hands for a HEADROOM_JUMP_M jump (never under WRIST_TOP_MIN of
//                       the frame), or a jump leaves it; when stepping back cannot make that room inside the fill band
//                       (a lens near the floor), the fix is the camera, not the feet
//   pose rate           ≥ 24 Hz, else jump height is 'unread' (advice, not a lock-out)
//   stillness           calibrate.ts's still window, which hands back the Calibration BodyReader starts from
//
// The ceiling cannot be seen, so the check always shows the safety note once per run.
//
// MOVEMENT PLAY P4 (2026-09-25), the build: ONE BODY AT A TIME. MediaPipe follows one person (numPoses 1), and when a
// second one walks in it can jump to them between two frames: a hip midpoint that moves further than any real step in
// that time (the fastest in the owner's 12 takes is 16.5 cm a 30 Hz frame, a dunk's take-off), or a body standing still
// that changes size in the picture (someone straight behind or in front), is a different body, and the check starts
// over — the rulers were the other body's. (The review: the jump distance scaled with the gap from an already doubled
// 35 cm, so at 15 Hz, or across one missed frame, two people 0.5 m apart passed as one; under 14.3 Hz a fixed 70 ms gap
// turned the rule off; and a switch in depth moved no hip at all.) The holds are lib/mirror/framing.ts's
// FramingGate now (its counted mode, which is what this file's own two clocks were). again() re-centres the same body
// (the headroom already measured for this view still counts); handOver() is a new body (Dunk Duel's next player, P5):
// the whole check, the safety note and the reach included.
//
// SpaceCheck is a state machine over those rules. Like framing it says ONE thing at a time, and each instruction has
// a stable id: the Coach's pre-rendered line (COACH_MOMENTS coach.space.*) where one exists, `space.*` (shown, not
// spoken) where the Coach has none. Frames are image landmarks (0..1, y DOWN, NOT mirrored: facing the camera the
// player's LEFT is the image's RIGHT), timed on the capture clock.
//
// Pure: no DOM, no camera.
import { checkFraming, FramingGate, VIS_MIN, type FramingFrame } from '../mirror/framing';
import {
  CORE_POINTS, LANDMARK_COUNT, NOSE, LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_ELBOW, RIGHT_ELBOW, LEFT_WRIST, RIGHT_WRIST, LEFT_HIP,
  RIGHT_HIP, LEFT_ANKLE, RIGHT_ANKLE, LEFT_FOOT_INDEX, RIGHT_FOOT_INDEX,
  type Lm, type Wm, type PoseFrame,
} from '../pose/landmarks';
import {
  StillnessGate, facingRatio, footLowImg, rulerX, rulerY, SEEN_VIS, CAL_WINDOW_MS, STILL_TORSO_SD_M,
  type Calibration, type CalibrationRefusal,
} from '../pose/calibrate';
import { bodyBox } from './luma';

// ── thresholds ───────────────────────────────────────────────────────────────────────────────────────────────────
//
// Anthropometry for a 1.8 m adult, as the map (movementplay/MAP.md, map:space-drills-ui §3) and the synth's rest body
// (lib/pose/synth.ts restPose) use it: nose 0.94 H, ankle point 0.045 H, wrists straight overhead 1.22 H. So the
// nose → ankle span the fill reads is 0.895 H ≈ 1.61 m, and the wrists overhead sit 1.175 H above the ankles.

/**
 * The lower ankle may sit no lower than this (image y): below it there is a strip of floor under the feet. The map's
 * derived number (framing.ts cuts at 0.97, which leaves no floor). A planted foot's index sits ~6 cm below the ankle
 * point, so at the top of the fill band the toes land ≤ ~0.945 and ~15 cm of floor shows under them.
 */
export const ANKLE_Y_MAX = 0.92;
/** The nose above this (image y) is out of the top: framing.ts's cut-off-top line. */
export const HEAD_Y_MIN = 0.03;
/** Without world landmarks, the metre ruler assumes this nose → ankle span (m): the 1.8 m adult above. */
export const NOSE_ANKLE_M = 1.6;
/**
 * JUMP HEADROOM, the design jump (m): with the arms straight overhead, the picture above the wrists must hold a jump
 * this high, measured through the body's own metre ruler (world landmarks, else the fill). The map's derivation
 * (map:space-drills-ui §3: ~0.5 m = 0.28 H of a 1.8 m adult). The map adds a 5 % margin because it PREDICTS the reach
 * from the nose; here the reach is measured on the real arms, so that margin is not taken. The owner's own jumps are
 * 0.2–0.32 m (low), 0.84 m (max) and ~1 m (the dunk) in the fixtures: a max jump still takes the hands out, which the
 * map accepts for the strike (map:dunk-input §6).
 */
export const HEADROOM_JUMP_M = 0.5;
/**
 * JUMP HEADROOM, the floor (image y): the wrists overhead never closer to the top than this, however far away the body
 * is. The map's dunk slice (map:dunk-input §6, "wrists ≥ ~15 % below the top", est.). It binds only at the far end of
 * the band (fill < 0.48), where it leaves more than HEADROOM_JUMP_M; nearer, the design jump binds (0.5 m = 0.18 of the
 * frame at the band's top, where the 15 % alone would carry only 0.42 m; at the old top, 0.585, 0.41 m).
 */
export const WRIST_TOP_MIN = 0.15;
/** Nose → ankle over wrists-overhead → ankle: 0.895 H / 1.175 H (the anthropometry above). */
export const NOSE_ANKLE_OVER_REACH = 0.76;
/**
 * The fill band for play (nose → lower ankle, share of the frame height).
 *   MAX is derived from the two rules that bound the frame: the wrists overhead with HEADROOM_JUMP_M of picture above
 *       them (HEADROOM_JUMP_M / NOSE_ANKLE_M × fill in image y) AND the ankles ANKLE_Y_MAX above the bottom can only
 *       both hold when fill / 0.76 + 0.3125 × fill ≤ 0.92, so fill ≤ 0.565, however the camera is aimed. (The map's
 *       0.53 is the same sum with its 5 % apex margin added.) The owner's stand at the fixtures' 3 m / 640×480 camera
 *       fills 0.585: over the line.
 *   MIN: the lite model at 640×480 then has ~190 px of body; the map's floor (framing.ts's 0.45 is for grading a
 *       squat, not reading a jump). Unverified on devices.
 */
export const PLAY_FILL_MAX = (NOSE_ANKLE_OVER_REACH * ANKLE_Y_MAX) / (1 + (NOSE_ANKLE_OVER_REACH * HEADROOM_JUMP_M) / NOSE_ANKLE_M);
export const PLAY_FILL_MIN = 0.40;
/**
 * Shoulder-mid → hip-mid over nose → ankle: estimates the fill when the feet or the head are cut, so a body that is
 * simply too close is told to step back rather than to tilt the camera. The map's 0.326, the synth's rest body 0.31,
 * the owner's fixtures 0.31–0.37 (median 0.345).
 */
export const TORSO_SHARE = 0.34;
/**
 * Square to the camera: the shoulders' span across the lens is at least this share of their 3-D span (|cos yaw|,
 * cos 32°). Stricter than calibrate.ts's FACING_MIN (0.8), so the calibration that follows never refuses 'edge-on' on
 * a noisy frame; the owner's stand reads 0.93 at its 10th percentile.
 */
export const FACING_MIN_PLAY = 0.85;
/** Half the owner's ~2 m of floor: the side-step each way, standing in its middle (m). */
export const SIDE_STEP_M = 1.0;
/** After that step, hips, shoulders and ankles keep this far inside the frame's side (framing.ts's 0.03 cut-off margin). */
export const SIDE_EDGE = 0.03;
/**
 * Image width over height when the caller does not say, or says something unusable (PoseService reports 0 × 0 until
 * the video's size is known, and 0 / 0 is NaN): the 640×480 poseSource asks for (and the synth's camera).
 */
export const DEFAULT_ASPECT = 4 / 3;
const aspectOf = (a: number | undefined) => (a !== undefined && Number.isFinite(a) && a > 0 ? a : DEFAULT_ASPECT);
/**
 * Arms UP: both wrists above the nose by this many torso lengths (shoulder-mid → hip-mid), both elbows at or above
 * their shoulders. A hand on the head is ~0.2; the synth's straight arms reach 0.58, a real adult's ~0.95.
 */
export const ARMS_UP_MIN = 0.4;
/** Jump height needs this pose rate (Hz): h = g·t²/8 on a 0.5 s flight is off by −7.6/+8.8 cm at 15 Hz, ±4 cm at 30 Hz (the map). */
export const MIN_POSE_HZ = 24;
/** The pose rate is counted over this window (ms), and is unknown until it spans RATE_MIN_SPAN_MS. */
export const RATE_WINDOW_MS = 1000;
export const RATE_MIN_SPAN_MS = 700;
/**
 * The rules read a per-landmark median of the last SMOOTH_FRAMES body frames (at most SMOOTH_MS old): the synth's
 * limb jitter (σ 0.004 of the width) would otherwise flip a fill sitting near a band edge on every other frame.
 */
export const SMOOTH_FRAMES = 5;
export const SMOOTH_MS = 250;
/** A rule's verdict counts once it has held this long (ms): one missed frame (the synth's 1 %) never moves the check. */
export const SETTLE_MS = 250;
/** The framing must stay good this long before the check moves on (ms): framing.ts's FramingGate. */
export const FRAME_HOLD_MS = 700;
/** The arms must stay overhead this long for a headroom verdict (ms): ~9 frames of the reach at 30 Hz. */
export const ARMS_HOLD_MS = 300;
/** Each piece of advice (a slow camera, poor light) is shown this long, once, unless it is fixed sooner (ms). */
export const ADVICE_MS = 3000;
/**
 * The headroom measured with the arms up holds while the view does: the fill may grow by at most this share (5 % of
 * the fill is ~15–20 cm nearer the lens), and the nose may shift by at most VIEW_SHIFT (the camera re-aimed).
 */
export const HEADROOM_FILL_SLACK = 0.05;
export const VIEW_SHIFT = 0.03;
/**
 * ONE BODY AT A TIME: the hip midpoint moving this far (m) between two body frames is a different body (the tracker
 * jumped to someone else), however close the frames. Measured through the last body's own metre ruler (world spans,
 * else the fill). Two people side by side stand ~0.5 m apart, hip to hip.
 */
export const SWAP_M = 0.35;
/**
 * The owner's fastest real hip step, read the same way: 16.5 cm in one 30 Hz frame (dunk_elijah_one_foot's take-off).
 * Between two frames further apart (a slower camera, a missed detection) a real body moves further in proportion, so
 * the jump the rule needs is SWAP_MARGIN × this × gap / SWAP_FRAME_MS, never under SWAP_M: 0.35 m at 30 Hz, 0.43 m at
 * 15 Hz or across one missed frame at 30 Hz (both still catch two people 0.5 m apart), 0.54 m at 24 Hz across one.
 */
export const SWAP_STEP_M = 0.165;
export const SWAP_MARGIN = 1.3;
/** One frame at the 30 Hz the camera is asked for (ms): the unit SWAP_STEP_M is in. */
export const SWAP_FRAME_MS = 1000 / 30;
/**
 * …and only between body frames at most this many camera frames apart (the frame step measured over the rate window,
 * SWAP_FRAME_MS until it is known): a body gone for longer and back somewhere else is a person walking. Counted in the
 * camera's own frames, so a slow camera keeps the rule (a fixed 70 ms turned it off under 14.3 Hz), and one missed
 * detection at the switch is still compared.
 */
export const SWAP_GAP_FRAMES = 2.5;
/**
 * …or a body STANDING STILL whose size in the picture jumps: someone straight behind or in front of the player moves
 * no hip across the picture, but is bigger or smaller in it, and no frame rate changes that. Still = the hips' and
 * shoulders' midpoints over the last SWAP_SCALE_FRAMES body frames within calibrate.ts's STILL_TORSO_SD_M (SD, m). A jump
 * = the torso (shoulders → hips) AND the legs (hips → ankles), in image height, both off their median over those frames
 * by this much (log ratio), the same way: one limb's change is a crouch or a lean, both at once is the distance. 0.5 m
 * behind at 3.6 m is 0.13 (0.11 at 4.5 m); the owner's 12 takes (as shot, at 15 Hz, from 3.6 and 4.5 m) never pass 0.06
 * on a still stretch, and the synth's noise at 4.5 m 0.05. Moving, the takes pass 0.3 (a dunk): hence the still.
 */
export const SWAP_SCALE = 0.075;
export const SWAP_SCALE_FRAMES = 5;
/** The 'swap' issue holds this long after the last jump (ms): two people taking turns in the picture never settle. */
export const SWAP_HOLD_MS = 1500;

// Light (luma 0..255, from a small canvas sample of the video — nothing leaves the page). All UNVERIFIED on devices.
/** Auto-exposure aims the mean near 118 (sRGB 18 % grey); a frame whose mean is under this has run out of gain. */
export const LUMA_DARK_MEAN = 50;
/** A pixel at or above this is clipped: a window, a lamp in shot. */
export const LUMA_CLIP = 240;
/** A pixel at or below this is shadow. */
export const LUMA_SHADOW = 50;
/** Backlit: at least this share of the frame is clipped… */
export const BACKLIT_CLIP_SHARE = 0.1;
/** …and the body's box is darker than this share of the frame's mean (a silhouette)… */
export const BACKLIT_BODY_RATIO = 0.6;
/** …or, with no body box sampled, at least this share of the frame is shadow (bright and dark, little between). */
export const BACKLIT_SHADOW_SHARE = 0.3;

// ── the per-frame rules ──────────────────────────────────────────────────────────────────────────────────────────

export type SpaceIssue =
  | 'noBody'     // nothing to read
  | 'swap'       // a different body than the frame before (the check's own rule, from frame to frame: not checkSpace's)
  | 'feet'       // a foot, or the floor under it, out of the picture (and the body is not simply too big)
  | 'head'       // the head out of the top (and the body is not simply too big)
  | 'turned'     // not square to the camera, or the back to it
  | 'tooClose'   // over the fill band: no headroom for a jump
  | 'tooFar'     // under it: too few pixels to measure
  | 'narrow'     // a side-step either way leaves the picture: only distance fixes it
  | 'moveLeft'   // no room for a step to the player's RIGHT: move to your left
  | 'moveRight'  // no room for a step to the player's LEFT: move to your right
  | 'dim';       // the model is unsure of the body

/** One at a time, this order: what to fix first. */
export const SPACE_ORDER: readonly SpaceIssue[] = [
  'noBody', 'swap', 'feet', 'head', 'turned', 'tooClose', 'tooFar', 'narrow', 'moveLeft', 'moveRight', 'dim',
];

export interface SpaceReading {
  /** Nose → lower ankle as a share of the frame height (framing.ts's bodyFill). */
  fill: number;
  /** The fill estimated from the torso, for when the feet or the head are cut. */
  fillEst: number | null;
  /** Mean visibility of the core points (framing.ts's). */
  visibility: number;
  /** The shoulders' span across the lens over their 3-D span, ~|cos yaw| (1 = square); null without a body. */
  facing: number | null;
  /** The left shoulder on the image's LEFT: the back is to the camera. */
  facingAway: boolean;
  /**
   * Image units to spare at the frame's edge after a SIDE_STEP_M step each way (negative = that step leaves the
   * frame). playerLeft is the step toward the player's own left = the image's right. null when the feet are cut.
   */
  room: { playerLeft: number; playerRight: number } | null;
  /** Both ankles and both foot indexes inside the frame, over the floor strip (a 'feet' issue with this true = unsure feet). */
  feetInFrame: boolean;
  /** Both arms overhead (ARMS_UP_MIN). */
  armsUp: boolean;
  /** Both wrists below their shoulders: the calibration stand. */
  armsDown: boolean;
  /** With the arms up: the highest image y the hands reach, measured or as a straight arm would (the smaller). */
  reachTop: number | null;
  /** HEADROOM_JUMP_M in image y units at the body's depth (the world ruler, else the fill); null without a body. */
  jumpSpan: number | null;
  /** How far below the top the reach must sit (image y): max(WRIST_TOP_MIN, jumpSpan); null without a body. */
  headroomNeed: number | null;
}

export interface SpaceFrameCheck {
  ok: boolean;
  issues: SpaceIssue[];
  worst: SpaceIssue | null;
  reading: SpaceReading;
}

export interface SpaceCheckOptions {
  /** Video width / height (the UI knows it). Only the no-world fallbacks and the arm length use it. */
  aspect?: number;
  /** The latest light verdict (readLight): a dark frame with a weak body read is fixed with light first. */
  light?: LightVerdict | null;
}

const NO_READING: SpaceReading = {
  fill: 0, fillEst: null, visibility: 0, facing: null, facingAway: false, room: null, feetInFrame: false, armsUp: false,
  armsDown: false, reachTop: null, jumpSpan: null, headroomNeed: null,
};

const inside = (l: Lm) => l.x >= 0 && l.x <= 1 && l.y >= 0 && l.y <= 1;
const toFraming = (f: PoseFrame): FramingFrame => ({
  present: f.present, landmarks: f.image.map((l) => ({ x: l.x, y: l.y, visibility: l.v })),
});

/** Without world landmarks: ~|cos yaw| from the shoulders' image x and relative depth (MediaPipe's z is on x's scale). */
function imageFacing(im: Lm[]): number {
  const dx = im[LEFT_SHOULDER].x - im[RIGHT_SHOULDER].x, dz = im[LEFT_SHOULDER].z - im[RIGHT_SHOULDER].z;
  const span = Math.hypot(dx, dz);
  return span > 1e-4 ? Math.abs(dx) / span : 0;
}

/** Image x units per metre at the body's depth: the world spans when there are world landmarks, else the fill. */
function xPerMetre(f: PoseFrame, fill: number, aspect: number): number {
  const mPerX = rulerX(f);
  if (mPerX && mPerX > 0) return 1 / mPerX;
  return fill / NOSE_ANKLE_M / aspect;   // y units per metre, then into x units
}

/** An image distance in y units (x spans aspect × as many pixels). */
const lenY = (a: Lm, b: Lm, aspect: number) => Math.hypot((b.x - a.x) * aspect, b.y - a.y);

/** The rules on one frame (smoothed or raw). Pure. */
export function checkSpace(frame: PoseFrame, opts: SpaceCheckOptions = {}): SpaceFrameCheck {
  const aspect = aspectOf(opts.aspect);
  const base = checkFraming(toFraming(frame));
  if (base.worst === 'noBody' || frame.image.length < LANDMARK_COUNT) {
    return { ok: false, issues: ['noBody'], worst: 'noBody', reading: NO_READING };
  }
  const im = frame.image;
  const issues: SpaceIssue[] = [];
  // a body the model is unsure of all over is a light problem: its feet reading weak is not a framing fault
  const weakBody = base.visibility < VIS_MIN;

  const shoulderY = (im[LEFT_SHOULDER].y + im[RIGHT_SHOULDER].y) / 2;
  const torsoY = (im[LEFT_HIP].y + im[RIGHT_HIP].y) / 2 - shoulderY;
  const fillEst = torsoY > 0 ? torsoY / TORSO_SHARE : null;
  const tooBig = fillEst !== null && fillEst > PLAY_FILL_MAX;

  // feet and floor, head: when one is cut, the torso says whether the body is simply too big (step back) or the
  // camera is aimed off (tilt it). Feet in the frame but unsure (behind a sofa, a rug's edge) are still 'feet'.
  const feet = [LEFT_ANKLE, RIGHT_ANKLE, LEFT_FOOT_INDEX, RIGHT_FOOT_INDEX];
  const ankleY = Math.max(im[LEFT_ANKLE].y, im[RIGHT_ANKLE].y);
  const feetIn = feet.every((i) => inside(im[i])) && ankleY <= ANKLE_Y_MAX;
  const feetSure = feet.every((i) => im[i].v >= SEEN_VIS);
  const headOk = im[NOSE].y >= HEAD_Y_MIN && inside(im[NOSE]);
  if (!feetIn) issues.push(tooBig ? 'tooClose' : 'feet');
  else if (!feetSure && !weakBody) issues.push('feet');
  if (!headOk && !issues.includes('tooClose')) issues.push(tooBig ? 'tooClose' : 'head');

  // square: read from depth. The image spans cannot tell: a yaw shrinks the shoulders AND the hips by cos(yaw), so
  // framing.ts's shoulder/hip ratio stays at a square body's (2.1 on the synth's rest body, 0°–75° alike; 1.6–2.0 on
  // the owner's takes) however far the player turns.
  const facing = facingRatio(frame) ?? imageFacing(im);
  const facingAway = im[LEFT_SHOULDER].x < im[RIGHT_SHOULDER].x;
  if (facing < FACING_MIN_PLAY || facingAway) issues.push('turned');

  // distance: the measured fill when head and feet are in, else the torso's estimate
  const fill = base.bodyFill;
  const fillUse = feetIn && headOk ? fill : fillEst;
  if (fillUse !== null && fillUse > PLAY_FILL_MAX && !issues.includes('tooClose')) issues.push('tooClose');
  if (fillUse !== null && fillUse < PLAY_FILL_MIN) issues.push('tooFar');

  // side range: predict the body after a SIDE_STEP_M step each way (read only with the feet in: the ankles count)
  let room: SpaceReading['room'] = null;
  if (feetIn) {
    const k = xPerMetre(frame, fill, aspect);
    const xs = [LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP, LEFT_ANKLE, RIGHT_ANKLE].map((i) => im[i].x);
    const step = SIDE_STEP_M * k;
    // facing the camera, the player's right is the image's left
    const playerRight = Math.min(...xs) - step - SIDE_EDGE;
    const playerLeft = 1 - SIDE_EDGE - Math.max(...xs) - step;
    room = { playerLeft, playerRight };
    if (playerLeft + playerRight < 0) issues.push('narrow');
    else if (playerRight < 0) issues.push('moveLeft');
    else if (playerLeft < 0) issues.push('moveRight');
  }

  // light: weak on average (framing's line), or a core point inside the frame the model is unsure of
  const unsure = CORE_POINTS.some((i) => inside(im[i]) && im[i].v < SEEN_VIS);
  if (weakBody || unsure) issues.push('dim');

  // arms overhead, and how high the hands reach
  const wristsUp = torsoY > 0 && [LEFT_WRIST, RIGHT_WRIST].every((w) => im[NOSE].y - im[w].y >= ARMS_UP_MIN * torsoY);
  const elbowsUp = im[LEFT_ELBOW].y <= im[LEFT_SHOULDER].y && im[RIGHT_ELBOW].y <= im[RIGHT_SHOULDER].y;
  const armsUp = wristsUp && elbowsUp;
  const armsDown = im[LEFT_WRIST].y > im[LEFT_SHOULDER].y && im[RIGHT_WRIST].y > im[RIGHT_SHOULDER].y;
  const reachTop = armsUp ? Math.min(...([[LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST], [RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST]] as const)
    .map(([s, e, w]) => Math.min(im[w].y, im[s].y - lenY(im[s], im[e], aspect) - lenY(im[e], im[w], aspect)))) : null;
  // the design jump in image y at the body's depth: the world torso's ruler, else the fill over the assumed body
  const mPerY = rulerY(frame);
  const yPerM = mPerY && mPerY > 0 ? 1 / mPerY : (fillUse ?? fill) / NOSE_ANKLE_M;
  const jumpSpan = HEADROOM_JUMP_M * yPerM;

  // a dark room with a weak read: light is the fix, whatever else the guessing landmarks say
  const worst = opts.light === 'dark' && issues.includes('dim') ? 'dim' : SPACE_ORDER.find((i) => issues.includes(i)) ?? null;
  return {
    ok: issues.length === 0,
    issues,
    worst,
    reading: {
      fill, fillEst, visibility: base.visibility, facing, facingAway, room, feetInFrame: feetIn, armsUp, armsDown, reachTop,
      jumpSpan, headroomNeed: Math.max(WRIST_TOP_MIN, jumpSpan),
    },
  };
}

/** The headroom rule on its own: the arms are overhead and the hands clear the top by headroomNeed. */
export const headroomOk = (r: SpaceReading): boolean =>
  r.armsUp && r.reachTop !== null && r.headroomNeed !== null && r.reachTop >= r.headroomNeed;

/**
 * After a failed reach: can stepping back make the room, before the body drops under PLAY_FILL_MIN? Walking back
 * shrinks the picture of the body toward the horizon, which for a level lens is the image's middle row, so the
 * reach's height above that row and the design jump's span both scale by PLAY_FILL_MIN / fill at the band's floor.
 * When even that fails (a lens near the floor: at 0.5 m no distance in the band clears it), "step back" would only
 * walk the player into "come closer", so the fix is the camera. A lens tilted up puts its horizon lower and makes
 * stepping back work better than this says; raising the lens is still a fix then.
 */
export function stepBackClears(reachTop: number, fill: number, jumpSpan: number): boolean {
  if (!(fill > 0)) return true;
  const s = Math.min(1, PLAY_FILL_MIN / fill);
  return 0.5 - (0.5 - reachTop) * s >= Math.max(WRIST_TOP_MIN, jumpSpan * s);
}

/**
 * After a 'narrow' read: can stepping back make room for a SIDE_STEP_M step each way before the body drops under
 * PLAY_FILL_MIN? Walking back shrinks the body's span and a metre's width in the picture alike (by PLAY_FILL_MIN / fill
 * at the band's floor); the room over both sides is 1 − 2·SIDE_EDGE less that. An upright 9:16 phone fails this at
 * every distance (its picture is too narrow for its height: ~43° across), so "step back" would only walk the player
 * into "come closer"; the fix is to turn the camera.
 */
export function stepBackWidens(room: { playerLeft: number; playerRight: number }, fill: number): boolean {
  if (!(fill > 0)) return true;
  const s = Math.min(1, PLAY_FILL_MIN / fill);
  const clear = 1 - 2 * SIDE_EDGE;
  // the body's span plus a step each way, in this frame's image x
  const needed = clear - (room.playerLeft + room.playerRight);
  return clear - s * needed >= 0;
}

// ── light ────────────────────────────────────────────────────────────────────────────────────────────────────────

export type LightVerdict = 'ok' | 'dark' | 'backlit';
/**
 * Luma histograms the UI samples from the video (any bin count; bin i covers [i, i + 1) × 256 / bins). `body` is
 * optional: the body's bounding box, which tells a backlit silhouette from a bright room.
 */
export interface LumaSample { frame: ArrayLike<number>; body?: ArrayLike<number> | null }
export interface LightRead { verdict: LightVerdict; mean: number; clipped: number; shadow: number; bodyMean: number | null }

function histStats(h: ArrayLike<number>): { n: number; mean: number; clipped: number; shadow: number } {
  const bins = h.length, w = 256 / Math.max(1, bins);
  let n = 0, sum = 0, clipped = 0, shadow = 0;
  for (let i = 0; i < bins; i++) {
    // a count is a finite, non-negative number of pixels: anything else in a bin is dropped, not averaged in
    const c = Number.isFinite(h[i]) ? Math.max(0, h[i]) : 0;
    n += c; sum += c * (i + 0.5) * w;
    // a bin counts by its centre
    if ((i + 0.5) * w >= LUMA_CLIP) clipped += c;
    if ((i + 0.5) * w <= LUMA_SHADOW) shadow += c;
  }
  return n > 0 ? { n, mean: sum / n, clipped: clipped / n, shadow: shadow / n } : { n: 0, mean: 0, clipped: 0, shadow: 0 };
}

/** Too dark, backlit, or fine; null for an empty sample. Pure. */
export function readLight(s: LumaSample): LightRead | null {
  const f = histStats(s.frame);
  if (!f.n) return null;
  const b = s.body ? histStats(s.body) : null;
  const bodyMean = b && b.n ? b.mean : null;
  const verdict: LightVerdict =
    f.mean < LUMA_DARK_MEAN ? 'dark'
    : f.clipped >= BACKLIT_CLIP_SHARE && (bodyMean !== null ? bodyMean < BACKLIT_BODY_RATIO * f.mean : f.shadow >= BACKLIT_SHADOW_SHARE) ? 'backlit'
    : 'ok';
  return { verdict, mean: f.mean, clipped: f.clipped, shadow: f.shadow, bodyMean };
}

// ── pose rate ────────────────────────────────────────────────────────────────────────────────────────────────────

/** Frames per second over capture times (ms, oldest first); null until they span RATE_MIN_SPAN_MS. */
export function poseRate(times: readonly number[]): number | null {
  if (times.length < 2) return null;
  const span = times[times.length - 1] - times[0];
  return span >= RATE_MIN_SPAN_MS ? ((times.length - 1) * 1000) / span : null;
}

// ── instructions ─────────────────────────────────────────────────────────────────────────────────────────────────

/** The Coach's space lines (lib/babylon/audio/mic/moments.ts COACH_MOMENTS): spoken as well as shown. */
export const SPACE_COACH_IDS = [
  'coach.space.intro', 'coach.space.back', 'coach.space.closer', 'coach.space.left', 'coach.space.right',
  'coach.space.feet', 'coach.space.arms', 'coach.space.still', 'coach.space.ready',
] as const;
export type SpaceCoachId = typeof SPACE_COACH_IDS[number];
/** Instructions the Coach has no line for: shown only. */
export type SpaceTextId =
  | 'space.turn' | 'space.dim' | 'space.light' | 'space.backlit' | 'space.rate' | 'space.depth' | 'space.raise' | 'space.wide'
  | 'space.one';
export type SpaceInstructionId = SpaceCoachId | SpaceTextId;

/** Which rule is speaking (several share a line: the fill, the head, the side range and the headroom all say "step back"). */
export type SpaceRule = SpaceIssue | 'intro' | 'hold' | 'arms' | 'headroom' | 'rate' | 'light' | 'still' | 'depth' | 'ready';

export interface SpaceInstruction {
  id: SpaceInstructionId;
  rule: SpaceRule;
  /** One sentence, an action. */
  text: string;
  /** The same in a few words, for the corner self-view during play (SpaceState.oneLine). */
  short: string;
  /** A Coach line exists for it (the id is a COACH_MOMENTS id). */
  voiced: boolean;
}

export interface SpaceNote { id: 'space.safety' | 'space.rate' | 'space.light' | 'space.backlit'; text: string }

/** The ceiling and the clearance: the one thing the camera cannot check, so it is always said, once per run. */
export const SAFETY_NOTE: SpaceNote = {
  id: 'space.safety',
  text: "Before you jump: nothing overhead you could hit (a fan, a light, a low ceiling), and about 2 m of clear floor. The camera can't see the ceiling.",
};

const say = (id: SpaceInstructionId, rule: SpaceRule, text: string, short: string): SpaceInstruction =>
  ({ id, rule, text, short, voiced: id.startsWith('coach.') });

const ISSUE_SAY: Record<Exclude<SpaceIssue, 'dim'>, SpaceInstruction> = {
  noBody: say('coach.space.intro', 'noBody', 'Step into the picture: your whole body, with clear space around and above you.', 'Step into the picture'),
  swap: say('space.one', 'swap', 'One player at a time: ask anyone else to step out of the picture.', 'One player at a time'),
  feet: say('coach.space.feet', 'feet', 'Your feet need to be in the picture, with some floor below them: tilt the camera down.', 'Feet in the picture'),
  head: say('coach.space.back', 'head', 'Your head is out of the picture: step back, or tilt the camera up.', 'Head in the picture'),
  turned: say('space.turn', 'turned', 'Face the camera square-on.', 'Face the camera'),
  tooClose: say('coach.space.back', 'tooClose', 'Step back: a jump needs room above your hands.', 'Step back'),
  tooFar: say('coach.space.closer', 'tooFar', 'Come closer: you are far enough away that I am guessing.', 'Come closer'),
  narrow: say('coach.space.back', 'narrow', 'Step back: a side-step either way would leave the picture.', 'Step back'),
  moveLeft: say('coach.space.left', 'moveLeft', 'Move to your left: there is no room for a step to your right.', 'Move to your left'),
  moveRight: say('coach.space.right', 'moveRight', 'Move to your right: there is no room for a step to your left.', 'Move to your right'),
};
const DIM_SAY: Record<LightVerdict | 'unknown', SpaceInstruction> = {
  dark: say('space.light', 'dim', 'Turn on more light: the room is too dark for the camera.', 'More light'),
  backlit: say('space.backlit', 'dim', 'A bright window or lamp is behind you: turn the camera so it is not in the picture.', 'Window behind you'),
  ok: say('space.dim', 'dim', 'A plainer background, or more light: I am losing track of you.', 'More light'),
  unknown: say('space.dim', 'dim', 'A plainer background, or more light: I am losing track of you.', 'More light'),
};
// the feet are in the picture but the model is unsure of them (a sofa's edge, dark socks on a dark floor): tilting the
// camera would not help. The Coach's feet line ("I need to see your feet") fits both.
const FEET_UNSURE = say('coach.space.feet', 'feet', 'I cannot make out your feet: clear the floor around them, or add some light.', 'Clear the floor');
const INTRO = say('coach.space.intro', 'intro', 'Step back until your whole body is in the picture, with clear space around and above you.', 'Whole body in the picture');
const HOLD = say('coach.space.still', 'hold', 'Hold that spot.', 'Hold that spot');
const ARMS = say('coach.space.arms', 'arms', 'Reach both arms overhead to check the headroom.', 'Arms overhead');
const HEADROOM = say('coach.space.back', 'headroom', 'Step back: your hands are near the top of the picture, and a jump would leave it.', 'Step back');
// the Coach has no lines for these (and "step back" would walk the player into "come closer"): shown only
const RAISE = say('space.raise', 'headroom', 'Raise the camera to about chest height, or tilt it up: stepping back far enough for a jump would leave you too small to read.', 'Raise the camera');
const TURN_PHONE = say('space.wide', 'narrow', 'Turn the phone on its side: upright, it cannot see about 2 m of floor and all of you at once.', 'Turn the phone on its side');
const WIDER = say('space.wide', 'narrow', 'This camera sees too narrow a strip for side-steps from a distance it can read you at: a wider camera is needed.', 'A wider camera is needed');
const STILL = say('coach.space.still', 'still', 'Stand still for a moment.', 'Stand still');
const STILL_ARMS = say('coach.space.still', 'still', 'Arms down, and stand still for a moment.', 'Arms down, stand still');
const READY = say('coach.space.ready', 'ready', 'All set: raise both hands to start.', 'All set: raise both hands');
const TURN_CAL = say('space.turn', 'turned', 'Face the camera square-on.', 'Face the camera');
const DEPTH = say('space.depth', 'depth', 'This camera feed carries no body depth, so body play cannot measure you.', 'Body play cannot measure you');
const rateSay = (hz: number) => say('space.rate', 'rate',
  `Your camera is slow (${Math.round(hz)} frames a second). You can play, but jump height won't be measured.`, 'Slow camera');
const lightSay = (v: LightVerdict) => v === 'backlit'
  ? say('space.backlit', 'light', 'A bright window or lamp is behind you: the read will be better with it out of the picture.', 'Window behind you')
  : say('space.light', 'light', 'More light will help the camera keep up with you.', 'More light');
const rateNote = (hz: number): SpaceNote => ({ id: 'space.rate', text: `Your camera is slow (${Math.round(hz)} frames a second): jump height won't be measured.` });
const lightNote = (v: LightVerdict): SpaceNote => v === 'backlit'
  ? { id: 'space.backlit', text: 'Backlit: a bright window or lamp behind you.' }
  : { id: 'space.light', text: 'Low light.' };

// ── the machine ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 *   frame   every per-frame rule holds (settled) for FRAME_HOLD_MS of clean frames
 *   arms    both arms overhead for ARMS_HOLD_MS of arms-up frames, with room above the hands for a HEADROOM_JUMP_M
 *           jump (skipped while an earlier headroom pass still holds for this view)
 *   advice  a slow camera or poor light, each shown once for up to ADVICE_MS; neither locks the player out
 *   still   calibrate.ts's still window: it hands back the Calibration
 *   ready   "raise both hands to start" (the UI owns the start gesture)
 * A per-frame issue that settles in any later stage drops back to `frame` (and drops the calibration). A swap (a
 * different body) drops back at once, and takes the headroom measured for the other body with it.
 *
 * The holds are clocks of frames that COUNT (FramingGate's counted mode): only the time between two consecutive frames
 * that both pass (a body, no issue; the arms overhead) adds to them. A missed or failing frame pauses the clock, so a
 * body the model finds one frame in four never "holds" anything, while one missed frame costs a frame's time, not the
 * hold.
 */
export type SpaceStage = 'frame' | 'arms' | 'advice' | 'still' | 'ready';

export interface SpaceState {
  t: number;
  stage: SpaceStage;
  /** The ONE thing to say now. */
  instruction: SpaceInstruction;
  /** The same in a few words: the corner self-view's line during play (instruction.short). */
  oneLine: string;
  /** 0..1 through the stage's hold (a progress ring). */
  hold: number;
  /** This frame's rules (on the smoothed frame). */
  check: SpaceFrameCheck;
  /** The settled issue the machine is acting on, or null. */
  issue: SpaceIssue | null;
  poseHz: number | null;
  /** 'read' at ≥ MIN_POSE_HZ, 'unread' under it, null until the rate is known. */
  jumpHeight: 'read' | 'unread' | null;
  light: LightRead | null;
  /**
   * The last arms-up verdict: where the hands reached, the room they needed (headroomNeed), whether it cleared, and
   * on a fail whether stepping back can fix it (false: raise or tilt the camera).
   */
  headroom: { ok: boolean; reachTop: number; need: number; stepBack: boolean } | null;
  /** Standing advice (a slow camera, poor light) while it holds. */
  notes: SpaceNote[];
  /** SAFETY_NOTE on the first state of a run, null after. */
  safety: SpaceNote | null;
  /** The still stand's rulers once taken (BodyReader.setCalibration). */
  calibration: Calibration | null;
  ready: boolean;
}

interface Latch { fill: number; noseY: number }

export class SpaceCheck {
  private aspect: number;
  private stage: SpaceStage = 'frame';
  private times: number[] = [];
  private recent: PoseFrame[] = [];
  private settled: SpaceIssue | null | undefined = undefined;
  private pending: SpaceIssue | null = null;
  private pendingSince = 0;
  private shownIssue = false;
  // frame: the framing held (counted: a frame that does not pass pauses it)
  private readonly frameGate = new FramingGate(FRAME_HOLD_MS, { counted: true });
  // arms: the reach held (counted, the same way)
  private readonly armsGate = new FramingGate(ARMS_HOLD_MS, { counted: true });
  private armsDownSince: number | null = null;
  private bestTop = Infinity;
  private needMax = 0;
  private spanMax = 0;
  private headroomLatch: Latch | null = null;
  private headroomFail: Latch | null = null;
  private lastHeadroom: SpaceState['headroom'] = null;
  // advice
  private adviceQueue: ('rate' | 'light')[] = [];
  private adviceSince = 0;
  private adviceDone = new Set<'rate' | 'light'>();
  // still
  private readonly gate = new StillnessGate();
  private stillWhy: CalibrationRefusal | 'arms' | null = null;
  private cal: Calibration | null = null;
  private lightRead: LightRead | null = null;
  private safetyDue = true;
  // one body at a time: the last body frame's hip point and metre rulers, the last few body frames' sizes (the scale
  // cue), and when the last jump between bodies was
  private lastBody: { t: number; x: number; y: number; mPerX: number; mPerY: number } | null = null;
  private trail: BodySize[] = [];
  private swapAt = -Infinity;

  constructor(opts: { aspect?: number } = {}) {
    this.aspect = aspectOf(opts.aspect);
  }

  /** The picture's width / height changed (the phone turned on its side, as 'space.wide' asks): read the new shape. */
  setAspect(aspect: number): void {
    this.aspect = aspectOf(aspect);
  }

  /** The latest luma sample (the UI samples a few times a second); returns its read. */
  light(sample: LumaSample | null): LightRead | null {
    this.lightRead = sample ? readLight(sample) : null;
    return this.lightRead;
  }

  /** Start over: a new run (the safety note is shown again). */
  reset(): void {
    this.stage = 'frame'; this.times = []; this.recent = []; this.settled = undefined; this.pending = null;
    this.pendingSince = 0; this.shownIssue = false; this.frameGate.reset(); this.resetArms();
    this.headroomLatch = null; this.headroomFail = null;
    this.lastHeadroom = null; this.adviceQueue = []; this.adviceSince = 0; this.adviceDone.clear(); this.gate.reset();
    this.stillWhy = null; this.cal = null; this.lightRead = null; this.safetyDue = true;
    this.lastBody = null; this.trail = []; this.swapAt = -Infinity;
  }

  /**
   * Re-centre the same body ("Check my space again"): back to the framing, the rulers dropped, a new still stand. The
   * headroom already measured for this view still counts (the latch), so an unchanged spot skips the reach; the
   * advice already given is not given again, and the safety note was said this run. The pose rate starts over too: the
   * frames before a stretch the check did not see (play, the end card) would read a 30 Hz camera as slow.
   */
  again(): void {
    this.toFrame();
    this.settled = undefined; this.pending = null; this.pendingSince = 0;
    this.times = []; this.recent = []; this.lastBody = null; this.trail = []; this.swapAt = -Infinity;
  }

  /** A new body (Dunk Duel's next player, P5): the whole check again — the safety note, the reach, a new stand. */
  handOver(): void {
    this.reset();
  }

  get calibration(): Calibration | null { return this.cal; }

  /** One camera frame (every frame the model returns, with a body or without), capture clock. */
  push(input: PoseFrame): SpaceState {
    // PoseService's own rule: a frame without all 33 points is a frame without a body (and the median needs 33)
    const f: PoseFrame = !input.present || input.image.length < LANDMARK_COUNT ? { t: input.t, present: false, image: [] }
      : input.world && input.world.length < LANDMARK_COUNT ? { t: input.t, present: true, image: input.image }
      : input;
    const t = f.t;
    this.times.push(t);
    // only the window's own frames: after a gap the rate is unknown until it spans RATE_MIN_SPAN_MS again, never the
    // gap's (a floor of two kept frames read a 30 Hz camera as 0.02 Hz across a 60 s stretch the check did not see)
    while (t - this.times[0] > RATE_WINDOW_MS) this.times.shift();
    const hz = poseRate(this.times);

    // one body at a time: a hip that jumps further than a real step could, or a still body that changes size, is someone
    // else. The smoothing starts over on the new body (a median across two people is neither of them).
    const swapped = f.present && this.swapped(f);
    if (swapped) { this.swapAt = t; this.recent = []; this.headroomLatch = null; }
    if (f.present) {
      this.recent.push(f);
      while (this.recent.length > SMOOTH_FRAMES || (this.recent.length > 1 && t - this.recent[0].t > SMOOTH_MS)) this.recent.shift();
    } else this.recent = [];
    const view = f.present ? medianFrame(this.recent) : f;
    const lightV = this.lightRead?.verdict ?? null;
    const check = checkSpace(view, { aspect: this.aspect, light: lightV });

    // settle the worst issue: a verdict counts once it has held SETTLE_MS (the first frame of a run counts at once).
    // A swap is an event, not a noisy verdict: it counts at once, and holds SWAP_HOLD_MS after the last one.
    const raw = check.worst === 'noBody' || t - this.swapAt >= SWAP_HOLD_MS ? check.worst : 'swap';
    if (this.settled === undefined || swapped) { this.settled = raw; this.pending = raw; this.pendingSince = t; }
    else if (raw !== this.pending) { this.pending = raw; this.pendingSince = t; }
    if (raw === this.pending && raw !== this.settled && t - this.pendingSince >= SETTLE_MS) this.settled = raw;
    const issue = this.settled ?? null;
    // after a fix the hold says "hold that spot"; walking into the picture is not a fix, the opening line stays
    if (issue && issue !== 'noBody') this.shownIssue = true;

    if (issue && this.stage !== 'frame') this.toFrame();
    const noseY = view.present && view.image.length ? view.image[NOSE].y : 0;
    // a stage that finishes on this frame hands the frame on to the next one (advice → still takes its first sample)
    let hold = 0;
    if (this.stage === 'frame') hold = this.stepFrame(issue, check.ok, check.reading.fill, noseY, t, hz);
    else if (this.stage === 'arms') hold = this.stepArms(check.reading, f.present, noseY, t, hz);
    if (this.stage === 'advice') hold = this.stepAdvice(t, hz, lightV);
    if (this.stage === 'still') hold = this.stepStill(f, check.reading.armsDown);
    if (this.stage === 'ready') hold = 1;

    const instruction = this.instruction(issue, check.reading, hz, lightV);
    const safety = this.safetyDue ? SAFETY_NOTE : null;
    this.safetyDue = false;
    const notes: SpaceNote[] = [];
    if (hz !== null && hz < MIN_POSE_HZ) notes.push(rateNote(hz));
    if (lightV && lightV !== 'ok' && issue !== 'dim') notes.push(lightNote(lightV));
    return {
      t, stage: this.stage, instruction, oneLine: instruction.short, hold: Math.max(0, Math.min(1, hold)), check, issue,
      poseHz: hz, jumpHeight: hz === null ? null : hz >= MIN_POSE_HZ ? 'read' : 'unread',
      light: this.lightRead, headroom: this.lastHeadroom, notes, safety, calibration: this.cal, ready: this.stage === 'ready',
    };
  }

  /**
   * A different body from the last one (the tracker jumped): the hip moved further than a real step could in the time
   * between the two frames, or a body standing still changed size in the picture. Keeps the last body frame and its size.
   */
  private swapped(f: PoseFrame): boolean {
    const im = f.image;
    const x = (im[LEFT_HIP].x + im[RIGHT_HIP].x) / 2, y = (im[LEFT_HIP].y + im[RIGHT_HIP].y) / 2;
    // the metre rulers at this body's depth: the world spans, else the fill over the assumed body
    const fill = Math.max(im[LEFT_ANKLE].y, im[RIGHT_ANKLE].y) - im[NOSE].y;
    const wy = rulerY(f), wx = rulerX(f);
    const mPerY = wy && wy > 0 ? wy : fill > 0.05 ? NOSE_ANKLE_M / fill : 0;
    const mPerX = wx && wx > 0 ? wx : mPerY * this.aspect;
    const last = this.lastBody;
    this.lastBody = mPerX > 0 && mPerY > 0 ? { t: f.t, x, y, mPerX, mPerY } : null;
    const size = bodySize(im);
    const gap = last ? f.t - last.t : NaN;
    // only frames close enough to compare (a body gone longer and back elsewhere is a person walking): the size trail
    // starts over across a longer gap too
    if (!last || !(gap > 0) || gap > SWAP_GAP_FRAMES * this.frameStep()) { this.trail = size ? [size] : []; return false; }
    const moved = Math.hypot((x - last.x) * last.mPerX, (y - last.y) * last.mPerY);
    const jumped = moved >= Math.max(SWAP_M, (SWAP_MARGIN * SWAP_STEP_M * gap) / SWAP_FRAME_MS)
      || (size !== null && this.resized(size, last));
    // a new body starts its own trail; the last body's frames never judge it
    if (jumped || !size) this.trail = size ? [size] : [];
    else { this.trail.push(size); if (this.trail.length > SWAP_SCALE_FRAMES) this.trail.shift(); }
    return jumped;
  }

  /** The camera's frame step (ms): the median over the rate window's capture times, SWAP_FRAME_MS until there are two. */
  private frameStep(): number {
    const ts = this.times;
    return ts.length < 2 ? SWAP_FRAME_MS : med(ts.slice(1).map((t, i) => t - ts[i]));
  }

  /** The scale cue: the trail's body stood still, and this frame's torso and legs both jumped in size, the same way. */
  private resized(now: BodySize, r: { mPerX: number; mPerY: number }): boolean {
    const w = this.trail;
    if (w.length < SWAP_SCALE_FRAMES) return false;
    const sd = (get: (b: BodySize) => number) => {
      const v = w.map(get), m = v.reduce((a, b) => a + b, 0) / v.length;
      return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
    };
    const still = Math.max(sd((b) => b.hipX) * r.mPerX, sd((b) => b.hipY) * r.mPerY, sd((b) => b.shoulderX) * r.mPerX, sd((b) => b.shoulderY) * r.mPerY);
    if (still > STILL_TORSO_SD_M) return false;
    const dTorso = now.torso - med(w.map((b) => b.torso)), dLegs = now.legs - med(w.map((b) => b.legs));
    return (dTorso > 0) === (dLegs > 0) && Math.min(Math.abs(dTorso), Math.abs(dLegs)) >= SWAP_SCALE;
  }

  private stepFrame(issue: SpaceIssue | null, clean: boolean, fill: number, noseY: number, t: number, hz: number | null): number {
    if (issue) { this.frameGate.reset(); return 0; }
    // a missed or failing frame (not yet settled into an issue) pauses the hold: it does not count toward it
    if (this.frameGate.step(clean, t) < 1) return this.frameGate.progress;
    // an earlier headroom pass still counts if the view has not come nearer or been re-aimed
    const l = this.headroomLatch;
    const holds = !!l && fill <= l.fill * (1 + HEADROOM_FILL_SLACK) && Math.abs(noseY - l.noseY) < VIEW_SHIFT;
    if (!holds) this.headroomLatch = null;
    this.enter(holds ? 'advice' : 'arms', t, hz);
    return 0;
  }

  private resetArms(): void {
    this.armsGate.reset(); this.armsDownSince = null; this.bestTop = Infinity; this.needMax = 0; this.spanMax = 0;
  }

  private stepArms(r: SpaceReading, present: boolean, noseY: number, t: number, hz: number | null): number {
    // a failed reach keeps its instruction until the view changes (they moved, or re-aimed) or a reach passes. Only a
    // frame with a body can say the view changed: a missed frame reads fill 0 and would look like a move.
    const fail = this.headroomFail;
    if (fail && present && (Math.abs(r.fill - fail.fill) >= HEADROOM_FILL_SLACK * fail.fill || Math.abs(noseY - fail.noseY) >= VIEW_SHIFT)) {
      this.headroomFail = null;
    }
    if (!r.armsUp) {
      // the hold pauses; it restarts once the arms have been down SETTLE_MS (one noisy frame does not break a reach)
      this.armsGate.step(false, t);
      this.armsDownSince ??= t;
      if (t - this.armsDownSince >= SETTLE_MS) { this.armsGate.reset(); this.bestTop = Infinity; this.needMax = 0; this.spanMax = 0; }
      return this.armsGate.progress;
    }
    this.armsDownSince = null;
    this.armsGate.step(true, t);
    this.bestTop = Math.min(this.bestTop, r.reachTop ?? Infinity);
    this.needMax = Math.max(this.needMax, r.headroomNeed ?? WRIST_TOP_MIN);
    this.spanMax = Math.max(this.spanMax, r.jumpSpan ?? 0);
    if (this.armsGate.progress < 1) return this.armsGate.progress;
    // the verdict is on the highest the hands got over the hold, against the most room any frame of it asked for
    const ok = this.bestTop >= this.needMax;
    const stepBack = ok || stepBackClears(this.bestTop, r.fill, this.spanMax);
    this.lastHeadroom = { ok, reachTop: this.bestTop, need: this.needMax, stepBack };
    if (ok) {
      this.headroomLatch = { fill: r.fill, noseY };
      this.headroomFail = null;
      this.enter('advice', t, hz);
    } else {
      this.headroomFail = { fill: r.fill, noseY };
      // judge the next window afresh, from this frame (the clock restarts on it)
      this.armsGate.reset(); this.armsGate.step(true, t);
      this.bestTop = r.reachTop ?? Infinity; this.needMax = r.headroomNeed ?? WRIST_TOP_MIN; this.spanMax = r.jumpSpan ?? 0;
    }
    return 0;
  }

  private stepAdvice(t: number, hz: number | null, lightV: LightVerdict | null): number {
    // drop advice that is fixed or has had its time, show the rest one at a time
    while (this.adviceQueue.length) {
      const a = this.adviceQueue[0];
      const fixed = a === 'rate' ? hz !== null && hz >= MIN_POSE_HZ : lightV === null || lightV === 'ok';
      if (!fixed && t - this.adviceSince < ADVICE_MS) return (t - this.adviceSince) / ADVICE_MS;
      this.adviceDone.add(a);
      this.adviceQueue.shift();
      this.adviceSince = t;
    }
    this.enter('still', t, hz);
    return 0;
  }

  private stepStill(f: PoseFrame, armsDown: boolean): number {
    if (!f.present) { this.gate.reset(); this.stillWhy = 'not-whole'; return 0; }
    // the rulers come from the stand, arms down (a raised arm lifts and narrows the shoulders, the lean's ruler)
    if (!armsDown) { this.gate.reset(); this.stillWhy = 'arms'; return 0; }
    const r = this.gate.push(f);
    if (r.ok) { this.cal = r.cal; this.stillWhy = null; this.stage = 'ready'; return 1; }
    this.stillWhy = r.why;
    const w = this.gate.window;
    return r.why === 'short' && w.length > 1 ? (w[w.length - 1].t - w[0].t) / CAL_WINDOW_MS : 0;
  }

  private toFrame(): void {
    this.stage = 'frame';
    this.frameGate.reset();
    this.resetArms(); this.headroomFail = null;
    this.adviceQueue = [];
    this.gate.reset(); this.stillWhy = null; this.cal = null;
  }

  private enter(stage: SpaceStage, t: number, hz: number | null): void {
    this.stage = stage;
    if (stage === 'arms') this.resetArms();
    if (stage === 'advice') {
      const lightV = this.lightRead?.verdict ?? null;
      this.adviceQueue = [];
      if (hz !== null && hz < MIN_POSE_HZ && !this.adviceDone.has('rate')) this.adviceQueue.push('rate');
      if (lightV && lightV !== 'ok' && !this.adviceDone.has('light')) this.adviceQueue.push('light');
      this.adviceSince = t;
    }
    // the still window is taken AFTER the check asks for it, so the rulers come from the stand, not the reach
    if (stage === 'still') { this.gate.reset(); this.stillWhy = null; }
  }

  private instruction(issue: SpaceIssue | null, r: SpaceReading, hz: number | null, lightV: LightVerdict | null): SpaceInstruction {
    switch (this.stage) {
      case 'frame':
        if (issue === 'dim') return DIM_SAY[lightV ?? 'unknown'];
        if (issue === 'feet' && r.feetInFrame) return FEET_UNSURE;
        if (issue === 'narrow' && r.room && !stepBackWidens(r.room, r.fill)) return this.aspect < 1 ? TURN_PHONE : WIDER;
        if (issue) return ISSUE_SAY[issue];
        return this.shownIssue ? HOLD : INTRO;
      case 'arms':
        if (!this.headroomFail) return ARMS;
        return this.lastHeadroom && !this.lastHeadroom.stepBack ? RAISE : HEADROOM;
      case 'advice': {
        const a = this.adviceQueue[0];
        return a === 'rate' ? rateSay(hz ?? 0) : lightSay(lightV ?? 'ok');
      }
      case 'still':
        if (this.stillWhy === 'edge-on' || this.stillWhy === 'turned-away') return TURN_CAL;
        if (this.stillWhy === 'no-world') return DEPTH;
        return this.stillWhy === 'arms' ? STILL_ARMS : STILL;
      case 'ready':
        return READY;
    }
  }
}

// ── what the self-view draws ─────────────────────────────────────────────────────────────────────────────────────

export interface SpaceOverlay {
  /** The floor line (image y): the calibration's once it is taken, else the lower foot's live lowest point; null without feet. */
  floorY: number | null;
  /** While the reach is asked for: the top band of the picture the hands must stay under (image y 0 → this); else null. */
  headroomY: number | null;
  /** The body's box, from the core points seen. */
  box: { x0: number; y0: number; x1: number; y1: number } | null;
}

/**
 * What the self-view draws over the camera picture, in IMAGE units (0..1, y down) — not mirrored: the self-view flips
 * its whole box with CSS, the picture and this overlay together, so a line drawn here lands on the body it belongs to.
 * `image` is the frame the state was read from (the landmarks the state does not carry).
 */
export function spaceOverlay(s: Pick<SpaceState, 'stage' | 'check' | 'calibration'>, image: readonly Lm[] | null): SpaceOverlay {
  const body = image && image.length >= LANDMARK_COUNT ? image : null;
  const feet = body && [LEFT_ANKLE, RIGHT_ANKLE, LEFT_FOOT_INDEX, RIGHT_FOOT_INDEX].every((i) => inside(body[i]) && body[i].v >= SEEN_VIS);
  const floorY = s.calibration ? s.calibration.floorY.line
    : feet ? Math.max(footLowImg(body as Lm[], 'L'), footLowImg(body as Lm[], 'R')) : null;
  const headroomY = s.stage === 'arms' ? s.check.reading.headroomNeed : null;
  return { floorY, headroomY, box: body ? bodyBox(body) : null };
}

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** One body frame's size in the picture (log image heights of the torso and the legs) and its torso's midpoints. */
interface BodySize { torso: number; legs: number; hipX: number; hipY: number; shoulderX: number; shoulderY: number }
function bodySize(im: readonly Lm[]): BodySize | null {
  const hipX = (im[LEFT_HIP].x + im[RIGHT_HIP].x) / 2, hipY = (im[LEFT_HIP].y + im[RIGHT_HIP].y) / 2;
  const shoulderX = (im[LEFT_SHOULDER].x + im[RIGHT_SHOULDER].x) / 2, shoulderY = (im[LEFT_SHOULDER].y + im[RIGHT_SHOULDER].y) / 2;
  const torso = hipY - shoulderY, legs = (im[LEFT_ANKLE].y + im[RIGHT_ANKLE].y) / 2 - hipY;
  return torso > 0 && legs > 0 ? { torso: Math.log(torso), legs: Math.log(legs), hipX, hipY, shoulderX, shoulderY } : null;
}

const med = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** A per-landmark median of body frames (image, and world when every frame has it), stamped with the last one's time. */
export function medianFrame(fs: readonly PoseFrame[]): PoseFrame {
  const last = fs[fs.length - 1];
  if (fs.length < 3) return last;
  const image: Lm[] = last.image.map((_, i) => ({
    x: med(fs.map((f) => f.image[i].x)), y: med(fs.map((f) => f.image[i].y)),
    z: med(fs.map((f) => f.image[i].z)), v: med(fs.map((f) => f.image[i].v)),
  }));
  const world: Wm[] | undefined = fs.every((f) => f.world)
    ? last.world!.map((_, i) => ({ x: med(fs.map((f) => f.world![i].x)), y: med(fs.map((f) => f.world![i].y)), z: med(fs.map((f) => f.world![i].z)) }))
    : undefined;
  return world ? { t: last.t, present: true, image, world } : { t: last.t, present: true, image };
}
