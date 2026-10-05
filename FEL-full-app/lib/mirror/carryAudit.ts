// carryAudit — the timed carry station (MIRROR-COACH P4, 2026-09-29): a suitcase or farmer carry marched IN PLACE
// (a living room has no walkway to actually carry across the room, and DECISIONS.md #9 asked for this station
// anyway — marching in place is the only way to hold the pose long enough to read it), read from the FRONT.
//
// WHAT IT READS. Four checks, every one of them from the shoulder / hip / ankle landmarks alone (2-D, front view):
//
//   trunkSideLean   the shoulder line's own tilt IN EXCESS of the hip line's tilt — see "why three checks from
//                   two tilts" below.
//   hipHike         the loaded side's hip riding up, in hip-half-widths (lungeAudit.ts's own unit, one pattern
//                   over, for the same idea).
//   shoulderShrug   the loaded side's shoulder riding up, in shoulder-half-widths — its OWN reading, not derived
//                   from hipHike (see below).
//   rhythm          how STEADY the march's cadence is, from the (left ankle y − right ankle y) oscillation; a
//                   0..1 score, 1 = perfectly even steps. This is the only one of the four that is not a lean —
//                   it is a data-quality-aware read, and reads 'unreadable' below its own 2-D jitter floor rather
//                   than ever claiming a still or barely-moving body is "perfectly steady" (see CARRY_THRESHOLDS).
//
// Every value this file reports is an unsigned MAGNITUDE, never a claimed DIRECTION of compensation — the
// HONESTY RULE: the camera saw a tilt, not why the athlete tilted, and 33 2-D landmarks cannot see a rib cage, an
// abdomen or a breath. Nothing here is called "posture" and nothing here is scored against a diagnosis. Cues use
// "builds capacity" language and FEL's own words (IP RULE) — never the book's.
//
// WHY THREE CHECKS FROM TWO TILTS. With only 4 points (2 shoulders, 2 hips) there are two independent numbers:
// the hip line's own tilt (H) and the shoulder line's own tilt (S), both measured the SAME way (left landmark's y
// minus right landmark's y, over that pair's own half-width — y is DOWN, so + means the subject's LEFT side sits
// HIGHER on screen). hipHike reports |H|, shoulderShrug reports |S|, trunkSideLean reports |S − H| — the part of
// the shoulder tilt the hip tilt does not already explain. A pure hip hike carried up a rigid trunk (S ≈ H) reads
// hipHike AND shoulderShrug but NOT trunkSideLean; an isolated shoulder shrug over a level pelvis (H ≈ 0) reads
// shoulderShrug AND trunkSideLean, because with the pelvis level there is nothing else that tilt could be. Both
// of those are real, independently true, camera-measurable statements about what the two LINES did — this audit
// reports what each line did, never which muscle did it or why.
//
// THE CONTRACT. lib/mirror/patterns.ts (MirrorPattern / PatternReading / PatternFaultReading / CueRule /
// MirrorPatternContext) landed mid-phase from the push-and-overhead lane, which reached it before "lane 1" had and
// wrote it from the brief's own wording rather than leave its two finished audits with nothing to register into
// (see that file's own header). This file imports the real contract below. PersonalBaseline is THIS lane's own —
// patterns.ts originally stubbed it as a bare value map and now re-exports lib/mirror/baselines.ts's real one (see
// that type's comment in patterns.ts): a flat map cannot carry "how many sessions is this built from", which the
// brief's own "building your baseline (n/3)" needs.
import type { PoseFrame } from '@/lib/pose/landmarks';
import { LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP, LEFT_ANKLE, RIGHT_ANKLE } from '@/lib/pose/landmarks';
import type { CueRule, MirrorPattern, MirrorPatternContext, PatternFaultReading, PatternReading } from './patterns';
import { compareToBaseline, describeBaseline, type PersonalBaseline } from './baselines';

/** The default hold, and the two other choices the harness offers (this phase's brief: "default 30 s, choice 20/30/45"). */
export const CARRY_DURATIONS = [20, 30, 45] as const;
export type CarryDurationSeconds = typeof CARRY_DURATIONS[number];
export const CARRY_DEFAULT_SECONDS: CarryDurationSeconds = 30;

/**
 * Every number this audit tunes, in ONE table (this phase's own rule). Comments say what each one is and, where a
 * threshold was MEASURED rather than judged, how — the rest are FEL judgement, conservative, tagged TUNE(elijah)
 * the same way squat/lunge's own tables are.
 */
export const CARRY_THRESHOLDS = {
  /** A landmark counts as seen at all. Matches lungeAudit's own bar (LUNGE_THRESHOLDS.minVis). */
  minVis: 0.5,
  /**
   * Shoulder-pair image separation below this reads as turned away from the camera, not face-on. MEASURED: a
   * still body rotated about the vertical through lib/mirror/fixtures/build.ts's own FIXTURE_CAMERA gives a
   * shoulder width of 0.110 face-on, 0.078 at 45°, 0.055 at 60°, 0 at 90° (this rig has no torso depth, so an
   * exact side-on view collapses it to a single point). Set at just under half the face-on width — a stance can
   * wander ±45° and still read; past roughly 60° of turn it cannot — FEL judgement, conservative.
   */
  minShoulderWidth: 0.05,
  /** The same idea for the hip pair (0.052 face-on, 0.026 at 60° by the same measurement). */
  minHipWidth: 0.02,
  /** Below this many BODY-readable frames, nothing is scored at all — a third of a second at 30 fps is a glance
   *  someone caught mid-turn, not a read. */
  minReadableFrames: 10,
  /** Hip-half-widths the loaded hip may ride up before it reads as a hike. Same SCALE as lungeAudit's
   *  hipDropWarn (0.18, a different pattern's pelvis, the same body). TUNE(elijah). */
  hipHikeFault: 0.18,
  /** Shoulder-half-widths the loaded shoulder may ride up before it reads as a shrug. TUNE(elijah). */
  shoulderShrugFault: 0.18,
  /** How far the shoulder line's own tilt may exceed the hip line's before it reads as a trunk lean, same
   *  half-width units. Set LOOSER than the other two on purpose: it is a difference of two noisy measurements,
   *  so it inherits both of their noise. TUNE(elijah). */
  trunkSideLeanFault: 0.22,
  /**
   * The 2-D jitter floor for the rhythm check's own signal (left-ankle-y − right-ankle-y), peak-to-peak, in
   * normalised image units. MEASURED: 300 frames of a DEAD-STILL body filmed through lib/pose/synth's own
   * DEFAULT_NOISE model (5 seeds) gave 0.036–0.045 peak-to-peak on this exact differenced signal (see this
   * phase's probe; the numbers are quoted in carryAudit.test.ts's own comment so they stay checked against the
   * synth rather than just asserted here). Set with headroom above the worst seed: below this, an oscillation
   * cannot be told from sensor noise, so rhythm reads 'unreadable' — never a false "perfectly steady" for a body
   * that the camera simply cannot resolve stepping.
   */
  rhythmJitterFloorPtp: 0.06,
  /** Fewer than this many step-to-step intervals (zero-crossings of the signal above) is not enough to say
   *  anything about a RHYTHM, whatever its amplitude. */
  minStepIntervals: 2,
  /** Steadiness (1 − the coefficient of variation of the step-to-step intervals, clamped 0..1) below this reads
   *  as a fault — one side rushed, or favoured. TUNE(elijah). */
  rhythmSteadyFault: 0.6,
} as const;

export type CarryFaultId = 'trunkSideLean' | 'hipHike' | 'shoulderShrug' | 'rhythm';
type CheckDirection = 'lowerIsBetter' | 'higherIsBetter';
const CHECK_DIRECTION: Record<CarryFaultId, CheckDirection> = {
  trunkSideLean: 'lowerIsBetter', hipHike: 'lowerIsBetter', shoulderShrug: 'lowerIsBetter', rhythm: 'higherIsBetter',
};

/** A camera fact this audit can add to a fault beyond the base contract (see patterns.ts note above): the athlete's
 *  own history compared against this reading, when one was passed in. Never read to set `status` — see baselines.ts. */
export interface CarryFault extends PatternFaultReading { vsBaseline?: string }
export interface CarryReading extends PatternReading { faults: CarryFault[] }

interface Readable { ls: { x: number; y: number }; rs: { x: number; y: number }; lh: { x: number; y: number }; rh: { x: number; y: number }; shoulderHalf: number; hipHalf: number }

function seen(v: number | undefined): boolean { return typeof v === 'number' && v >= CARRY_THRESHOLDS.minVis; }

/** Front-enough AND every needed landmark visible, or null (the frame does not count toward readableFrames). */
function readBody(f: PoseFrame): Readable | null {
  if (!f.present || !f.image.length) return null;
  const ls = f.image[LEFT_SHOULDER], rs = f.image[RIGHT_SHOULDER], lh = f.image[LEFT_HIP], rh = f.image[RIGHT_HIP];
  if (!ls || !rs || !lh || !rh || ![ls.v, rs.v, lh.v, rh.v].every(seen)) return null;
  const shoulderW = Math.abs(ls.x - rs.x), hipW = Math.abs(lh.x - rh.x);
  if (shoulderW < CARRY_THRESHOLDS.minShoulderWidth || hipW < CARRY_THRESHOLDS.minHipWidth) return null;
  return { ls, rs, lh, rh, shoulderHalf: Math.max(1e-4, shoulderW / 2), hipHalf: Math.max(1e-4, hipW / 2) };
}

/** Both ankles ALSO visible — the extra bar the rhythm check needs beyond readBody. */
function readAnkles(f: PoseFrame): { la: number; ra: number } | null {
  if (!f.present || !f.image.length) return null;
  const la = f.image[LEFT_ANKLE], ra = f.image[RIGHT_ANKLE];
  if (!la || !ra || !seen(la.v) || !seen(ra.v)) return null;
  return { la: la.y, ra: ra.y };
}

function mean(a: readonly number[]): number { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; }

/** Steadiness of a march from its (left ankle y − right ankle y) trace: 1 − the coefficient of variation of the
 *  step-to-step intervals between the signal's own zero-crossings, clamped 0..1. Interpolates the crossing time
 *  between the two straddling samples so the interval is not just rounded to a frame. */
function stepSteadiness(t: readonly number[], d: readonly number[]): { steadiness: number; ptp: number; intervals: number } {
  const ptp = d.length ? Math.max(...d) - Math.min(...d) : 0;
  const crossings: number[] = [];
  for (let i = 1; i < d.length; i++) {
    const a = d[i - 1], b = d[i];
    if (a === 0 || (a < 0) !== (b < 0)) {
      const u = a === b ? 0 : Math.abs(a) / Math.abs(b - a);
      crossings.push(t[i - 1] + (t[i] - t[i - 1]) * u);
    }
  }
  if (crossings.length < 2) return { steadiness: 0, ptp, intervals: 0 };
  const intervals = crossings.slice(1).map((c, i) => c - crossings[i]);
  const m = mean(intervals);
  const sd = Math.sqrt(mean(intervals.map((v) => (v - m) ** 2)));
  const cv = m > 0 ? sd / m : 1;
  return { steadiness: Math.max(0, Math.min(1, 1 - cv)), ptp, intervals: intervals.length };
}

function round(v: number, dp = 3): number { const k = 10 ** dp; const r = Math.round(v * k) / k; return Object.is(r, -0) ? 0 : r; }

function baselineNote(value: number, id: CarryFaultId, side: 'left' | 'right' | undefined, baseline: PersonalBaseline | undefined): string | undefined {
  if (!baseline) return undefined;
  const checkId = side ? `${id}:${side}` : id;
  return describeBaseline(compareToBaseline(value, checkId, CHECK_DIRECTION[id], baseline));
}

/**
 * The carry's audit: a pure function over the WHOLE frame history handed in so far (the contract's own shape —
 * no running state kept here). `ctx.side` is the loaded side the athlete (or the harness's own picker) told us,
 * NEVER inferred from the image — a suitcase carry cannot be told apart from a farmer carry by geometry alone,
 * and guessing which hand holds the weight from a lean would be diagnosing the fault from itself.
 */
export function auditCarry(frames: readonly PoseFrame[], ctx: MirrorPatternContext = {}): CarryReading {
  const T = CARRY_THRESHOLDS;
  const bodies: { t: number; b: Readable }[] = [];
  const ankleSeries: { t: number; d: number }[] = [];
  for (const f of frames) {
    const b = readBody(f);
    if (b) {
      bodies.push({ t: f.t, b });
      const a = readAnkles(f);
      if (a) ankleSeries.push({ t: f.t, d: a.la - a.ra });
    }
  }

  const unreadable = (id: CarryFaultId, value = 0): CarryFault => ({ id, side: ctx.side, value, unit: unitFor(id), status: 'unreadable' });

  if (bodies.length < T.minReadableFrames) {
    return {
      faults: (['trunkSideLean', 'hipHike', 'shoulderShrug', 'rhythm'] as const).map((id) => unreadable(id)),
      readableFrames: bodies.length,
      note: bodies.length === 0 ? 'turn to face the camera — the carry reads from the front' : 'hold the carry a little longer so the camera can get a steady read',
    };
  }

  // hip/shoulder tilt, SIGNED the same way for both (left landmark's y minus right's, over that pair's own
  // half-width; y is down, so + = the subject's LEFT side sits higher) — averaged across the whole readable
  // window so the natural side-to-side sway of marching (which alternates sign every step) cancels out and only
  // a CONSISTENT bias survives. This is the same "measure over a window, not one frame" lesson this phase's other
  // lanes applied to the squat's heel cue, applied here from the start.
  const hipTiltSigned = mean(bodies.map(({ b }) => (b.rh.y - b.lh.y) / b.hipHalf));
  const shoulderTiltSigned = mean(bodies.map(({ b }) => (b.rs.y - b.ls.y) / b.shoulderHalf));
  const hipHike = Math.abs(hipTiltSigned);
  const shoulderShrug = Math.abs(shoulderTiltSigned);
  const trunkSideLean = Math.abs(shoulderTiltSigned - hipTiltSigned);

  const lean: CarryFault = {
    id: 'trunkSideLean', side: ctx.side, value: round(trunkSideLean), unit: 'hipHalfWidths',
    status: trunkSideLean >= T.trunkSideLeanFault ? 'fault' : 'ok',
    vsBaseline: baselineNote(round(trunkSideLean), 'trunkSideLean', ctx.side, ctx.baseline),
  };
  const hike: CarryFault = {
    id: 'hipHike', side: ctx.side, value: round(hipHike), unit: 'hipHalfWidths',
    status: hipHike >= T.hipHikeFault ? 'fault' : 'ok',
    vsBaseline: baselineNote(round(hipHike), 'hipHike', ctx.side, ctx.baseline),
  };
  const shrug: CarryFault = {
    id: 'shoulderShrug', side: ctx.side, value: round(shoulderShrug), unit: 'shoulderHalfWidths',
    status: shoulderShrug >= T.shoulderShrugFault ? 'fault' : 'ok',
    vsBaseline: baselineNote(round(shoulderShrug), 'shoulderShrug', ctx.side, ctx.baseline),
  };

  const { steadiness, ptp, intervals } = stepSteadiness(ankleSeries.map((s) => s.t), ankleSeries.map((s) => s.d));
  const rhythmReadable = ankleSeries.length >= T.minReadableFrames && ptp >= T.rhythmJitterFloorPtp && intervals >= T.minStepIntervals;
  const rhythm: CarryFault = rhythmReadable
    ? {
        id: 'rhythm', side: ctx.side, value: round(steadiness), unit: 'steadiness01',
        status: steadiness < T.rhythmSteadyFault ? 'fault' : 'ok',
        vsBaseline: baselineNote(round(steadiness), 'rhythm', ctx.side, ctx.baseline),
      }
    : unreadable('rhythm');

  const faultWords = [lean.status === 'fault' && 'trunk lean', hike.status === 'fault' && 'hip hike', shrug.status === 'fault' && 'shoulder shrug']
    .filter((v): v is string => !!v);
  const note = faultWords.length ? `what the camera saw: ${faultWords.join(', ')}` : 'what the camera saw: level through the march';

  return { faults: [hike, shrug, lean, rhythm], readableFrames: bodies.length, note };
}

function unitFor(id: CarryFaultId): string {
  return id === 'rhythm' ? 'steadiness01' : id === 'shoulderShrug' ? 'shoulderHalfWidths' : 'hipHalfWidths';
}

/** FEL's own coaching lines (IP RULE: never the book's names or copy), three levels of insistence (cue-engine.ts's
 *  own CueCard shape, adopted by patterns.ts's CueRule so a phase-5 lane can hand these straight to that engine) —
 *  set-up language throughout, never diagnosis, nothing that reads as a max-effort brace (owner decision #6 below). */
// MIRROR-COACH P9 (2026-09-30): reworded to FEL's external-focus policy (lib/coach/cueLint.ts, whose test lints this
// table): a cue that names a body part leads with the floor, the wall, the ceiling, the camera or the load, and nothing
// names a muscle to squeeze or feel. The fault each line answers, and its three levels, are unchanged.
export const CARRY_CUES: readonly CueRule[] = [
  { faultId: 'hipHike', cue: 'Keep the belt line level as you step — no hiking up on the loaded side.',
    escalate: 'Still hiking. Shorten the step until the belt line stays level.',
    regress: 'Set the weight down. Just march the pattern, hips level, then pick it back up.' },
  { faultId: 'shoulderShrug', cue: 'Let the load pull that arm long — the shoulder stays away from your ear.',
    escalate: 'Still riding up. Switch the load to the other hand for a set and come back to this one.',
    regress: 'A lighter load, the same long arm — let the load hang it, then build back up.' },
  { faultId: 'trunkSideLean', cue: 'Grow tall toward the ceiling — shoulders level over your hips.',
    escalate: 'Still leaning off to one side. Slow the march and find the tall line before you speed back up.',
    regress: 'Hold the tall line standing still first, no march, then add the steps back in.' },
  { faultId: 'rhythm', cue: 'Find one even beat and keep it for every step.',
    escalate: 'The beat is still uneven. Count it out loud, same count every step.',
    regress: 'Slow it right down — an even, unhurried step matters more than a fast one.' },
];

/**
 * Registered into MIRROR_PATTERNS (lib/mirror/patterns.ts) as a third entry alongside push-up and overhead reach —
 * it did not need to wait for the squat, since the brief only asks that the squat specifically land first. A
 * suitcase or farmer carry, marched in place, is an ordinary loaded-carry drill with no max-effort bracing cue in
 * its list above — youthSafe: true (owner decision #6; the harness's own isMinorForMirror() gate decides who sees
 * which cues, this pattern has nothing in CARRY_CUES that needs hiding from a minor).
 */
export const CARRY_PATTERN: MirrorPattern = {
  id: 'carry',
  label: 'Loaded carry',
  view: 'front',
  timed: { seconds: CARRY_DEFAULT_SECONDS },
  audit: auditCarry,
  cues: CARRY_CUES,
  youthSafe: true,
};
