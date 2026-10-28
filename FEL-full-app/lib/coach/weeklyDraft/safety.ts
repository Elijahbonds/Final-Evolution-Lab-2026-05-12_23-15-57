// lib/coach/weeklyDraft/safety.ts — COACH-AI-DRAFT (2026-10-24): the safety class of a drafted change.
//
// ONE FUNCTION DECIDES WHETHER A CHANGE MAY BE OFFERED, and it reads what the change WRITES, not what it is called. A
// change that raises sets, a load, an RPE or a band, or swaps to anything but the easier step, is a progression whatever
// its kind says — so an edited change, or one an AI layer described differently, is judged by its ops. The rules engine
// runs every change through it; the coach's edit runs through it again before anything is written (./approve.ts).
//
// THE RULES (owner's brief, 2026-10-24, and the app's standing decisions):
//   · a pain flag open → no progression at all ("ease off / see a professional", never "progress");
//   · under youth rules (13–17 with a guardian's coach-training consent) → volume only: never a load, an RPE, a band or a
//     harder swap up, never past MAX_DRAFT_SETS.youth, never an adults-only band (decision #6), never a row that pins;
//   · a lighter week (deload or ease-off drafted), low compliance, a "Limited" status the coach set, or a form drop on
//     that movement pattern → no progression;
//   · never Full throttle (a top set is the coach's to write by hand), never an RPE past MAX_DRAFT_RPE;
//   · never a swap to, or an add of, protocol-gated work (plyometrics, depth drops): FEL's jump checks gate those, and a
//     coach adds them by hand (lib/coach/protocolGate.ts);
//   · everything that only eases, regresses or adds low-load prep work is 'safe'; any progression that passes is 'review';
//   · YOUTH-CONTACT-CAP (2026-10-26): more reps (or a longer hold) is an increase, as more sets is; under youth rules a
//     session never goes past MAX_TEEN_SESSION_CONTACTS jump contacts, no jump set or rep is ever added (PM ruling
//     2026-10-26), and no set is added to a max-effort isometric (./contacts.ts).
//
// Pure, client-safe.

import { isProtocolGated } from '../protocolGate';
import { EFFORT_BANDS, PIN_EXERCISE, bandAllowed } from '../taxonomy';
import { contactProblem, isMaxEffortIsometric, jumpVolumeUp, repsUp } from './contacts';
import { maxSets, numericLoad, rpeOf } from './dose';
import { MAX_DRAFT_RPE } from './thresholds';
import type { DraftCatalogueRow, DraftChange, DraftOp, SafetyClass } from './types';

export interface SafetyContext {
  youth: boolean;
  painOpen: boolean;
  availability: 'full' | 'limited' | 'out' | null;
  lowCompliance: boolean;
  /** An ease-off or a deload with ops is in this week's draft. */
  easierWeek: boolean;
  /** Movement patterns whose Mirror form dropped this week (squat, lunge). */
  formDropPatterns: ReadonlySet<string>;
  catalogue: ReadonlyMap<string, DraftCatalogueRow>;
  /**
   * Under youth rules: each session's jump contacts as written now, by session id (the rules engine reads the program,
   * approval reads the rows fresh). Without it, a change is judged by the rows it touches alone.
   */
  sessionContacts?: Readonly<Record<string, number>>;
}

const bandIndex = (id: string | null) => (id ? EFFORT_BANDS.findIndex((b) => b.id === id) : -1);

/** The easier ladder below a row, as ids (regressionOfId, again and again, at most 6 steps, no loops). */
function easierIds(fromId: string, cat: ReadonlyMap<string, DraftCatalogueRow>): Set<string> {
  const out = new Set<string>();
  let cur = cat.get(fromId);
  for (let i = 0; i < 6 && cur?.regressionOfId && !out.has(cur.regressionOfId); i++) {
    out.add(cur.regressionOfId);
    cur = cat.get(cur.regressionOfId);
  }
  return out;
}

export interface OpRead {
  increase: boolean;
  /** An increase in load, RPE, band, or a harder swap: what youth rules never allow (volume alone may move). */
  intensityUp: boolean;
  problems: string[];
}

/** What one op does, and anything about it that is never allowed. */
export function readOp(op: DraftOp, ctx: Pick<SafetyContext, 'youth' | 'catalogue'>): OpRead {
  const problems: string[] = [];
  let increase = false;
  let intensityUp = false;
  const rowOf = (id: string) => ctx.catalogue.get(id);
  const gateProblems = (id: string, name: string) => {
    const row = rowOf(id);
    if (!row) problems.push(`${name} is not in your catalogue.`);
    else if (isProtocolGated(row)) problems.push(`${name} is jump or drop work. FEL's jump checks gate it, so add it by hand if you want it.`);
    if (ctx.youth && PIN_EXERCISE.test(row?.name ?? name)) problems.push(`${name} pins. Pin-and-stretch work is for adults.`);
  };

  if (op.action === 'add') {
    gateProblems(op.exerciseId, op.exerciseName);
    const band = typeof op.body.effortBand === 'string' ? op.body.effortBand : null;
    if (band && !bandAllowed(band, ctx.youth)) problems.push('Full throttle is for adults.');
    return { increase: false, intensityUp: false, problems };
  }

  const { before: b, after: a } = op;
  if (a.sets > b.sets) increase = true;
  if (repsUp(b.reps, a.reps)) increase = true;
  if (ctx.youth && a.sets > b.sets && isMaxEffortIsometric(b, rowOf(b.exerciseId))) {
    problems.push(`${b.exerciseName} is a max-effort isometric. Under 18 it gets no more sets: max-effort isometrics are for adults.`);
  }
  if (a.sets > maxSets(ctx.youth)) problems.push(`A draft writes at most ${maxSets(ctx.youth)} sets${ctx.youth ? ' for an athlete under 18' : ''}.`);
  if (a.sets < 1) problems.push('A row needs at least one set.');
  const nb = numericLoad(b.load), na = numericLoad(a.load);
  if (nb && na && nb.unit === na.unit && na.value > nb.value) { increase = true; intensityUp = true; }
  const rb = rpeOf(b.load), ra = rpeOf(a.load);
  if (ra != null && (rb == null || ra > rb)) {
    increase = true; intensityUp = true;
    if (ra > MAX_DRAFT_RPE) problems.push(`A draft never sets an effort past RPE ${MAX_DRAFT_RPE}.`);
  }
  if (bandIndex(a.effortBand) > bandIndex(b.effortBand)) { increase = true; intensityUp = true; }
  if (a.effortBand === 'full' && b.effortBand !== 'full') problems.push('A draft never writes a top set (Full throttle). Set one yourself if you want it.');
  if (!bandAllowed(a.effortBand, ctx.youth)) problems.push('Full throttle is for adults.');
  if (a.exerciseId !== b.exerciseId) {
    gateProblems(a.exerciseId, a.exerciseName);
    if (!easierIds(b.exerciseId, ctx.catalogue).has(a.exerciseId)) { increase = true; intensityUp = true; }
  }
  return { increase, intensityUp, problems };
}

/** The class of one change in this week's context, and why when it is held. */
export function classify(change: Pick<DraftChange, 'ops' | 'exerciseName'>, ctx: SafetyContext): { safety: SafetyClass; why: string | null } {
  const reads = change.ops.map((op) => readOp(op, ctx));
  const problem = reads.flatMap((r) => r.problems)[0];
  if (problem) return { safety: 'unsafe', why: problem };
  if (ctx.youth) {
    const contacts = contactProblem(change.ops, ctx.catalogue, ctx.sessionContacts);
    if (contacts) return { safety: 'unsafe', why: contacts };
    if (jumpVolumeUp(change.ops, ctx.catalogue)) {
      return { safety: 'unsafe', why: 'Under 18: a draft never adds jump sets or reps. More jumps are your call: add them by hand if you want them.' };
    }
  }
  const increase = reads.some((r) => r.increase);
  if (!increase) return { safety: 'safe', why: null };
  if (ctx.painOpen) return { safety: 'unsafe', why: 'A pain flag is open. Nothing moves up until it has settled.' };
  if (ctx.youth && reads.some((r) => r.intensityUp)) {
    return { safety: 'unsafe', why: 'Under 18: the draft moves volume only, never load or effort, within the coach training their guardian approved.' };
  }
  if (ctx.availability === 'limited' || ctx.availability === 'out') return { safety: 'unsafe', why: 'You marked them Limited. Nothing moves up while they are.' };
  if (ctx.lowCompliance) return { safety: 'unsafe', why: 'They have missed sessions. Get them back to the plan before it grows.' };
  if (ctx.easierWeek) return { safety: 'unsafe', why: 'This is a lighter week. Progress comes back next week.' };
  const patterns = change.ops.flatMap((op) => (op.action === 'update' ? [ctx.catalogue.get(op.before.exerciseId)?.pattern ?? null] : []));
  if (patterns.some((p) => p != null && ctx.formDropPatterns.has(p))) {
    return { safety: 'unsafe', why: 'Their Mirror form dropped on this movement. Technique comes back before the load does.' };
  }
  return { safety: 'review', why: null };
}
