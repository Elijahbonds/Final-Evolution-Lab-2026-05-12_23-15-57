/**
 * lib/workout/relaunch.ts — MIRROR-COACH P8 (2026-09-29): what a /workout plan is now, built from a FEL template, and how
 * it reads behind the protocol gate. PURE: no Prisma client value, no fetch, no clock of its own.
 *
 * WHAT WAS WRONG. The old plan generator (lib/workout/plan-generator.ts generatePlan) gave every buyer one flat plan:
 * the page sent no scan, so everyone planned from defaultMetrics (Mobility focus); the sets and reps never changed in
 * 12 weeks; and it put "Depth Drop to Vertical" 4x4 in week 1 with no gate (the crossref: "/workout bypasses it and
 * gives every buyer Depth Drop to Vertical 4×4 in week 1"). P1 pulled it from sale (owner decision #3); P2 swapped the
 * depth drops out of every stored plan (#22).
 *
 * WHAT A PLAN IS NOW (owner decisions #3, #10, #24; P8 rule (c)).
 *   · A FEL TEMPLATE MATCHED TO THE BUYER'S ANSWERS — days a week and equipment — by lib/coach/templates templateFor.
 *     The server decides youth from the account's birth year (lib/mirror/youth.ts isMinorForMirror, the one age truth:
 *     under 18, or no birth year, is youth — decision #20), and youth gets a youth template: bodyweight, no jumps, no
 *     band above Drive. The page's answers can pick the days and the equipment, never the audience.
 *   · ITS WAVES: the 4-week plan is the template's first wave, the 12-week plan its three (expandTemplate wave 1, 2, 3):
 *     weeks 1–3 build and week 4 is easier — FEL's choice, said as FEL's choice (waves.ts WAVE_LINE). The /workout copy
 *     calls this "four-week waves", never "periodized".
 *   · STORED AS A SNAPSHOT (templatePlanWeeks): the weeks as they were bought, one row per item — what a template edit
 *     later must not silently change under a buyer. Each week carries `source` TEMPLATE_PLAN_SOURCE and its template's
 *     id, and holds `sessions`, not `days`: every P1/P2 revision function (plan-revision.ts) skips a week with no `days`
 *     array, so a template plan passes through the stored-plan revision and the backfill untouched (relaunch.test.ts).
 *   · NEVER A DEPTH DROP, anywhere: no FEL template programs one (templates/index.ts templateProblems refuses it), and a
 *     jump never climbs a wave (expandTemplate moves only what does not land), so no week of any plan reaches the depth
 *     drop at the top of the vertical-jump ladder. Measured in relaunch.test.ts for every answer, both products, adult
 *     and youth: 0 depth drops in any week, and 0 gated items of any kind for youth or a blank birth year.
 *
 * THE PROTOCOL GATE, AT READ TIME (P8 rule (b); lib/coach/protocolGate.ts). An adult template opens some days with ONE
 * jump (Prime). The stored plan keeps it as written; every read runs the gate for the reader, today (gatedPlanView): open
 * — the jump shows; shut — the jump is replaced by the first rung down its ladder that does not land, walked by the
 * gate's own easierUngatedStep over the template catalogue's ladders (the same coach/template scope rule: a template
 * item steps down only to a template rung), with the gate's one line why and its link; with no such rung, held back.
 * `coachAssigned: false` always: a /workout plan is a FEL template the athlete bought, so the youth rule is never
 * lifted (decision #6; protocolGateServer.ts coachAssignedProgram). Today's pain decision cannot be known when a plan is
 * bought, which is why the gate reads at read time and nothing gated is decided at purchase.
 */
import { doseLine } from '@/lib/coach/structure';
import { TEMPLATE_EXERCISES, easierKey, templateExercise } from '@/lib/coach/templateCatalogue';
import { expandTemplate, templateFor, type ProgramTemplate, type TemplatePrescription } from '@/lib/coach/templates';
import {
  GATE_UNREAD_LINE, GATE_UNREAD_REASON, athleteWhy, easierReps, easierUngatedStep, heldLine, isProtocolGated, itemReasons, leadReason, swappedLine,
  type GateRow, type ProtocolReason,
} from '@/lib/coach/protocolGate';
import { isDepthDrop } from './plan-generator';
import { productFor, type WorkoutAnswers, type WorkoutTier } from './plan-sale';

// ── the plan as stored ───────────────────────────────────────────────────────────────────────────────────────────────

/** The mark on every week of a template-built plan (WorkoutPlan.weeks[i].source). */
export const TEMPLATE_PLAN_SOURCE = 'fel-template';

/** One item of one session, as the plan stores it: the prescription a reader needs, not the builder's whole spec. */
export interface TemplatePlanItem {
  /** templateCatalogue.ts key. */
  exercise: string;
  name: string;
  section: 'prime' | 'key' | 'assist' | 'finish';
  isKeySet?: true;
  supersetGroup?: string;
  sets: number;
  reps: string;
  restSeconds: number;
  workSeconds?: number;
  holdSeconds?: number;
  effortBand: string;
  /** The exercise's first cue. */
  cue: string;
  /** A jump or a drop: the protocol gate decides it at every read. */
  gated?: true;
}

export interface TemplatePlanSession { day: string; label: string; items: TemplatePlanItem[] }

export interface TemplatePlanWeek {
  source: typeof TEMPLATE_PLAN_SOURCE;
  /** The template's id (lib/coach/templates TEMPLATES). */
  template: string;
  week: number;
  label: string;
  /** Week 4 of a wave: FEL's easier week. */
  easier: boolean;
  sessions: TemplatePlanSession[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Is this stored plan one of these (every week marked, each with sessions)? A legacy plan is anything else. */
export function isTemplatePlan(weeks: unknown): weeks is TemplatePlanWeek[] {
  return Array.isArray(weeks) && weeks.length > 0
    && weeks.every((w) => isObj(w) && w.source === TEMPLATE_PLAN_SOURCE && typeof w.template === 'string' && Array.isArray(w.sessions));
}

/** The template a stored plan was built from, or null. */
export const templateIdOf = (weeks: unknown): string | null => (isTemplatePlan(weeks) ? weeks[0].template : null);

/** Does the protocol gate decide this item? A jump or a drop by the template's own impact tag, by the gate's catalogue
 *  test (protocolGate.ts gatedKind: a depth drop by name, jump work by category or skill layer), or by name alone. */
export function isGatedTemplateItem(it: { exercise?: unknown; name?: unknown; gated?: unknown }): boolean {
  if (it.gated === true) return true;
  const ex = typeof it.exercise === 'string' ? templateExercise(it.exercise) : null;
  if (ex && (ex.impact !== null || isProtocolGated(ex.catalogue))) return true;
  return isDepthDrop({ name: it.name });
}

function storedItem(p: TemplatePrescription): TemplatePlanItem {
  const gated = isGatedTemplateItem({ exercise: p.exercise, name: p.name }) || p.impact !== null;
  return {
    exercise: p.exercise, name: p.name, section: p.section as TemplatePlanItem['section'],
    ...(p.isKeySet ? { isKeySet: true as const } : {}),
    ...(p.supersetGroup ? { supersetGroup: p.supersetGroup } : {}),
    sets: p.sets, reps: p.reps, restSeconds: p.restSeconds,
    ...(p.workSeconds ? { workSeconds: p.workSeconds } : {}),
    ...(p.holdSeconds ? { holdSeconds: p.holdSeconds } : {}),
    effortBand: p.effortBand, cue: p.cue,
    ...(gated ? { gated: true as const } : {}),
  };
}

/**
 * The weeks a /workout purchase stores: the template's first wave for the 4-week plan, its three waves for the 12-week
 * one. A camp template is a coach's session, never a /workout plan: it throws (templateFor never picks it).
 */
export function templatePlanWeeks(t: ProgramTemplate, tier: WorkoutTier): TemplatePlanWeek[] {
  if (t.kind !== 'program') throw new Error(`${t.id} is not a program template`);
  const product = productFor(tier);
  if (!product) throw new Error(`unknown tier ${tier}`);
  const waves = ([1, 2, 3] as const).slice(0, product.waves);
  return waves.flatMap((wave) => expandTemplate(t, { wave })).map((w) => ({
    source: TEMPLATE_PLAN_SOURCE, template: t.id, week: w.week, label: w.label, easier: w.easier,
    sessions: w.sessions.map((s) => ({ day: s.day, label: s.label, items: s.items.map(storedItem) })),
  }));
}

/** The template for these answers and this reader (lib/coach/templates/list.ts templateFor). */
export const pickTemplate = (answers: WorkoutAnswers, youth: boolean): ProgramTemplate =>
  templateFor({ daysPerWeek: answers.daysPerWeek, equipment: answers.equipment, youth });

/** Does any week hold an item the gate decides? The server reads the gate's tables only when one does. */
export const hasGatedItem = (weeks: readonly TemplatePlanWeek[]): boolean =>
  weeks.some((w) => w.sessions.some((s) => s.items.some((i) => isGatedTemplateItem(i))));

// ── the gate, over the template ladders ──────────────────────────────────────────────────────────────────────────────

/** A template exercise as the gate reads a catalogue row: its easier version is its regressionOfId. */
function gateRowFor(key: string): GateRow | null {
  const e = templateExercise(key);
  if (!e) return null;
  return { id: e.key, name: e.catalogue.name, category: e.catalogue.category, skillLayer: e.catalogue.skillLayer, regressionOfId: easierKey(e.key) };
}

/** Every template rung, as gate rows by key: the ladder the gate walks for a /workout plan (the template scope). */
export const TEMPLATE_GATE_LADDER: ReadonlyMap<string, GateRow> = new Map(
  TEMPLATE_EXERCISES.map((e) => [e.key, gateRowFor(e.key) as GateRow]),
);

/**
 * What the page shows when the gate's facts could not be read (a database error): gated items take their easier step
 * with this line — the careful direction — and the next read tries again. MIRROR-COACH P8 FIX (2026-09-30): the line
 * lives in lib/coach/protocolGate.ts now, because Today closes the gate the same way on a failed read.
 */
export { GATE_UNREAD_LINE, GATE_UNREAD_REASON };

/** The reasons the reader's gate is shut (protocolGate.ts protocolReasons over their facts), or 'unread'. */
export type PlanGateFacts = readonly ProtocolReason[] | typeof GATE_UNREAD_REASON;

/** The line on a swapped item: the Today card's shape (lib/coach/today.ts TodayGateNote). */
export interface PlanGateNote { from: { id: string; name: string }; line: string; href: string | null; reason: string }
/** An item held back today (no ungated rung below it): the Today held list's shape (TodayHeldItem). */
export interface PlanHeldItem { id: string; name: string; line: string; href: string | null; reason: string }

export interface PlanItemView {
  /** Stable within the plan: "<week>-<session>-<item>". */
  id: string;
  exercise: string;
  name: string;
  section: string;
  isKeySet: boolean;
  supersetGroup: string | null;
  /** "3 × 8 · Drive" (lib/coach/structure.ts doseLine). */
  dose: string;
  restSeconds: number;
  cue: string;
  gate?: PlanGateNote;
}
export interface PlanSessionView { day: string; label: string; items: PlanItemView[]; held: PlanHeldItem[] }
export interface PlanWeekView { week: number; label: string; easier: boolean; sessions: PlanSessionView[] }
export interface GatedPlanView { weeks: PlanWeekView[]; gatedItems: number; swapped: number; held: number }

/**
 * A jump's dose, read for its easier step (lib/coach/protocolGate.ts easierReps — MIRROR-COACH P8 FIX, 2026-09-30: moved
 * there so Today's swap strips the jump noun the same way this page does).
 */
export { easierReps };

/** "3 × 8 · Drive": P2's one dose line (the band's label comes from lib/coach/taxonomy.ts EFFORT_BANDS through it). */
const doseOf = (it: TemplatePlanItem, reps: string) =>
  doseLine({ sets: it.sets, reps, workSeconds: it.workSeconds ?? null, holdSeconds: it.holdSeconds ?? null, effortBand: it.effortBand });

/**
 * THE PLAN AS THIS READER SEES IT TODAY. Every gated item goes through the gate (coachAssigned false): open — as
 * written; shut — its ladder's first ungated rung (protocolGate.ts easierUngatedStep over TEMPLATE_GATE_LADDER) with the
 * gate's one line and link, or held back with the gate's held line when there is none. Every other item is as stored.
 * `athlete` = protocolGate.ts protocolReasons for the reader now, or 'unread' (GATE_UNREAD_LINE, swapped where it can
 * be). A stored item this catalogue no longer knows is still gated when its stored mark or its name says so, and with no
 * ladder to walk it is held back.
 */
export function gatedPlanView(weeks: readonly TemplatePlanWeek[], athlete: PlanGateFacts): GatedPlanView {
  let gatedItems = 0, swapped = 0, held = 0;
  const out = weeks.map((w): PlanWeekView => ({
    week: w.week, label: w.label, easier: w.easier === true,
    sessions: w.sessions.map((s, si): PlanSessionView => {
      const items: PlanItemView[] = [];
      const heldHere: PlanHeldItem[] = [];
      s.items.forEach((it, ii) => {
        const id = `${w.week}-${si + 1}-${ii + 1}`;
        const asWritten: PlanItemView = {
          id, exercise: it.exercise, name: it.name, section: it.section, isKeySet: it.isKeySet === true, supersetGroup: it.supersetGroup ?? null,
          dose: doseOf(it, it.reps), restSeconds: it.restSeconds, cue: it.cue,
        };
        if (!isGatedTemplateItem(it)) { items.push(asWritten); return; }
        gatedItems++;
        const unread = athlete === GATE_UNREAD_REASON;
        const reasons: ProtocolReason[] = athlete === GATE_UNREAD_REASON ? [] : itemReasons(athlete, { coachAssigned: false });
        if (!unread && reasons.length === 0) { items.push(asWritten); return; }
        const row: GateRow = gateRowFor(it.exercise) ?? { id: it.exercise, name: it.name, category: 'plyometric' };
        // a row the gate itself would not call gated (a stored mark, or a depth drop by name) still takes the ladder walk
        const to = easierUngatedStep(isProtocolGated(row) ? row : { ...row, category: 'plyometric' }, TEMPLATE_GATE_LADDER);
        const lead = unread ? GATE_UNREAD_REASON : (leadReason(reasons) ?? reasons[0]);
        const why = unread ? { why: GATE_UNREAD_LINE, href: null } : athleteWhy(reasons);
        const step = to ? templateExercise(to.id) : null;
        if (!step) {
          held++;
          heldHere.push({ id, name: it.name, line: heldLine(it.name, why.why), href: why.href, reason: lead });
          return;
        }
        swapped++;
        items.push({
          ...asWritten, exercise: step.key, name: step.catalogue.name, cue: step.catalogue.primaryCues[0] ?? '',
          dose: doseOf(it, easierReps(it.reps)),
          gate: { from: { id: it.exercise, name: it.name }, line: swappedLine(it.name, why.why), href: why.href, reason: lead },
        });
      });
      return { day: s.day, label: s.label, items, held: heldHere };
    }),
  }));
  return { weeks: out, gatedItems, swapped, held };
}
