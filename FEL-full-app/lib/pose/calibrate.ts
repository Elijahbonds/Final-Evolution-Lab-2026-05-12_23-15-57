// calibrate — the body's rulers, taken from a STILL stand with the whole body in frame (movement play, phase 2,
// 2026-09-24).
//
// What it replaces: poseSource's one-frame calibration (the 12th rAF tick after the body appears, whatever it is
// doing — the baseline found 5 of 12 takes calibrated ≥ 30 % off the ruler or ≥ 5 cm off the hips, BASELINE.md §0).
// Here a rolling ~0.7 s window has to hold still before anything is measured, and every ruler is the window's median:
//
//   shoulder width   image x units (the old ruler, kept for the old gates) and metres (world)
//   hip line         the hip midpoint's image x, y: the centre every lean and rise is read from
//   floor line       per foot, the image y of its lowest point of ankle / heel / foot index
//   hip height       metres from the hips down to the lowest foot point, read in the WORLD landmarks: a staggered
//                    stance puts one foot ~0.3 m nearer the lens and ~11 cm lower in the image (the owner's
//                    jump_two_foot_low stance), which no image floor line survives, but the world skeleton is metric
//   leg length       hip → ankle, metres (world) and image y units
//   the METRE RULER  metres per image unit, x and y apart (the image is 4:3, so they differ by the aspect): world vs
//                    image spans of the shoulders and hips (x) and of the torso, shoulders → hips (y). Heights out of
//                    the image come out in metres through it.
//   the lens PITCH   MediaPipe's world landmarks are turned with the camera, not with gravity: a phone propped on the
//                    floor looking up 13° mixes 22 % of a foot's depth into its "height" (a foot 20 cm nearer the lens
//                    than the hips reads 4.5 cm off the floor). An upright stand is vertical, so its ankles → shoulders
//                    axis in the world landmarks IS the camera's pitch; the drops are read along gravity through it.
//
// It refuses — and says why — when the body is not still, not whole (a core point hidden or a foot out of frame),
// edge-on or turned away (the shoulder span is the x ruler), or has no world landmarks. A stand taken in a crouch is
// not refused (the reader lifts its standing height when the player stands taller), but it cannot tell the pitch.
//
// Pure: no DOM, no camera.
import {
  CORE_POINTS, LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP, LEFT_KNEE, RIGHT_KNEE, LEFT_ANKLE, RIGHT_ANKLE,
  LEFT_HEEL, RIGHT_HEEL, LEFT_FOOT_INDEX, RIGHT_FOOT_INDEX, LEFT_ELBOW, RIGHT_ELBOW, LEFT_WRIST, RIGHT_WRIST,
  type Lm, type Wm, type PoseFrame,
} from './landmarks';

// ── thresholds ───────────────────────────────────────────────────────────────────────────────────────────────────

/** The still window (ms): the brief's ~0.7 s, and lib/mirror/framing.ts's FramingGate (700 ms of good framing). */
export const CAL_WINDOW_MS = 700;
/**
 * The window must hold this share of the frames its span implies (a 30 fps camera drops ~2 %, the model misses ~1 %:
 * the synth's defaults, poseSource's own camera): fewer and the medians are a handful of samples.
 */
export const CAL_MIN_FRAME_SHARE = 0.7;
/** A point counts as seen at MediaPipe's own confidence default, 0.5 (poseControl's MIN_VISIBILITY). */
export const SEEN_VIS = 0.5;
/**
 * A body missing for less than this (ms) keeps the still window: a blink of the model (1–5 missed frames) is not the
 * player leaving. At a 10 % miss rate a window that restarted on every miss held 21 frames in a row 11 % of the time,
 * and the reader first calibrated after 6 s (the adversarial review's drops 20 % / misses 10 % stream).
 */
export const CAL_GAP_MS = 200;
/**
 * Stillness is read on each track's running mean over this many frames, so landmark jitter (white, frame to frame) is
 * not taken for motion: at twice the synth's jitter (a dim room, the lite model) the raw ankles of a statue read
 * 3.0–3.9 cm and no stand ever calibrated. Smoothed: the owner's stand_still reads ≤ 1.9 / 2.0 cm (torso / ankle) at
 * that jitter, and the jog's ankles still ≥ 6.2 cm, every jump take ≥ 5.9 cm on the torso.
 */
export const STILL_SMOOTH_FRAMES = 5;
/**
 * Still = the hips' and shoulders' midpoints wander less than this (SD over the window, m, the worst of x and y). The
 * landmark jitter alone is ~0.7 cm on the torso (the synth's noise model at 640×480, 3 m); the owner's stand_still
 * reads 0.6–1.45 cm over its windows (a video solve's shoulder sway); every window of a jog in place reads ≥ 1.9 cm
 * (and its ankles ≥ 7 cm), a jump take ≥ 4 cm.
 */
export const STILL_TORSO_SD_M = 0.02;
/**
 * …and each ankle less than this. Limb jitter alone is ~1.4 cm (ditto) and stand_still's ankles read 1.3–1.8 cm; a
 * step lifts a foot 5–25 cm, and no window of the jog, the jumps or the approaches reads under 3 cm.
 */
export const STILL_ANKLE_SD_M = 0.025;
/**
 * An upright stand: the more bent knee (hip → knee → ankle, world) at least this. The owner's stand_still reads 159°,
 * the synth's rest body 167°; hips lowered 5 cm into a ready crouch read 135°, 15 cm 106°. Only an upright stand can
 * tell the lens pitch (a crouch leans its axis).
 */
export const STAND_KNEE_DEG = 150;
/**
 * The pitch read off an upright stand is trusted from this far off level (deg). A person standing still is vertical to
 * a few degrees: the owner's upright stands read 0.4–3.1° on a level lens; the tilted lenses the review built (5.7°,
 * 11.8°, 13.1°) read 5.0°, 12.4°, 12.4°.
 */
export const PITCH_DEADBAND_DEG = 4;
/**
 * Facing = the shoulders' span across the image is at least this share of their true (world, 3-D) span: cos 37°.
 * The x ruler divides by that span, and a body turned further is the edge-on case the ruler must not be taken from.
 */
export const FACING_MIN = 0.8;

// ── per-frame geometry, shared with the reader ──────────────────────────────────────────────────────────────────

export type FootSide = 'L' | 'R';
const midW = (a: Wm, b: Wm): Wm => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
const distW = (a: Wm, b: Wm) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const median = (v: number[]): number => {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const sd = (v: number[]): number => {
  if (v.length < 2) return 0;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
};

export const FOOT = {
  L: { hip: LEFT_HIP, knee: LEFT_KNEE, ankle: LEFT_ANKLE, heel: LEFT_HEEL, toe: LEFT_FOOT_INDEX },
  R: { hip: RIGHT_HIP, knee: RIGHT_KNEE, ankle: RIGHT_ANKLE, heel: RIGHT_HEEL, toe: RIGHT_FOOT_INDEX },
} as const;
export const ARM = {
  L: { shoulder: LEFT_SHOULDER, elbow: LEFT_ELBOW, wrist: LEFT_WRIST },
  R: { shoulder: RIGHT_SHOULDER, elbow: RIGHT_ELBOW, wrist: RIGHT_WRIST },
} as const;

/** Hip midpoint in the image. */
export const hipMidImg = (im: Lm[]) => ({ x: (im[LEFT_HIP].x + im[RIGHT_HIP].x) / 2, y: (im[LEFT_HIP].y + im[RIGHT_HIP].y) / 2 });
export const shoulderMidImg = (im: Lm[]) => ({ x: (im[LEFT_SHOULDER].x + im[RIGHT_SHOULDER].x) / 2, y: (im[LEFT_SHOULDER].y + im[RIGHT_SHOULDER].y) / 2 });

/**
 * A planted ankle sits this far above the sole (m): the synth's foot model puts it at 8.5 cm (lib/pose/synth.ts
 * calibrateFoot, ANKLE_M), an adult's lateral malleolus is 6–9 cm up. Used only when neither heel nor toe is seen.
 */
export const ANKLE_ABOVE_SOLE_M = 0.085;

/**
 * The camera's pitch as the world landmarks carry it: cos and sin of the angle the lens looks DOWN (up is negative).
 * World landmarks are turned with the camera, so "down" in them is gravity's down only on a level lens.
 */
export interface Tilt { c: number; s: number }
export const LEVEL: Tilt = { c: 1, s: 0 };
export const tiltOf = (pitchDeg: number): Tilt => ({ c: Math.cos((pitchDeg * Math.PI) / 180), s: Math.sin((pitchDeg * Math.PI) / 180) });
/** A world point's (or offset's) component along gravity's down (m): its y and z turned back by the pitch. */
export const downW = (w: Wm, t: Tilt = LEVEL) => w.y * t.c + w.z * t.s;

/**
 * How far below the hip midpoint a foot's lowest point is (m, world, + = down): the lower of heel and foot index,
 * as the synth's ground truth reads a foot (lowestFootY). A point MediaPipe is unsure of (visibility < SEEN_VIS) is 3×
 * noisier, so one hidden behind a leg is dropped when a sure point exists — but one below the image's bottom edge is
 * kept: that is a foot forward of the other near the lens, on its toes, and dropping the toe read the raised heel as
 * the foot (a planted foot at 10–14 cm in the owner's one-foot dunk). With neither, the ankle less its height over the
 * sole. Read along gravity through the lens pitch. null when the frame has no world landmarks.
 */
export function footDropW(f: PoseFrame, side: FootSide, tilt: Tilt = LEVEL): number | null {
  const w = f.world;
  if (!w) return null;
  const s = FOOT[side], im = f.image;
  const sure = [s.heel, s.toe].filter((i) => im[i].v >= SEEN_VIS || im[i].y > 1);
  if (sure.length) return Math.max(...sure.map((i) => downW(w[i], tilt)));
  if (im[s.ankle].v >= SEEN_VIS) return downW(w[s.ankle], tilt) + ANKLE_ABOVE_SOLE_M;
  return Math.max(downW(w[s.heel], tilt), downW(w[s.toe], tilt));
}

/**
 * Any of a leg's knee / ankle / heel / foot index inside the image. A foot just past the bottom edge is still read
 * (MediaPipe carries it on from the shin it sees: the owner's one-foot dunk lands its near foot below the edge); a
 * leg gone from the knee down leaves nothing to carry it on from, and is not read.
 */
export function footInFrame(im: Lm[], side: FootSide): boolean {
  const s = FOOT[side];
  return [s.knee, s.ankle, s.heel, s.toe].some((i) => im[i].x >= 0 && im[i].x <= 1 && im[i].y >= 0 && im[i].y <= 1);
}

/** The knee's angle, hip → knee → ankle (deg, world; 180 = straight). */
export function kneeDeg(w: Wm[], side: FootSide): number {
  const s = FOOT[side];
  const a = { x: w[s.hip].x - w[s.knee].x, y: w[s.hip].y - w[s.knee].y, z: w[s.hip].z - w[s.knee].z };
  const b = { x: w[s.ankle].x - w[s.knee].x, y: w[s.ankle].y - w[s.knee].y, z: w[s.ankle].z - w[s.knee].z };
  const d = (a.x * b.x + a.y * b.y + a.z * b.z) / Math.max(1e-9, Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z));
  return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI;
}

/**
 * The lens pitch one frame shows (deg, + = looking down), IF the body is standing upright: the ankles → shoulders axis
 * in the world landmarks. (For a lens looking down θ, a vertical body's up is (0, −cos θ, −sin θ) in them.)
 */
export function bodyPitchDeg(w: Wm[]): number {
  const ay = (w[LEFT_ANKLE].y + w[RIGHT_ANKLE].y) / 2, az = (w[LEFT_ANKLE].z + w[RIGHT_ANKLE].z) / 2;
  const sy = (w[LEFT_SHOULDER].y + w[RIGHT_SHOULDER].y) / 2, sz = (w[LEFT_SHOULDER].z + w[RIGHT_SHOULDER].z) / 2;
  return (Math.atan2(-(sz - az), -(sy - ay)) * 180) / Math.PI;
}

/** A foot's lowest image point of ankle / heel / foot index (image y, down): the floor line is read from these. */
export const footLowImg = (im: Lm[], side: FootSide) => Math.max(im[FOOT[side].ankle].y, im[FOOT[side].heel].y, im[FOOT[side].toe].y);

/** Metres per image x unit in one frame: world vs image spans of the shoulders and hips (both across the lens). */
export function rulerX(f: PoseFrame): number | null {
  const w = f.world, im = f.image;
  if (!w) return null;
  const iw = Math.abs(im[LEFT_SHOULDER].x - im[RIGHT_SHOULDER].x) + Math.abs(im[LEFT_HIP].x - im[RIGHT_HIP].x);
  const ww = Math.abs(w[LEFT_SHOULDER].x - w[RIGHT_SHOULDER].x) + Math.abs(w[LEFT_HIP].x - w[RIGHT_HIP].x);
  return iw > 1e-4 ? ww / iw : null;
}
/** Metres per image y unit in one frame: the torso's height, shoulders → hips, in the world vs in the image. */
export function rulerY(f: PoseFrame): number | null {
  const w = f.world, im = f.image;
  if (!w) return null;
  const ih = hipMidImg(im).y - shoulderMidImg(im).y;
  const wh = midW(w[LEFT_HIP], w[RIGHT_HIP]).y - midW(w[LEFT_SHOULDER], w[RIGHT_SHOULDER]).y;
  return ih > 1e-4 && wh > 0 ? wh / ih : null;
}
/** The shoulders' span across the lens as a share of their 3-D span: ~cos(yaw). */
export function facingRatio(f: PoseFrame): number | null {
  const w = f.world;
  if (!w) return null;
  const span = distW(w[LEFT_SHOULDER], w[RIGHT_SHOULDER]);
  return span > 1e-4 ? Math.abs(w[LEFT_SHOULDER].x - w[RIGHT_SHOULDER].x) / span : null;
}

// ── the calibration ──────────────────────────────────────────────────────────────────────────────────────────────

export interface Calibration {
  /** Capture time (ms) of the window's last frame, and how many frames it held. */
  t: number;
  frames: number;
  /** Image x units between the shoulders (poseControl's ruler) and the same span in metres (world, 3-D). */
  shoulderWidth: number;
  shoulderWidthM: number;
  /** The hip midpoint in the image: the centre a lean is read from, and the height a rise is read from. */
  centreX: number;
  hipY: number;
  /** The hip midpoint's height above the floor (m): the world drop to the planted feet's lowest points. */
  hipHeightM: number;
  /** Image y of each foot's lowest point of ankle / heel / foot index, and their mean: the floor line. */
  floorY: { L: number; R: number; line: number };
  /** Hip → ankle: metres (world, 3-D, the mean of the sides) and image y units. */
  legLengthM: number;
  legLength: number;
  /** Hip → knee (m, world): knee drive is read in thighs. */
  thighM: number;
  /** Shoulder → elbow → wrist per arm (m, world): a punch is an arm near full reach. */
  armM: { L: number; R: number };
  /** Shoulders → hips (m, world). */
  torsoM: number;
  /** THE METRE RULER: metres per image unit across (x) and down (y) the image, at the body's depth. */
  mPerX: number;
  mPerY: number;
  /**
   * The lens pitch (deg, + = looking down) the world landmarks are turned by; 0 when the stand could not tell (not
   * upright) or read within PITCH_DEADBAND_DEG of level. Every drop and height is read along gravity through it.
   */
  pitchDeg: number;
  /** The stand's more bent knee (deg, 180 = straight): under STAND_KNEE_DEG the rulers were taken in a crouch. */
  kneeDeg: number;
  /** What the window actually held still to (SD, m, of each track's running mean): the stand's own sway. */
  sway: { torsoM: number; ankleM: number };
}

export type CalibrationRefusal = 'short' | 'no-world' | 'not-whole' | 'edge-on' | 'turned-away' | 'not-still';
export type CalibrationResult =
  | { ok: true; cal: Calibration }
  | { ok: false; why: CalibrationRefusal; detail: string };

const refuse = (why: CalibrationRefusal, detail: string): CalibrationResult => ({ ok: false, why, detail });

/**
 * Calibrate on a window of frames (oldest first; the caller picks the window — StillnessGate keeps a rolling one).
 * Every frame must hold a body: an absent frame inside the window is a refusal ('not-whole').
 */
export function calibrate(frames: PoseFrame[], opts: { windowMs?: number; expectFps?: number } = {}): CalibrationResult {
  const windowMs = opts.windowMs ?? CAL_WINDOW_MS;
  if (frames.length < 2) return refuse('short', `${frames.length} frames`);
  const span = frames[frames.length - 1].t - frames[0].t;
  // the camera's rate from the typical frame step (a dropped frame is one long step, not a slower camera)
  const fps = opts.expectFps ?? 1000 / Math.max(1, median(frames.slice(1).map((f, i) => f.t - frames[i].t)));
  if (span < windowMs * 0.9 || frames.length < CAL_MIN_FRAME_SHARE * (span / 1000) * fps) {
    return refuse('short', `${frames.length} frames over ${span.toFixed(0)} ms (need ${windowMs} ms)`);
  }
  if (frames.some((f) => !f.present)) return refuse('not-whole', 'the body left the frame');
  if (frames.some((f) => !f.world)) return refuse('no-world', 'no world landmarks: no metre ruler');
  // facing first (a turned body also hides points, and "turn to the camera" is the useful answer): the x ruler is the
  // shoulders' span, and MediaPipe's "left" is on the image right when facing
  const facing = median(frames.map((f) => facingRatio(f) ?? 0));
  if (facing < FACING_MIN) return refuse('edge-on', `shoulders at ${(facing * 100).toFixed(0)} % of their span across the lens`);
  const away = frames.filter((f) => f.image[LEFT_SHOULDER].x < f.image[RIGHT_SHOULDER].x).length;
  if (away > frames.length / 2) return refuse('turned-away', 'the back is to the camera');
  // whole: every core point seen and inside the image, and each foot's points in frame (the floor line needs them)
  const inside = (l: Lm) => l.x >= 0 && l.x <= 1 && l.y >= 0 && l.y <= 1;
  for (const f of frames) {
    const hidden = CORE_POINTS.find((i) => f.image[i].v < SEEN_VIS || !inside(f.image[i]));
    if (hidden !== undefined) return refuse('not-whole', `landmark ${hidden} hidden or out of frame at ${f.t.toFixed(0)} ms`);
    for (const s of ['L', 'R'] as const) {
      if (![FOOT[s].heel, FOOT[s].toe].some((i) => f.image[i].v >= SEEN_VIS && inside(f.image[i]))) {
        return refuse('not-whole', `the ${s} foot is out of frame at ${f.t.toFixed(0)} ms`);
      }
    }
  }
  const mPerX = median(frames.map((f) => rulerX(f) ?? NaN).filter(Number.isFinite));
  const mPerY = median(frames.map((f) => rulerY(f) ?? NaN).filter(Number.isFinite));
  // still: the SD of each track's running mean (the jitter averaged out, the motion kept), in metres through the
  // window's own ruler
  const still = (get: (f: PoseFrame) => number) => sd(runningMean(frames.map(get), STILL_SMOOTH_FRAMES));
  const torso = Math.max(
    still((f) => hipMidImg(f.image).x) * mPerX, still((f) => hipMidImg(f.image).y) * mPerY,
    still((f) => shoulderMidImg(f.image).x) * mPerX, still((f) => shoulderMidImg(f.image).y) * mPerY,
  );
  const ankle = Math.max(...[LEFT_ANKLE, RIGHT_ANKLE].flatMap((i) => [
    still((f) => f.image[i].x) * mPerX, still((f) => f.image[i].y) * mPerY,
  ]));
  if (torso > STILL_TORSO_SD_M) return refuse('not-still', `the torso moved ${(torso * 100).toFixed(1)} cm (SD; limit ${STILL_TORSO_SD_M * 100})`);
  if (ankle > STILL_ANKLE_SD_M) return refuse('not-still', `an ankle moved ${(ankle * 100).toFixed(1)} cm (SD; limit ${STILL_ANKLE_SD_M * 100})`);

  const m = (fn: (f: PoseFrame) => number) => median(frames.map(fn));
  const W = (f: PoseFrame) => f.world!;
  // the lens pitch, from an upright stand only (a crouch leans its axis); near level it is left at level
  const knee = m((f) => Math.min(kneeDeg(W(f), 'L'), kneeDeg(W(f), 'R')));
  const pitchRead = knee >= STAND_KNEE_DEG ? m((f) => bodyPitchDeg(W(f))) : 0;
  const pitchDeg = Math.abs(pitchRead) >= PITCH_DEADBAND_DEG ? pitchRead : 0;
  const tilt = tiltOf(pitchDeg);
  const floorL = m((f) => footLowImg(f.image, 'L')), floorR = m((f) => footLowImg(f.image, 'R'));
  const cal: Calibration = {
    t: frames[frames.length - 1].t,
    frames: frames.length,
    shoulderWidth: m((f) => Math.abs(f.image[LEFT_SHOULDER].x - f.image[RIGHT_SHOULDER].x)),
    shoulderWidthM: m((f) => distW(W(f)[LEFT_SHOULDER], W(f)[RIGHT_SHOULDER])),
    centreX: m((f) => hipMidImg(f.image).x),
    hipY: m((f) => hipMidImg(f.image).y),
    // both feet are planted: their mean drop (each read the way the reader reads a foot, so a stance reads 0)
    hipHeightM: m((f) => (footDropW(f, 'L', tilt)! + footDropW(f, 'R', tilt)!) / 2),
    floorY: { L: floorL, R: floorR, line: (floorL + floorR) / 2 },
    legLengthM: m((f) => (distW(W(f)[LEFT_HIP], W(f)[LEFT_ANKLE]) + distW(W(f)[RIGHT_HIP], W(f)[RIGHT_ANKLE])) / 2),
    legLength: m((f) => (f.image[LEFT_ANKLE].y + f.image[RIGHT_ANKLE].y) / 2 - hipMidImg(f.image).y),
    thighM: m((f) => (distW(W(f)[LEFT_HIP], W(f)[LEFT_KNEE]) + distW(W(f)[RIGHT_HIP], W(f)[RIGHT_KNEE])) / 2),
    armM: {
      L: m((f) => distW(W(f)[LEFT_SHOULDER], W(f)[LEFT_ELBOW]) + distW(W(f)[LEFT_ELBOW], W(f)[LEFT_WRIST])),
      R: m((f) => distW(W(f)[RIGHT_SHOULDER], W(f)[RIGHT_ELBOW]) + distW(W(f)[RIGHT_ELBOW], W(f)[RIGHT_WRIST])),
    },
    torsoM: m((f) => distW(midW(W(f)[LEFT_SHOULDER], W(f)[RIGHT_SHOULDER]), midW(W(f)[LEFT_HIP], W(f)[RIGHT_HIP]))),
    mPerX,
    mPerY,
    pitchDeg,
    kneeDeg: knee,
    sway: { torsoM: torso, ankleM: ankle },
  };
  return { ok: true, cal };
}

/** Centred running mean over k samples (fewer at the ends). */
function runningMean(v: number[], k: number): number[] {
  const h = k >> 1, out = new Array<number>(v.length);
  for (let i = 0; i < v.length; i++) {
    const a = Math.max(0, i - h), b = Math.min(v.length, i + h + 1);
    let s = 0;
    for (let j = a; j < b; j++) s += v[j];
    out[i] = s / (b - a);
  }
  return out;
}

/**
 * The rolling still window: push every frame; it answers with a calibration once the last CAL_WINDOW_MS held still
 * (or why not). A body gone longer than CAL_GAP_MS empties the window — the stand starts again when it is back; a
 * shorter blink of the model is skipped. add() keeps the window without judging it (a calibrated reader only needs
 * the window for an explicit re-calibration: judging it cost 29 of the reader's 47 µs a frame at 60 fps).
 */
export class StillnessGate {
  private buf: PoseFrame[] = [];
  private lastSeen = -Infinity;
  constructor(readonly windowMs = CAL_WINDOW_MS) {}

  push(f: PoseFrame): CalibrationResult {
    if (!this.add(f)) return refuse('not-whole', 'no body');
    return calibrate(this.buf, { windowMs: this.windowMs });
  }

  /** Keep the frame in the window; false when it holds no body. */
  add(f: PoseFrame): boolean {
    if (f.t - this.lastSeen > CAL_GAP_MS) this.buf = [];
    if (!f.present) return false;
    this.lastSeen = f.t;
    this.buf.push(f);
    while (this.buf.length > 1 && f.t - this.buf[1].t >= this.windowMs) this.buf.shift();
    return true;
  }

  /** The frames the gate is looking at now (oldest first). */
  get window(): readonly PoseFrame[] { return this.buf; }
  reset(): void { this.buf = []; this.lastSeen = -Infinity; }
}
