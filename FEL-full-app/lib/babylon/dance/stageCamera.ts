// stageCamera — MUSIC-SUITE P8 (2026-09-25), "a stage that performs".
//
// PLAN phase 8, owner decision #8: "front, audience view, moving on the beat (low on freezes, wide on streaks)".
// Today (DanceMode.ts ~:436, before this pass) `mountVenue` is called with `keepGameplayCamera: true` specifically to
// KEEP the over-shoulder follow camera — the M104 comment there calls this out as a gap: dance is the one creative
// discipline where the avatar IS the content, so a camera built to chase a moving athlete from behind is the wrong
// shot for a solo performer on a fixed stage. This file is the arithmetic for the right one: pure, so the framing
// contract ("never cuts the dancer's feet or hands, across aspect ratios") is something a test can hold the camera
// to, not something only an eye on a capture can confirm.
//
// PURE ON PURPOSE — same reason as beatBus.ts. `stageCameraFrame` takes the beat PHASE (0..1) as an argument; it
// never advances anything of its own. Feed it `beatBus.phase(clock.song(audioNow())).beatPhase` every frame and the
// sway is "locked to the song clock, never the frame clock" (PLAN phase 8, item 1) for free — a paused song clock
// hands this the same phase every frame, and the camera holds as still as everything else on the stage.
//
// THE FRAMING MATH REUSES lib/babylon/core/CameraFraming.ts's model (vertical-FOV-fixed lens: `visibleHeight =
// 2·distance·tan(fov/2)`, foreshortened by `cos(pitch)`) rather than re-deriving it — that file is the one place in
// this codebase that has already been checked against MEASURED, on-device numbers (its header). This file only adds
// what CameraFraming did not need for a wide team shot: a HORIZONTAL constraint too (a vertical-fixed lens's
// horizontal FOV is `2·atan(tan(vFov/2)·aspect)`, so a narrower (portrait) aspect leaves LESS side room at the same
// distance, not more), because a soloist raising both arms or dropping into a floor move can be wider than they are
// tall, and "never cuts... hands" is a horizontal promise as much as a vertical one.
//
// NEW TUNED FEEL NUMBERS (owner's eye is the judge — PLAN's "flag loudly" rule): every constant in
// `DEFAULT_STAGE_CAMERA` below is new to this camera (nothing here EXISTED to compare against; the room's only
// camera before this pass was the borrowed over-shoulder preset). `contentHeightM`/`contentSpanM` are the reach
// envelope a body can occupy (assumption: standing height 1.72 m — CameraFraming's own MEASURED figure — plus a
// raised-arm allowance and a floor-move span; nobody has measured the six captured moves' actual bounding box yet).
// `targetFraction`, the drop on a freeze, the widen on a streak, and the sway/push amplitudes are all new authored
// values with no prior reading to anchor them. Flagging them here AND in DanceMode's wiring comment, per the rule.

export interface Vec2 { x: number; z: number }

export interface StageCameraTunables {
  /** Feet-to-fingertip-overhead envelope the frame must always contain. assumption: 1.72 m (CameraFraming.MEASURED's
   *  own athlete height) + ~0.63 m of raised-arm reach above the head (roughly height × 0.37, a typical adult ratio). */
  contentHeightM: number;
  /** Worst-case side-to-side reach (arms spread, a floor move) the frame must always contain. assumption: close to
   *  a wingspan (~= height) plus a margin for a move that travels sideways mid-beat. */
  contentSpanM: number;
  /** Fraction of frame HEIGHT the content should fill in the neutral (no beat motion) framing. NEW tuned number —
   *  chosen far below CameraFraming.TOO_CLOSE (0.45) so the beat sway/push/freeze/streak swings below never cross
   *  it, and well above CameraFraming.READABLE_MIN (0.15): a soloist is the whole show here, not a wide field. */
  targetFraction: number;
  /** Clear space kept on every edge of the frame (fraction of content size), so the base framing already has room
   *  for the beat motion to move IN without the content ever touching the edge. */
  edgeMarginFrac: number;
  /** Camera eye height in the neutral state — a standing viewer's eye line. */
  baseHeightM: number;
  /** How much lower the camera drops on a freeze/hold — the classic breaking-crew low shot looking up at a held pose. */
  freezeDropM: number;
  /** Extra distance pulled back at the top of a streak ("wide on streaks"). */
  streakWidenM: number;
  /** Streak count at which the widen is fully applied (linear ramp below it). */
  streakCap: number;
  /** Lateral sway amplitude, one full cycle per beat. */
  swayM: number;
  /** Push (toward the stage) amplitude right on the beat, easing back out before the next one. */
  pushM: number;
  /** The camera is never placed closer than this — a beat-push must not be able to walk it into the dancer. */
  minDistanceM: number;
  /** The camera is never placed further than this from the stage centre, streak-widen included. MEASURED, not
   *  assumed: the dance venue's own ground is 20×20 m (venueSpecs.ts, half-extent 10 m from the stage centre), and
   *  under the NEON CLUB look specifically (placeLooks.ts's `neon-club` entry sets `propSet: null`) NexusVenue's
   *  surround-ground fill never runs — `mountVenue` only builds one when a propSet is declared — so that look has
   *  NOTHING past the 20×20 floor at all (the STUDIO/home look keeps the borrowed 'dojo' propSet's own much larger
   *  surround; see MESHY-PROMPTS.md for the pieces that should replace that borrowed dressing). Kept well under
   *  10 m so even the widest streak shot, on the look with no surround, still leaves several metres of floor
   *  visible beyond the dancer before the ground would end — PLAN phase 8 rule (a)'s "no black nothing at the
   *  edges of the frame". */
  maxDistanceM: number;
}

export const DEFAULT_STAGE_CAMERA: StageCameraTunables = {
  contentHeightM: 2.35,
  contentSpanM: 1.8,
  targetFraction: 0.58,
  edgeMarginFrac: 0.05,
  baseHeightM: 1.6,
  freezeDropM: 0.7,
  streakWidenM: 1.8,
  streakCap: 24,
  swayM: 0.22,
  pushM: 0.18,
  minDistanceM: 3.2,
  maxDistanceM: 8,
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

/** The vertical FOV a lens needs turns into a HORIZONTAL one through the aspect ratio alone, for a vertical-fixed
 *  camera (Babylon's default, and the one this game renders with — CameraFraming.ts's header). */
export function horizontalFov(verticalFovRad: number, aspect: number): number {
  return 2 * Math.atan(Math.tan(verticalFovRad / 2) * Math.max(0.1, aspect));
}

/** The distance that keeps `sizeM` of content at `fraction` of the frame, for a lens whose FOV (in the axis being
 *  measured) is `fovRad`. Reused for both the vertical content-height check (pass the vertical FOV) and the
 *  horizontal content-span check (pass `horizontalFov(...)`) — the same arithmetic CameraFraming.distanceForFraction
 *  uses, generalised to either axis instead of only "up". */
export function distanceForFraction(sizeM: number, fovRad: number, fraction: number): number {
  return sizeM / (2 * Math.max(1e-4, fraction) * Math.tan(fovRad / 2));
}

/**
 * The base (no beat motion) distance that keeps BOTH the full vertical reach and the full horizontal span inside
 * frame, with `edgeMarginFrac` of clear space on every side — whichever axis needs more room wins. A portrait phone
 * (aspect < 1) narrows the horizontal FOV at a fixed vertical one, so it is this max, not the vertical term alone,
 * that keeps a wide floor move from clipping the sides on a phone even though the same distance frames it fine on a
 * 16:9 desktop.
 */
export function baseDistance(fovRad: number, aspect: number, cfg: StageCameraTunables = DEFAULT_STAGE_CAMERA): number {
  const frac = clamp01(cfg.targetFraction) * (1 - 2 * clamp01(cfg.edgeMarginFrac));
  const dV = distanceForFraction(cfg.contentHeightM, fovRad, frac);
  const dH = distanceForFraction(cfg.contentSpanM, horizontalFov(fovRad, aspect), frac);
  return clamp(Math.max(dV, dH), cfg.minDistanceM, cfg.maxDistanceM);
}

/** A beat-locked push (toward the stage, negative = closer) and sway (lateral), both pure functions of the beat
 *  PHASE alone (0 at the downbeat) — never of elapsed wall time. The push eases in sharply on the beat and releases
 *  before the next one (an exponential decay, the same shape beatBus.beatBob uses for the lamps); the sway is one
 *  full side-to-side cycle per beat, gentler and continuous rather than a snap. */
export function beatMotion(beatPhase: number, cfg: StageCameraTunables = DEFAULT_STAGE_CAMERA): { push: number; sway: number } {
  const p = ((beatPhase % 1) + 1) % 1;
  return {
    push: -cfg.pushM * Math.exp(-p * 6),
    sway: cfg.swayM * Math.sin(p * Math.PI * 2),
  };
}

export interface StageCameraInput {
  /** The dancer's root position (world). */
  dancer: Vec2;
  /** The point the routine performs TOWARD (DanceMode's `AUDIENCE` constant) — the camera sits on THIS side and
   *  looks back at the dancer, which is what makes the shot a front/audience view instead of an over-shoulder one. */
  audience: Vec2;
  /** Render aspect (width / height) — read from the engine, not assumed, so the same call is correct on a phone in
   *  portrait and a desktop in landscape without this module needing to know which. */
  aspect: number;
  /** The camera's own vertical FOV (radians) — read off the live camera, not hard-coded, so a change to the
   *  harness's lens is inherited rather than silently disagreed with. */
  fovRad: number;
  /** 0..1, from `beatBus.phase(songTime).beatPhase`. */
  beatPhase: number;
  /** The step currently playing is a freeze/hold (DANCE_LIBRARY category === 'freeze'). */
  freeze: boolean;
  /** The live combo/streak count. */
  streak: number;
  /** The comfort setting (decision #8: "a comfort setting 'still camera' disables the motion") — true drops the
   *  beat sway/push AND the freeze-drop/streak-widen reactions, holding the plain neutral framing throughout. */
  stillCamera: boolean;
}

export interface StageCameraFrame {
  /** ADD x/z to the dancer's root position for the camera's world X and Z. */
  groundOffset: { x: number; z: number };
  /** The camera's ABSOLUTE world height (a standing viewer's eye line, ground-relative) — REPLACES the dancer's own
   *  Y, it is never added to it. The audience's eye height does not climb onto the podium with the performer: a
   *  camera at "1.6 m above wherever the dancer's root happens to be" would rise every time a step lifts the root
   *  (BeatOwner's jumps), which is motion this camera must not have. */
  heightM: number;
  /** ABOVE the dancer's root position — where the camera aims (the same convention CameraDirector.setFixed's own
   *  `targetHeight` argument already uses across the rest of the game: added to the SUBJECT, not absolute). */
  targetHeight: number;
  /** The distance actually used, in front of the dancer — exposed for the framing checks below and for tests. */
  distanceM: number;
}

/** The flat (Y-ignored) unit direction from the dancer toward the audience, and its perpendicular "right" — falls
 *  back to a fixed forward when the two points coincide (mirrors CameraDirector.snapTo's own degenerate-vector
 *  guard), so a bad venue configuration can never hand this function a NaN. */
function frontAndRight(dancer: Vec2, audience: Vec2): { front: Vec2; right: Vec2 } {
  const dx = audience.x - dancer.x, dz = audience.z - dancer.z;
  const len = Math.hypot(dx, dz);
  const front = len > 1e-3 ? { x: dx / len, z: dz / len } : { x: 0, z: -1 };
  return { front, right: { x: -front.z, z: front.x } };
}

/** The camera position + aim for this instant. Pure — see the file header. */
export function stageCameraFrame(input: StageCameraInput, cfg: StageCameraTunables = DEFAULT_STAGE_CAMERA): StageCameraFrame {
  const { front, right } = frontAndRight(input.dancer, input.audience);
  const base = baseDistance(input.fovRad, input.aspect, cfg);

  if (input.stillCamera) {
    const distanceM = base;
    return {
      groundOffset: { x: front.x * distanceM, z: front.z * distanceM },
      heightM: cfg.baseHeightM,
      targetHeight: cfg.contentHeightM * 0.42,
      distanceM,
    };
  }

  const streakT = clamp01(input.streak / Math.max(1, cfg.streakCap));
  const { push, sway } = beatMotion(input.beatPhase, cfg);
  const distanceM = clamp(base + streakT * cfg.streakWidenM + push, cfg.minDistanceM, cfg.maxDistanceM);
  const heightM = cfg.baseHeightM - (input.freeze ? cfg.freezeDropM : 0);
  // the low freeze angle looks UP at the held pose a little more than the neutral shot does, not just lower
  const targetHeight = cfg.contentHeightM * 0.42 + (input.freeze ? cfg.freezeDropM * 0.5 : 0);

  return {
    groundOffset: { x: front.x * distanceM + right.x * sway, z: front.z * distanceM + right.z * sway },
    heightM,
    targetHeight,
    distanceM,
  };
}

export interface FramingCheck {
  verticalOk: boolean;
  horizontalOk: boolean;
  visibleHeightM: number;
  visibleWidthM: number;
}

/**
 * Does a shot at `distanceM` (this lens, this aspect) keep the FULL content envelope inside the picture, with the
 * configured edge margin clear on every side? What the tests hold `stageCameraFrame`'s own output to, across the
 * aspect ratios a phone-to-desktop range covers.
 */
export function framesFullBody(distanceM: number, fovRad: number, aspect: number, cfg: StageCameraTunables = DEFAULT_STAGE_CAMERA): FramingCheck {
  const visibleHeightM = 2 * distanceM * Math.tan(fovRad / 2);
  const visibleWidthM = 2 * distanceM * Math.tan(horizontalFov(fovRad, aspect) / 2);
  const neededH = cfg.contentHeightM * (1 + 2 * cfg.edgeMarginFrac);
  const neededW = cfg.contentSpanM * (1 + 2 * cfg.edgeMarginFrac);
  return { verticalOk: visibleHeightM >= neededH, horizontalOk: visibleWidthM >= neededW, visibleHeightM, visibleWidthM };
}
