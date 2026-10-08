// setupLine — a one-shot, side-view LIFT SET-UP check, before a hinge-pattern lift: a deadlift, a row, an RDL
// (MIRROR-COACH P4, 2026-09-29, owner decision #9's set-up line). Held for a few seconds, not a rep.
//
// FRAMED STRICTLY AS SET-UP, NEVER POSTURE OR HEALTH. This is not a screen of the athlete's body; it is a check of
// whether the position they have taken, right now, in front of a bar, is one a lift is likely to start well from. The
// three things a coach checks by eye before a pull, all camera-measurable from the side:
//   (a) HIP HEIGHT — the hips should sit somewhere BETWEEN the shoulders and the knees, not pinned near either end.
//       Too close to the shoulders (a nearly straight leg, the trunk doing all the folding) reads "hips riding high";
//       too close to the knees (a squat depth) reads "hips are low — this is a squat stance, not a pull stance".
//   (b) SHOULDERS OVER THE BAR-HAND LINE — the shoulder should sit over, or a little ahead of, the wrist (the bar in
//       hand). Read from the body's own heel→toe direction, so the sign holds whichever way the camera faces the
//       subject (the same trick as hingeAudit.ts's shinForwardLeanDeg).
//   (c) HEAD IN LINE — reuses hingeAudit.ts's own dowelLineDeviationDeg (ear/shoulder/hip) rather than re-deriving
//       the same three-point geometry a second time.
// ONE line out, never a list: "Set-up looks ready." or the single worst thing to fix — a setup checklist nobody reads
// end to end is not a setup checklist (framing.ts's own "one instruction at a time" rule, reused here).
//
// Same shape as hingeAudit.ts: pure, an array of pose frames in (the whole ~5 s hold), one PatternReading out. No DOM.
//
// assumption: MediaPipe has no barbell landmark, so "the bar" is read as the near-side WRIST — right for a standard
// double-overhand grip at roughly hip width, not modelled for a snatch-width or offset grip; not yet checked against
// a real pull.
import type { PoseFrame, Lm } from '@/lib/pose/landmarks';
import {
  LEFT_EAR, RIGHT_EAR, LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP,
  LEFT_KNEE, RIGHT_KNEE, LEFT_WRIST, RIGHT_WRIST, LEFT_HEEL, RIGHT_HEEL, LEFT_FOOT_INDEX, RIGHT_FOOT_INDEX,
} from '@/lib/pose/landmarks';
import { sideWidth, SIDE_WIDTH_MAX, SIDE_TURNED, type FramingFrame } from './framing';
import { dowelLineDeviationDeg, pickNearSide } from './hingeAudit';
import type { CueRule, MirrorPattern, MirrorPatternContext, PatternFaultReading, PatternReading } from './patterns';

export type SetupFaultId = 'hipHeight' | 'barLine' | 'headLine';

export interface SetupThresholds {
  minVis: number;
  sideWidthMax: number;
  /** Hip position between shoulder (0) and knee (1); below this the hips read "riding high". */
  hipHeightLow: number;
  /** …above this the hips read "low", a squat stance rather than a pull stance. */
  hipHeightHigh: number;
  /** Shoulder-ahead-of-wrist, in torso lengths (shoulder→hip), signed by the body's own forward direction: below
   *  −this many torso-lengths BEHIND the wrist, the bar line is flagged. Being ahead is never flagged. */
  barLineBehindWarn: number;
  /** Degrees the ear–shoulder–hip angle may fall short of 180° before the head line is flagged. */
  headLineWarnDeg: number;
  minReadableFrames: number;
}
export const SETUP_THRESHOLDS: SetupThresholds = {
  minVis: 0.5,
  sideWidthMax: SIDE_WIDTH_MAX,
  hipHeightLow: 0.38,          // TUNE(elijah) — measured: a good set-up (hingeSetupBuild.ts setupClean) reads ~0.50;
                               // hips riding high (setupHipsHigh) reads ~0.32. 0.38 sits between with headroom.
  hipHeightHigh: 0.72,         // TUNE(elijah)
  barLineBehindWarn: 0.12,     // TUNE(elijah) — torso-lengths
  headLineWarnDeg: 12,         // TUNE(elijah) — matches hingeAudit's own dowelLineWarnDeg
  minReadableFrames: 10,
};

interface SetupPoints { ear?: Lm; shoulder: Lm; hip: Lm; knee: Lm; wrist: Lm; heel: Lm; footIndex: Lm }
const vis = (l: Lm | undefined, min: number) => !!l && l.v >= min;
const r2 = (x: number) => Math.round(x * 100) / 100;

function setupPoints(image: readonly Lm[], side: 'left' | 'right'): SetupPoints {
  return side === 'left'
    ? { ear: image[LEFT_EAR], shoulder: image[LEFT_SHOULDER], hip: image[LEFT_HIP], knee: image[LEFT_KNEE], wrist: image[LEFT_WRIST], heel: image[LEFT_HEEL], footIndex: image[LEFT_FOOT_INDEX] }
    : { ear: image[RIGHT_EAR], shoulder: image[RIGHT_SHOULDER], hip: image[RIGHT_HIP], knee: image[RIGHT_KNEE], wrist: image[RIGHT_WRIST], heel: image[RIGHT_HEEL], footIndex: image[RIGHT_FOOT_INDEX] };
}

/** 0 = hip at shoulder height, 1 = hip at knee height — where the hip sits between the two, y-down image space. */
export function hipHeightFraction(shoulder: { y: number }, hip: { y: number }, knee: { y: number }): number {
  const span = knee.y - shoulder.y;
  if (Math.abs(span) < 1e-6) return 0.5;
  return (hip.y - shoulder.y) / span;
}

/** Shoulder-ahead-of-wrist, in torso lengths (shoulder→hip), signed by the heel→toe forward direction: + = the
 *  shoulder is ahead of the wrist (over or in front of the bar), − = behind it. */
export function shoulderAheadOfHandRatio(
  shoulder: { x: number; y: number }, hip: { x: number; y: number }, wrist: { x: number }, heel: { x: number }, footIndex: { x: number },
): number {
  const torso = Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y);
  if (torso < 1e-6) return 0;
  const fwd = Math.sign(footIndex.x - heel.x) || 1;
  return ((shoulder.x - wrist.x) * fwd) / torso;
}

const asFramingFrame = (f: PoseFrame): FramingFrame => ({ present: f.present, landmarks: f.image.map((l) => ({ x: l.x, y: l.y, visibility: l.v })) });
const unreadable = (id: SetupFaultId, side: 'left' | 'right' | undefined): PatternFaultReading => ({ id, side, value: 0, unit: idUnit(id), status: 'unreadable' });
const idUnit = (id: SetupFaultId): string => (id === 'barLine' ? 'torsoLengths' : id === 'hipHeight' ? 'fraction' : 'deg');
const ALL_IDS: SetupFaultId[] = ['hipHeight', 'barLine', 'headLine'];

/** The single line a lifter reads: "ready", or the worst thing to fix — never a list (see the file header). */
function summaryLine(faults: PatternFaultReading[]): string {
  const by = (id: SetupFaultId) => faults.find((f) => f.id === id)!;
  const hip = by('hipHeight'), bar = by('barLine'), head = by('headLine');
  if (hip.status === 'fault') return hip.value < SETUP_THRESHOLDS.hipHeightLow
    ? 'Hips are riding high — sit them down toward the bar, knees add the bend.'
    : 'Hips are low for a pull — this reads as a squat stance. Hips up a touch, chest over the bar.';
  if (bar.status === 'fault') return 'Shoulders are behind the bar — bring your chest over it a touch.';
  if (head.status === 'fault') return 'Set your head in line first — one long line from your ears to your hips.';
  if (hip.status === 'unreadable') return 'Can\'t see your hips and knees well enough to check your set-up — square up in frame.';
  if (bar.status === 'unreadable') return 'Can\'t see the bar hand well enough to check your set-up — bring it into frame.';
  if (head.status === 'unreadable') return 'Can\'t see your head and shoulders well enough to check your set-up — square up in frame.';
  return 'Set-up looks ready.';
}

/** Grade one held lift set-up (the whole ~5 s hold together, not frame by frame). */
export function auditSetup(
  frames: PoseFrame[],
  ctx: MirrorPatternContext = {},
  t: SetupThresholds = SETUP_THRESHOLDS,
): PatternReading {
  // ctx.baseline (lib/mirror/patterns.ts) is accepted for the contract but not read: a one-shot readiness check
  // ("is this set-up right, right now") is a pass/fail against a fixed line, not a trend a personal baseline would
  // compare against — the same reservation lib/mirror/pushupAudit.ts's own audit makes.
  void ctx.baseline;
  const present = frames.filter((f) => f.present && f.image.length > 0);
  if (present.length === 0) {
    return { faults: ALL_IDS.map((id) => unreadable(id, undefined)), readableFrames: 0, note: 'No body in view.' };
  }

  const side = ctx.side ?? pickNearSide(present, t.minVis);
  if (!side) {
    return { faults: ALL_IDS.map((id) => unreadable(id, undefined)), readableFrames: 0, note: 'Too little of you in view to tell which side is toward the camera.' };
  }

  let sideOnVotes = 0, viewVotes = 0;
  for (const f of present) {
    const w = sideWidth(asFramingFrame(f));
    if (w === null) continue;
    viewVotes++;
    if (w < t.sideWidthMax) sideOnVotes++;
  }
  if (viewVotes === 0 || sideOnVotes / viewVotes < 0.5) {
    return { faults: ALL_IDS.map((id) => unreadable(id, side)), readableFrames: 0, note: SIDE_TURNED };
  }

  const hipSeries: number[] = [], barSeries: number[] = [], headSeries: number[] = [];
  for (const f of present) {
    const p = setupPoints(f.image, side);
    if (vis(p.shoulder, t.minVis) && vis(p.hip, t.minVis) && vis(p.knee, t.minVis)) hipSeries.push(hipHeightFraction(p.shoulder, p.hip, p.knee));
    if (vis(p.shoulder, t.minVis) && vis(p.hip, t.minVis) && vis(p.wrist, t.minVis) && vis(p.heel, t.minVis) && vis(p.footIndex, t.minVis)) {
      barSeries.push(shoulderAheadOfHandRatio(p.shoulder, p.hip, p.wrist, p.heel, p.footIndex));
    }
    if (p.ear && vis(p.ear, t.minVis) && vis(p.shoulder, t.minVis) && vis(p.hip, t.minVis)) headSeries.push(dowelLineDeviationDeg(p.ear, p.shoulder, p.hip));
  }

  const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const worst = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);

  const faults: PatternFaultReading[] = [];
  if (hipSeries.length < t.minReadableFrames) faults.push(unreadable('hipHeight', side));
  else {
    const v = median(hipSeries);
    faults.push({ id: 'hipHeight', side, value: r2(v), unit: 'fraction', status: v < t.hipHeightLow || v > t.hipHeightHigh ? 'fault' : 'ok' });
  }
  if (barSeries.length < t.minReadableFrames) faults.push(unreadable('barLine', side));
  else {
    const v = median(barSeries);
    faults.push({ id: 'barLine', side, value: r2(v), unit: 'torsoLengths', status: v < -t.barLineBehindWarn ? 'fault' : 'ok' });
  }
  if (headSeries.length < t.minReadableFrames) faults.push(unreadable('headLine', side));
  else {
    const v = worst(headSeries);
    faults.push({ id: 'headLine', side, value: r2(v), unit: 'deg', status: v > t.headLineWarnDeg ? 'fault' : 'ok' });
  }

  const readableFrames = Math.max(hipSeries.length, barSeries.length, headSeries.length);
  return { faults, readableFrames, note: summaryLine(faults) };
}

// External-focus, action cues — "lift set-up", never posture/health, no injury or risk claim. All three CueRule
// levels are filled in even though this is a one-shot check (patterns.ts's CueRule requires them, matching
// pushupAudit.ts's shape): `escalate` for "still like this after resetting once", `regress` for "try it this way
// instead of the bar for now".
// MIRROR-COACH P9 (2026-09-30): reworded to FEL's external-focus policy (lib/coach/cueLint.ts, whose test lints this
// table): a cue that names a body part leads with the floor, the wall, the ceiling, the camera or the load, and nothing
// names a muscle to squeeze or feel. The fault each line answers, and its three levels, are unchanged.
export const SETUP_CUES: readonly CueRule[] = [
  {
    faultId: 'hipHeight',
    cue: 'Sit your hips down level with the bar — let your knees add the bend, not your back.',
    escalate: 'Still riding high. Touch the bar to the floor from a dead stop before you set up again.',
    regress: 'Set up from blocks or a rack pin a few inches up, so the hips do not have as far to travel yet.',
  },
  {
    faultId: 'barLine',
    cue: 'Bring your shoulders over the bar — chest up and over your hands.',
    escalate: 'Still behind it. Walk the bar back until it is under your armpits before you set your hands.',
    regress: 'Set up with the bar (or a light bag) a hand-width closer than feels natural, and find the line from there.',
  },
  {
    faultId: 'headLine',
    cue: 'Eyes to a spot on the floor a few feet ahead — one long line, ears to hips, before you pull.',
    escalate: 'Find that spot on the floor first, hold your eyes on it, then hinge into the set-up without losing the line.',
    regress: 'Set up facing a wall a few feet off and keep your eyes on the same spot the whole time.',
  },
];

/** The Movement Screen's registry entry — a 5-second held check, side-on, no bracing cue, so youthSafe throughout. */
export const setupLinePattern: MirrorPattern = {
  id: 'setupLine', label: 'Lift set-up', view: 'side',
  timed: { seconds: 5 },
  audit: auditSetup,
  cues: SETUP_CUES,
  youthSafe: true,
};
