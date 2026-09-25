// Neuro-Mechanic Mirror (v1) — MediaPipe Pose adapter
//
// Wraps the MediaPipe Pose landmarker (tasks-vision WASM) and emits a normalized
// landmark stream, fully CLIENT-SIDE. No pose data leaves the browser (brief
// §2.1). @mediapipe/tasks-vision is already a project dependency — no new
// package is introduced.
//
// Running mode is VIDEO so detectForVideo() runs per animation frame against the
// live <video> element. Latency budget: real-time, target <50ms/frame (brief).
//
// Movement play (2026-09-24) added two opt-ins, both off for the existing callers: `world: true` keeps MediaPipe's
// metric world landmarks, and onVideoFrames() + detect(..., { frameId }) run once per camera frame on its capture
// timestamp (requestVideoFrameCallback) instead of once per render tick on performance.now().
//
// Phase 2 (2026-09-24): the wasm and the model load from our own hosting (/pose/, lib/pose/assets.ts), with the
// MediaPipe CDN only as the fallback for a deploy missing them; `model: 'full'` picks the full landmarker (lite stays
// the default); dispose() also frees a landmarker whose init() was still loading.
import { visionAssets, poseModelName, type AssetResolver, type PoseModel } from '../../../../pose/assets';

/** Which model the landmarks came from by default — recordings carry it, since lite and full landmarks differ. */
export const POSE_MODEL_NAME = poseModelName('lite');

/** One normalized landmark. x,y in 0..1 image space; z relative depth; visibility 0..1. */
export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

// Canonical MediaPipe Pose landmark indices — only the ones the split-stance
// press/row needs (brief §2.1: shoulders, sternum proxy, hips, elbows, wrists).
// The sternum/xiphoid and ASIS points are derived (midpoints), not raw indices.
export const POSE_IDX = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
} as const;

/**
 * One MediaPipe WORLD landmark: metres, origin between the hips, y down, z away from the camera. Movement play
 * reads it because image landmarks shrink and grow with distance, and a jump height in shoulder widths is not cm.
 */
export interface PoseWorldLandmark {
  x: number;
  y: number;
  z: number;
}

/** A single frame of landmarks plus the timestamp used to derive velocities. */
export interface PoseFrame {
  landmarks: PoseLandmark[];
  timestampMs: number;
  /** True when a full body pose was detected this frame. */
  present: boolean;
  /** The 33 world landmarks. Only set when the adapter was built with `world: true`; empty when no body. */
  world?: PoseWorldLandmark[];
}

export interface PoseAdapterOptions {
  /** Override model visibility gating etc. later; kept minimal for v1. */
  numPoses?: number;
  /** Also keep `result.worldLandmarks` on each frame. Off by default so the existing callers allocate nothing new. */
  world?: boolean;
  /** Which landmarker: 'lite' (the default every existing caller runs) or 'full' (PoseService on a desktop). */
  model?: PoseModel;
  /** Where the wasm and model come from. Tests pass their own; the app shares one resolver per page. */
  assets?: AssetResolver;
}

/** Optional per-frame identity for detect(), from a requestVideoFrameCallback loop (see onVideoFrames). */
export interface DetectFrameInfo {
  /**
   * A number that grows once per real camera frame (rVFC's presentedFrames). When given, detect() dedupes on it
   * instead of video.currentTime, which a live stream can leave unchanged across two real frames.
   */
  frameId?: number;
}

/**
 * MediaPipePoseAdapter — lazy-initialised, single-pose, VIDEO-mode landmarker.
 * Swappable: the rest of the module only depends on detect()/PoseFrame, never
 * on MediaPipe types directly, so a different pose backend can drop in behind
 * this same shape.
 */
export class MediaPipePoseAdapter {
  private landmarker: any = null;
  private loading: Promise<void> | null = null;
  private disposed = false;
  private readonly numPoses: number;
  private readonly keepWorld: boolean;
  readonly model: PoseModel;
  private readonly assets: AssetResolver;
  private lastVideoTime = -1;
  private lastFrameId = -1;
  private lastTs = -Infinity;
  private lastFrame: PoseFrame = { landmarks: [], timestampMs: 0, present: false };

  constructor(opts: PoseAdapterOptions = {}) {
    this.numPoses = opts.numPoses ?? 1;
    this.keepWorld = opts.world ?? false;
    this.model = opts.model ?? 'lite';
    this.assets = opts.assets ?? visionAssets;
  }

  /** e.g. 'pose_landmarker_full/float16/1'. */
  get modelName(): string {
    return poseModelName(this.model);
  }

  /** Load WASM + model. Safe to call more than once, even concurrently; only initialises once. */
  init(): Promise<void> {
    if (this.landmarker) return Promise.resolve();
    if (this.disposed) return Promise.reject(new Error('pose adapter disposed'));
    this.loading ??= this.load().finally(() => { this.loading = null; });
    return this.loading;
  }

  private async load(): Promise<void> {
    const [vision, wasm, modelAssetPath] = await Promise.all([
      import('@mediapipe/tasks-vision'), this.assets.wasmBase(), this.assets.poseModel(this.model),
    ]);
    const fileset = await vision.FilesetResolver.forVisionTasks(wasm);
    const lm = await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath },
      runningMode: 'VIDEO',
      numPoses: this.numPoses,
    });
    // Disposed while the model was loading (the camera was switched off): free it now, or its wasm heap leaks.
    if (this.disposed) {
      try { lm.close(); } catch { /* noop */ }
      throw new Error('pose adapter disposed');
    }
    this.landmarker = lm;
  }

  get ready(): boolean {
    return !!this.landmarker;
  }

  /**
   * Detect on the current <video> frame. Returns the previous frame unchanged if
   * the video hasn't advanced (MediaPipe requires strictly increasing
   * timestamps in VIDEO mode). Never throws on a missing pose — returns
   * present:false so callers mark dependent zones 'unavailable'.
   */
  detect(video: HTMLVideoElement, timestampMs: number, info?: DetectFrameInfo): PoseFrame {
    if (!this.landmarker || video.readyState < 2) return this.lastFrame;
    // Skip re-running on a frame we've already processed. A caller with a real frame id (rVFC) dedupes on that.
    if (info?.frameId != null) {
      if (info.frameId === this.lastFrameId) return this.lastFrame;
      this.lastFrameId = info.frameId;
    } else {
      if (video.currentTime === this.lastVideoTime) return this.lastFrame;
      this.lastVideoTime = video.currentTime;
    }

    // VIDEO mode throws on a timestamp that does not strictly increase. performance.now() never repeats, but a
    // capture clock can, so nudge the model's copy forward by 1 ms; the frame keeps the caller's true time.
    const modelTs = timestampMs > this.lastTs ? timestampMs : this.lastTs + 1;
    this.lastTs = modelTs;

    let result: any;
    try {
      result = this.landmarker.detectForVideo(video, modelTs);
    } catch (e) {
      console.warn('[FEL-MIRROR] pose detect failed this frame', e);
      return this.lastFrame;
    }

    const poses: any[] = result?.landmarks ?? [];
    if (!poses.length) {
      this.lastFrame = this.keepWorld
        ? { landmarks: [], timestampMs, present: false, world: [] }
        : { landmarks: [], timestampMs, present: false };
      return this.lastFrame;
    }
    const raw = poses[0] as Array<{ x: number; y: number; z: number; visibility?: number }>;
    const landmarks: PoseLandmark[] = raw.map((p) => ({
      x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 0,
    }));
    if (!this.keepWorld) {
      this.lastFrame = { landmarks, timestampMs, present: true };
      return this.lastFrame;
    }
    const rawWorld = (result?.worldLandmarks?.[0] ?? []) as Array<{ x: number; y: number; z: number }>;
    const world: PoseWorldLandmark[] = rawWorld.map((p) => ({ x: p.x, y: p.y, z: p.z }));
    this.lastFrame = { landmarks, timestampMs, present: true, world };
    return this.lastFrame;
  }

  /** Free the landmarker (its wasm heap and graph). Final: init() refuses after it. */
  dispose(): void {
    this.disposed = true;
    try { this.landmarker?.close?.(); } catch { /* noop */ }
    this.landmarker = null;
  }
}

/** One new camera frame, as onVideoFrames reports it. */
export interface VideoFrameTick {
  /** When the frame was taken, ms on the performance.now() clock. */
  timestampMs: number;
  /**
   * Where timestampMs came from: 'capture' = the camera's own capture stamp (best; camera lag is already in it),
   * 'display' = when the frame was handed to the compositor (rVFC without a capture stamp: late by the camera's lag,
   * but never later than the frame's result), 'now' = rAF fallback, read late.
   */
  clock: 'capture' | 'display' | 'now';
  /** Grows once per real frame (rVFC's presentedFrames). Pass it to detect() as `frameId`; unset on the rAF fallback. */
  frameId?: number;
}

/**
 * A capture stamp further than this from the callback's time is on some other clock (unverified per browser) and is not
 * used. Camera to callback is 30–150 ms on the performance clock (the pass's latency budget, MAP pose-pipeline §3), so a
 * second is several times the worst real lag and nowhere near a foreign clock's offset.
 */
const CAPTURE_CLOCK_SANITY_MS = 1000;

/**
 * Calls `onFrame` once per new video frame, stamped with when the camera took it. Uses requestVideoFrameCallback
 * where the browser has it (its captureTime is the capture moment, so the model's timeline is the body's, not the
 * render loop's); otherwise a rAF loop stamped with performance.now(). The video must be playing, and for rVFC it
 * should be in the page (a detached element's callbacks are unverified). Returns a cancel function.
 */
export function onVideoFrames(video: HTMLVideoElement, onFrame: (tick: VideoFrameTick) => void): () => void {
  let stopped = false;
  let handle = 0;

  if (typeof video.requestVideoFrameCallback === 'function') {
    const step = (now: DOMHighResTimeStamp, meta: VideoFrameCallbackMetadata) => {
      if (stopped) return;
      handle = video.requestVideoFrameCallback(step);
      const capture = meta.captureTime != null && Math.abs(now - meta.captureTime) < CAPTURE_CLOCK_SANITY_MS ? meta.captureTime : null;
      // Without a capture stamp, the nearest thing to it the browser gives is when the frame was handed over for
      // composition. Not expectedDisplayTime: that is a vsync in the FUTURE, so a frame would be stamped after its own
      // result arrived (PoseFrame's arrive ≥ t breaks, and the latency reads negative).
      const tick: VideoFrameTick = capture != null
        ? { timestampMs: capture, clock: 'capture', frameId: meta.presentedFrames }
        : { timestampMs: meta.presentationTime, clock: 'display', frameId: meta.presentedFrames };
      onFrame(tick);
    };
    handle = video.requestVideoFrameCallback(step);
    return () => { stopped = true; video.cancelVideoFrameCallback?.(handle); };
  }

  // Fallback: a rAF tick is not a camera frame, so no frameId; detect() dedupes on video.currentTime as it always has.
  const loop = () => {
    if (stopped) return;
    handle = requestAnimationFrame(loop);
    onFrame({ timestampMs: performance.now(), clock: 'now' });
  };
  handle = requestAnimationFrame(loop);
  return () => { stopped = true; cancelAnimationFrame(handle); };
}
