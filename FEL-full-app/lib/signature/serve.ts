// lib/signature/serve.ts — SIGNATURE-PROGRAMS (2026-10-25): today's session through today's gates.
//
// THE DRILLS PAGE'S GATES, IN THE DRILLS PAGE'S ORDER (lib/drills/access.ts, lib/coach/warmup.ts "THE GATES"), read from
// the same server context (lib/coach/warmupServer.ts loadWarmupContext):
//   · a standing intake RED FLAG → no session at all, with the intake's own words (RED_FLAG_COPY);
//   · a pain check-in that said STOP and see someone (isHardStop) → only the calm work (Prep, Cool-down, breath and
//     mobility) runs; everything else waits, and the athlete reads the check-in's own words (PAIN_DECISION_COPY) and the
//     weekly draft's "check with a clinician" line (easeOffClientLine) — the existing "see a professional" wording;
//   · JUMPS AND LANDINGS (every item with contacts) are swapped for their calm step-down when: a pain check-in asked for
//     anything but "continue" (one step stricter than the drills page, which holds them on a stop only), the details could not be read, YOUTH RULES (under 18 or no birth year: a solo program has
//     no coach to add them), or the protocol gate's jump gate is shut (no landing check yet …) — in that order, the
//     drills page's;
//   · an EASIER DAY — today's readiness check read Low (PR #447: the coach readiness lane's ease, lib/coach/readiness/
//     ease.ts easeRow over the drafts engine's dose.ts easeStep), or a pain check-in that asked for an easier variation —
//     takes a set off and a step of effort from each work row.
// NEVER HARDER. Every served row is checked against the row as planned (lib/coach/readiness/ease.ts neverHarder) and
// served as planned when the check fails; a step-down never carries more sets than the item it replaces.
//
// Pure. Client-safe (the page's rig renders it).
import type { TreeExercise } from '@/lib/coach/loop';
import { neverHarder, easeRow } from '@/lib/coach/readiness/ease';
import { easeOffClientLine } from '@/lib/coach/weeklyDraft/copy';
import { effortBand, youthSafeCues } from '@/lib/coach/taxonomy';
import { JUMP_GATE_DEFAULT_WHY } from '@/lib/coach/warmup';
import { LANDING_CHECK_HREF } from '@/lib/coach/protocolGate';
import { LANDING_CHECK_ENTRY } from '@/lib/drills/route';
import { RED_FLAG_COPY } from '@/lib/health/intake';
import { PAIN_DECISION_COPY, isHardStop, type PainDecision } from '@/lib/health/painRule';
import { PAIN_EASE_LINE, readinessEaseLine } from './copy';
import type { PlanItem, PlanSession } from './plan';
import type { RetestKind } from './types';

/** What a page needs of a library entry (lib/library entries carry more). */
export interface ExerciseLite {
  id: string;
  name: string;
  setup: string;
  cues: string[];
  faults: { fault: string; fix: string }[];
  pattern: string;
  category: string;
  youthOk: boolean;
  prehabNote: string | null;
  dosage: { sets: number; reps?: string; seconds?: number; restSec: number };
}

export type Lookup = (id: string) => ExerciseLite | null;

/** Today's gates, as the server reads them (./server.ts dayGate). */
export interface DayGate {
  youth: boolean;
  hardStopped: boolean;
  painDecision: PainDecision | null;
  jumpGate: { closed: boolean; why: string; href: string | null };
  /** The context could not be read: the careful version (no jumps). */
  unavailable?: boolean;
  /** Today's readiness check read Low under FEL's default rule (ease). */
  readinessLow: boolean;
}

export const CAREFUL_GATE: DayGate = { youth: true, hardStopped: false, painDecision: null, jumpGate: { closed: true, why: '', href: null }, unavailable: true, readinessLow: false };

export interface ServedItem {
  key: string;
  ex: string;
  name: string;
  section: PlanItem['section'];
  sets: number;
  reps: string;
  workSeconds: number | null;
  restSeconds: number;
  effortBand: string;
  bandLabel: string | null;
  isKeySet: boolean;
  impact: boolean;
  contacts: number | null;
  setup: string;
  cue: string | null;
  /** The planned item's name when a calm step-down runs in its place. */
  swappedFrom: string | null;
  /** What eased ("3 → 2 sets, Drive → Cruise"), or null. */
  eased: string | null;
}

export interface HeldItem { key: string; name: string; line: string }
export interface DayNote { id: 'red_flag' | 'pain_stop' | 'pain_ease' | 'readiness' | 'impact' | 'see_someone'; text: string; href?: string | null }

export interface ServedSession {
  id: string;
  key: string;
  label: string;
  day: PlanSession['day'];
  retest: RetestKind[];
  /** A standing red flag: nothing runs today. */
  blocked: boolean;
  items: ServedItem[];
  held: HeldItem[];
  notes: DayNote[];
  /** Foot contacts the served session asks for. */
  contacts: number;
}

export type ImpactWhy = 'pain' | 'unavailable' | 'youth_impact' | 'jump_gate';

export const IMPACT_LINES: Record<ImpactWhy, string> = {
  pain: "A recent pain check-in asked for easier work, so today's jumps and landings are swapped for calm versions. Do what that check-in said.",
  unavailable: "We couldn't load your details just now, so today takes the careful version: no jumps or landings. Reload to try again.",
  youth_impact: 'Jumps and landings are swapped for calm versions: under 18, or with no birth year on your account, they wait for a coach.',
  jump_gate: 'Jumps and landings are swapped for calm versions today.',
};

/**
 * Why jumps and landings wait today, in the drills page's order (lib/drills/access.ts drillsAccess), or null. One step
 * stricter than the drills page on purpose: ANY pain decision but 'continue' holds them (the drills page holds them on a
 * stop outcome only; an 'easier_variation' keeps its jumps there). A program day never jumps on an open pain flag.
 */
export function impactWhy(g: DayGate): ImpactWhy | null {
  if (g.painDecision && g.painDecision !== 'continue') return 'pain';
  if (g.unavailable) return 'unavailable';
  if (g.youth) return 'youth_impact';
  if (g.jumpGate.closed) return 'jump_gate';
  return null;
}

const CALM_PATTERNS = new Set(['breath', 'mobility']);
const isCalm = (p: PlanItem, e: ExerciseLite | null) => p.section === 'prep' || p.section === 'cooldown' || CALM_PATTERNS.has(e?.pattern ?? '');

export const asTree = (p: Pick<PlanItem, 'key' | 'ex' | 'sets' | 'reps' | 'section' | 'isKeySet' | 'workSeconds' | 'restSeconds' | 'setupCues' | 'effortBand'>, name: string, order = 0): TreeExercise => ({
  id: p.key, order, exerciseId: p.ex, name, sets: p.sets, reps: p.reps, load: '', tempo: '3-1-1-0', restSeconds: p.restSeconds, coachNote: null,
  section: p.section, isKeySet: p.isKeySet, supersetGroup: null, workSeconds: p.workSeconds, holdSeconds: null, setupCues: [...p.setupCues], effortBand: p.effortBand,
});

function served(p: PlanItem, e: ExerciseLite | null, youth: boolean): ServedItem {
  return {
    key: p.key, ex: p.ex, name: e?.name ?? p.ex, section: p.section, sets: p.sets, reps: p.reps, workSeconds: p.workSeconds, restSeconds: p.restSeconds,
    effortBand: p.effortBand, bandLabel: effortBand(p.effortBand)?.label ?? null, isKeySet: p.isKeySet, impact: p.impact, contacts: p.contacts,
    setup: e?.setup ?? '', cue: (youth ? youthSafeCues(e?.cues ?? []) : e?.cues ?? [])[0] ?? null, swappedFrom: null, eased: null,
  };
}

/** The calm step-down in place of a held jump: the step-down's own dose, never more sets than the jump had. */
function stepDown(p: PlanItem, from: ExerciseLite | null, to: ExerciseLite, youth: boolean): ServedItem {
  const secs = to.dosage.seconds && !to.dosage.reps ? to.dosage.seconds : null;
  return {
    ...served({ ...p, ex: to.id, impact: false, contacts: null }, to, youth),
    sets: Math.min(p.sets, Math.max(1, to.dosage.sets)),
    reps: secs ? `${secs} s` : to.dosage.reps ?? (to.dosage.seconds ? `${to.dosage.seconds} s` : '8'),
    workSeconds: secs,
    restSeconds: to.dosage.restSec,
    swappedFrom: from?.name ?? p.ex,
  };
}

/** Today's session as it runs. */
export function serveSession(s: PlanSession, g: DayGate, lookup: Lookup): ServedSession {
  const base = { id: s.id, key: s.key, label: s.label, day: s.day, retest: [...s.retest] };
  if (g.hardStopped) return { ...base, blocked: true, items: [], held: [], notes: [{ id: 'red_flag', text: RED_FLAG_COPY }], contacts: 0 };

  const notes: DayNote[] = [];
  const items: ServedItem[] = [];
  const held: HeldItem[] = [];
  const pain = g.painDecision;
  const hardPain = pain !== null && isHardStop(pain);
  const why = impactWhy(g);
  const easePain = pain === 'easier_variation' || pain === 'step_down_flag_coach';
  const ease = !hardPain && (g.readinessLow || easePain);
  let eased = 0;

  s.items.forEach((p, i) => {
    const e = lookup(p.ex);
    if (g.youth && e && !e.youthOk) { held.push({ key: p.key, name: e.name, line: `${e.name} is for 18 and over, so it is left out today.` }); return; }
    if (hardPain && !isCalm(p, e)) { held.push({ key: p.key, name: e?.name ?? p.ex, line: `${e?.name ?? p.ex} waits until that check-in is settled.` }); return; }
    if (p.impact && why) {
      const to = p.down ? lookup(p.down) : null;
      if (to && (!g.youth || to.youthOk)) items.push(stepDown(p, e, to, g.youth));
      else held.push({ key: p.key, name: e?.name ?? p.ex, line: `${e?.name ?? p.ex} waits today.` });
      return;
    }
    let out = served(p, e, g.youth);
    if (ease) {
      const before = asTree(p, out.name, i);
      const r = easeRow(before, { youth: g.youth, pattern: e?.pattern ?? null });
      if (r.what && neverHarder(before, r.row)) {
        out = { ...out, sets: r.row.sets, effortBand: r.row.effortBand ?? out.effortBand, bandLabel: effortBand(r.row.effortBand)?.label ?? out.bandLabel, eased: r.what };
        eased++;
      }
    }
    items.push(out);
  });

  if (hardPain) {
    notes.push({ id: 'pain_stop', text: PAIN_DECISION_COPY[pain!] });
    notes.push({ id: 'see_someone', text: easeOffClientLine(g.youth) });
  } else if (why) {
    const href = why === 'jump_gate' ? (g.jumpGate.href === LANDING_CHECK_HREF ? LANDING_CHECK_ENTRY : g.jumpGate.href) : null;
    const text = why === 'jump_gate' ? `${IMPACT_LINES.jump_gate} ${g.jumpGate.why || JUMP_GATE_DEFAULT_WHY}` : IMPACT_LINES[why];
    if (s.items.some((p) => p.impact)) notes.push({ id: 'impact', text, href });
  }
  if (ease && easePain) {
    notes.push({ id: 'pain_ease', text: PAIN_EASE_LINE });
    notes.push({ id: 'see_someone', text: easeOffClientLine(g.youth) });
  } else if (ease) notes.push({ id: 'readiness', text: readinessEaseLine(eased) });

  const contacts = items.reduce((n, it) => n + (it.impact && it.contacts ? it.contacts * it.sets : 0), 0);
  return { ...base, blocked: false, items, held, notes, contacts };
}
