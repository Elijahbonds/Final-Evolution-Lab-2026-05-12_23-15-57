// lib/signature/check.ts — SIGNATURE-PROGRAMS (2026-10-25): what is wrong with a program, in words; [] when nothing is.
//
// The same discipline as the coach templates' templateProblems (lib/coach/templates/index.ts): every week of every
// program, for an adult AND under youth rules, through the coach builder's own validators. The review page refuses to
// store an owner edit that leaves a problem, refuses to approve a program with one, and signature.test.ts holds the four
// programs at none. Checked:
//   · every exercise (and every calm step-down) is an entry of the shared library — and copies cleanly into a coach's
//     catalogue (lib/library/bridge.ts libraryToCatalogue, the catalogue's own validation);
//   · a jump or a landing (lib/library: a plyometric for the vertical or the landing, or an approach jump) carries its
//     foot contacts and a calm, youth-safe step-down; nothing else claims contacts;
//   · each prescription is exactly what lib/coach/loop.ts validateExerciseSpec would save, each session has one key set
//     and no structure warning (lib/coach/structure.ts sessionWarnings);
//   · effort: no week uses Full throttle, and under youth rules nothing passes Drive (the youth wave's cap);
//   · contacts: an adult session asks at most SESSION_CONTACTS_MAX (the Dunk Program's busiest day, §9.3);
//   · length: the plan as written, and the shortest and longest it can adapt to, stay in 8–12 weeks;
//   · every retest a phase exits on is run in one of its sessions; every line of copy passes the share screen and the
//     weekly draft's MEDICAL_WORDS (the prehab field's exact PREHAB_NOTE is the one line that names "treatment").
//
// Pure (server and tests: it reads library entries).
import { libraryToCatalogue } from '@/lib/library/bridge';
import type { LibraryExercise } from '@/lib/library/types';
import { PREHAB_NOTE } from '@/lib/library/vocab';
import { validateExerciseSpec } from '@/lib/coach/loop';
import { sessionWarnings, warningText } from '@/lib/coach/structure';
import { sameSpec } from '@/lib/coach/templates/index';
import { MEDICAL_WORDS } from '@/lib/coach/weeklyDraft/copy';
import { screenText } from '@/lib/share/screen';
import { EFFORT_BANDS } from '@/lib/coach/taxonomy';
import { MAX_PROGRAM_WEEKS, MIN_PROGRAM_WEEKS, expandPlan, planRange, type PlanItem } from './plan';
import type { SignatureProgram } from './types';

/** The Dunk Program's busiest day (§9.3: "Tendon and reset … about 100 low-effort" contacts). No signature session asks more. */
export const SESSION_CONTACTS_MAX = 100;

/** A jump or a landing, read off the library entry: a plyometric for the vertical or the landing, or an approach jump. */
export function isImpactEntry(e: Pick<LibraryExercise, 'id' | 'category' | 'goals'>): boolean {
  if (e.category === 'plyometric' && e.goals.some((g) => g === 'vertical' || g === 'landing')) return true;
  return /approach-jump$/.test(e.id);
}

/** The prescription the coach builder's add takes, from a plan item. */
export const specOf = (p: PlanItem): Record<string, unknown> => ({
  section: p.section, isKeySet: p.isKeySet, supersetGroup: null, sets: p.sets, reps: p.reps, load: '', tempo: '3-1-1-0',
  restSeconds: p.restSeconds, workSeconds: p.workSeconds, holdSeconds: null, effortBand: p.effortBand, setupCues: [...p.setupCues], coachNote: null,
});

const bandRank = (id: string) => EFFORT_BANDS.findIndex((b) => b.id === id);

/** Every line of copy a program shows (its own; the exercises' words are the library's, checked by its validator). */
export function programText(p: SignatureProgram): string[] {
  return [
    p.title, p.tagline, p.summary, p.equipmentLine, ...p.gaps,
    ...p.phases.flatMap((ph) => [ph.label, ph.goal, ...ph.weeks.map((w) => w.label), ...ph.sessions.flatMap((s) => [s.label, ...s.items.map((i) => i.reps ?? '')])]),
  ].filter(Boolean);
}

export function programProblems(p: SignatureProgram, lookup: (id: string) => LibraryExercise | null): string[] {
  const out: string[] = [];
  const items = p.phases.flatMap((ph) => ph.sessions.flatMap((s) => s.items.map((it) => ({ ph, s, it }))));
  // the library
  const seen = new Set<string>();
  for (const { ph, s, it } of items) {
    const at = `${ph.id}/${s.key} ${it.ex}`;
    const e = lookup(it.ex);
    if (!e) { out.push(`${at}: not in the library`); continue; }
    if (!seen.has(e.id)) {
      seen.add(e.id);
      const c = libraryToCatalogue(e);
      if (!c.ok) out.push(`${at}: does not copy into a coach catalogue (${c.error})`);
    }
    const impact = isImpactEntry(e);
    if (impact && it.contacts == null) out.push(`${at}: a jump or landing without its contacts`);
    if (!impact && it.contacts != null) out.push(`${at}: contacts on an item that is not a jump or a landing`);
    if (it.contacts != null && it.section !== 'prime') out.push(`${at}: a jump belongs in Prime`);
    if (impact) {
      const d = it.down ? lookup(it.down) : null;
      if (!d) out.push(`${at}: no calm step-down in the library (${it.down ?? 'none'})`);
      else if (isImpactEntry(d)) out.push(`${at}: its step-down ${d.id} is itself a jump`);
      else if (!d.youthOk) out.push(`${at}: its step-down ${d.id} is adults only`);
    }
  }
  // the weeks, as an adult and under youth rules
  const asWritten = expandPlan(p, { youth: false, cap: false }).length;
  if (asWritten < MIN_PROGRAM_WEEKS || asWritten > MAX_PROGRAM_WEEKS) out.push(`${asWritten} planned weeks: the owner's range is ${MIN_PROGRAM_WEEKS}–${MAX_PROGRAM_WEEKS}`);
  const range = planRange(p);
  if (range.min < MIN_PROGRAM_WEEKS || range.max > MAX_PROGRAM_WEEKS) out.push(`adapts to ${range.min}–${range.max} weeks`);
  for (const youth of [false, true]) {
    for (const w of expandPlan(p, { youth, cap: false })) {
      for (const s of w.sessions) {
        const at = `${youth ? 'youth ' : ''}week ${w.n} ${s.key}`;
        const rows = s.items.map((it, i) => ({ id: it.key, order: i + 1, section: it.section, isKeySet: it.isKeySet, supersetGroup: null }));
        for (const warning of sessionWarnings(rows)) out.push(`${at}: ${warningText(warning)}`);
        if (s.items.filter((i) => i.isKeySet).length !== 1) out.push(`${at}: one key set per session`);
        let contacts = 0;
        for (const it of s.items) {
          const v = validateExerciseSpec({ exerciseId: it.ex, ...specOf(it) });
          if (!v.ok) { out.push(`${at} ${it.ex}: ${v.error}`); continue; }
          const { exerciseId: _id, ...spec } = v.spec;
          if (!sameSpec(spec, specOf(it))) out.push(`${at} ${it.ex}: the builder would save a different prescription`);
          if (String(it.effortBand) === 'full') out.push(`${at} ${it.ex}: no signature program uses Full throttle`);
          if (youth && bandRank(it.effortBand) > bandRank('drive')) out.push(`${at} ${it.ex}: youth rules stop at Drive`);
          if (it.contacts) contacts += it.contacts * it.sets;
        }
        if (!youth && contacts > SESSION_CONTACTS_MAX) out.push(`${at}: ${contacts} contacts (max ${SESSION_CONTACTS_MAX})`);
      }
    }
  }
  // retests and copy
  for (const ph of p.phases) {
    const run = new Set(ph.sessions.flatMap((s) => s.retest ?? []));
    for (const r of ph.exit.reads) if (!run.has(r)) out.push(`${ph.id}: exits on ${r}, which no session re-tests`);
    if (ph.exit.earlyAfterWeek !== null && (ph.exit.earlyAfterWeek < 1 || ph.exit.earlyAfterWeek >= ph.weeks.length)) out.push(`${ph.id}: early exit after week ${ph.exit.earlyAfterWeek}`);
    if (ph.exit.repeatWeeks < 1 || ph.exit.repeatWeeks > ph.weeks.length) out.push(`${ph.id}: repeats ${ph.exit.repeatWeeks} weeks`);
  }
  for (const t of programText(p)) {
    if (MEDICAL_WORDS.test(t)) out.push(`copy: "${t.slice(0, 60)}" uses a medical word`);
    const flags = screenText(t);
    if (flags.length) out.push(`copy: "${t.slice(0, 60)}" flags ${flags.map((f) => f.found).join(', ')}`);
  }
  if (p.prehabNote !== null && p.prehabNote !== PREHAB_NOTE) out.push(`prehab note must read exactly "${PREHAB_NOTE}"`);
  return out;
}
