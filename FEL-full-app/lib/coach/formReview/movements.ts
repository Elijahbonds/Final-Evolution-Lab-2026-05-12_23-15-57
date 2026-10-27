// lib/coach/formReview/movements.ts — COACH-VIDEO-REVIEW (2026-10-24): which program exercises the camera can review,
// and the words it uses about them.
//
// The owner's edge over TrueCoach / ATG / CoachNow (docs/COACH-COMPETITIVE-AUDIT.md): their coaches watch every client
// video by hand; here the camera counts the reps and flags the bad one. Nothing here grades: the grading is the Mirror's
// own tested audits (squat-audit.ts, lungeAudit.ts, hingeAudit.ts, pushupAudit.ts), read rep by rep by ./reader.ts. This
// file only says which movement a program exercise is, the coaching order of its faults (the order each audit's live
// coach already uses), what each fault is called, and the cue the Mirror already says for it — reused, not rewritten.
//
// Pure data. No new cue copy: every cue line below is an existing CueRule (lib/mirror/*Audit.ts, cue-engine.ts CUES).

import { FAULT_NAMES, sided } from '@/lib/cue-style/names';
import { FAULT_PRIORITY } from '@/lib/babylon/nexus/neuro-mirror/rules/cue-engine';
import type { SquatFault } from '@/lib/babylon/nexus/neuro-mirror/rules/squat-audit';
import type { CueRule } from '@/lib/mirror/patterns';
import { SQUAT_CUES } from '@/lib/mirror/squatPattern';
import { SQUAT_FAULT_LABEL } from '@/lib/mirror/squatStage';
import { LUNGE_CUES } from '@/lib/mirror/lungeAudit';
import { LUNGE_FAULTS, LUNGE_FAULT_LABEL } from '@/lib/mirror/lungeStage';
import { HINGE_CUES } from '@/lib/mirror/hingeAudit';
import { HINGE_FAULTS, HINGE_FAULT_LABEL } from '@/lib/mirror/hingeStage';
import { PUSHUP_CUES } from '@/lib/mirror/pushupAudit';
import { PUSHUP_FAULTS, PUSHUP_FAULT_LABEL } from '@/lib/mirror/pushupStage';

export type ReviewMovement = 'squat' | 'lunge' | 'hinge' | 'pushup';
export const REVIEW_MOVEMENTS: readonly ReviewMovement[] = ['squat', 'lunge', 'hinge', 'pushup'];
export type FaultSide = 'left' | 'right' | 'both';

const SQUAT_FAULTS: readonly SquatFault[] = FAULT_PRIORITY.filter((f): f is SquatFault =>
  (['kneeValgus', 'heelRise', 'armFall', 'lateralShift', 'shallow'] as const).includes(f as SquatFault));

export interface MovementSpec {
  id: ReviewMovement;
  label: string;
  /** How the phone must see the body (the audit's own view). */
  view: 'front' | 'side';
  /** The faults the review can report, in coaching order (safety first): the order each live coach already uses. */
  faults: readonly string[];
  /** The review card's name for a fault (the Mirror's own review labels). */
  label_of: Readonly<Record<string, string>>;
  /** The fault's existing cue card (cue / escalate / regress), the Mirror's own reviewed copy. */
  cues: readonly CueRule[];
  /** How to set the phone up, one line, said before recording. */
  setup: string;
}

export const MOVEMENT_SPECS: Readonly<Record<ReviewMovement, MovementSpec>> = {
  squat: {
    id: 'squat', label: 'Squat', view: 'front', faults: SQUAT_FAULTS, label_of: SQUAT_FAULT_LABEL, cues: SQUAT_CUES,
    setup: 'Phone at hip height, 2 to 3 m away, facing you. Stand still for a second, then do your set.',
  },
  lunge: {
    id: 'lunge', label: 'Lunge', view: 'front', faults: LUNGE_FAULTS, label_of: LUNGE_FAULT_LABEL, cues: LUNGE_CUES,
    setup: 'Phone at hip height, 2 to 3 m away, facing you. Get in your stance, stand still, then go.',
  },
  hinge: {
    id: 'hinge', label: 'Hip hinge', view: 'side', faults: HINGE_FAULTS, label_of: HINGE_FAULT_LABEL, cues: HINGE_CUES,
    setup: 'Side-on to the phone, 2 to 3 m away, at hip height. Stand tall and still, then go.',
  },
  pushup: {
    id: 'pushup', label: 'Push-up', view: 'side', faults: PUSHUP_FAULTS, label_of: PUSHUP_FAULT_LABEL, cues: PUSHUP_CUES,
    setup: 'Phone on the floor, side-on, 2 m away. Hold the top of your push-up still, then go.',
  },
};

/**
 * The short form of a fault for a flag line: "<this> on rep 4". Movement words only, what the camera saw (the same rule
 * the review labels keep). A knee fault takes its side in front ("Left knee caves").
 */
// CUE-REWRITE (2026-10-27): the flag line uses the canonical fault names (lib/cue-style/names.ts) — the same words the
// Mirror's review card and the Quick Screen use ("Knees cave in", "Heels lift"), not a third set ("knee caves", "Torso
// drifts", "Stops short").
const SHORT: Readonly<Record<ReviewMovement, Readonly<Record<string, string>>>> = {
  squat: { kneeValgus: FAULT_NAMES.kneeCave, heelRise: FAULT_NAMES.heelLift, armFall: FAULT_NAMES.shoulderShift, lateralShift: FAULT_NAMES.weightShift, shallow: FAULT_NAMES.notDeep },
  lunge: { kneeIn: FAULT_NAMES.frontKneeCave, hipDrop: FAULT_NAMES.hipTip, torsoDrift: FAULT_NAMES.upperBodyDrift, wobble: FAULT_NAMES.kneeWobble, shallow: FAULT_NAMES.notDeep },
  hinge: { dowelLine: FAULT_NAMES.backBends, hingeRatio: FAULT_NAMES.kneesTooMuch, shinAngle: FAULT_NAMES.shinsForward },
  pushup: { bodyLine: FAULT_NAMES.hipsOffLine, handSetup: FAULT_NAMES.handsNotUnder, headLine: FAULT_NAMES.headOffLine, depth: FAULT_NAMES.notDeep },
};
/** The faults whose line names a side ("Left knee caves in"). */
const SIDED: ReadonlySet<string> = new Set(['squat:kneeValgus', 'lunge:kneeIn', 'lunge:wobble']);

/** "Left knee caves in", "Both knees cave in", "Heels lift". */
export function faultPhrase(movement: ReviewMovement, fault: string, side: FaultSide | null | undefined): string {
  const s = SHORT[movement][fault] ?? MOVEMENT_SPECS[movement].label_of[fault] ?? fault;
  if (!SIDED.has(`${movement}:${fault}`)) return s;
  return sided(s, side ?? null);
}

/** The Mirror's own cue for this fault (CueRule.cue), or null. */
export function cueFor(movement: ReviewMovement, fault: string): CueRule | null {
  return MOVEMENT_SPECS[movement].cues.find((c) => c.faultId === fault) ?? null;
}

/** Is this one of the movement's faults? (A submission naming any other id is refused.) */
export function isFault(movement: ReviewMovement, fault: string): boolean {
  return MOVEMENT_SPECS[movement].faults.includes(fault);
}

export function isReviewMovement(v: unknown): v is ReviewMovement {
  return typeof v === 'string' && (REVIEW_MOVEMENTS as readonly string[]).includes(v);
}

/**
 * Which review a program exercise gets, or null when the camera cannot read it. The catalogue's pattern tag decides,
 * with the name breaking the cases a pattern alone gets wrong: a split squat is tagged 'squat' or 'lunge' but stands like
 * a lunge; a push-up is tagged 'push' with every bench and overhead press, and only the push-up is readable from the
 * floor. An untagged row is read by its name. assumption: name matching in English (the catalogue's language).
 */
export function reviewMovementFor(ex: { pattern?: string | null; name: string }): ReviewMovement | null {
  const n = ex.name.toLowerCase();
  if (/\b(push|press)[\s-]?ups?\b/.test(n)) return 'pushup';
  if (/\blunges?\b|split[\s-]?squat|bulgarian/.test(n)) return 'lunge';
  if (ex.pattern === 'squat') return 'squat';
  if (ex.pattern === 'lunge') return 'lunge';
  if (ex.pattern === 'hinge') return 'hinge';
  if (ex.pattern) return null;
  if (/\bsquats?\b/.test(n)) return 'squat';
  if (/deadlift|\brdl\b|\bhinge\b|good[\s-]?morning/.test(n)) return 'hinge';
  return null;
}
