// lib/program-ask/rules24.ts — EVERY-SCREEN P3 (2026-11-10): the plan's five written rules for the AI program builder
// (docs/PLAN-EVERY-SCREEN-10PHASE.md, phase 3), as one function the 24 fixed asks are tested against
// (./asks24.test.ts) and the probe runs over a grid of 5,040 requests (scripts/every-screen/builder-rules.mts):
//
//   kit       only equipment the person has (a wall and a floor are always there), warm-up and cool-down included;
//   patterns  every major movement pattern each week: a squat, a hinge, a single-leg move, a push, a pull and a trunk
//             move (mobility programs: every pattern still moves, a lighter week counts the same);
//   volume    sensible weekly volume: hard sets per area per building week within a ceiling no goal may pass (adults
//             24, teens 15, under 13 10), and at least 2 for every area;
//   youth     under 18: no jump work, no adults-only entry, no max-effort cue, effort at most Drive (Cruise under 13),
//             sets capped, no foot-contact counts;
//   medical   no medical claims: every word the program shows passes the medical-words guard and the honesty screen.
//
// The ceilings are FEL's written bounds, independent of the builder's own goal ranges (./rules.ts VOLUME_RANGES) so a
// mistake there cannot hide here. assumption: 24 / 15 / 10 hard sets per area a week is the most any goal should ask
// (the builder's highest range is 22, advanced muscle).
//
// The builder's own complete check (./check.ts programProblems) runs too, as rule "check".
//
// Pure.
import { MAX_EFFORT_CUE } from '@/lib/coach/taxonomy';
import { MEDICAL_WORDS } from '@/lib/coach/weeklyDraft/copy';
import type { LibraryExercise } from '@/lib/library/types';
import { screenText } from '@/lib/share/screen';
import { programProblems } from './check';
import { MAX_SETS, SLOT_WEIGHT } from './rules';
import { fitsKit, isImpact, needs } from './slots';
import type { BuiltProgram, ProgramWeek, SlotId, VolumeGroup } from './types';

export type BuilderRule = 'kit' | 'patterns' | 'volume' | 'youth' | 'medical' | 'check';

export const AREA_CEILING: Record<BuiltProgram['request']['age'], number> = { adult: 24, teen: 15, child: 10 };
export const AREA_FLOOR = 2;

/** The six movement patterns a week covers, each as the builder's slots that do it. */
export const WEEK_PATTERNS: readonly { name: string; slots: readonly SlotId[] }[] = [
  { name: 'a squat', slots: ['knee'] },
  { name: 'a hinge', slots: ['hinge'] },
  { name: 'a single-leg move', slots: ['single'] },
  { name: 'a push', slots: ['hpush', 'vpush'] },
  { name: 'a pull', slots: ['hpull', 'vpull', 'rear'] },
  { name: 'a trunk move', slots: ['antiExt', 'antiRot'] },
];

/** Areas a goal trains (a mobility goal trains every area lightly; conditioning still needs every area moved). */
const AREAS: readonly VolumeGroup[] = ['knee', 'hip', 'push', 'pull', 'trunk'];

const working = (w: ProgramWeek) => w.days.flatMap((d) => d.blocks.filter((b) => b.kind !== 'filler').flatMap((b) => b.items));

/** Hard sets per area this week, from the items themselves (a single-leg set counts half to legs, half to hips). */
export function areaSets(w: ProgramWeek): Record<VolumeGroup, number> {
  const out: Record<VolumeGroup, number> = { knee: 0, hip: 0, push: 0, pull: 0, trunk: 0 };
  for (const i of working(w)) for (const [g, k] of Object.entries(SLOT_WEIGHT[i.slot] ?? {})) out[g as VolumeGroup] += i.sets * (k ?? 0);
  return out;
}

/** Every line of words the program shows a person. */
export function programWords(p: BuiltProgram): string[] {
  const out = [p.title, p.summary, p.why, ...p.notes, p.jumps.line ?? ''];
  for (const w of p.weeks) {
    out.push(w.label);
    for (const d of w.days) {
      out.push(d.title);
      for (const s of [...d.warmup, ...d.cooldown]) out.push(s.name, s.cue ?? '', s.dose ?? '');
      for (const b of d.blocks) for (const i of b.items) out.push(i.name, i.setup, i.cue ?? '', i.note ?? '', i.bandSetup ?? '', i.harder ?? '', i.easier ?? '', i.effortWords);
    }
  }
  return [...new Set(out.filter(Boolean))];
}

export function builderRuleFailures(p: BuiltProgram, library: readonly LibraryExercise[], o: { jumpsOpen: boolean }): string[] {
  const out: string[] = [];
  const r = p.request;
  const byId = new Map(library.map((e) => [e.id, e]));
  const youth = r.age !== 'adult';

  for (const w of p.weeks) {
    const covered = new Set<SlotId>();
    for (const d of w.days) {
      const where = `week ${w.n} ${d.id}`;
      // kit: the session's exercises, and the warm-up and cool-down steps that are library entries
      for (const s of [...d.warmup, ...d.cooldown]) {
        const e = byId.get(s.id);
        if (e && !fitsKit(e, r.equipment)) out.push(`kit: ${where}: warm-up/cool-down ${e.name} needs ${needs(e).join(', ')}`);
      }
      for (const b of d.blocks) for (const i of b.items) {
        covered.add(i.slot);
        const e = byId.get(i.exId);
        if (!e) { out.push(`kit: ${where}: ${i.exId} is not a library entry`); continue; }
        if (!fitsKit(e, r.equipment)) out.push(`kit: ${where}: ${e.name} needs ${needs(e).join(', ')}`);
        if (youth) {
          if (isImpact(e) || i.impact) out.push(`youth: ${where}: jump work (${e.name})`);
          if (!e.youthOk) out.push(`youth: ${where}: ${e.name} is adults only`);
          if (i.cue && MAX_EFFORT_CUE.test(i.cue)) out.push(`youth: ${where}: a max-effort cue (${i.cue})`);
          if (!['idle', 'cruise', 'drive'].includes(i.effort)) out.push(`youth: ${where}: ${i.effort} effort`);
          if (r.age === 'child' && !['idle', 'cruise'].includes(i.effort)) out.push(`youth: ${where}: ${i.effort} effort under 13`);
          if (b.kind !== 'filler' && i.sets > MAX_SETS[r.age]) out.push(`youth: ${where}: ${i.sets} sets of ${e.name}`);
          if (i.contacts) out.push(`youth: ${where}: foot contacts counted (${e.name})`);
        }
      }
    }
    for (const pat of WEEK_PATTERNS) if (!pat.slots.some((s) => covered.has(s))) out.push(`patterns: week ${w.n}: no ${pat.name}`);
    if (!w.lighter) {
      const sets = areaSets(w);
      for (const g of AREAS) {
        if (sets[g] > AREA_CEILING[r.age] + 1e-9) out.push(`volume: week ${w.n}: ${sets[g]} hard sets for ${g} (at most ${AREA_CEILING[r.age]})`);
        if (sets[g] < AREA_FLOOR - 1e-9) out.push(`volume: week ${w.n}: ${sets[g]} hard sets for ${g} (at least ${AREA_FLOOR})`);
      }
    }
  }
  if (youth && p.jumps.allowed) out.push('youth: the jump gate reads open');

  for (const line of programWords(p)) {
    if (MEDICAL_WORDS.test(line)) out.push(`medical: "${line.slice(0, 100)}"`);
    else if (screenText(line).length) out.push(`medical: honesty screen: "${line.slice(0, 100)}"`);
  }

  for (const x of programProblems(p, library, o)) out.push(`check: ${x}`);
  return out;
}
