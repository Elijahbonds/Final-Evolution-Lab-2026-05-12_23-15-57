// lib/program-ask/slots.ts — PROGRAM-ASK (2026-11-02): which REAL library entries can fill each slot of a session.
//
// A slot is a movement job (a knee-dominant squat, a hinge, a horizontal pull …). Its matcher reads only the library's
// structured tags (pattern, family, laterality, category, primary muscles) plus a few words of the name where the tags do
// not say it (a row is horizontal, a pulldown vertical). Nothing is invented: a slot with no matching entry is filled by
// the best real stand-in, and the program says so in plain words (STAND_INS).
//
// SAFETY, IN THE FILTER (not left to the ranking):
//   · youth (under 18, or no birth year): adults-only entries (`youthOk: false`) never; jump work never;
//   · jump work (lib/coach/protocolGate.ts gatedKind — a plyometric, a Jump & Land layer, a depth drop — plus anything
//     whose name or demo loop is a jump, hop, bound, skip or burpee) only when the protocol gate is open, for an adult;
//   · a depth drop never, gate or not (owner decision #22: no depth drop in any week);
//   · equipment: only what the person has, plus a wall and a floor (mat). An entry that needs something its tags do not
//     list (an inverted row needs a bar, anything with a partner needs a partner) is read as needing it (IMPLIED);
//   · rejected entries never. Draft entries are used, as the owner-approved signature programs use them (119 of their 132
//     exercises are library drafts); assumption, flagged in the report.
//
// Pure.
import { gatedKind } from '@/lib/coach/protocolGate';
import { isDepthDrop } from '@/lib/workout/plan-generator';
import type { LibraryExercise } from '@/lib/library/types';
import { levelRank, type LevelId } from '@/lib/library/vocab';
import type { AgeBand, SlotId } from './types';

/** Always there: a wall and a floor to lie on. */
export const AMBIENT: readonly string[] = ['wall', 'mat'];

/** Kit the tags do not list but the movement needs. */
const IMPLIED: readonly [RegExp, string][] = [
  [/\binverted row\b/i, 'pull-up-bar'],
  [/\bbody tricep press\b|\bbody-up\b/i, 'pull-up-bar'],
  [/\bpartner\b/i, 'partner'],
  [/\bglute[- ]ham raise\b|\bnordic\b/i, 'partner'],
];

export function needs(e: Pick<LibraryExercise, 'name' | 'equipment'>): string[] {
  const out = new Set<string>(e.equipment);
  for (const [re, kit] of IMPLIED) if (re.test(e.name)) out.add(kit);
  return [...out];
}

export const fitsKit = (e: Pick<LibraryExercise, 'name' | 'equipment'>, owned: readonly string[]): boolean =>
  needs(e).every((x) => AMBIENT.includes(x) || owned.includes(x));

const IMPACT_WORDS = /\b(jumps?|jumping|hops?|hopping|bounds?|bounding|skips?|skipping|burpees?|jacks?|plyo\w*|pogos?|leaps?|depth)\b/i;

/** Jump work: anything that leaves the floor and lands. The protocol gate's own test first, then the name and the loop. */
export function isImpact(e: Pick<LibraryExercise, 'name' | 'category' | 'skillLayer'> & { demo?: { clipKey?: string } }): boolean {
  return gatedKind({ name: e.name, category: e.category, skillLayer: e.skillLayer }) !== null || IMPACT_WORDS.test(e.name) || e.demo?.clipKey === 'jump';
}

const prim = (e: LibraryExercise, ...m: string[]) => e.primaryMuscles.some((x) => (m as string[]).includes(x));
const fam = (e: LibraryExercise, ...f: string[]) => f.includes(e.family);
const name = (e: LibraryExercise, re: RegExp) => re.test(e.name);

/** The slot's job, read from tags. */
export const SLOT_MATCH: Record<SlotId, (e: LibraryExercise) => boolean> = {
  knee: (e) => e.pattern === 'squat' && e.laterality === 'bilateral' && prim(e, 'quads') && ['strength', 'prehab'].includes(e.category)
    && !fam(e, 'single-leg-squat') && !name(e, /terminal knee|knee extension|sissy|walk/i) && typeof e.dosage.meters !== 'number',
  hinge: (e) => e.pattern === 'hinge' && e.laterality !== 'unilateral' && e.category === 'strength' && prim(e, 'glutes', 'hamstrings')
    && !fam(e, 'leg-curl', 'hamstring-curl', 'back-extension'),
  single: (e) => e.category === 'strength' && ((e.pattern === 'lunge') || (e.pattern === 'squat' && e.laterality !== 'bilateral')
    || (e.pattern === 'hinge' && fam(e, 'single-leg-hinge'))) && prim(e, 'quads', 'glutes', 'hamstrings'),
  hpush: (e) => e.pattern === 'push' && e.category === 'strength' && prim(e, 'chest')
    && (fam(e, 'push-up', 'push-extra', 'standing-cable', 'chest-press', 'floor-press', 'bench-press') || name(e, /push-?up|chest press|floor press/i))
    && !name(e, /handstand|pike/i),
  hpull: (e) => e.pattern === 'pull' && e.category === 'strength' && prim(e, 'lats', 'mid-back')
    && (fam(e, 'row', 'standing-cable', 'inverted-row') || name(e, /\brows?\b/i)) && !name(e, /upright/i),
  vpush: (e) => e.pattern === 'push' && e.category === 'strength' && prim(e, 'delts')
    && (fam(e, 'overhead-press', 'pike', 'handstand') || name(e, /pike|overhead press|shoulder press|handstand/i)),
  vpull: (e) => e.pattern === 'pull' && e.category === 'strength' && prim(e, 'lats')
    && (fam(e, 'vertical-pull', 'pull-up', 'chin-up', 'pull-extra', 'lat-pulldown') || name(e, /pull-?down|pull-?up|chin-?up/i)),
  antiExt: (e) => e.category === 'core' && (fam(e, 'plank', 'dead-bug', 'trunk-flexion', 'rollout') || name(e, /dead bug|\bplank\b|hollow|rollout/i))
    && !name(e, /side plank|side bridge|bird dog|partner|crunch|sit-?up/i) && !(fam(e, 'trunk-flexion') && !name(e, /hollow/i)),
  antiRot: (e) => e.category === 'core' && (fam(e, 'anti-rotation', 'pallof-matrix', 'side-plank') || name(e, /pallof|side plank|side bridge|bird dog/i))
    && !name(e, /partner|chop|twist|russian|rotate-out|wiper/i),
  calf: (e) => fam(e, 'calf-raise') || (e.category === 'strength' && prim(e, 'calves') && name(e, /calf/i)),
  biceps: (e) => e.pattern === 'pull' && prim(e, 'biceps') && name(e, /curl/i),
  triceps: (e) => e.pattern === 'push' && prim(e, 'triceps') && (fam(e, 'triceps', 'triceps-accessory') || name(e, /triceps|pushdown|skull/i)) && !name(e, /push-?up/i),
  rear: (e) => e.pattern === 'pull' && prim(e, 'rear-delts', 'mid-back', 'delts') && (fam(e, 'rear-delt-face-pull', 'upper-back') || name(e, /face pull|pull[- ]apart|reverse fly|back fly/i)),
  power: (e) => (e.category === 'plyometric' || e.category === 'power') && e.level === 'beginner' && e.pattern !== 'push' && !isDepthDrop(e),
  speed: (e) => e.category === 'speed-agility' && e.pattern === 'locomotion',
  cond: (e) => (e.category === 'conditioning' && (fam(e, 'conditioning-circuit', 'crawl') || name(e, /mountain climber|squat thrust|shadow/i)))
    || (['core', 'conditioning'].includes(e.category) && name(e, /\bcrawl\b/i) && !name(e, /interval|partner/i)),
  mobility: (e) => e.category === 'mobility' && e.pattern === 'mobility',
};

/** Slots a person's band (or other loading kit) does the job better in than their bodyweight alone. */
export const PREFERS_KIT: ReadonlySet<SlotId> = new Set<SlotId>(['hpull', 'vpull', 'vpush', 'hinge', 'rear', 'biceps', 'triceps', 'antiRot', 'calf']);
/** Kit that loads a lift (a person with any of these gets loaded squats and presses over bodyweight ones). */
export const LOADING_KIT: readonly string[] = ['dumbbell', 'kettlebell', 'barbell', 'trap-bar', 'sandbag', 'weight-vest', 'landmine', 'cable', 'machine'];

export interface Eligibility {
  owned: readonly string[];
  level: LevelId;
  age: AgeBand;
  /** The protocol gate's verdict for this person today (adults only can be open). */
  jumpsOpen: boolean;
  lowLoad: readonly string[];
}

/** May this entry appear in this person's program at all? (Every rule here is a hard rule, held by program-ask.test.ts.) */
export function eligible(e: LibraryExercise, el: Eligibility): boolean {
  if (e.review.status === 'rejected') return false;
  if (!fitsKit(e, el.owned)) return false;
  if (levelRank(e.level) > levelRank(el.level)) return false;
  if (isDepthDrop(e)) return false;
  if (el.age !== 'adult' && !e.youthOk) return false;
  if (isImpact(e) && (el.age !== 'adult' || !el.jumpsOpen)) return false;
  if (el.age === 'child' && e.level !== 'beginner') return false;
  return true;
}

/** A counted entry (reps) or a timed one (a hold, an interval). */
export const isTimedEntry = (e: LibraryExercise): boolean => typeof e.dosage.seconds === 'number'
  && (!e.dosage.reps || /\b(?:sit|hold|isometric|plank|hang|carry|march|crawl|walk)\b/i.test(e.name));
export const perSideEntry = (e: LibraryExercise): boolean => e.laterality !== 'bilateral' || /each side|each leg|each arm/i.test(e.dosage.reps ?? '');

/** The base of an entry's group (a variant's base, else itself). */
export const baseIdOf = (e: LibraryExercise): string => e.variantOf ?? e.id;
