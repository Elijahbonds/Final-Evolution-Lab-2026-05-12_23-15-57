// lib/coach/weeklyDraft/firstBlock.ts — COACH-DELIVERY COA-02 (2026-10-27): draft a client's FIRST block from what the coach
// knows at the start — the intake answers the coach can see and the athlete's Mirror screen — with the weekly-draft
// engine's rules picking the work and the AI (optional) only wording it. The pure half.
//
// THE RULES PICK THE WORK, every one an existing rule:
//   · the TEMPLATE: lib/coach/templates templateFor — days a week and equipment from the intake, YOUTH from the birth year on
//     file (lib/coach/taxonomy.ts youthRules: under 18 or blank → a youth template, no jumps, no band above Drive);
//   · the CORRECTIVES: the Mirror screen's own draft (lib/coach/mirrorToProgram.ts coachDraft: from the coach's OWN
//     catalogue, matched on tags, a finding with no match is shown and not invented) go into each session's PREP, the
//     weekly draft's rule 7 (at most MAX_CORRECTIVES of them, highest-cost finding first, as coachDraft orders them);
//   · every line is a line the coach REVIEWS: each carries why it is there, and an unticked line is not written.
// THE WRITE is the paste-a-program import's (lib/coach/import/apply.ts through the builder's 'import_program' action): a
// BLANK program only, every builder validator, youth rules and pins, the coach's own catalogue (a template exercise is
// seeded with its cues and faults), ONE nested write — so applying is one step, and so is undoing (back to blank weeks,
// while nothing has been logged).
//
// WHAT THE AI SEES (aiFirstBlockPayload): the template's name and the coach's own lines — exercise names, sets, reps,
// sections. NEVER health data: no intake answer (the intake is health data, lib/health/intake.ts), no screen finding, no
// score, no pain, readiness, age or name (tests/coach-delivery/first-block.test.ts walks the payload). It returns notes
// for the coach only; a note with a medical word is dropped (weeklyDraft/ai.ts cleanAiText). Off unless the Abacus switch
// is on, and only for an adult client.
//
// Pure.
import { nameKey } from '../catalogue';
import { templateExercise } from '../templateCatalogue';
import { planTemplateClone, templateAllowedFor, templateFor, type ProgramTemplate, type TemplateEquipment } from '../templates';
import type { ConfirmItem, ConfirmWeek } from '../import/types';
import type { Prescription } from '../mirrorToProgram';
import { AI_SUMMARY_CHARS, cleanAiText, type AiCaller } from './ai';
import { withPainSafety } from '../aiSystemPrompt';

/** (new) Screen correctives added to each session's Prep in a first block. */
export const MAX_CORRECTIVES = 2;

export interface FirstBlockAnswers { daysPerWeek: number; equipment: TemplateEquipment; goal: string | null }

/** The coach's form answers (days 2–4, equipment), the program's own shape as the default. */
export function cleanAnswers(raw: Record<string, unknown>, fallbackDays: number): FirstBlockAnswers {
  const d = Number(raw.daysPerWeek ?? fallbackDays);
  return {
    daysPerWeek: Number.isFinite(d) ? Math.min(4, Math.max(2, Math.round(d))) : 3,
    equipment: raw.equipment === 'gym' ? 'gym' : 'bodyweight',
    goal: typeof raw.goal === 'string' && raw.goal.trim() ? raw.goal.trim().slice(0, 200) : null,
  };
}

export interface DraftLine extends ConfirmItem { id: string; name: string; why: string }
export interface DraftDay { label: string; items: DraftLine[] }
export interface DraftWeek { label: string; days: DraftDay[] }

export interface FirstBlockDraft {
  templateId: string;
  templateName: string;
  reasons: string[];
  weeks: DraftWeek[];
  /** Screen findings with no exercise in the coach's catalogue: shown, never invented. */
  unmatched: { title: string; wanted: string[] }[];
  summary: string | null;
  engine: 'rules' | 'rules+ai';
}

/** The draft (see the header). `catalogue` is the coach's own rows (a template exercise they already have is used as theirs). */
export function draftFirstBlock(o: {
  answers: FirstBlockAnswers; youth: boolean; prescriptions: readonly Prescription[];
  catalogue: readonly { id: string; name: string }[];
}): FirstBlockDraft {
  const t: ProgramTemplate = templateFor({ daysPerWeek: o.answers.daysPerWeek, equipment: o.answers.equipment, youth: o.youth });
  if (!templateAllowedFor(t, o.youth)) throw new Error('templateFor picked a template the athlete may not have');
  const plan = planTemplateClone(t);
  const own = new Map(o.catalogue.map((c) => [nameKey(c.name), c]));
  const correctives = o.prescriptions.filter((p) => p.exercise).slice(0, MAX_CORRECTIVES);
  const templateWhy = `${t.name}: ${t.summary}`;
  let n = 0;
  const weeks: DraftWeek[] = plan.blocks.map((b) => ({
    label: b.label,
    days: b.sessions.map((s) => ({
      label: s.label,
      items: [
        ...correctives.map((p): DraftLine => ({
          id: `l${++n}`, name: p.exercise!.name, why: p.because, pick: { kind: 'catalogue', id: p.exercise!.id },
          section: 'prep', sets: p.sets, reps: p.workSeconds ? null : p.reps, workSeconds: p.workSeconds, restSeconds: 30, note: p.because.slice(0, 280),
        })),
        ...s.items.map((i): DraftLine => {
          const name = templateExercise(i.exercise)?.catalogue.name ?? i.exercise;
          const mine = own.get(nameKey(name));
          const sp = i.spec as Record<string, unknown>;
          return {
            id: `l${++n}`, name, why: templateWhy, pick: mine ? { kind: 'catalogue', id: mine.id } : { kind: 'template', key: i.exercise },
            section: sp.section as ConfirmItem['section'], isKeySet: sp.isKeySet === true, superset: (sp.supersetGroup as string | undefined) ?? null,
            sets: sp.sets as number, reps: (sp.reps as string | undefined) ?? null, load: (sp.load as string | undefined) ?? '', tempo: (sp.tempo as string | undefined) ?? null,
            restSeconds: (sp.restSeconds as number | undefined) ?? null, workSeconds: (sp.workSeconds as number | undefined) ?? null,
            holdSeconds: (sp.holdSeconds as number | undefined) ?? null, effortBand: (sp.effortBand as string | undefined) ?? null,
            setupCues: Array.isArray(sp.setupCues) ? (sp.setupCues as string[]) : null, note: (sp.coachNote as string | null | undefined) ?? null,
          };
        }),
      ],
    })),
  }));
  const reasons = [
    `${o.answers.daysPerWeek} days a week, ${o.answers.equipment === 'gym' ? 'a gym' : 'bodyweight only'}${o.youth ? ', youth rules (under 18 or no birth year on file)' : ''}: ${t.name}.`,
    ...(o.answers.goal ? [`Their goal, as the coach can see it: “${o.answers.goal}”.`] : []),
    correctives.length ? `From their Mirror screen: ${correctives.map((p) => p.title).join('; ')} — in Prep.` : 'No graded Mirror screen finding to program from.',
  ];
  return {
    templateId: t.id, templateName: t.name, reasons, weeks,
    unmatched: o.prescriptions.filter((p) => !p.exercise).map((p) => ({ title: p.title, wanted: p.wanted })), summary: null, engine: 'rules',
  };
}

/** The confirmed grid for the import: the lines the coach left ticked (`keep`), as ConfirmWeek[]. */
export function confirmedGrid(d: Pick<FirstBlockDraft, 'weeks'>, keep: ReadonlySet<string> | null): ConfirmWeek[] {
  return d.weeks.map((w) => ({
    label: w.label,
    days: w.days.map((day) => ({ label: day.label, items: day.items.filter((l) => !keep || keep.has(l.id)).map(({ id: _i, name: _n, why: _w, ...item }) => item) })),
  }));
}

// ── the AI layer: wording only ──────────────────────────────────────────────────────────────────────────────────────

/** What the model is shown: the template's name and the first week's template lines. Nothing about the athlete, no screen line. */
export function aiFirstBlockPayload(d: Pick<FirstBlockDraft, 'templateName' | 'weeks'>): { template: string; week: { day: string; lines: { exercise: string; section: string; dose: string }[] }[] } {
  return {
    template: d.templateName,
    week: (d.weeks[0]?.days ?? []).map((day) => ({
      day: day.label,
      // the screen's Prep correctives are left out: which corrective a coach chose says what the camera saw
      lines: day.items.filter((l) => l.section !== 'prep').map((l) => ({ exercise: l.name, section: String(l.section ?? 'key'), dose: `${l.sets ?? '-'}×${l.reps ?? (l.workSeconds ? `${l.workSeconds}s` : '-')}` })),
    })),
  };
}

export function aiFirstBlockSystem(): string {
  return withPainSafety([
    "You help a strength coach review the FIRST block of a new client's program. FEL's rules picked every exercise and dose; you never add, remove or change one.",
    'Write ONE line (at most 30 words) to the COACH saying what this first block builds and what to watch in week one. Plain coaching words.',
    'Never give medical advice: no diagnosis, no condition names, no treatment, no injury talk, no promises.',
    'Reply with JSON only: {"summary": string}.',
  ].join('\n'), { isMinor: false });
}

/** The draft with the AI's one line, or as it was (switch off, a teen client, any failure, a medical word). */
export async function wordFirstBlock(d: FirstBlockDraft, call: AiCaller | null, adult: boolean): Promise<FirstBlockDraft> {
  if (!call || !adult) return d;
  try {
    const text = await call(aiFirstBlockSystem(), JSON.stringify(aiFirstBlockPayload(d)));
    const m = /\{[\s\S]*\}/.exec(text);
    const summary = m ? cleanAiText((JSON.parse(m[0]) as { summary?: unknown }).summary as string, AI_SUMMARY_CHARS) : null;
    return summary ? { ...d, summary, engine: 'rules+ai' } : d;
  } catch {
    return d;
  }
}
