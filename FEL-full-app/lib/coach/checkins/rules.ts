// lib/coach/checkins/rules.ts — COACH-PARITY (2026-10-26): a coach's check-in form, checked; who sees which question; an
// athlete's answers, checked; and the answers read back over time. Pure.
//
// WHO SEES WHICH QUESTION (questionsFor). The gates are the app's own, not new ones:
//   · a TEEN (13–17 with a guardian's coach-training consent, lib/coach/teenGate.ts) gets training questions only, and no
//     free text: their consent covers training data (set logs, sessions, goals), not health, and free text is where health
//     ends up unasked. No pain check either (the pain write is verified-adults-only, lib/privacy/healthWriteGate.ts).
//   · an ADULT gets every training question and the free text; the health questions too when the health switch is on
//     (COACH_PARITY_HEALTH_ENABLED, the draft wording) — saved only with a live health_data grant (lib/health/consent.ts).
//   · nobody gets a pain question: there is none (lib/coach/parity/topic.ts). painCheck hands an adult FEL's pain check-in.
import { addDays, weekKeyOf } from '@/lib/groups/week';
import { settleTopic } from '../parity/topic';
import { QUESTION_KINDS, type Answerer, type AnswerRow, type Answers, type AnswerValue, type Cadence, type CheckinFormRow, type CheckinQuestion, type QuestionKind } from './types';

export const LIMITS = { title: 80, prompt: 140, questions: 12, choices: 6, choice: 40, unit: 12, text: 500, formsPerCoach: 40 } as const;
export const SCALE = { min: 1, max: 10 } as const;
export const NUMBER = { min: -100_000, max: 1_000_000 } as const;
/** The answers-over-time view: the newest this many periods. */
export const HISTORY_PERIODS = 12;

export type FormError =
  | 'title_required' | 'cadence' | 'no_questions' | 'too_many_questions' | 'question_kind' | 'prompt_required'
  | 'question_is_pain' | 'health_off' | 'choices' | 'unit';

export interface CleanForm { title: string; cadence: Cadence; painCheck: boolean; questions: CheckinQuestion[] }

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const ID = /^q[a-z0-9]{1,12}$/;

/** A form from a request: every question checked and its topic settled (raised to health by its words, never lowered). */
export function cleanForm(body: unknown, o: { healthEnabled: boolean }): { ok: true; form: CleanForm } | { ok: false; error: FormError; at?: number } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const title = text(b.title, LIMITS.title);
  if (!title) return { ok: false, error: 'title_required' };
  if (b.cadence !== 'weekly' && b.cadence !== 'once') return { ok: false, error: 'cadence' };
  const raw = Array.isArray(b.questions) ? b.questions : [];
  if (!raw.length && b.painCheck !== true) return { ok: false, error: 'no_questions' };
  if (raw.length > LIMITS.questions) return { ok: false, error: 'too_many_questions' };
  const used = new Set<string>();
  const questions: CheckinQuestion[] = [];
  for (const [i, r] of raw.entries()) {
    const q = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    if (!QUESTION_KINDS.includes(q.kind as QuestionKind)) return { ok: false, error: 'question_kind', at: i };
    const kind = q.kind as QuestionKind;
    const prompt = text(q.prompt, LIMITS.prompt);
    if (!prompt) return { ok: false, error: 'prompt_required', at: i };
    const choices = kind === 'choice' ? (Array.isArray(q.choices) ? q.choices : []).map((c) => text(c, LIMITS.choice)).filter(Boolean) : [];
    const settled = settleTopic(`${prompt} ${choices.join(' ')}`, q.topic);
    if (!settled) return { ok: false, error: 'question_is_pain', at: i };
    if (settled.topic === 'health' && !o.healthEnabled) return { ok: false, error: 'health_off', at: i };
    if (kind === 'choice' && (choices.length < 2 || choices.length > LIMITS.choices || new Set(choices.map((c) => c.toLowerCase())).size !== choices.length)) {
      return { ok: false, error: 'choices', at: i };
    }
    const unit = kind === 'number' ? text(q.unit, LIMITS.unit) || null : null;
    if (kind === 'number' && unit && !/^[\p{L}%°/.\s-]+$/u.test(unit)) return { ok: false, error: 'unit', at: i };
    let id = typeof q.id === 'string' && ID.test(q.id) && !used.has(q.id) ? q.id : '';
    for (let n = i + 1; !id; n += 1) { const c = `q${n}`; if (!used.has(c) && !raw.some((x) => (x as { id?: unknown })?.id === c && x !== r)) id = c; }
    used.add(id);
    questions.push({
      id, kind, prompt, topic: settled.topic,
      ...(settled.bodyOrDiet ? { bodyOrDiet: true } : {}),
      ...(kind === 'number' ? { unit } : {}),
      ...(kind === 'choice' ? { choices } : {}),
    });
  }
  return { ok: true, form: { title, cadence: b.cadence, painCheck: b.painCheck === true, questions } };
}

/** The questions this athlete is asked (see the header): training first, then health in its own section. */
export function questionsFor(questions: readonly CheckinQuestion[], who: Answerer): { training: CheckinQuestion[]; health: CheckinQuestion[] } {
  const training = questions.filter((q) => q.topic === 'training' && (who.band === 'adult' || q.kind !== 'text'));
  const health = who.band === 'adult' && who.healthShown ? questions.filter((q) => q.topic === 'health') : [];
  return { training, health };
}

/** Is FEL's pain check-in offered with this form, to this athlete? Adults only, like the pain write itself. */
export const offersPainCheck = (form: Pick<CheckinFormRow, 'painCheck'>, who: Pick<Answerer, 'band'>): boolean => form.painCheck && who.band === 'adult';

export type AnswerError = 'no_answers' | 'bad_answer';

function cleanValue(q: CheckinQuestion, v: unknown): AnswerValue | null | undefined {
  if (v === null || v === undefined || v === '') return null;   // skipped
  switch (q.kind) {
    case 'scale': return typeof v === 'number' && Number.isInteger(v) && v >= SCALE.min && v <= SCALE.max ? v : undefined;
    case 'yesno': return typeof v === 'boolean' ? v : undefined;
    case 'number': return typeof v === 'number' && Number.isFinite(v) && v >= NUMBER.min && v <= NUMBER.max ? Math.round(v * 100) / 100 : undefined;
    case 'choice': return typeof v === 'string' && (q.choices ?? []).includes(v) ? v : undefined;
    case 'text': { const t = text(v, LIMITS.text); return t || null; }
  }
}

/** The answers to these questions from a request: unknown ids dropped, a skipped one left out, a wrong one refused. */
export function cleanAnswers(questions: readonly CheckinQuestion[], raw: unknown): { ok: true; answers: Answers } | { ok: false; error: AnswerError; id?: string } {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const answers: Answers = {};
  for (const q of questions) {
    const v = cleanValue(q, r[q.id]);
    if (v === undefined) return { ok: false, error: 'bad_answer', id: q.id };
    if (v !== null) answers[q.id] = v;
  }
  return { ok: true, answers };
}

/** The period an answer given now belongs to. */
export const periodFor = (cadence: Cadence, now: Date | number): string => (cadence === 'weekly' ? weekKeyOf(now) : 'once');

/** Due = nothing answered for the current period. */
export const isDue = (cadence: Cadence, answeredPeriods: readonly string[], now: Date | number): boolean => !answeredPeriods.includes(periodFor(cadence, now));

/** "Weekly · 5 questions · pain check". */
export function formLine(f: Pick<CheckinFormRow, 'cadence' | 'questions' | 'painCheck'>): string {
  const n = f.questions.length;
  return [f.cadence === 'weekly' ? 'Weekly' : 'One-off', `${n} question${n === 1 ? '' : 's'}`, f.painCheck ? 'pain check' : null].filter(Boolean).join(' · ');
}

/** An answer as the coach's table shows it. */
export function answerText(q: CheckinQuestion, v: AnswerValue | undefined): string {
  if (v === undefined) return '–';
  if (q.kind === 'yesno') return v ? 'Yes' : 'No';
  if (q.kind === 'scale') return `${v}/10`;
  if (q.kind === 'number') return `${v}${q.unit ? ` ${q.unit}` : ''}`;
  return String(v);
}

export interface HistoryRow { period: string; cells: Record<string, string>; values: Record<string, AnswerValue> }

/**
 * One athlete's answers to one form over time, newest first, as the coach reads them. `withHealth` is the coach-view rule
 * (lib/coach/readiness/gate.ts coachMaySee: on the live roster, a live coach_view grant, an adult): without it the health
 * answers are not in the result at all — not blanked, absent.
 */
export function history(questions: readonly CheckinQuestion[], rows: readonly AnswerRow[], withHealth: boolean): { columns: CheckinQuestion[]; rows: HistoryRow[] } {
  const columns = questions.filter((q) => q.topic === 'training' || withHealth);
  const out = [...rows].sort((a, b) => (a.period < b.period ? 1 : -1)).slice(0, HISTORY_PERIODS).map((r) => {
    const all: Answers = { ...r.answers, ...(withHealth && r.health ? r.health : {}) };
    const values: Record<string, AnswerValue> = {};
    const cells: Record<string, string> = {};
    for (const q of columns) { if (all[q.id] !== undefined) values[q.id] = all[q.id]; cells[q.id] = answerText(q, all[q.id]); }
    return { period: r.period, cells, values };
  });
  return { columns, rows: out };
}

/** The number series of one scale or number question, oldest first: what the coach's spark line draws. */
export function series(q: CheckinQuestion, rows: readonly HistoryRow[]): { period: string; value: number }[] {
  if (q.kind !== 'scale' && q.kind !== 'number') return [];
  return rows.flatMap((r) => (typeof r.values[q.id] === 'number' ? [{ period: r.period, value: r.values[q.id] as number }] : [])).reverse();
}

/** Answered weeks out of the last n weeks (fewer when the form was assigned more recently): the coach's compliance line. */
export function weeksAnswered(rows: readonly Pick<AnswerRow, 'period'>[], now: Date | number, n = 4, since?: Date | number): { answered: number; of: number } {
  const keys = new Set(rows.map((r) => r.period));
  const thisWeek = weekKeyOf(now);
  const first = since === undefined ? null : weekKeyOf(since);
  let answered = 0;
  let of = 0;
  for (let i = 0; i < n; i += 1) {
    const wk = addDays(thisWeek, -7 * i);
    if (first && wk < first) break;
    of += 1;
    if (keys.has(wk)) answered += 1;
  }
  return { answered, of };
}
