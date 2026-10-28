// lib/library/validate.ts — EXERCISE-LIBRARY (2026-10-25): what every library entry must be before anyone sees it.
//
// Run by scripts/library/validate.ts (CLI, prints a report), scripts/library-tests.ts (the CI suite) and the two
// generators (which refuse to write a file that fails). The checks, from the owner brief:
//   1. schema completeness — every field present, with the right shape and within the catalogue's own limits;
//   2. fixed lists — muscles, equipment, pattern, category, level, plane, laterality, sport, goal, joint, skill layer,
//      brace mode, clip key: each value is on its list (lib/library/vocab.ts, demo.ts, lib/coach/taxonomy.ts);
//   3. links resolve — regressionId / progressionId name another real entry, never itself;
//   4. no duplicates — ids, slugs, normalised names (search/text.ts nameKey), aliases that collide with another
//      entry's name, and the (pattern, equipment, family + variation) key;
//   5. cueLint passes — the owner's external-focus policy (lib/coach/cueLint.ts lintCue): set-up and fault
//      descriptions at the instruction tier, cues and fault fixes at the attention tier;
//   6. no medical claims — lib/share/screen.ts screenText on every line (a named condition, a treatment claim, a
//      guarantee), and the prehab note is exactly PREHAB_NOTE on prehab entries and absent elsewhere;
//   7. source and licence present on every entry; review status and batch present; every authored and seed entry
//      that nobody has reviewed is a draft.
// Youth: an entry marked youthOk must carry no max-effort cue (taxonomy.ts MAX_EFFORT_CUE) and no pin (PIN_EXERCISE).
//   8. variants and modifiers (batches 2–4) — `variantOf` names a real BASE entry (never itself, never another variant:
//      one level deep), an entry whose variation ends in `+<modifier>` is a variant of the entry it modifies, the
//      modifier is one on ./modifiers.ts's list, and that modifier's applicability rule accepts the base (no "Paused Plyo
//      …", no "Vertical Swing Against the Clock", no single-arm barbell lift, no seated deficit). check: 'modifier'.

import { lintCue, type CueTier } from '@/lib/coach/cueLint';
import { CATALOGUE_LIMITS } from '@/lib/coach/catalogue';
import { MAX_EFFORT_CUE, PIN_EXERCISE, isSkillLayerId } from '@/lib/coach/taxonomy';
import { screenText } from '@/lib/share/screen';
import { isClipKey } from './demo';
import { modifierById, modifierOf, ruleFailures } from './modifiers';
import { nameKey } from './search/text';
import type { LibraryExercise } from './types';
import {
  CATEGORY_IDS, GOAL_IDS, JOINTS, LATERALITY, LEVEL_IDS, PATTERNS, PLANES, PREHAB_NOTE, REVIEW_STATUSES, SOURCES, SPORT_TAG_IDS,
  isEquipmentId, isMuscleId,
} from './vocab';

export interface Issue { id: string; check: string; detail: string }

export const LIBRARY_LIMITS = {
  name: CATALOGUE_LIMITS.name, aliases: 8, alias: 80, setup: 220, cues: CATALOGUE_LIMITS.cues, cue: CATALOGUE_LIMITS.cue,
  faults: 4, fault: CATALOGUE_LIMITS.fault, cautions: 4, caution: 200,
} as const;

const BRACES = ['set', 'reflex', 'none'];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const URL = /^https?:\/\/[^\s]+$/i;

const inList = (list: readonly string[], v: unknown) => typeof v === 'string' && list.includes(v);
const strArr = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** The near-duplicate key: pattern, sorted equipment, family and variation. */
export const dupKey = (e: Pick<LibraryExercise, 'pattern' | 'equipment' | 'family' | 'variation'>): string =>
  `${e.pattern}|${[...e.equipment].sort().join('+') || 'none'}|${e.family}|${e.variation}`;

/** Name words that only say the load, not the exercise: "Barbell Romanian Deadlift" with a barbell is "Romanian Deadlift". */
const LOAD_WORDS = new Set(['dumbbell', 'kettlebell', 'barbell', 'cabl', 'band', 'machin', 'leverag', 'bodyweight']);

/**
 * The semantic near-duplicate key: pattern, sorted equipment and the name's terms without the load words, so an entry
 * named for its equipment does not slip past one that holds the same equipment in its tags.
 */
export const semanticKey = (e: Pick<LibraryExercise, 'pattern' | 'equipment' | 'name'>): string =>
  `${e.pattern}|${[...e.equipment].sort().join('+') || 'none'}|${nameKey(e.name).split(' ').filter((t) => !LOAD_WORDS.has(t)).join(' ')}`;

/** Every line of an entry the athlete or coach reads, with the tier the cue policy holds it to. */
export function entryLines(e: LibraryExercise): { field: string; text: string; tier: CueTier }[] {
  return [
    { field: 'setup', text: e.setup, tier: 'instruction' as CueTier },
    ...e.cues.map((t, i) => ({ field: `cues[${i}]`, text: t, tier: 'attention' as CueTier })),
    ...e.faults.flatMap((f, i) => [
      { field: `faults[${i}].fault`, text: f.fault, tier: 'instruction' as CueTier },
      { field: `faults[${i}].fix`, text: f.fix, tier: 'attention' as CueTier },
    ]),
    ...e.cautions.map((t, i) => ({ field: `cautions[${i}]`, text: t, tier: 'instruction' as CueTier })),
  ];
}

/** One entry on its own: shape, lists, text policy. */
export function checkEntry(e: LibraryExercise): Issue[] {
  const out: Issue[] = [];
  const id = typeof e?.id === 'string' ? e.id : '(no id)';
  const bad = (check: string, detail: string) => out.push({ id, check, detail });
  const L = LIBRARY_LIMITS;

  // 1. completeness
  if (!e || typeof e !== 'object') { bad('schema', 'not an object'); return out; }
  if (!SLUG.test(e.id ?? '') || e.slug !== e.id) bad('schema', 'id must be a slug equal to slug');
  if (typeof e.name !== 'string' || !e.name.trim() || e.name.length > L.name) bad('schema', `name missing or over ${L.name}`);
  if (!strArr(e.aliases) || e.aliases.length > L.aliases || e.aliases.some((a) => !a.trim() || a.length > L.alias)) bad('schema', 'aliases');
  if (typeof e.family !== 'string' || !e.family || typeof e.variation !== 'string' || !e.variation) bad('schema', 'family / variation');
  if (typeof e.setup !== 'string' || !e.setup.trim() || e.setup.length > L.setup) bad('schema', `setup missing or over ${L.setup}`);
  if (!strArr(e.cues) || e.cues.length < 1 || e.cues.length > L.cues || e.cues.some((c) => !c.trim() || c.length > L.cue)) bad('schema', `cues: 1–${L.cues}, each ≤${L.cue}`);
  if (!Array.isArray(e.faults) || e.faults.length < 1 || e.faults.length > L.faults
    || e.faults.some((f) => typeof f?.fault !== 'string' || typeof f?.fix !== 'string' || !f.fault.trim() || !f.fix.trim() || f.fault.length > L.fault || f.fix.length > L.fault)) {
    bad('schema', `faults: 1–${L.faults}, each with a fault and a fix ≤${L.fault}`);
  }
  if (!strArr(e.cautions) || e.cautions.length > L.cautions || e.cautions.some((c) => c.length > L.caution)) bad('schema', 'cautions');
  if (typeof e.youthOk !== 'boolean') bad('schema', 'youthOk');
  const d = e.dosage;
  if (!d || typeof d.sets !== 'number' || d.sets < 1 || d.sets > 10 || typeof d.restSec !== 'number' || d.restSec < 0
    || (d.reps === undefined && d.seconds === undefined && d.contacts === undefined && d.meters === undefined)) bad('schema', 'dosage needs sets, restSec and one of reps / seconds / contacts / meters');
  if (d?.tempo !== undefined && !/^\d{1,2}-\d{1,2}-\d{1,2}-\d{1,2}$/.test(d.tempo)) bad('schema', 'dosage.tempo format');

  // 2. fixed lists
  if (!inList(PATTERNS, e.pattern)) bad('list', `pattern ${e.pattern}`);
  if (!inList(PLANES, e.plane)) bad('list', `plane ${e.plane}`);
  if (!inList(LATERALITY, e.laterality)) bad('list', `laterality ${e.laterality}`);
  if (!inList(CATEGORY_IDS, e.category)) bad('list', `category ${e.category}`);
  if (!inList(LEVEL_IDS, e.level)) bad('list', `level ${e.level}`);
  if (!strArr(e.equipment) || e.equipment.some((x) => !isEquipmentId(x))) bad('list', `equipment ${JSON.stringify(e.equipment)}`);
  if (new Set(e.equipment).size !== e.equipment?.length) bad('list', 'equipment repeats');
  if (!strArr(e.primaryMuscles) || e.primaryMuscles.length < 1 || e.primaryMuscles.some((x) => !isMuscleId(x))) bad('list', `primaryMuscles ${JSON.stringify(e.primaryMuscles)}`);
  if (!strArr(e.secondaryMuscles) || e.secondaryMuscles.some((x) => !isMuscleId(x))) bad('list', `secondaryMuscles ${JSON.stringify(e.secondaryMuscles)}`);
  if (!strArr(e.sportTags) || e.sportTags.length < 1 || e.sportTags.some((x) => !inList(SPORT_TAG_IDS, x))) bad('list', 'sportTags');
  if (!strArr(e.goals) || e.goals.length < 1 || e.goals.some((x) => !inList(GOAL_IDS, x))) bad('list', `goals ${JSON.stringify(e.goals)}`);
  if (!strArr(e.lowLoad) || e.lowLoad.some((x) => !inList(JOINTS, x))) bad('list', 'lowLoad');
  if (e.skillLayer !== null && !isSkillLayerId(e.skillLayer)) bad('list', `skillLayer ${e.skillLayer}`);
  if (e.braceMode !== null && !inList(BRACES, e.braceMode)) bad('list', `braceMode ${e.braceMode}`);
  if (!e.demo || !isClipKey(e.demo.clipKey)) bad('list', `demo.clipKey ${e.demo?.clipKey}`);
  if (e.demo?.videoUrl !== null && e.demo?.videoUrl !== undefined && !URL.test(e.demo.videoUrl)) bad('schema', 'demo.videoUrl must be http(s)');
  if (e.demo?.imageRef !== null && e.demo?.imageRef !== undefined && !URL.test(e.demo.imageRef)) bad('schema', 'demo.imageRef must be http(s)');

  // 5. the cue policy, line by line
  for (const line of entryLines(e)) {
    const findings = lintCue(line.text, line.tier);
    if (findings.length) bad('cueLint', `${line.field} (${line.tier}): ${findings.map((f) => `${f.rule} "${f.word}"`).join(', ')} — "${line.text}"`);
  }

  // 6. no medical claims; the prehab note
  const allText = [e.name, ...e.aliases, ...entryLines(e).map((l) => l.text)];
  for (const t of allText) {
    const flags = screenText(t);
    if (flags.length) bad('claims', `${flags.map((f) => `${f.kind} "${f.found}"`).join(', ')} — "${t}"`);
  }
  if (e.category === 'prehab' ? e.prehabNote !== PREHAB_NOTE : e.prehabNote !== null) bad('prehab', `prehabNote must be "${PREHAB_NOTE}" on prehab entries and null elsewhere`);
  if (e.youthOk) {
    for (const t of [...e.cues, ...e.faults.map((f) => f.fix), e.setup]) if (MAX_EFFORT_CUE.test(t)) bad('youth', `max-effort wording on a youth entry: "${t}"`);
    if (PIN_EXERCISE.test(e.name)) bad('youth', 'a pin exercise is adults only (owner decision #6)');
  }

  // 7. provenance and review
  if (!e.source || !inList(SOURCES, e.source.kind) || typeof e.source.licence !== 'string' || !e.source.licence.trim()) bad('source', 'source.kind and source.licence required');
  if (e.source?.url !== null && e.source?.url !== undefined && !URL.test(e.source.url)) bad('source', 'source.url must be http(s)');
  if (!e.review || !inList(REVIEW_STATUSES, e.review.status) || typeof e.review.batch !== 'string' || !e.review.batch) bad('review', 'review.status and review.batch required');
  if (e.review?.status === 'approved' && !e.review.reviewer) bad('review', 'an approved entry names its reviewer');

  // 8. variants and modifiers (on their own: the shape; checkLibrary / checkAgainst check the base)
  if (e.variantOf !== undefined && e.variantOf !== null && (typeof e.variantOf !== 'string' || !SLUG.test(e.variantOf))) bad('modifier', 'variantOf must be an entry id or null');
  const mod = typeof e.variation === 'string' ? modifierOf(e.variation) : null;
  if (mod !== null) {
    if (!modifierById(mod)) bad('modifier', `unknown modifier "${mod}" in variation ${e.variation}`);
    if (!e.variantOf) bad('modifier', `a "+${mod}" entry names the base it modifies (variantOf)`);
  }
  return out;
}

/** Rule 8 across entries: the base resolves, is not itself a variant, and the modifier's rule accepts it. */
function checkVariant(e: LibraryExercise, get: (id: string) => LibraryExercise | undefined): Issue[] {
  if (!e.variantOf) return [];
  const bad = (detail: string): Issue[] => [{ id: e.id, check: 'modifier', detail }];
  if (e.variantOf === e.id) return bad('variantOf points at itself');
  const base = get(e.variantOf);
  if (!base) return bad(`variantOf → ${e.variantOf} does not exist`);
  if (base.variantOf) return bad(`variantOf → ${base.id}, which is itself a variant of ${base.variantOf} (one level only)`);
  const mod = modifierOf(e.variation);
  const m = mod ? modifierById(mod) : undefined;
  if (!m) return [];
  const why = ruleFailures(m.rule, base);
  return why.length ? bad(`"${m.label}" does not apply to ${base.id}: ${why.join('; ')}`) : [];
}

/** The whole library: each entry, then links and duplicates across entries. */
export function checkLibrary(entries: readonly LibraryExercise[]): Issue[] {
  const out: Issue[] = [];
  for (const e of entries) out.push(...checkEntry(e));

  const byId = new Map<string, LibraryExercise>();
  const names = new Map<string, string>();
  const keys = new Map<string, string>();
  const semantic = new Map<string, string>();
  for (const e of entries) {
    if (byId.has(e.id)) out.push({ id: e.id, check: 'duplicate', detail: 'id used twice' });
    byId.set(e.id, e);
    const nk = nameKey(e.name);
    const prevName = names.get(nk);
    if (prevName) out.push({ id: e.id, check: 'duplicate', detail: `same name as ${prevName} ("${nk}")` });
    else names.set(nk, e.id);
    const k = dupKey(e);
    const prevKey = keys.get(k);
    if (prevKey) out.push({ id: e.id, check: 'duplicate', detail: `same pattern/equipment/variation key as ${prevKey} (${k})` });
    else keys.set(k, e.id);
    const sk = semanticKey(e);
    const prevSem = semantic.get(sk);
    if (prevSem && !prevName) out.push({ id: e.id, check: 'duplicate', detail: `same exercise as ${prevSem} once the load words are set aside (${sk})` });
    else semantic.set(sk, e.id);
  }
  for (const e of entries) {
    for (const a of e.aliases) {
      const owner = names.get(nameKey(a));
      if (owner && owner !== e.id) out.push({ id: e.id, check: 'duplicate', detail: `alias "${a}" is the name of ${owner}` });
    }
    for (const f of ['regressionId', 'progressionId'] as const) {
      const to = e[f];
      if (to === null) continue;
      if (to === e.id) out.push({ id: e.id, check: 'links', detail: `${f} points at itself` });
      else if (!byId.has(to)) out.push({ id: e.id, check: 'links', detail: `${f} → ${to} does not exist` });
    }
    out.push(...checkVariant(e, (id) => byId.get(id)));
  }
  return out;
}

/** Counts for the report. */
export function countBy<K extends string>(entries: readonly LibraryExercise[], key: (e: LibraryExercise) => K | K[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) {
    const ks = key(e);
    for (const k of Array.isArray(ks) ? (ks.length ? ks : ['none' as K]) : [ks]) out[k] = (out[k] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
}

/**
 * One new or edited entry against the rest of the library, without re-checking the rest (a review action must answer
 * in milliseconds): its own checks, then its name, aliases and keys against the others, then its links.
 */
export function checkAgainst(e: LibraryExercise, others: readonly LibraryExercise[]): Issue[] {
  const out = checkEntry(e);
  const rest = others.filter((o) => o.id !== e.id);
  const nk = nameKey(e.name);
  const dk = dupKey(e);
  const sk = semanticKey(e);
  for (const o of rest) {
    if (o.review.status === 'rejected') continue;
    if (nameKey(o.name) === nk) out.push({ id: e.id, check: 'duplicate', detail: `same name as ${o.id}` });
    else if (dupKey(o) === dk) out.push({ id: e.id, check: 'duplicate', detail: `same pattern/equipment/variation key as ${o.id}` });
    else if (semanticKey(o) === sk) out.push({ id: e.id, check: 'duplicate', detail: `same exercise as ${o.id} once the load words are set aside` });
    for (const a of e.aliases) if (nameKey(a) === nameKey(o.name)) out.push({ id: e.id, check: 'duplicate', detail: `alias "${a}" is the name of ${o.id}` });
  }
  const ids = new Set(rest.map((o) => o.id));
  for (const f of ['regressionId', 'progressionId'] as const) {
    const to = e[f];
    if (to !== null && (to === e.id || !ids.has(to))) out.push({ id: e.id, check: 'links', detail: `${f} → ${to} does not resolve` });
  }
  out.push(...checkVariant(e, (id) => rest.find((o) => o.id === id)));
  return out;
}
