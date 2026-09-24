// landmarks — the ONE 33-point body table for the app, and the frame every pose consumer reads (movement play,
// 2026-09-24).
//
// Before this there were six index tables (the adapter, poseControl, dunkTracker, framing, lungeAudit, squatScan)
// and about seven frame shapes, each a copy of a slice of MediaPipe's list. This is the whole list, once, in
// MediaPipe BlazePose order with MediaPipe's names, so a detector written against it reads a live camera frame and a
// synthetic fixture (lib/pose/synth.ts) the same way.
//
// "left" is the SUBJECT's left, as MediaPipe means it. The camera image is not mirrored, so a player facing the
// camera has their left shoulder on the image's RIGHT: x[LEFT_SHOULDER] > x[RIGHT_SHOULDER].
//
// Pure: no DOM, no camera, no model.

/** MediaPipe BlazePose landmark names, in index order (0 … 32). */
export const LANDMARK_NAMES = [
  'nose',
  'left_eye_inner', 'left_eye', 'left_eye_outer',
  'right_eye_inner', 'right_eye', 'right_eye_outer',
  'left_ear', 'right_ear',
  'mouth_left', 'mouth_right',
  'left_shoulder', 'right_shoulder',
  'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist',
  'left_pinky', 'right_pinky',
  'left_index', 'right_index',
  'left_thumb', 'right_thumb',
  'left_hip', 'right_hip',
  'left_knee', 'right_knee',
  'left_ankle', 'right_ankle',
  'left_heel', 'right_heel',
  'left_foot_index', 'right_foot_index',
] as const;

export type LandmarkName = typeof LANDMARK_NAMES[number];
export const LANDMARK_COUNT = 33;

// Named indices. Spelled out (not derived from the list) so a reader can grep a number back to its name.
export const NOSE = 0;
export const LEFT_EYE_INNER = 1, LEFT_EYE = 2, LEFT_EYE_OUTER = 3;
export const RIGHT_EYE_INNER = 4, RIGHT_EYE = 5, RIGHT_EYE_OUTER = 6;
export const LEFT_EAR = 7, RIGHT_EAR = 8;
export const MOUTH_LEFT = 9, MOUTH_RIGHT = 10;
export const LEFT_SHOULDER = 11, RIGHT_SHOULDER = 12;
export const LEFT_ELBOW = 13, RIGHT_ELBOW = 14;
export const LEFT_WRIST = 15, RIGHT_WRIST = 16;
export const LEFT_PINKY = 17, RIGHT_PINKY = 18;
export const LEFT_INDEX = 19, RIGHT_INDEX = 20;
export const LEFT_THUMB = 21, RIGHT_THUMB = 22;
export const LEFT_HIP = 23, RIGHT_HIP = 24;
export const LEFT_KNEE = 25, RIGHT_KNEE = 26;
export const LEFT_ANKLE = 27, RIGHT_ANKLE = 28;
export const LEFT_HEEL = 29, RIGHT_HEEL = 30;
export const LEFT_FOOT_INDEX = 31, RIGHT_FOOT_INDEX = 32;

/** name → index, for code that reads better by name (`LM.left_wrist`). */
export const LM = Object.fromEntries(LANDMARK_NAMES.map((n, i) => [n, i])) as Record<LandmarkName, number>;

/** Each side's index for the same body part, so a detector can be written once per side. */
export const SIDE = {
  left: {
    eye: LEFT_EYE, ear: LEFT_EAR, mouth: MOUTH_LEFT, shoulder: LEFT_SHOULDER, elbow: LEFT_ELBOW, wrist: LEFT_WRIST,
    pinky: LEFT_PINKY, index: LEFT_INDEX, thumb: LEFT_THUMB, hip: LEFT_HIP, knee: LEFT_KNEE, ankle: LEFT_ANKLE,
    heel: LEFT_HEEL, footIndex: LEFT_FOOT_INDEX,
  },
  right: {
    eye: RIGHT_EYE, ear: RIGHT_EAR, mouth: MOUTH_RIGHT, shoulder: RIGHT_SHOULDER, elbow: RIGHT_ELBOW, wrist: RIGHT_WRIST,
    pinky: RIGHT_PINKY, index: RIGHT_INDEX, thumb: RIGHT_THUMB, hip: RIGHT_HIP, knee: RIGHT_KNEE, ankle: RIGHT_ANKLE,
    heel: RIGHT_HEEL, footIndex: RIGHT_FOOT_INDEX,
  },
} as const;
export type Side = keyof typeof SIDE;

/** The other side's index for a landmark (nose → nose). Mirroring a frame swaps these AND flips x. */
export const MIRROR_INDEX: readonly number[] = LANDMARK_NAMES.map((n) => {
  const other = n.startsWith('left_') ? n.replace('left_', 'right_')
    : n.startsWith('right_') ? n.replace('right_', 'left_')
    : n === 'mouth_left' ? 'mouth_right' : n === 'mouth_right' ? 'mouth_left' : n;
  return LANDMARK_NAMES.indexOf(other as LandmarkName);
});

/** The points a body needs before anything is read from it (the framing check's rule: 5 of these 9 in frame). */
export const CORE_POINTS = [NOSE, LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP, LEFT_KNEE, RIGHT_KNEE, LEFT_ANKLE, RIGHT_ANKLE] as const;

/**
 * An image landmark, as MediaPipe gives it: x, y normalised to the image (0..1, y DOWN, may fall outside when the
 * model extrapolates an off-screen limb), z = depth relative to the hip midpoint on roughly x's scale (smaller =
 * nearer the camera), v = visibility 0..1.
 */
export interface Lm { x: number; y: number; z: number; v: number }

/** A world landmark: metres, origin between the hips, camera axes (x toward image-right, y DOWN, z AWAY from the camera). */
export interface Wm { x: number; y: number; z: number }

/**
 * One camera frame's pose.
 *
 *   t        capture time in ms (the camera's clock: requestVideoFrameCallback's captureTime live, the virtual camera's
 *            shutter in a fixture). Detectors time events on THIS, so pipeline latency cancels out of any interval.
 *   present  the model found a body. When false, `image` is empty and `world` absent.
 *   image    33 image landmarks (LANDMARK_NAMES order) when present.
 *   world    33 world landmarks when the source gives them.
 *   arrive   optional: when the app got the result (ms, same clock as t) — capture + camera + inference latency.
 */
export interface PoseFrame {
  t: number;
  present: boolean;
  image: Lm[];
  world?: Wm[];
  arrive?: number;
}

/** A frame with no body in it. */
export const emptyFrame = (t: number, arrive?: number): PoseFrame =>
  arrive === undefined ? { t, present: false, image: [] } : { t, present: false, image: [], arrive };

/** Midpoint of two image landmarks (visibility = the weaker of the two). */
export function midLm(a: Lm, b: Lm): Lm {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, v: Math.min(a.v, b.v) };
}
