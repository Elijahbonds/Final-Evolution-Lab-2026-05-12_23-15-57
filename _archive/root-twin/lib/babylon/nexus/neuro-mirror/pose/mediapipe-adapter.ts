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

// Reuse the exact CDN pin FaceScanCapture uses so both features share one WASM
// download and stay on one version.
const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

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

/** A single frame of landmarks plus the timestamp used to derive velocities. */
export interface PoseFrame {
  landmarks: PoseLandmark[];
  timestampMs: number;
  /** True when a full body pose was detected this frame. */
  present: boolean;
}

export interface PoseAdapterOptions {
  /** Override model visibility gating etc. later; kept minimal for v1. */
  numPoses?: number;
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
  private lastVideoTime = -1;
  private lastFrame: PoseFrame = { landmarks: [], timestampMs: 0, present: false };

  constructor(opts: PoseAdapterOptions = {}) {
    this.numPoses = opts.numPoses ?? 1;
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
  detect(video: HTMLVideoElement, timestampMs: number): PoseFrame {
    if (!this.landmarker || video.readyState < 2) return this.lastFrame;
    // Skip re-running on a frame we've already processed.
    if (video.currentTime === this.lastVideoTime) return this.lastFrame;
    this.lastVideoTime = video.currentTime;

    let result: any;
    try {
      result = this.landmarker.detectForVideo(video, timestampMs);
    } catch (e) {
      console.warn('[FEL-MIRROR] pose detect failed this frame', e);
      return this.lastFrame;
    }

    const poses: any[] = result?.landmarks ?? [];
    if (!poses.length) {
      this.lastFrame = { landmarks: [], timestampMs, present: false };
      return this.lastFrame;
    }
    const raw = poses[0] as Array<{ x: number; y: number; z: number; visibility?: number }>;
    const landmarks: PoseLandmark[] = raw.map((p) => ({
      x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 0,
    }));
    this.lastFrame = { landmarks, timestampMs, present: true };
    return this.lastFrame;
  }

  dispose(): void {
    try { this.landmarker?.close?.(); } catch { /* noop */ }
    this.landmarker = null;
  }
}
