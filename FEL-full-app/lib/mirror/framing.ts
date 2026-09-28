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
/**
 * SIDE-ON, read as how wide the shoulders look against how long the torso looks (shoulder-to-shoulder distance over
 * shoulder-midpoint-to-hip-midpoint distance, both in the image). Turning side-on collapses the first and leaves the
 * second, so below this the body is side-on; at or above it, it is still facing (or backing onto) the camera.
 *
 * MIRROR-COACH P1 (2026-09-25) — WHY THIS REPLACED `shoulderSpan / hipSpan > 0.6`. That ratio cannot see a turn: the
 * shoulders and the hips narrow together as the body rotates, so the ratio stays where it was (~2.1 on the fixture
 * body, front or turned) — and exactly side-on both collapse, the hip span fell under 1e-3 and the ratio fell back to
 * 1, which is "turned". The baseline measured it: an athlete standing exactly side-on (lib/mirror/fixtures
 * stand_side.json) never passed the side check, so both screens stalled at the head-float station repeating "Turn
 * side-on to the camera — I read a hinge from the side." to someone already side-on; under jitter 29% of frames passed
 * by noise. The same fallback let that side-on body pass the FRONT check (519 of 880 jittered frames).
 *
 * The threshold, measured on the fixtures (FIXTURE_CAMERA, 640×480): 0.57 facing the camera (and backing onto it),
 * 0.44 seated and turned 40° (the rotation station, a FRONT station, must still pass as front), 0.09 standing exactly
 * side-on, 0.06–0.09 through a side-on hinge, 0.23–0.32 through a side-on push-up (a horizontal body). Re-filmed with
 * the synth's landmark jitter over 10 seeds, stand_side passes the side check on every frame it delivers and the front
 * and back checks on none; stand_front and stand_back the reverse. assumption: a portrait phone reads a facing body
 * wider (~1.0: x and y are fractions of the image's width and height), which only moves it further from this line; a
 * real side-on MediaPipe read is wider than the synth's (it does not stack the shoulders perfectly) — not yet measured
 * on a recording, which is why the line sits at 0.35, about a 50° turn from facing on a landscape phone.
 */
export const SIDE_WIDTH_MAX = 0.35;

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

/** What a side station says when the athlete is not side-on yet. */
export const SIDE_TURNED = 'Turn side-on to the camera.';

/**
 * Shoulder width over torso length, in the image (see SIDE_WIDTH_MAX), or null when the four points are not there or
 * the torso has no length to divide by.
 */
export function sideWidth(frame: FramingFrame): number | null {
  const L = frame.landmarks ?? [];
  const ls = L[IDX.leftShoulder], rs = L[IDX.rightShoulder], lh = L[IDX.leftHip], rh = L[IDX.rightHip];
  if (!ls || !rs || !lh || !rh) return null;
  const torso = Math.hypot((ls.x + rs.x) / 2 - (lh.x + rh.x) / 2, (ls.y + rs.y) / 2 - (lh.y + rh.y) / 2);
  if (torso < 1e-3) return null;
  return Math.hypot(ls.x - rs.x, ls.y - rs.y) / torso;
}

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
  const width = sideWidth(frame);

  const issues: FramingIssue[] = [];
  if (head.y < 0.03) issues.push('cutOffTop');
  if (ankleY > 0.97 || !seen(get(IDX.leftAnkle)) || !seen(get(IDX.rightAnkle))) issues.push('cutOffBottom');
  if (bodyFill > FILL_MAX) issues.push('tooClose');
  if (bodyFill < FILL_MIN) issues.push('tooFar');
  if (Math.abs(hipMidX - 0.5) > CENTRE_TOLERANCE) issues.push('offCentre');
  // square-on: the shoulders read wider than the hips (front and back keep this test). Side-on is read from the width
  // against the torso (SIDE_WIDTH_MAX): collapsed shoulders are side-on whatever the hips do, so a side-on body is
  // 'turned' for the front and back views too — it used to pass them through the ratio's fallback of 1.
  const sideOn = width !== null && width < SIDE_WIDTH_MAX;
  const squareness = hipSpan > 1e-3 ? shoulderSpan / hipSpan : 1;
  const faceVis = Math.max(
    get(IDX.nose)?.visibility ?? 1, get(IDX.leftEye)?.visibility ?? 0, get(IDX.rightEye)?.visibility ?? 0,
  );
  const wrongWay =
    view === 'front' ? sideOn || squareness < SQUARE_MIN || faceVis < FACE_AWAY_MAX
    : view === 'side' ? !sideOn
    : sideOn || squareness < SQUARE_MIN || faceVis >= FACE_AWAY_MAX;   // back: square body, face turned away
  if (wrongWay) issues.push('turned');
  if (visibility < VIS_MIN) issues.push('dim');

  const worst = ORDER.find((i) => issues.includes(i)) ?? null;
  // the side line names no movement: the screen's side stations read the head over the shoulder, not a hinge
  const say = worst === 'turned'
    ? view === 'side' ? SIDE_TURNED
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

/**
 * Steady framing: the shot has to be good for a beat, not for one lucky frame, before a rep is allowed.
 *
 * MOVEMENT PLAY P4 (2026-09-25): an opt-in COUNTED hold, for the space check (lib/move/spaceCheck.ts), which used to
 * keep two private copies of it. The default is a wall-clock hold that a bad frame restarts: right for a rep, which
 * a missed frame should not start. Counted, only the time between two consecutive passing frames adds to the hold,
 * and a failing (or missing) frame PAUSES it: a body the model finds one frame in four never holds anything, while
 * one missed frame costs a frame's time, not the whole hold. reset() is what restarts it.
 */
export class FramingGate {
  private goodSince: number | null = null;
  private heldMs = 0;
  private lastOkT: number | null = null;
  private readonly counted: boolean;
  constructor(private readonly holdMs = 700, opts: { counted?: boolean } = {}) {
    this.counted = !!opts.counted;
  }
  /** True once the shot has been good for `holdMs`. */
  ready(check: FramingCheck, nowMs: number): boolean {
    if (this.counted) return this.step(check.ok, nowMs) >= 1;
    if (!check.ok) { this.goodSince = null; return false; }
    if (this.goodSince == null) this.goodSince = nowMs;
    return nowMs - this.goodSince >= this.holdMs;
  }
  /**
   * The counted hold, one frame: a passing frame adds the time since the passing frame before it (none after a pause
   * or a reset), a failing one pauses. Returns the progress, 0..1.
   */
  step(ok: boolean, nowMs: number): number {
    if (!ok) { this.lastOkT = null; return this.progress; }
    if (this.lastOkT !== null && nowMs > this.lastOkT) this.heldMs += nowMs - this.lastOkT;
    this.lastOkT = nowMs;
    return this.progress;
  }
  /** How far through the hold, 0..1 (the counted hold; the wall-clock one reports 0 until it is read with ready()). */
  get progress(): number { return this.holdMs > 0 ? Math.min(1, this.heldMs / this.holdMs) : 1; }
  reset(): void { this.goodSince = null; this.heldMs = 0; this.lastOkT = null; }
}
