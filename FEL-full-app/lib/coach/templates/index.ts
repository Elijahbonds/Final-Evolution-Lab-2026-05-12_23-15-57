// lib/coach/templates — MIRROR-COACH P8 (2026-09-29): FEL's program templates, as weeks a coach can clone to a client and
// /workout can sell (owner decisions #3, #10, #24; P8 rule (a)).
//
// WHAT WAS MISSING. No schedule template shipped (crossref matrix "Programs for any schedule and equipment": "No schedule
// templates ship, CampTemplates are empty"); a coach built every program from a blank week, and /workout sold one fixed
// plan with the same mobility focus for everyone and a depth drop in week 1. P2 built the session structure (sections,
// key set, supersets, timers, bands, set-up cues, pattern tags) and P6 the warm-up and cool-down, but nothing FEL wrote
// used them.
//
// WHAT THIS IS.
//   · SEVEN TEMPLATES (./list.ts): 3 and 4 days × bodyweight and full gym for adults (./adultBodyweight.ts,
//     ./adultGym.ts), a 3-day and a 2-day youth week and a camp session (./youth.ts). Each is written once as its week in
//     P2's structure, naming exercises from FEL's template catalogue (lib/coach/templateCatalogue.ts) by key.
//   · THE WAVE (./waves.ts): expandTemplate turns the week into four — weeks 1–3 build, week 4 is easier — FEL's choice,
//     said as FEL's choice. The 12-week product is three waves; from the second wave each adult lift that does not land
//     moves one rung up its ladder (the harder version), jumps never move, and youth weeks never move on their own
//     (the owner's Playbook ch8: "Progress a movement only when every rep is technically clean" — a youth athlete's next
//     rung is a coach's or a parent's call, not a calendar's).
//   · THE CHECKS (templateProblems): every template, every week, through P2's own validators — the catalogue row
//     (lib/coach/catalogue.ts), the prescription (lib/coach/loop.ts validateExerciseSpec, and it must come back exactly
//     as written), the session's shape (lib/coach/structure.ts sessionWarnings, one key set), the six-pattern coverage
//     and pull-over-push (lib/coach/coverage.ts patternCoverage / pullPushCheck) — plus the youth rules and the ladder
//     rule. The clone refuses a template with any problem; templates/index.test.ts asserts there are none.
//   · THE CLONE PLAN (planTemplateClone): what lib/coach/builderServer.ts 'clone_template' writes — the catalogue rows
//     (every rung of every ladder used), the links between them, and the weeks as blocks → sessions → prescriptions.
//
// THE PROTOCOL GATE is not here. Adult templates hold their jumps as written, each carrying `impact` and `stepDown` (the
// first rung below that does not land); the gate (P8 rule (b)) decides per athlete per day whether the jump stays or
// the step-down runs, at read time — today's pain decision cannot be known when a template is cloned.
//
// Pure: no Prisma client value, no DOM.
import type { MovementPattern, SessionSection } from '@/public/_prisma/client';
import { validateCatalogueCreate } from '../catalogue';
import { COVERAGE_PATTERNS, patternCoverage, pullPushCheck, isWorking, type PatternedItem } from '../coverage';
import { validateExerciseSpec } from '../loop';
import { sessionWarnings, warningText } from '../structure';
import { EFFORT_BANDS, PIN_EXERCISE, MAX_EFFORT_CUE, bandAllowed, effortBand } from '../taxonomy';
import {
  catalogueCreateInput, easierKey, harderKey, impactFreeStepDown, isUnilateral, ladderKeysFor, stepUp, templateExercise, type TemplateImpact,
} from '../templateCatalogue';
import { CAMP_BANDS, waveFor, waveSets, weekLabel, type WaveBand, type WaveWeek } from './waves';
import { templateWeeks } from './list';
import type { ProgramTemplate, TemplateItem, TemplateSection, TemplateSession } from './types';

export * from './types';
export * from './list';
export { ADULT_WAVE, YOUTH_WAVE, CAMP_BANDS, WAVE_LINE, MAX_WEEKLY_SET_GROWTH, WEEK4_MAX_SHARE, weekLabel } from './waves';

// ── one week, expanded ───────────────────────────────────────────────────────────────────────────────────────────────

/** One item of one week: the prescription as the builder's add takes it, plus what readers need to know about it. */
export interface TemplatePrescription {
  /** templateCatalogue.ts key (after any wave step-up). */
  exercise: string;
  name: string;
  pattern: MovementPattern;
  impact: TemplateImpact;
  /** The easier and harder versions (templateCatalogue.ts keys); null at the end of a ladder. */
  easier: string | null;
  harder: string | null;
  /** What the protocol gate runs instead when it is shut: the first rung below that does not land (itself when this
   *  one does not land). */
  stepDown: string | null;
  /** The exercise's first cue: the one line a plan view shows. */
  cue: string;
  section: SessionSection;
  isKeySet: boolean;
  supersetGroup: string | null;
  sets: number;
  reps: string;
  load: string;
  tempo: string;
  restSeconds: number;
  workSeconds: number | null;
  holdSeconds: number | null;
  effortBand: WaveBand;
  setupCues: string[];
  coachNote: null;
}

export interface TemplateSessionPlan { order: number; day: TemplateSession['day']; label: string; items: TemplatePrescription[] }
export interface TemplateWeekPlan { week: number; label: string; easier: boolean; sessions: TemplateSessionPlan[] }

const EACH_SIDE = /\s*each side\b/i;
/**
 * A dose's reps text read across a wave's step-up (MIRROR-COACH P8 FIX, 2026-09-30, code review): onto a one-sided rung
 * the text says "each side" ("10" → "10 each side", "40 s" → "40 s each side"); off one ("10 each side" onto the barbell
 * row) it no longer does. The same rung keeps the text as written.
 */
export function sidedReps(reps: string, from: string, to: string): string {
  if (from === to) return reps;
  const one = isUnilateral(to);
  if (one && !EACH_SIDE.test(reps)) return `${reps} each side`;
  if (!one && isUnilateral(from) && EACH_SIDE.test(reps)) return reps.replace(EACH_SIDE, '').trim();
  return reps;
}

function prescription(item: TemplateItem, band: WaveBand, sets: number, exerciseKey: string): TemplatePrescription {
  const ex = templateExercise(exerciseKey);
  if (!ex) throw new Error(`template names an unknown exercise: ${exerciseKey}`);
  const ws = item.workSeconds ?? null;
  return {
    exercise: exerciseKey,
    name: ex.catalogue.name,
    pattern: ex.catalogue.pattern,
    impact: ex.impact,
    easier: easierKey(exerciseKey),
    harder: harderKey(exerciseKey),
    stepDown: impactFreeStepDown(exerciseKey),
    cue: ex.catalogue.primaryCues[0] ?? '',
    section: item.section,
    isKeySet: item.isKeySet === true,
    supersetGroup: item.supersetGroup ?? null,
    sets,
    // a timed item's reps state its seconds (lib/coach/loop.ts validateExerciseSpec re-derives anything else); a step-up
    // onto (or off) a one-sided rung says so (sidedReps)
    reps: sidedReps(ws ? item.reps ?? `${ws} s` : item.reps ?? '8', item.exercise, exerciseKey),
    load: '',
    // a step-up keeps the rung's own tempo: "3-Second Lower" is its tempo, not the rung below's
    tempo: exerciseKey === item.exercise ? item.tempo ?? ex.catalogue.defaultTempo : ex.catalogue.defaultTempo,
    restSeconds: item.restSeconds,
    workSeconds: ws,
    holdSeconds: item.holdSeconds ?? null,
    effortBand: band,
    setupCues: [...(item.setupCues ?? [])],
    coachNote: null,
  };
}

/** Labels for the first week of a later wave: a step up for an adult, a fresh start for a youth week (nothing moves). */
const LATER_WAVE_FIRST = { adult: 'Step up', youth: 'Start again' } as const;

/**
 * A template as weeks. `wave` 1 is weeks 1–4 (what a clone writes); 2 and 3 are weeks 5–8 and 9–12 (the 12-week plan),
 * where each adult exercise that does not land moves `wave − 1` rungs up its ladder (stopping at the top). The camp
 * session is one week of one session at CAMP_BANDS whatever the wave.
 */
export function expandTemplate(t: ProgramTemplate, opts: { wave?: 1 | 2 | 3 } = {}): TemplateWeekPlan[] {
  const wave = opts.wave ?? 1;
  const sessionsFor = (w: Pick<WaveWeek, 'sets' | 'bands'>) => t.sessions.map((s, i): TemplateSessionPlan => ({
    order: i + 1, day: s.day, label: s.label,
    items: s.items.map((it) => {
      const moves = t.audience === 'adult' && wave > 1 && templateExercise(it.exercise)?.impact === null;
      return prescription(it, w.bands[it.section], waveSets(it.sets, w.sets[it.section]), moves ? stepUp(it.exercise, wave - 1) : it.exercise);
    }),
  }));
  if (t.kind === 'camp') {
    return [{ week: 1, label: 'Camp', easier: false, sessions: sessionsFor({ sets: { prime: 0, key: 0, assist: 0, finish: 0 }, bands: CAMP_BANDS }) }];
  }
  return waveFor(t.audience).map((w) => ({
    week: (wave - 1) * 4 + w.week,
    label: wave > 1 && w.week === 1 ? LATER_WAVE_FIRST[t.audience] : w.label,
    easier: w.easier,
    sessions: sessionsFor(w),
  }));
}

/** The prescription as lib/coach/loop.ts validateExerciseSpec takes it (the builder's add body, less the exercise id). */
export function specInput(p: TemplatePrescription): Record<string, unknown> {
  return {
    section: p.section, isKeySet: p.isKeySet, supersetGroup: p.supersetGroup, sets: p.sets, reps: p.reps, load: p.load, tempo: p.tempo,
    restSeconds: p.restSeconds, workSeconds: p.workSeconds, holdSeconds: p.holdSeconds, effortBand: p.effortBand, setupCues: [...p.setupCues],
    coachNote: p.coachNote,
  };
}

// ── what a week adds up to ───────────────────────────────────────────────────────────────────────────────────────────

const itemsOf = (w: TemplateWeekPlan): TemplatePrescription[] => w.sessions.flatMap((s) => s.items);
const patterned = (p: TemplatePrescription): PatternedItem => ({ pattern: p.pattern, section: p.section, sets: p.sets });

/** Working sets in a week (Key, Assist and Finish: lib/coach/coverage.ts WORKING_SECTIONS — a jump in Prime is not one). */
export const weekWorkingSets = (w: TemplateWeekPlan): number => itemsOf(w).filter((p) => isWorking(patterned(p))).reduce((s, p) => s + p.sets, 0);

const bandRank = (id: string): number => EFFORT_BANDS.findIndex((b) => b.id === id);
/** The hardest band on a working set this week. */
export function weekTopBand(w: TemplateWeekPlan): string {
  const working = itemsOf(w).filter((p) => isWorking(patterned(p)));
  return working.reduce((top, p) => (bandRank(p.effortBand) > bandRank(top) ? p.effortBand : top), 'idle');
}
/**
 * FEL's effort index for a week (its own bookkeeping, not a published formula): working sets × the top RPE of their band
 * (Cruise 5, Drive 7, Surge 9). The measure templates/index.test.ts uses to say weeks 1–3 build.
 */
export const weekEffort = (w: TemplateWeekPlan): number =>
  itemsOf(w).filter((p) => isWorking(patterned(p))).reduce((s, p) => s + p.sets * (effortBand(p.effortBand)?.rpe[1] ?? 0), 0);

/** P2's six-pattern strip for the week, read as if every session in it were done (lib/coach/coverage.ts). */
export const weekCoverage = (w: TemplateWeekPlan) => patternCoverage(itemsOf(w).map(patterned), w.sessions.map((s) => s.items.map(patterned)));
/** P2's pull-over-push check for the week: null = at least as much pulling as pressing. */
export const weekPullPush = (w: TemplateWeekPlan) => pullPushCheck(itemsOf(w).map(patterned), { label: `week ${w.week}` });

/** Two prescriptions are the same when every field is (key order aside; setupCues compared as lists). */
export function sameSpec(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return keys.every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));
}

// ── the checks ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Every text a template puts in front of a coach or an athlete: its own lines and its exercises' rows. */
export function templateText(t: ProgramTemplate): string[] {
  const keys = ladderKeysFor(t.sessions.flatMap((s) => s.items.map((i) => i.exercise)));
  return [
    t.name, t.summary, t.equipmentLine, ...t.sessions.map((s) => s.label), ...t.sessions.flatMap((s) => s.items.map((i) => i.reps ?? '')),
    ...keys.flatMap((k) => {
      const e = templateExercise(k)!;
      return [e.catalogue.name, ...e.catalogue.primaryCues, ...e.catalogue.commonFaults.flatMap((x) => [x.fault, x.correctionCue]), ...e.catalogue.equipment];
    }),
  ].filter(Boolean);
}

/**
 * What is wrong with a template, in words; [] when nothing is. Every week of every wave it writes is checked. The clone
 * refuses a template with any problem (500 template_invalid) — it would be FEL's bug, not the coach's.
 */
export function templateProblems(t: ProgramTemplate): string[] {
  const out: string[] = [];
  const used = [...new Set(t.sessions.flatMap((s) => s.items.map((i) => i.exercise)))];
  for (const k of used) {
    if (!templateExercise(k)) { out.push(`unknown exercise ${k}`); continue; }
    if (!easierKey(k) || !harderKey(k)) out.push(`${k} needs an easier and a harder version on its ladder`);
    if (templateExercise(k)!.impact === 'depth_drop') out.push(`${k} is a depth drop: no FEL template programs one`);
  }
  if (out.length) return out;
  for (const k of ladderKeysFor(used)) {
    const v = validateCatalogueCreate(catalogueCreateInput(k));
    if (!v.ok) out.push(`${k}: catalogue ${v.error} (${v.field})`);
    else if (v.warnings.length) out.push(`${k}: claims screen ${v.warnings.map((w) => w.found).join(', ')}`);
    else if (PIN_EXERCISE.test(v.item.name)) out.push(`${k}: a pin exercise`);
  }
  if (t.sessions.length !== t.daysPerWeek) out.push(`daysPerWeek ${t.daysPerWeek} but ${t.sessions.length} sessions`);
  const youth = t.audience === 'youth';
  const waves: (1 | 2 | 3)[] = t.kind === 'camp' ? [1] : [1, 2, 3];
  for (const wave of waves) {
    const weeks = expandTemplate(t, { wave });
    if (weeks.length !== templateWeeks(t)) out.push(`wave ${wave}: ${weeks.length} weeks`);
    for (const w of weeks) {
      const at = `week ${w.week}`;
      for (const s of w.sessions) {
        const rows = s.items.map((p, i) => ({ id: `${s.order}-${i}`, order: i + 1, section: p.section, isKeySet: p.isKeySet, supersetGroup: p.supersetGroup }));
        for (const warning of sessionWarnings(rows)) out.push(`${at} ${s.label}: ${warningText(warning)}`);
        if (s.items.filter((p) => p.isKeySet).length !== 1) out.push(`${at} ${s.label}: one key set per session`);
        for (const p of s.items) {
          const v = validateExerciseSpec({ exerciseId: p.exercise, ...specInput(p) });
          if (!v.ok) { out.push(`${at} ${s.label} ${p.exercise}: ${v.error}`); continue; }
          const { exerciseId: _id, ...spec } = v.spec;
          if (!sameSpec(spec, specInput(p))) out.push(`${at} ${s.label} ${p.exercise}: the builder would save a different prescription`);
          if (!bandAllowed(p.effortBand, youth)) out.push(`${at} ${p.exercise}: band ${p.effortBand} is adults-only`);
          if (String(p.effortBand) === 'full') out.push(`${at} ${p.exercise}: no template uses Full throttle`);
          if (youth && bandRank(p.effortBand) > bandRank('drive')) out.push(`${at} ${p.exercise}: youth templates stop at Drive`);
          if (youth && (p.impact !== null || p.section === 'prime')) out.push(`${at} ${p.exercise}: a youth template carries no jump and no Prime`);
          if (p.section === 'prime' && p.impact === null) out.push(`${at} ${p.exercise}: Prime holds the day's jump`);
          if (p.impact !== null && p.section !== 'prime') out.push(`${at} ${p.exercise}: a jump belongs in Prime`);
          if (youth && templateExercise(p.exercise)!.catalogue.primaryCues.some((c) => MAX_EFFORT_CUE.test(c))) out.push(`${at} ${p.exercise}: a max-effort cue`);
        }
      }
      const strip = weekCoverage(w);
      const missing = strip.cells.filter((c) => c.state !== 'done').map((c) => c.pattern);
      if (missing.length) out.push(`${at}: misses ${missing.join(', ')}`);
      const pp = weekPullPush(w);
      if (pp) out.push(`${at}: ${pp.text}`);
    }
  }
  return out;
}

/** templateProblems, worked out once per template per server process (templates are constants; ~1,000 prescriptions). */
const CHECKED = new WeakMap<ProgramTemplate, readonly string[]>();
export function templateProblemsOnce(t: ProgramTemplate): readonly string[] {
  let p = CHECKED.get(t);
  if (!p) { p = templateProblems(t); CHECKED.set(t, p); }
  return p;
}

/** The six patterns every week covers (lib/coach/coverage.ts COVERAGE_PATTERNS), re-exported for readers. */
export const SIX_PATTERNS = COVERAGE_PATTERNS;

// ── the clone plan ───────────────────────────────────────────────────────────────────────────────────────────────────

export interface ClonePlan {
  templateId: string;
  /** Weeks the program becomes. */
  durationWeeks: number;
  /** Every rung of every ladder the template uses, in ladder order: seeded into the coach's catalogue. */
  exerciseKeys: string[];
  /** The easier/harder link of each seeded rung (templateCatalogue.ts keys). */
  links: { key: string; easier: string | null; harder: string | null }[];
  /** Blocks → sessions → prescriptions, each prescription naming its exercise by key. */
  blocks: { order: number; label: string; sessions: { order: number; label: string; items: { exercise: string; spec: Record<string, unknown> }[] }[] }[];
}

/** A session's label in the builder and on Today: "Mon · Lower: squat" ("Camp session" for the camp). */
export const sessionLabel = (s: { day: string; label: string }): string => (s.day === 'Camp' ? s.label : `${s.day} · ${s.label}`);

/** What cloning this template writes: wave 1 (weeks 1–4), or the camp's one session. */
export function planTemplateClone(t: ProgramTemplate): ClonePlan {
  const weeks = expandTemplate(t, { wave: 1 });
  const exerciseKeys = ladderKeysFor(t.sessions.flatMap((s) => s.items.map((i) => i.exercise)));
  return {
    templateId: t.id,
    durationWeeks: weeks.length,
    exerciseKeys,
    links: exerciseKeys.map((key) => ({ key, easier: easierKey(key), harder: harderKey(key) })),
    blocks: weeks.map((w, bi) => ({
      order: bi + 1,
      label: t.kind === 'camp' ? 'Camp' : weekLabel(w),
      sessions: w.sessions.map((s) => ({ order: s.order, label: sessionLabel(s), items: s.items.map((p) => ({ exercise: p.exercise, spec: specInput(p) })) })),
    })),
  };
}

/** What a template holds, for the picker: "4 weeks · 3 sessions a week · 18 exercises". */
export function templateShape(t: ProgramTemplate): { weeks: number; sessionsPerWeek: number; exercises: number } {
  return { weeks: templateWeeks(t), sessionsPerWeek: t.sessions.length, exercises: new Set(t.sessions.flatMap((s) => s.items.map((i) => i.exercise))).size };
}

/** The sections a template writes, in running order (./types.ts). */
export const TEMPLATE_SECTIONS: readonly TemplateSection[] = ['prime', 'key', 'assist', 'finish'];
