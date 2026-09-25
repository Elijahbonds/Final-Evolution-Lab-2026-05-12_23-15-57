// chart — what a body drill IS, as data (movement play, phase 9, 2026-09-24).
//
// A drill is a list of phases; a phase is a timed chart of body targets (bodyTargets.ts: a move, a limb, sometimes a
// zone on the self-view) and the coach's prompts at the beats they belong to. The Playbook drills (drills.ts) are
// written in this shape; the DrillRunner plays it against the body's events; the cue lane draws it.
//
// Times are SECONDS FROM THE PHASE'S START on the drill's own clock, which only runs while the body is in frame.
//
// Pure: no DOM, no camera.
import type { DanceStep } from '../babylon/core/DanceCore';
import {
  type CueZone, type Limb, type MoveKind, MOVE_WINDOW_SCALE, lateGraceFor, mirrorLimb,
} from '../babylon/core/bodyTargets';

/** The coach's drill lines (COACH_MOMENTS in lib/babylon/audio/mic/moments.ts; the test holds these to that list). */
export type CoachPrompt =
  | 'coach.drill.intro' | 'coach.drill.go' | 'coach.drill.nice' | 'coach.drill.faster' | 'coach.drill.slower'
  | 'coach.drill.hold' | 'coach.drill.breathe' | 'coach.drill.switch' | 'coach.drill.rest' | 'coach.drill.last'
  | 'coach.drill.done';

/**
 * Where a drill comes from. Every drill names its book, chapter and section (the Playbook's are checked against
 * lib/education/playbook.data.json by the tests). `adapted` says, in one line, what changed to fit a living room with
 * about 2 m of floor and a camera in front (owner's decision: jumping in place, approaches become steps).
 */
export interface DrillSource {
  book: 'playbook' | 'art-of-dunking';
  chapter: number;
  section: string;
  adapted?: string;
}

export interface DrillTarget {
  /** Seconds from the phase's start. */
  t: number;
  move: MoveKind;
  limb?: Limb;
  /** Where on the self-view (0..1, y down, mirrored); the limb that must reach it is the target's limb. */
  zone?: { x: number; y: number };
  /** Stay put this long after the hit (s): a stuck landing, a squat's pause, a balance. */
  holdSec?: number;
  /** What the lane calls it (defaults to the move's name). */
  label?: string;
}

export interface DrillPhase {
  id: string;
  name: string;
  durationSec: number;
  /** 'required': the clock runs only with the body in frame. 'free': a rest, the clock runs regardless. */
  presence: 'required' | 'free';
  /** One line for the screen, in our words. */
  cue: string;
  /** Timed screen lines inside a phase (a guided phase changes exercise without a target). */
  lines?: { t: number; text: string }[];
  targets: DrillTarget[];
  prompts: { t: number; id: CoachPrompt }[];
  /** Running-in-place windows [from, to) whose steps are read for cadence (RhythmCadence) at this rate. */
  cadence?: { stepsPerMin: number; windows: [number, number][] };
  /** A breathing pacer for the screen: inhale / hold / exhale seconds, rounds, from `from`. */
  pacer?: { from: number; inSec: number; holdSec: number; outSec: number; rounds: number };
  /** Set when the phase is its own section of the book (the wake-up's six phases). */
  source?: DrillSource;
}

export interface Drill {
  id: string;
  name: string;
  /** One line on the drills screen. */
  blurb: string;
  source: DrillSource;
  /** What the book says to look at, as ids for the form read (phase 10): knee90, hipsBack, kneeOverFoot … */
  checks: string[];
  phases: DrillPhase[];
}

// ── layout rules (the chart tests hold every drill to these) ─────────────────────────────────────────────────────────

/**
 * The first target of a phase comes no earlier than this: the lane shows a target CUE_LOOKAHEAD_SEC (2.4 s, danceTracks)
 * before it is due, so a target at 3 s is seen for its whole approach, with the phase's opening prompt before it.
 */
export const LEAD_IN_SEC = 3;
/** The first phase of a drill opens with the intro (≤ 12 words, ~4 s at 3 words a second), so its first target waits. */
export const FIRST_LEAD_IN_SEC = 6;
/** The coach speaks one line at a time: the next prompt waits for the last one's words at this rate (~180 wpm). */
export const COACH_WORDS_PER_SEC = 3;

// ── builders ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** `count` alternating foot targets (steps, pogos on one foot …) every `interval` s from `from`, `first` foot first. */
export function alternate(
  from: number, count: number, interval: number, first: 'L' | 'R',
  move: MoveKind = 'step', label?: string,
): DrillTarget[] {
  const out: DrillTarget[] = [];
  for (let k = 0; k < count; k++) {
    const left = (k % 2 === 0) === (first === 'L');
    const limb: Limb = move === 'knee' ? (left ? 'kneeL' : 'kneeR') : (left ? 'footL' : 'footR');
    out.push({ t: round3(from + k * interval), move, limb, ...(label ? { label } : {}) });
  }
  return out;
}

/** `count` identical targets every `interval` s from `from`. */
export function repeat(from: number, count: number, interval: number, target: Omit<DrillTarget, 't'>): DrillTarget[] {
  return Array.from({ length: count }, (_, k) => ({ ...target, t: round3(from + k * interval) }));
}

/** Seconds between steps at a cadence (steps a minute). */
export const stepInterval = (stepsPerMin: number): number => 60 / stepsPerMin;

export const round3 = (x: number): number => Math.round(x * 1000) / 1000;

export const drillLengthSec = (d: Drill): number => d.phases.reduce((s, p) => s + p.durationSec, 0);
export const drillTargetCount = (d: Drill): number => d.phases.reduce((s, p) => s + p.targets.length, 0);

/** A phase run the other way: left and right swapped, zones flipped across the self-view. */
export function mirrorPhase(p: DrillPhase): DrillPhase {
  return {
    ...p,
    targets: p.targets.map((t) => ({
      ...t,
      ...(t.limb ? { limb: mirrorLimb(t.limb) } : {}),
      ...(t.zone ? { zone: { x: round3(1 - t.zone.x), y: t.zone.y } } : {}),
    })),
  };
}

/** The drill run the other way (a left-footed jumper, the other side of a one-sided drill). */
export function mirrorDrill(d: Drill, id = `${d.id}-mirrored`, name = `${d.name} (other side)`): Drill {
  return { ...d, id, name, phases: d.phases.map(mirrorPhase) };
}

/**
 * A phase's targets as judge steps. The drill's clock is seconds, so the judge runs at 60 BPM (one beat = one second).
 * Each step carries its move's window scale and late grace (bodyTargets; a squat held at the bottom waits as long as a
 * hold, lateGraceFor), and a stable id for the lane.
 */
export const DRILL_BPM = 60;
export function phaseSteps(phase: DrillPhase): DanceStep[] {
  return phase.targets.map((t, i) => {
    const zone: CueZone | undefined = t.zone && t.limb ? { x: t.zone.x, y: t.zone.y, limb: t.limb } : undefined;
    return {
      clipId: `${phase.id}#${i}`,
      beat: t.t,
      holdBeats: 0,
      mirrored: false,
      move: t.move,
      ...(t.limb ? { limb: t.limb } : {}),
      ...(zone ? { zone } : {}),
      windowScale: MOVE_WINDOW_SCALE[t.move],
      lateGraceSec: lateGraceFor(t.move, t.holdSec),
      ...(t.label ? { label: t.label } : {}),
      ...(t.holdSec ? { holdSec: t.holdSec } : {}),
    };
  });
}
