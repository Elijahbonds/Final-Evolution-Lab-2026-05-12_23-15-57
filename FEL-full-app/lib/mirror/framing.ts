// framing — is the camera seeing enough to grade anything?
//
// OWNER'S SETUP, 2026-09-19: one phone, propped up, at home. Not a gym rig, not a tripod at a measured distance — a
// phone leaning on a water bottle while someone squats in a kitchen. Every number the Mirror produces comes out of
// that shot, so the shot is the first thing worth checking, and nothing in the module checked it: the audit gated on
// per-landmark visibility and the assessment gated on confidence, and both of those fire AFTER a rep the athlete has
// already wasted. Standing too close is not a low-confidence rep. It is a rep that should never have been taken.
//
// So this runs BEFORE the rep, on the live preview, and says the one thing to fix. It is deliberately one instruction
// at a time — a setup screen listing four problems is a setup screen nobody fixes.
//
// Pure: one pose frame in, a verdict out. No DOM, no camera handles.

/**
 * WHICH WAY THE ATHLETE FACES, and it is a property of the MOVEMENT, not a preference.
 *
 * Knee tracking and left/right symmetry are frontal-plane measurements: from the side the knees are behind each other
 * and there is nothing to read. A hip hinge is the opposite — its whole question is how far the hips travel back and
 * whether the back stays flat, and from the front you cannot see either. So a pattern declares the view it needs and
 * the framing check enforces THAT, instead of always demanding square-on and quietly failing every side-on movement.
 */
export type FramingView = 'front' | 'side' | 'back';

export type FramingIssue =
  | 'noBody'        // nothing to work with
  | 'cutOffTop'     // head out of shot
  | 'cutOffBottom'  // feet out of shot — the one that silently ruins a squat
  | 'tooClose'      // filling the frame; a squat will leave it
  | 'tooFar'        // a small body is a noisy body
  | 'offCentre'     // drifting out of one side
  | 'turned'        // facing the wrong way for this movement's own measurements
  | 'dim';          // the model is guessing — bad light, busy background

export interface FramingCheck {
  ok: boolean;
  issues: FramingIssue[];
  /** The one to fix first, or null when the shot is good. */
  worst: FramingIssue | null;
  /** What to say to the athlete. One sentence, an action, never a list. */
  instruction: string;
  /** Head-to-ankle height as a share of the frame — the distance read. */
  bodyFill: number;
  /** Mean landmark visibility across the body. */
  visibility: number;
}

export interface FramingPoint { x: number; y: number; visibility?: number }
export interface FramingFrame { landmarks: FramingPoint[]; present?: boolean }

const IDX = {
  nose: 0, leftEye: 2, rightEye: 5, leftShoulder: 11, rightShoulder: 12, leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26, leftAnkle: 27, rightAnkle: 28,
} as const;

/** A whole body should fill this much of the frame: enough pixels to measure, enough room to squat without leaving. */
export const FILL_MIN = 0.45, FILL_MAX = 0.92;
/** Off this far from the middle and a squat will drift out of shot. */
export const CENTRE_TOLERANCE = 0.18;
/** Below this the landmarks are guesses, not positions. */
export const VIS_MIN = 0.55;
/** Square to the camera the shoulders read wider than the hips; under this ratio the athlete has turned. */
export const SQUARE_MIN = 0.85;
/** Facing away, the model loses the face. Above this the athlete is still looking at the camera. */
export const FACE_AWAY_MAX = 0.45;
/** And the other way: a SIDE-on movement wants the shoulders stacked, so anything wider than this is still facing you. */
export const SIDE_MAX = 0.6;

const ORDER: FramingIssue[] = ['noBody', 'cutOffBottom', 'cutOffTop', 'turned', 'tooClose', 'tooFar', 'offCentre', 'dim'];

const SAY: Record<FramingIssue, string> = {
  noBody: 'Step into the shot — I cannot see you yet.',
  cutOffBottom: 'Your feet are out of shot. Tilt the phone down or step back.',
  cutOffTop: 'Your head is out of shot. Tilt the phone up or step back.',
  turned: 'Turn and face the camera square-on — I read your knees from the front.',
  tooClose: 'Step back a couple of paces so your whole body stays in shot when you squat.',
  tooFar: 'Come forward a little — you are far enough away that I am guessing.',
  offCentre: 'Move to the middle of the shot.',
  dim: 'More light, or a plainer background — I am losing track of you.',
};

export function checkFraming(frame: FramingFrame, view: FramingView = 'front'): FramingCheck {
  const L = frame.landmarks ?? [];
  const get = (i: number) => L[i];
  const seen = (p: FramingPoint | undefined) => !!p && (p.visibility ?? 1) >= 0.3;
  const key = [IDX.nose, IDX.leftShoulder, IDX.rightShoulder, IDX.leftHip, IDX.rightHip,
    IDX.leftKnee, IDX.rightKnee, IDX.leftAnkle, IDX.rightAnkle].map(get);

  if (frame.present === false || key.filter(seen).length < 5) {
    return { ok: false, issues: ['noBody'], worst: 'noBody', instruction: SAY.noBody, bodyFill: 0, visibility: 0 };
  }

  const vis = key.filter(Boolean).map((p) => p!.visibility ?? 1);
  const visibility = vis.reduce((a, b) => a + b, 0) / Math.max(1, vis.length);

  const head = get(IDX.nose)!;
  const ankleY = Math.max(get(IDX.leftAnkle)?.y ?? 0, get(IDX.rightAnkle)?.y ?? 0);
  const bodyFill = Math.max(0, ankleY - head.y);
  const hipMidX = ((get(IDX.leftHip)?.x ?? 0.5) + (get(IDX.rightHip)?.x ?? 0.5)) / 2;
  const shoulderSpan = Math.abs((get(IDX.leftShoulder)?.x ?? 0) - (get(IDX.rightShoulder)?.x ?? 0));
  const hipSpan = Math.abs((get(IDX.leftHip)?.x ?? 0) - (get(IDX.rightHip)?.x ?? 0));

  const issues: FramingIssue[] = [];
  if (head.y < 0.03) issues.push('cutOffTop');
  if (ankleY > 0.97 || !seen(get(IDX.leftAnkle)) || !seen(get(IDX.rightAnkle))) issues.push('cutOffBottom');
  if (bodyFill > FILL_MAX) issues.push('tooClose');
  if (bodyFill < FILL_MIN) issues.push('tooFar');
  if (Math.abs(hipMidX - 0.5) > CENTRE_TOLERANCE) issues.push('offCentre');
  // square-on: the shoulders read wider than the hips. Side-on: they collapse toward each other.
  const squareness = hipSpan > 1e-3 ? shoulderSpan / hipSpan : 1;
  const faceVis = Math.max(
    get(IDX.nose)?.visibility ?? 1, get(IDX.leftEye)?.visibility ?? 0, get(IDX.rightEye)?.visibility ?? 0,
  );
  const wrongWay =
    view === 'front' ? squareness < SQUARE_MIN || faceVis < FACE_AWAY_MAX
    : view === 'side' ? squareness > SIDE_MAX
    : squareness < SQUARE_MIN || faceVis >= FACE_AWAY_MAX;   // back: square body, face turned away
  if (wrongWay) issues.push('turned');
  if (visibility < VIS_MIN) issues.push('dim');

  const worst = ORDER.find((i) => issues.includes(i)) ?? null;
  const say = worst === 'turned'
    ? view === 'side' ? 'Turn side-on to the camera — I read a hinge from the side.'
      : view === 'back' ? 'Turn all the way around — I read the heel line from behind.'
      : SAY.turned
    : worst ? SAY[worst] : 'Good shot — start when you are ready.';
  return {
    ok: issues.length === 0,
    issues,
    worst,
    instruction: say,
    bodyFill,
    visibility,
  };
}

/** Steady framing: the shot has to be good for a beat, not for one lucky frame, before a rep is allowed. */
export class FramingGate {
  private goodSince: number | null = null;
  constructor(private readonly holdMs = 700) {}
  /** True once the shot has been good for `holdMs`. */
  ready(check: FramingCheck, nowMs: number): boolean {
    if (!check.ok) { this.goodSince = null; return false; }
    if (this.goodSince == null) this.goodSince = nowMs;
    return nowMs - this.goodSince >= this.holdMs;
  }
  reset(): void { this.goodSince = null; }
}
