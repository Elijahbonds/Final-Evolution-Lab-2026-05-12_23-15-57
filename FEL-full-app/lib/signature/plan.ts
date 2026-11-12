// lib/signature/plan.ts — SIGNATURE-PROGRAMS (2026-10-25): a signature program as weeks.
//
// THE COACH TEMPLATES' WAVE, NOT A NEW ONE. Every program week names a step of lib/coach/templates/waves.ts's 4-week wave
// (1 learn the moves, 2 build, 3 build more, 4 the easier week), and that step moves Prime / Key / Assist / Finish the way
// it moves a coach template: the same set deltas (waveSets) and the same effort bands, ADULT_WAVE or — under youth rules
// (lib/coach/taxonomy.ts youthRules) — YOUTH_WAVE, capped at Drive. Prep and Cool-down are written as they run (the Down–Up
// work and the breath), at Idle. So a signature week is built from the same numbers a coach's cloned template is, and
// every prescription is the builder's own shape (lib/coach/loop.ts validateExerciseSpec takes it unchanged:
// ./check.ts holds every week of every program to that).
//
// ADAPTATION IS EVENTS. The plan is the program's weeks with the enrollment's decisions laid over them (./adapt.ts
// decides; the server keeps each one on the enrollment, so the plan reads the same on every visit):
//   · 'advance' at a phase's EARLY checkpoint skips the rest of that phase (the retest read up);
//   · 'repeat' at a phase's END checkpoint runs its last `repeatWeeks` weeks again (a retest read down, a pain flag,
//     low readiness) — at most `maxRepeats` times;
//   · 'continue' changes nothing (the plan runs on schedule).
// Every plan stays within MIN_PROGRAM_WEEKS–MAX_PROGRAM_WEEKS: a decision that would take it outside is not offered
// (decisionOptions), so the owner's "8–12 weeks" holds whatever the retests read.
//
// Pure. Client-safe.
import { waveFor, waveSets } from '@/lib/coach/templates/waves';
import type { WaveBand } from '@/lib/coach/templates/waves';
import { youthSafeCues } from '@/lib/coach/taxonomy';
import type { DecisionKind, ItemSection, PlanEvent, ProgramItem, ProgramPhase, ProgramSession, RetestKind, SignatureProgram } from './types';

/** The owner's range: each program runs 8–12 weeks and adapts. */
export const MIN_PROGRAM_WEEKS = 8;
export const MAX_PROGRAM_WEEKS = 12;

export type PlanBand = WaveBand;

export interface PlanItem {
  /** Stable across visits and edits: "<phaseId>/<sessionKey>/<index>". The owner's edits key on it. */
  key: string;
  /** lib/library entry id. */
  ex: string;
  section: ItemSection;
  sets: number;
  /** The reps text as the builder stores it ("8", "6 each side", "30 s"). */
  reps: string;
  workSeconds: number | null;
  restSeconds: number;
  effortBand: PlanBand;
  isKeySet: boolean;
  /** A jump or a landing: the day's gates may hold it (./serve.ts). */
  impact: boolean;
  /** Foot contacts per set (impact items). */
  contacts: number | null;
  /** The calm step-down when jumps are held. */
  down: string | null;
  setupCues: string[];
}

export interface PlanSession {
  /** "w3:B" — the instance key the enrollment marks done. */
  id: string;
  key: string;
  day: ProgramSession['day'];
  label: string;
  items: PlanItem[];
  retest: RetestKind[];
}

export interface PlanWeek {
  /** 1-based plan week. */
  n: number;
  phaseId: string;
  phaseLabel: string;
  /** 1-based week inside its phase (a repeated week keeps its number). */
  phaseWeek: number;
  wave: 1 | 2 | 3 | 4;
  label: string;
  /** The wave's easier week. */
  easier: boolean;
  /** A week run again by a 'repeat' decision. */
  repeat: boolean;
  /** Where a decision is read once the week's sessions are done. */
  checkpoint: 'early' | 'end' | null;
  sessions: PlanSession[];
}

export const itemKey = (phaseId: string, sessionKey: string, index: number): string => `${phaseId}/${sessionKey}/${index}`;
export const sessionInstanceId = (week: number, sessionKey: string): string => `w${week}:${sessionKey}`;

const WAVE_SECTIONS = new Set<ItemSection>(['prime', 'key', 'assist', 'finish']);

/** One item at one wave step: the builder's prescription fields. */
export function planItem(it: ProgramItem, key: string, wave: 1 | 2 | 3 | 4, youth: boolean): PlanItem {
  const w = waveFor(youth ? 'youth' : 'adult')[wave - 1];
  const moves = WAVE_SECTIONS.has(it.section);
  const section = it.section as 'prime' | 'key' | 'assist' | 'finish';
  const ws = it.secs ?? null;
  return {
    key, ex: it.ex, section: it.section,
    sets: moves ? waveSets(it.sets, w.sets[section]) : it.sets,
    // a timed item's reps state its seconds, with any per-side tail (the builder re-derives anything else)
    reps: ws ? (it.reps ? `${ws} s ${it.reps}` : `${ws} s`) : it.reps ?? '8',
    workSeconds: ws,
    restSeconds: it.rest,
    effortBand: moves ? w.bands[section] : 'idle',
    isKeySet: it.key === true,
    impact: it.contacts != null,
    contacts: it.contacts ?? null,
    down: it.down ?? null,
    setupCues: youth ? youthSafeCues(it.cues ?? []) : [...(it.cues ?? [])],
  };
}

function weekOf(p: SignatureProgram, ph: ProgramPhase, n: number, i: number, opts: { youth: boolean; repeat: boolean; checkpoint: PlanWeek['checkpoint'] }): PlanWeek {
  const pw = ph.weeks[i];
  return {
    n, phaseId: ph.id, phaseLabel: ph.label, phaseWeek: i + 1, wave: pw.wave, label: pw.label, easier: pw.wave === 4,
    repeat: opts.repeat, checkpoint: opts.checkpoint,
    sessions: ph.sessions.map((s) => ({
      id: sessionInstanceId(n, s.key), key: s.key, day: s.day, label: s.label, retest: [...(s.retest ?? [])],
      items: s.items.map((it, ix) => planItem(it, itemKey(ph.id, s.key, ix), pw.wave, opts.youth)),
    })),
  };
}

/** The checkpoint a phase week carries: its last week ends the phase; its `earlyAfterWeek` may end it early. */
function checkpointAt(ph: ProgramPhase, i: number, repeating: boolean): PlanWeek['checkpoint'] {
  if (i === ph.weeks.length - 1) return 'end';
  if (!repeating && ph.exit.earlyAfterWeek === i + 1) return 'early';
  return null;
}

/**
 * The program as weeks, with the enrollment's decisions applied. `cap` false measures a candidate plan's full length
 * (decisionOptions); every plan an athlete sees is capped at MAX_PROGRAM_WEEKS.
 */
export function expandPlan(p: SignatureProgram, opts: { youth: boolean; events?: readonly PlanEvent[]; cap?: boolean }): PlanWeek[] {
  const events = opts.events ?? [];
  const cap = opts.cap !== false;
  const weeks: PlanWeek[] = [];
  for (const ph of p.phases) {
    let i = 0;
    let repeats = 0;
    let repeating = false;
    while (i < ph.weeks.length) {
      if (cap && weeks.length >= MAX_PROGRAM_WEEKS) return weeks;
      const n = weeks.length + 1;
      const checkpoint = checkpointAt(ph, i, repeating);
      weeks.push(weekOf(p, ph, n, i, { youth: opts.youth, repeat: repeating, checkpoint }));
      const ev = events.find((e) => e.afterWeek === n && e.phaseId === ph.id);
      if (ev?.kind === 'advance' && checkpoint === 'early') break;
      if (ev?.kind === 'repeat' && checkpoint === 'end' && repeats < ph.exit.maxRepeats) {
        repeats++;
        repeating = true;
        i = Math.max(0, ph.weeks.length - ph.exit.repeatWeeks);
        continue;
      }
      i++;
    }
  }
  return weeks;
}

/** The plan as written, no decisions: what the overview shows before anyone starts. */
export const plannedWeeks = (p: SignatureProgram): number => expandPlan(p, { youth: false, cap: false }).length;

/** The shortest and longest the plan can run under every decision it can take (the overview's "8–12 weeks"). */
export function planRange(p: SignatureProgram): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const ph of p.phases) {
    const early = ph.exit.earlyAfterWeek;
    min += early && early < ph.weeks.length ? early : ph.weeks.length;
    max += ph.weeks.length + ph.exit.maxRepeats * ph.exit.repeatWeeks;
  }
  return { min: Math.max(min, MIN_PROGRAM_WEEKS), max: Math.min(max, MAX_PROGRAM_WEEKS) };
}

/**
 * Which decisions a checkpoint may take: 'continue' always; 'advance' at an early checkpoint when the whole plan would
 * still run at least MIN_PROGRAM_WEEKS; 'repeat' at an end checkpoint with repeats left when the whole plan, every
 * later phase included, would still fit in MAX_PROGRAM_WEEKS.
 */
export function decisionOptions(p: SignatureProgram, events: readonly PlanEvent[], week: PlanWeek): DecisionKind[] {
  const out: DecisionKind[] = ['continue'];
  if (!week.checkpoint) return out;
  const trial = (kind: DecisionKind) => expandPlan(p, { youth: false, cap: false, events: [...events, { afterWeek: week.n, phaseId: week.phaseId, kind, line: '', reads: {}, at: '' }] });
  if (week.checkpoint === 'early' && trial('advance').length >= MIN_PROGRAM_WEEKS) out.push('advance');
  if (week.checkpoint === 'end') {
    const before = expandPlan(p, { youth: false, cap: false, events }).length;
    const after = trial('repeat').length;
    if (after > before && after <= MAX_PROGRAM_WEEKS) out.push('repeat');
  }
  return out;
}

// ── where the athlete is ──────────────────────────────────────────────────────────────────────────────────────────

export interface Position {
  /** The week holding the next session to do, or null when every session is done. */
  week: PlanWeek | null;
  /** The next session to do. */
  session: PlanSession | null;
  sessionsDone: number;
  sessionsTotal: number;
  /** A checkpoint whose sessions are all done but whose decision has not been taken yet. */
  pendingCheckpoint: PlanWeek | null;
}

/** The next session in order, across the plan (the coach loop's nextSession rule: the first one not done). */
export function positionIn(weeks: readonly PlanWeek[], done: Readonly<Record<string, string>>, events: readonly PlanEvent[]): Position {
  let sessionsDone = 0;
  let sessionsTotal = 0;
  let next: { week: PlanWeek; session: PlanSession } | null = null;
  let pendingCheckpoint: PlanWeek | null = null;
  for (const w of weeks) {
    const all = w.sessions.every((s) => !!done[s.id]);
    for (const s of w.sessions) {
      sessionsTotal++;
      if (done[s.id]) sessionsDone++;
      else if (!next) next = { week: w, session: s };
    }
    if (all && w.checkpoint && !pendingCheckpoint && !events.some((e) => e.afterWeek === w.n && e.phaseId === w.phaseId)) pendingCheckpoint = w;
  }
  return { week: next?.week ?? null, session: next?.session ?? null, sessionsDone, sessionsTotal, pendingCheckpoint };
}
