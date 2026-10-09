// modelChoice — which pose model a device runs, what it asks the camera for, and when full is too slow for it
// (movement play, phase 2, 2026-09-24).
//
// Owner: tune for both a laptop/webcam with a TV and a propped phone or tablet; the full model where the device can
// afford it, lite elsewhere. Lite and full share the pose detector and differ in the landmark network (full's is the
// bigger one, 9.4 MB of float16 weights against 5.8 MB), so full holds a small, distant body steadier and costs more
// per frame. The rules:
//
//   phone / tablet  → lite. No measuring: lite is the floor, and a phone should not download full to find that out.
//   desktop         → full, then measured on the first seconds of frames WITH A BODY; over budget → lite, remembered.
//   ?pose=lite|full → that model, no measuring (for testing either on any device).
//
// Pure: PoseService hands it navigator facts, storage strings and detect timings.
import type { PoseModel } from './assets';

export type DeviceClass = 'desktop' | 'mobile';

export interface DeviceHints {
  userAgent: string;
  /** navigator.maxTouchPoints. iPadOS 13+ sends a Mac user agent; the touch screen is how it is told apart. */
  maxTouchPoints?: number;
  /** navigator.userAgentData.mobile, where the browser has it (Chromium). False on tablets, so the UA still decides those. */
  uaMobile?: boolean;
}

/** Phones and tablets by user agent. Android tablets drop "Mobile" but keep "Android". */
const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|PlayBook|BlackBerry|Opera Mini|IEMobile/i;

export function deviceClass(h: DeviceHints): DeviceClass {
  if (h.uaMobile) return 'mobile';
  if (MOBILE_UA.test(h.userAgent)) return 'mobile';
  // An iPad asking for the desktop site: a Mac user agent with a touch screen (no Mac has one).
  if (/Macintosh/.test(h.userAgent) && (h.maxTouchPoints ?? 0) > 1) return 'mobile';
  return 'desktop';
}

// ── the camera request ──────────────────────────────────────────────────────────────────────────────────────────

/** 30 fps: what webcams and front cameras deliver natively, the fixtures' rate, and above the plan's 24 Hz pose-rate gate. */
export const CAMERA_FPS = 30;

/**
 * Desktop: 1280×720, the native 16:9 mode of nearly every webcam at 30 fps. A player 3 m back fills ~45 % of the frame
 * height (MAP space-check), so 720 rows give the body twice the pixels today's 640×480 request did.
 */
export const DESKTOP_CAMERA = { width: 1280, height: 720 } as const;

/**
 * Phone / tablet: 4:3 VGA. 4:3 is the front camera's native sensor shape, so nothing is cropped off the sides of the
 * room (2 m of floor has to fit), and VGA is today's pixel count: the image is copied into the model every frame, and a
 * phone pays for pixels. Held upright it is asked for tall (480×640), since a standing body is taller than wide.
 */
export const MOBILE_CAMERA = { long: 640, short: 480 } as const;

/**
 * What to ask getUserMedia for. Every number is `ideal`, never `exact` or `min`: the browser picks its nearest mode
 * instead of failing (no OverconstrainedError), and PoseService reads back what it really got. Phones also disagree
 * about whether width means the sensor's long side or the screen's, so the answer is never assumed.
 */
export function cameraConstraints(device: DeviceClass, portrait: boolean, facingMode: 'user' | 'environment' = 'user'): MediaTrackConstraints {
  const size = device === 'desktop'
    ? DESKTOP_CAMERA
    : portrait ? { width: MOBILE_CAMERA.short, height: MOBILE_CAMERA.long } : { width: MOBILE_CAMERA.long, height: MOBILE_CAMERA.short };
  return {
    facingMode,
    width: { ideal: size.width },
    height: { ideal: size.height },
    frameRate: { ideal: CAMERA_FPS },
  };
}

/** The plan's pose-rate gate (phase 4's space check): a desktop camera that answers below it is asked again. */
export const MIN_CAMERA_FPS = 24;

/**
 * CONTEXT (2026-09-24): the desktop's 1280×720 ideal can land on a slow mode. The browser picks the mode with the
 * least summed distance from the ideals, so a webcam without MJPEG (older USB2 and built-in ones: uncompressed 720p
 * tops out near 10 fps over USB2) offering 1280×720@10 and 640×480@30 scores 720p@10 at 0.67 against VGA@30's 0.83
 * and gets 720p@10, where the old 640×480 request got 30 fps. A third the pose frames makes jumps late or missed.
 * Such a camera is asked again for today's VGA, still ideal-only; whatever that gives is kept. A frame rate the
 * browser does not report is not read as slow.
 */
export function cameraTooSlow(device: DeviceClass, frameRate: number | null | undefined): boolean {
  return device === 'desktop' && typeof frameRate === 'number' && frameRate > 0 && frameRate < MIN_CAMERA_FPS;
}

/** The second ask for a desktop camera that was too slow at 1280×720: 640×480 at 30, the request before phase 2. */
export function cameraFallbackConstraints(facingMode: 'user' | 'environment' = 'user'): MediaTrackConstraints {
  return {
    facingMode,
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: CAMERA_FPS },
  };
}

// ── the model ───────────────────────────────────────────────────────────────────────────────────────────────────

/** A desktop that measured full over budget, as stored under MODEL_MEMORY_KEY. */
export interface RememberedFallback { model: 'lite'; detectMs: number; at: number }

export const MODEL_MEMORY_KEY = 'fel.pose.model';

/**
 * How long a measured fallback is trusted. A slow laptop should not pay full's download and a janky first two seconds
 * every session; a week on, a browser update (wasm speed moves with it) or a different machine behind the same
 * profile gets another try.
 */
export const REMEMBER_FALLBACK_MS = 7 * 24 * 3600 * 1000;

export function rememberFallback(detectMs: number, now: number): string {
  const r: RememberedFallback = { model: 'lite', detectMs: Math.round(detectMs * 10) / 10, at: now };
  return JSON.stringify(r);
}

/** A stored fallback that is well formed and fresh, or null. Anything else in storage is ignored. */
export function parseRemembered(raw: string | null | undefined, now: number): RememberedFallback | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Partial<RememberedFallback>;
    if (r?.model !== 'lite' || typeof r.at !== 'number' || typeof r.detectMs !== 'number') return null;
    if (now - r.at > REMEMBER_FALLBACK_MS || r.at > now) return null;
    return { model: 'lite', detectMs: r.detectMs, at: r.at };
  } catch {
    return null;
  }
}

/** `?pose=lite|full`, or null. */
export function askedModel(search: string): PoseModel | null {
  const q = new URLSearchParams(search).get('pose');
  return q === 'lite' || q === 'full' ? q : null;
}

export interface ModelChoice {
  model: PoseModel;
  /** Measure it on the first frames and fall back when over budget (full on a desktop only). */
  measure: boolean;
  /** Why, in words, for the stats line and the dev overlay. */
  why: string;
}

export function initialModel(device: DeviceClass, o: { asked?: PoseModel | null; remembered?: RememberedFallback | null } = {}): ModelChoice {
  if (o.asked) return { model: o.asked, measure: false, why: `asked for ${o.asked} (?pose=)` };
  if (device === 'mobile') return { model: 'lite', measure: false, why: 'phone or tablet: lite' };
  if (o.remembered) {
    return { model: 'lite', measure: false, why: `full ran ${o.remembered.detectMs} ms a frame on this device (budget ${FULL_BUDGET_MS.toFixed(1)} ms): lite` };
  }
  return { model: 'full', measure: true, why: 'desktop: full, measured on the first frames' };
}

// ── the budget ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Full's budget for one detect, in ms. Detection runs on the main thread once per camera frame (every 33.3 ms at 30
 * fps), between the game's 60 Hz renders. Half the camera period is the most it may take: past it, pose inference
 * holds the main thread longer than the game does, and a detect longer than one 60 Hz frame (also 16.7 ms) drops a
 * render frame every time it runs.
 */
export const FULL_BUDGET_MS = 1000 / CAMERA_FPS / 2;

/** Body frames skipped before measuring: the first runs pay one-off set-up (weights packed, buffers allocated). ⅓ s at 30 fps. */
export const BUDGET_WARMUP = 10;

/**
 * Body frames measured before deciding: 1.5 s at 30 fps. Only frames with a body count, because with nobody in frame
 * the model runs only its detector, which lite and full share, so an empty room says nothing about full's cost.
 */
export const BUDGET_SAMPLES = 45;

/**
 * A camera frame that comes sooner than this after the last one detected is skipped. A 30 fps camera's frames (33 ms
 * apart, a few ms of jitter) all pass; a 60 fps camera is halved to 30, so the budget above still holds. ¾ of the 30
 * fps period.
 */
export const MIN_DETECT_GAP_MS = (1000 / CAMERA_FPS) * 0.75;

export type BudgetVerdict = 'measuring' | 'keep' | 'fallback';

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Times full on its first body frames and says once whether it fits. The median, so one garbage-collection pause
 * cannot send a fast laptop to lite. Decided once, in the first seconds (the READY screen), never mid-game: swapping
 * models mid-play would drop a few frames exactly when the player is moving.
 */
export class DetectBudget {
  private body = 0;
  private readonly samples: number[] = [];
  private verdict: 'keep' | 'fallback' | null = null;

  constructor(readonly budgetMs: number = FULL_BUDGET_MS) {}

  add(ms: number, bodyPresent: boolean): BudgetVerdict {
    if (this.verdict) return this.verdict;
    if (!bodyPresent) return 'measuring';
    if (++this.body <= BUDGET_WARMUP) return 'measuring';
    this.samples.push(ms);
    if (this.samples.length < BUDGET_SAMPLES) return 'measuring';
    this.verdict = median(this.samples) > this.budgetMs ? 'fallback' : 'keep';
    return this.verdict;
  }

  /** The median of the measured frames so far, or null before any. */
  get medianMs(): number | null {
    return this.samples.length ? median(this.samples) : null;
  }
}

// ── the jump test's higher pose rate (MIRROR PHASE 3, lane/capture, 2026-10-07) ──────────────────────────────────
//
// The Quick Screen's jump (T5) times a flight, and one frame at 30 Hz is 33 ms each end of it, so every CMJ read under
// the screen's 50 Hz jump gate (gate.jumpFps) and its landing symmetry was never scored. The camera was asked for 60 fps
// on the jump, but MIN_DETECT_GAP_MS above thinned it back to 30. Now the jump may OPT IN to a higher detect rate, for
// that test only, and only where the device measures that it can hold it:
//
//   ask        the camera for 60 fps (ideal, never exact), and detect up to HIGH_RATE_FPS.
//   measure    HIGH_RATE_SAMPLES body frames after HIGH_RATE_WARMUP: the median detect cost and the pose rate achieved.
//   hold       when the rate reaches HIGH_RATE_MIN_HZ and a detect fits HIGH_RATE_BUDGET_MS.
//   fall back  otherwise, to the 30 Hz thinning, with the reason in words (and the camera asked for 30 again).
//
// Every number below is PROPOSED (new in Phase 3, not yet measured on a phone): the owner-led capture logs each
// phone's detect cost and rate at 60 (docs/MIRROR-CAPTURE-PROTOCOL.md), and the replay report prints what this trial
// would decide on it. Pure, like the rest of this file.

/** What the jump asks for: twice the 30 fps every other camera feature uses. */
export const HIGH_RATE_FPS = 60;

/** The thinning gap at the high rate: ¾ of the 60 fps period, as MIN_DETECT_GAP_MS is of the 30 fps one. */
export const HIGH_RATE_GAP_MS = (1000 / HIGH_RATE_FPS) * 0.75;

/**
 * The pose rate the high mode has to reach to be worth holding: the Quick Screen's jump gate (lib/screen
 * PROPOSED-thresholds.ts gate.jumpFps, 50 Hz; modelChoice.test.ts pins the two together). A phone whose camera or
 * model only gets to 40 gains nothing a 30 Hz read lacks for the gate, and pays the battery and the heat.
 */
export const HIGH_RATE_MIN_HZ = 50;

/**
 * A detect at the high rate may cost at most this (ms): ¾ of the 60 fps period, the same share MIN_DETECT_GAP_MS
 * leaves. Past it the main thread spends most of each frame in the model and the page's own drawing starts to drop
 * frames, which a jump cannot afford. The Quick Screen draws one skeleton and no 3-D scene, which is why this is
 * looser than full's FULL_BUDGET_MS (half the period, beside a game's renders).
 */
export const HIGH_RATE_BUDGET_MS = (1000 / HIGH_RATE_FPS) * 0.75;

/** Body frames skipped before measuring the high rate (the camera's new mode settling): 0.1 s at 60 fps. */
export const HIGH_RATE_WARMUP = 6;

/** Body frames measured before deciding: half a second at 60 fps, inside the jump's own set-up and 3-2-1. */
export const HIGH_RATE_SAMPLES = 30;

export type HighRateVerdict = 'measuring' | 'hold' | 'fallback';

/** The camera's reported rate already rules the high mode out (a rate the browser does not report is not read as slow). */
export function cameraBelowHighRate(frameRate: number | null | undefined): boolean {
  return typeof frameRate === 'number' && frameRate > 0 && frameRate < HIGH_RATE_MIN_HZ;
}

/** What the trial decides from a median detect cost and an achieved rate. Exported for the replay report. */
export function highRateVerdict(medianMs: number, rateHz: number): { verdict: 'hold' | 'fallback'; why: string } {
  if (rateHz < HIGH_RATE_MIN_HZ) {
    return { verdict: 'fallback', why: `${rateHz.toFixed(0)} Hz at the high rate (needs ${HIGH_RATE_MIN_HZ}): 30 Hz` };
  }
  if (medianMs > HIGH_RATE_BUDGET_MS) {
    return { verdict: 'fallback', why: `${medianMs.toFixed(1)} ms a detect at ${rateHz.toFixed(0)} Hz (budget ${HIGH_RATE_BUDGET_MS.toFixed(1)} ms): 30 Hz` };
  }
  return { verdict: 'hold', why: `${rateHz.toFixed(0)} Hz, ${medianMs.toFixed(1)} ms a detect (budget ${HIGH_RATE_BUDGET_MS.toFixed(1)} ms)` };
}

/**
 * Times the high rate on its first body frames and says once whether it holds. Frames without a body do not count,
 * for DetectBudget's reason: an empty room runs only the detector and says nothing about the landmark model's cost.
 */
export class HighRateTrial {
  private body = 0;
  private readonly costs: number[] = [];
  private readonly times: number[] = [];
  private decided: { verdict: 'hold' | 'fallback'; why: string } | null = null;

  /** One detected frame: its capture time (ms), its detect cost (ms) and whether it had a body. */
  add(t: number, ms: number, bodyPresent: boolean): HighRateVerdict {
    if (this.decided) return this.decided.verdict;
    if (!bodyPresent) return 'measuring';
    if (++this.body <= HIGH_RATE_WARMUP) return 'measuring';
    this.costs.push(ms);
    this.times.push(t);
    if (this.costs.length < HIGH_RATE_SAMPLES) return 'measuring';
    const span = this.times[this.times.length - 1] - this.times[0];
    const rate = span > 0 ? ((this.times.length - 1) * 1000) / span : 0;
    this.decided = highRateVerdict(median(this.costs), rate);
    return this.decided.verdict;
  }

  /** The decision's words, once decided. */
  get why(): string | null { return this.decided?.why ?? null; }
}
