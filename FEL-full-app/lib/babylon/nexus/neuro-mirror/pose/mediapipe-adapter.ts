// Neuro-Mechanic Mirror (v1) — MediaPipe Pose adapter
//
// Wraps the MediaPipe Pose landmarker (tasks-vision WASM) and emits a normalized
// landmark stream, fully CLIENT-SIDE. No pose data leaves the browser (brief
// §2.1). Model + WASM are loaded from the same CDN the existing FaceScanCapture
// (M31) already uses, and @mediapipe/tasks-vision is already a project dependency
// — no new package is introduced.
//
// Running mode is VIDEO so detectForVideo() runs per animation frame against the
// live <video> element. Latency budget: real-time, target <50ms/frame (brief).
//
// Movement play (2026-09-24) added two opt-ins, both off for the existing callers: `world: true` keeps MediaPipe's
// metric world landmarks, and onVideoFrames() + detect(..., { frameId }) run once per camera frame on its capture
// timestamp (requestVideoFrameCallback) instead of once per render tick on performance.now().

// Reuse the exact CDN pin FaceScanCapture uses so both features share one WASM
// download and stay on one version.
const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
/** Which model the landmarks came from — recordings carry it, since lite and full landmarks differ. */
export const POSE_MODEL_NAME = 'pose_landmarker_lite/float16/1';

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
  private readonly numPoses: number;
  private readonly keepWorld: boolean;
  private lastVideoTime = -1;
  private lastFrameId = -1;
  private lastTs = -Infinity;
  private lastFrame: PoseFrame = { landmarks: [], timestampMs: 0, present: false };

  constructor(opts: PoseAdapterOptions = {}) {
    this.numPoses = opts.numPoses ?? 1;
    this.keepWorld = opts.world ?? false;
  }

  /** Load WASM + model. Safe to call more than once; only initialises once. */
  async init(): Promise<void> {
    if (this.landmarker) return;
    const vision = await import('@mediapipe/tasks-vision');
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_CDN);
    this.landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL },
      runningMode: 'VIDEO',
      numPoses: this.numPoses,
    });
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

  dispose(): void {
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
   * 'display' = when the frame is due on screen (rVFC without a capture stamp), 'now' = rAF fallback, read late.
   */
  clock: 'capture' | 'display' | 'now';
  /** Grows once per real frame (rVFC's presentedFrames). Pass it to detect() as `frameId`; unset on the rAF fallback. */
  frameId?: number;
}

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
      // A capture stamp more than a second away from now is on some other clock (unverified per browser): not used.
      const capture = meta.captureTime != null && Math.abs(now - meta.captureTime) < 1000 ? meta.captureTime : null;
      const tick: VideoFrameTick = capture != null
        ? { timestampMs: capture, clock: 'capture', frameId: meta.presentedFrames }
        : { timestampMs: meta.expectedDisplayTime, clock: 'display', frameId: meta.presentedFrames };
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
