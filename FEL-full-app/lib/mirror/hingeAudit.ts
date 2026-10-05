// hingeAudit — the Mirror's side-view hip-hinge station (MIRROR-COACH P4, 2026-09-29, owner decision #9).
//
// THE MOVEMENT. A hip hinge (a bodyweight RDL, a deadlift's pattern without the bar) should move the hips BACK with a
// SOFT knee — the hips do almost all the travel, the knee bends only a little. The common miss is doing a squat
// instead: the knee does the work, the hips barely move back. This is read from the SIDE, unlike the squat and lunge
// (frontal-plane movements, lib/mirror/framing.ts's `view` — a hinge's whole question is how far the hips travel back
// and whether the trunk stays one piece, which a front camera cannot see at all).
//
// THREE CAMERA-MEASURABLE CHECKS (the brief's (a)/(b)/(c); nothing here reads a rib, the abdomen, the pelvis or a
// breath — only what MediaPipe's 33 2-D landmarks can place):
//   (a) HINGE RATIO — how much the hip angle changes over the rep against how much the knee angle changes. A
//       knee-dominant ("squat-shaped") hinge shows a LOW ratio: the knee did proportionally more of the work than the
//       hip. Flagged with the cue "more hips back", never a name for what a squat-shaped hinge IS (this is not a
//       diagnosis of anything, it is a shape read off two joint angles).
//   (b) DOWEL LINE — a coach's dowel held along the ear–shoulder–hip line during a real hinge is a PROXY this camera
//       can approximate the same way: how far off a straight line the ear (7/8), shoulder (11/12) and hip (23/24)
//       land. A big head poke or the shoulder-to-hip line collapsing (rounding) both show up as an angle at the
//       shoulder vertex away from 180°. This is NOT a spine, rib or posture read — three 2-D points, nothing more.
//   (c) SHIN ANGLE — the shin's lean off vertical, read against the body's own heel→toe direction (so the sign is
//       right whichever way the camera happens to face the subject — the same self-referential trick squat-audit.ts's
//       kneeInwardRatio uses for "inward"). A hinge should barely move the knee forward past the ankle; a big forward
//       lean is the knee (and the shin) doing a squat's job.
//
// NEAR SIDE, CHOSEN BY VISIBILITY. From the side only one leg/arm is close to the camera; the far one is behind the
// body. P1 found the synth's own occlusion model sometimes marks a far-side limb fully visible where a real phone
// would not (see lib/mirror/fixtures/build.ts's header) — so this does not assume either side is the near one. It
// scores both sides' average visibility across the clip and reads whichever is higher, every frame, for the whole
// reading (a side chosen frame-by-frame would let one noisy frame swap which leg the read is "about" mid-rep).
//
// UNREADABLE, NOT A GUESS. A hinge read from the front is not a smaller number — it is a different question the
// camera cannot answer, so the WHOLE reading is 'unreadable' with a one-line "turn side-on" prompt (this function does
// not loop or retry — that policy, and how many times to ask, is the harness's, per P1's lesson: one retry, then
// record unreadable). Within a side-on take, EACH check degrades on its own: if the ear is never visible enough to
// place, the dowel-line check alone reads 'unreadable' while the hip and knee angles (which do not need the ear) can
// still be graded. 'unreadable' is never reported as 'ok'.
//
// Pure: an array of pose frames in, one PatternReading out (the whole capture's worth — not a per-frame stream like
// squat-audit.ts / lungeAudit.ts, which run a display loop; this and setupLine.ts are graded after the fact, the way
// lib/mirror/stationGraders.ts already grades the Movement Screen's stations, P3). No DOM, no camera.
import type { PoseFrame, Lm } from '@/lib/pose/landmarks';
import {
  LEFT_EAR, RIGHT_EAR, LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP,
  LEFT_KNEE, RIGHT_KNEE, LEFT_ANKLE, RIGHT_ANKLE, LEFT_HEEL, RIGHT_HEEL, LEFT_FOOT_INDEX, RIGHT_FOOT_INDEX,
} from '@/lib/pose/landmarks';
import { sideWidth, SIDE_WIDTH_MAX, SIDE_TURNED, type FramingFrame } from './framing';
import type { CueRule, MirrorPattern, MirrorPatternContext, PatternFaultReading, PatternReading } from './patterns';

// The pattern-registry contract itself (MirrorPattern / PatternReading / PatternFaultReading / CueRule /
// MirrorPatternContext) lives in lib/mirror/patterns.ts — the push-and-overhead lane reached that file first and
// wrote it from the same phase-4 brief this module was built from (see that file's own header). Re-exported here
// only for convenience so a caller of this module does not also need to know patterns.ts's path.
export type { CueRule, MirrorPattern, MirrorPatternContext, PatternFaultReading, PatternReading };

export type HingeFaultId = 'hingeRatio' | 'dowelLine' | 'shinAngle';

export interface HingeThresholds {
  /** A landmark below this is not trusted (squat-audit.ts's own minVis). */
  minVis: number;
  /** Below this (framing.ts sideWidth) the body reads side-on; at/above it, the view is wrong for this station. */
  sideWidthMax: number;
  /** The rep must move the hip angle at least this many degrees, or there is not enough hinge here to grade (a). */
  minHipRangeDeg: number;
  /** hipFlexionRange / kneeFlexionRange must clear this to read as hip-led, not knee-led. */
  hingeRatioMin: number;
  /** Degrees the ear–shoulder–hip angle may fall short of a straight 180° before the dowel line is flagged (b). */
  dowelLineWarnDeg: number;
  /** Degrees the shin may lean off vertical, toward the toe, before the knee-over-toe drift is flagged (c). */
  shinAngleWarnDeg: number;
  /** How many readable frames a check needs before its range/worst reading is trusted at all. */
  minReadableFrames: number;
}
export const HINGE_THRESHOLDS: HingeThresholds = {
  minVis: 0.5,
  sideWidthMax: SIDE_WIDTH_MAX,
  minHipRangeDeg: 12,        // TUNE(elijah)
  hingeRatioMin: 1.5,        // TUNE(elijah) — measured: a clean hinge (build.ts hingePose) reads ~4–6; a knee-dominant
                             // rep (hingeSetupBuild.ts hingeSquatty) reads well under 1. 1.5 sits between with headroom.
  dowelLineWarnDeg: 12,      // TUNE(elijah) — a clean hinge reads a few degrees of natural sway; a 10 cm head poke
                             // (hingeSetupBuild.ts hingeHeadPoke) reads well past this.
  shinAngleWarnDeg: 24,      // TUNE(elijah)
  minReadableFrames: 10,
};

interface XY { x: number; y: number }
const angle2D = (a: XY, b: XY, c: XY): number => {
  const ux = a.x - b.x, uy = a.y - b.y, vx = c.x - b.x, vy = c.y - b.y;
  const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
  if (lu < 1e-6 || lv < 1e-6) return 180;
  const cos = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)));
  return (Math.acos(cos) * 180) / Math.PI;
};

/** Interior angle at the hip between shoulder–hip–knee, turned into a flexion amount: 0 = standing tall (shoulder,
 *  hip and knee near a straight line), larger = more folded at the hip. 2-D, image space — estimated. */
export function hipFlexionDeg(shoulder: XY, hip: XY, knee: XY): number {
  return 180 - angle2D(shoulder, hip, knee);
}
/** Interior angle at the knee between hip–knee–ankle, as a flexion amount: 0 = knee straight, larger = more bent. */
export function kneeFlexionDeg(hip: XY, knee: XY, ankle: XY): number {
  return 180 - angle2D(hip, knee, ankle);
}
/**
 * The DOWEL-LINE proxy: how far the angle at the shoulder, between the ear and the hip, falls short of a straight
 * 180° — 0 = ear, shoulder and hip collinear (the dowel would touch all three), larger = a head poke forward of the
 * line or the shoulder-to-hip line breaking (rounding). Estimated, 2-D; this is not a spine or rib measurement.
 */
export function dowelLineDeviationDeg(ear: XY, shoulder: XY, hip: XY): number {
  return 180 - angle2D(ear, shoulder, hip);
}
/**
 * The shin's lean toward the toe, degrees off vertical, SIGNED by the body's own heel→toe direction so the sign is
 * right whichever way the camera faces the subject (the same self-referential trick as squat-audit.ts's
 * kneeInwardRatio "inward"): + = the knee has travelled toward the toe past the ankle (a squat's knee-over-toe
 * travel), − = the knee sits behind the ankle (rare; toward the heel).
 */
export function shinForwardLeanDeg(knee: XY, ankle: XY, heel: XY, footIndex: XY): number {
  const fwd = Math.sign(footIndex.x - heel.x) || 1;
  const dx = (knee.x - ankle.x) * fwd, dy = ankle.y - knee.y; // y-down: ankle is BELOW the knee, so dy > 0
  if (Math.abs(dy) < 1e-6) return 0;
  return (Math.atan2(dx, Math.abs(dy)) * 180) / Math.PI;
}

interface SidePoints { ear?: Lm; shoulder: Lm; hip: Lm; knee: Lm; ankle: Lm; heel: Lm; footIndex: Lm }
const vis = (l: Lm | undefined, min: number) => !!l && l.v >= min;

/**
 * Which side (left/right) is nearer the camera, by AVERAGE visibility of its shoulder/hip/knee/ankle across every
 * present frame — one decision for the whole reading (see the file header). Null when neither side is ever readable.
 *
 * VISIBILITY TIES BREAK ON DEPTH (z), not a fixed default. A real occluded far side reads lower visibility and the
 * vote above settles it; lib/mirror/fixtures/build.ts's own header records that the synth's torso-occlusion model
 * does not always dim a standing or hinging body's far shoulder/hip/knee/ankle the way a real phone would (those
 * points sit inside its TORSO_FACE set), so a synthetic side-on clip can read identical visibility on both sides —
 * which must not silently default to "left" every time, or a mirrored (selfie) take of the same clip would pick the
 * SAME label instead of the other one. z is depth from the camera on roughly the image's own scale (smaller = nearer
 * — lib/pose/landmarks.ts), already trusted the same way by squat-audit.ts's torsoTurnSample/squareOn.
 *
 * assumption: a real phone's MediaPipe orders a side-on body's near shoulder ahead of (smaller z than) the far one
 * clearly enough for this tiebreak to resolve the right way on a recording, the same assumption squat-audit.ts's
 * squareOn already carries for its own z read; not yet checked on one (the owner's capture, still outstanding there).
 */
export function pickNearSide(frames: readonly PoseFrame[], minVis: number): 'left' | 'right' | null {
  let left = 0, right = 0, frames_ = 0, lz = 0, rz = 0, zVotes = 0;
  for (const f of frames) {
    if (!f.present || !f.image.length) continue;
    const L = f.image;
    const lv = (L[LEFT_SHOULDER]?.v ?? 0) + (L[LEFT_HIP]?.v ?? 0) + (L[LEFT_KNEE]?.v ?? 0) + (L[LEFT_ANKLE]?.v ?? 0);
    const rv = (L[RIGHT_SHOULDER]?.v ?? 0) + (L[RIGHT_HIP]?.v ?? 0) + (L[RIGHT_KNEE]?.v ?? 0) + (L[RIGHT_ANKLE]?.v ?? 0);
    if (lv < 1e-6 && rv < 1e-6) continue;
    left += lv; right += rv; frames_++;
    const lzv = L[LEFT_SHOULDER]?.z, rzv = L[RIGHT_SHOULDER]?.z;
    if (Number.isFinite(lzv) && Number.isFinite(rzv)) { lz += lzv as number; rz += rzv as number; zVotes++; }
  }
  if (frames_ === 0) return null;
  const visGap = Math.abs(left - right) / Math.max(1e-6, left + right);
  if (visGap > 0.02) return left > right ? 'left' : 'right';
  if (zVotes > 0 && Math.abs(lz - rz) > 1e-6) return lz < rz ? 'left' : 'right';
  return left >= right ? 'left' : 'right';
}

function sidePoints(image: readonly Lm[], side: 'left' | 'right'): SidePoints {
  return side === 'left'
    ? { ear: image[LEFT_EAR], shoulder: image[LEFT_SHOULDER], hip: image[LEFT_HIP], knee: image[LEFT_KNEE], ankle: image[LEFT_ANKLE], heel: image[LEFT_HEEL], footIndex: image[LEFT_FOOT_INDEX] }
    : { ear: image[RIGHT_EAR], shoulder: image[RIGHT_SHOULDER], hip: image[RIGHT_HIP], knee: image[RIGHT_KNEE], ankle: image[RIGHT_ANKLE], heel: image[RIGHT_HEEL], footIndex: image[RIGHT_FOOT_INDEX] };
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const unreadable = (id: HingeFaultId, side: 'left' | 'right' | undefined): PatternFaultReading => ({ id, side, value: 0, unit: idUnit(id), status: 'unreadable' });
const idUnit = (id: HingeFaultId): string => (id === 'hingeRatio' ? 'ratio' : 'deg');

/** lib/pose/landmarks.ts's PoseFrame (image: Lm[], .v) → lib/mirror/framing.ts's own frame shape (landmarks: [], .visibility) —
 *  two different frame shapes the Mirror carries for historical reasons (lungeAudit.ts's own header); framing.ts is
 *  the one with the view/side-on read, so this is the one place hinge needs to bridge them. */
function asFramingFrame(f: PoseFrame): FramingFrame {
  return { present: f.present, landmarks: f.image.map((l) => ({ x: l.x, y: l.y, visibility: l.v })) };
}

/**
 * Grade a whole hinge capture (every rep together, like stationGraders.ts — not a per-frame stream). `ctx.side`, when
 * given, is trusted over the visibility vote (a coach or an earlier calibration already knows which side is near).
 */
export function auditHinge(
  frames: PoseFrame[],
  ctx: MirrorPatternContext = {},
  t: HingeThresholds = HINGE_THRESHOLDS,
): PatternReading {
  const present = frames.filter((f) => f.present && f.image.length > 0);
  if (present.length === 0) {
    return {
      faults: (['hingeRatio', 'dowelLine', 'shinAngle'] as HingeFaultId[]).map((id) => unreadable(id, undefined)),
      readableFrames: 0, note: 'No body in view.',
    };
  }

  const side = ctx.side ?? pickNearSide(present, t.minVis);
  if (!side) {
    return {
      faults: (['hingeRatio', 'dowelLine', 'shinAngle'] as HingeFaultId[]).map((id) => unreadable(id, undefined)),
      readableFrames: 0, note: 'Too little of you in view to tell which side is toward the camera.',
    };
  }

  // VIEW GATE — a hinge is read side-on only (framing.ts's own convention: sideWidth < SIDE_WIDTH_MAX). Majority
  // vote over present frames, so one bad frame mid-turn does not flip the whole reading.
  let sideOnVotes = 0, viewVotes = 0;
  for (const f of present) {
    const w = sideWidth(asFramingFrame(f));
    if (w === null) continue;
    viewVotes++;
    if (w < t.sideWidthMax) sideOnVotes++;
  }
  if (viewVotes === 0 || sideOnVotes / viewVotes < 0.5) {
    return {
      faults: (['hingeRatio', 'dowelLine', 'shinAngle'] as HingeFaultId[]).map((id) => unreadable(id, side)),
      readableFrames: 0, note: SIDE_TURNED,
    };
  }

  // per-check readable series
  const hipSeries: number[] = [], kneeSeries: number[] = [];
  const dowelSeries: number[] = []; let dowelFrames = 0;
  const shinSeries: number[] = []; let shinFrames = 0;
  let legFrames = 0;

  for (const f of present) {
    const p = sidePoints(f.image, side);
    if (vis(p.shoulder, t.minVis) && vis(p.hip, t.minVis) && vis(p.knee, t.minVis) && vis(p.ankle, t.minVis)) {
      hipSeries.push(hipFlexionDeg(p.shoulder, p.hip, p.knee));
      kneeSeries.push(kneeFlexionDeg(p.hip, p.knee, p.ankle));
      legFrames++;
      if (vis(p.heel, t.minVis) && vis(p.footIndex, t.minVis)) {
        shinSeries.push(shinForwardLeanDeg(p.knee, p.ankle, p.heel, p.footIndex));
        shinFrames++;
      }
    }
    if (p.ear && vis(p.ear, t.minVis) && vis(p.shoulder, t.minVis) && vis(p.hip, t.minVis)) {
      dowelSeries.push(dowelLineDeviationDeg(p.ear, p.shoulder, p.hip));
      dowelFrames++;
    }
  }

  const range = (xs: number[]) => (xs.length ? Math.max(...xs) - Math.min(...xs) : 0);
  const worst = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);

  const faults: PatternFaultReading[] = [];
  const hipRange = range(hipSeries), kneeRange = range(kneeSeries);
  if (legFrames < t.minReadableFrames) {
    faults.push(unreadable('hingeRatio', side));
  } else if (hipRange < t.minHipRangeDeg) {
    faults.push({ id: 'hingeRatio', side, value: r2(hipRange), unit: 'deg', status: 'unreadable' });
  } else {
    const ratio = hipRange / Math.max(1, kneeRange);
    faults.push({ id: 'hingeRatio', side, value: r2(ratio), unit: 'ratio', status: ratio >= t.hingeRatioMin ? 'ok' : 'fault' });
  }

  if (dowelFrames < t.minReadableFrames) {
    faults.push(unreadable('dowelLine', side));
  } else {
    const worstDowel = worst(dowelSeries);
    faults.push({ id: 'dowelLine', side, value: r2(worstDowel), unit: 'deg', status: worstDowel > t.dowelLineWarnDeg ? 'fault' : 'ok' });
  }

  if (shinFrames < t.minReadableFrames) {
    faults.push(unreadable('shinAngle', side));
  } else {
    const worstShin = worst(shinSeries);
    faults.push({ id: 'shinAngle', side, value: r2(worstShin), unit: 'deg', status: worstShin > t.shinAngleWarnDeg ? 'fault' : 'ok' });
  }

  const readableFrames = Math.max(legFrames, dowelFrames, shinFrames);
  const hr = faults.find((f) => f.id === 'hingeRatio')!;
  // ctx.baseline (lib/mirror/patterns.ts's MirrorPatternContext) is accepted for the contract but not read yet —
  // the same choice lib/mirror/pushupAudit.ts's auditPushup makes (see patterns.ts's own header): it is reserved for
  // whichever phase-4/5 lane wires up the per-athlete store, and this reading calibrates fresh from its own frames.
  void ctx.baseline;
  const note = hr.status === 'unreadable'
    ? 'Estimated: not enough hip travel in this clip to read a hinge ratio.'
    : `Estimated: hinge ratio ${hr.value.toFixed(2)} (hip:knee) · dowel line ${faults[1].status === 'unreadable' ? 'not read' : `${faults[1].value.toFixed(0)}° off`} · shin ${faults[2].status === 'unreadable' ? 'not read' : `${faults[2].value.toFixed(0)}°`}`;

  return { faults, readableFrames, note };
}

// External-focus, action cues (cue-engine.ts's voice): the action, never a muscle, a cause, or a claim about injury
// or risk. `escalate` if the same check still reads 'fault' next time; `regress` is the simpler version to fall back
// to (lib/mirror/pushupAudit.ts's own three-level shape, and patterns.ts's CueRule, which this file registers into).
// MIRROR-COACH P9 (2026-09-30): reworded to FEL's external-focus policy (lib/coach/cueLint.ts, whose test lints this
// table): a cue that names a body part leads with the floor, the wall, the ceiling, the camera or the load, and nothing
// names a muscle to squeeze or feel. The fault each line answers, and its three levels, are unchanged.
export const HINGE_CUES: readonly CueRule[] = [
  {
    faultId: 'hingeRatio',
    cue: 'Close a door behind you with your hips — more hips back, and the knee stays soft.',
    escalate: 'Still squatting it. Send the hips back to the wall behind you before the knee bends at all.',
    regress: 'Hands on a wall or a doorframe. Hinge back only until the stretch stops you, no lower — the range earns itself.',
  },
  {
    faultId: 'dowelLine',
    cue: 'Hinge as if a broomstick lies along your back — it stays touching your head and your hips.',
    escalate: 'That line is still breaking. Eyes to a spot on the floor a few feet ahead, then hinge without losing the broomstick.',
    regress: 'Pick a spot on the floor a few feet ahead and hold your eyes there the whole rep — the line follows the eyes.',
  },
  {
    faultId: 'shinAngle',
    cue: 'Send the hips back toward the wall behind you — the shin stays still, the knee stays put.',
    escalate: 'Still drifting forward. Sit back toward your heels as the hips travel back to the wall.',
    regress: 'Stand an inch off a wall behind you. If your knee taps it, the shin travelled too far — reset and go slower.',
  },
];

/**
 * The Movement Screen's registry entry (MIRROR-COACH P4, owner decision #9) — a SEPARATE deliverable from the
 * routed T4 patch this phase also files for the still-unmerged mirror-assess lane (PR #20): that battery's own T4
 * hip-hinge slot is theirs to wire in on their branch; this station ships on lib/mirror's picker regardless. No
 * bracing or loaded-lift cue here (a bodyweight hinge, camera-only), so youthSafe is true throughout. Same
 * check/work split as the squat and the push-up (lib/mirror/squatStage.ts, lib/mirror/pushupAudit.ts) — FEL judgment,
 * one convention for every reps-based station.
 */
export const hingePattern: MirrorPattern = {
  id: 'hinge', label: 'Hip hinge', view: 'side',
  reps: { checkReps: 3, workReps: 8 },
  audit: auditHinge,
  cues: HINGE_CUES,
  youthSafe: true,
};
