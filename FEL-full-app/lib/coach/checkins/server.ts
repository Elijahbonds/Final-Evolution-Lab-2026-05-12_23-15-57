// lib/coach/checkins/server.ts — COACH-PARITY (2026-10-26): check-in forms, the coach's and the athlete's halves.
//
//   coachBoard     GET   /api/coach/checkins      the coach's forms, who each is assigned to, compliance, and — for one
//                                                 form — every athlete's answers over time (health only per coachMaySee)
//   coachAct       POST  /api/coach/checkins      { action: 'create' | 'update' | 'archive' | 'assign' | 'unassign', … }
//   myForms        GET   /api/coach/me/checkins   the athlete's check-ins due or answered this period, as THEY see them
//   submit         POST  /api/coach/me/checkins   { formId, answers, health? } — training answers under the teen gate;
//                                                 health answers only for a verified adult with a live health_data grant
// Before the pending SQL: GET { available: false }, writes 503 parity_not_ready.
import 'server-only';
import { parityHealthEnabled, parityReady } from '../parity/probe';
import { coachPeople, healthViewers, liveCoaches, mayAssign, teamIdsOf, whoIs, type PeopleDb } from '../parity/people';
import { cleanAnswers, cleanForm, formLine, history, isDue, LIMITS, offersPainCheck, periodFor, questionsFor, series, weeksAnswered } from './rules';
import { archiveForm, assign, answersForAthlete, answersForCoach, assignsFor, assignsForCoach, formsByIds, formsForCoach, insertForm, saveAnswer, unassign, updateForm } from './store';
import { COACH_HEALTH_NOTE_DRAFT, HEALTH_CONSENT_NEEDED_DRAFT, HEALTH_OFF_LINE, HEALTH_SECTION_LINE_DRAFT, PAIN_LINE, TEEN_SKIPPED_LINE_DRAFT, TRAINING_SEEN_LINE } from './copy';
import type { Answers, CheckinFormRow, Scope } from './types';

export type CheckinDb = PeopleDb;
export interface Res { status: number; body: Record<string, unknown> }
const res = (status: number, body: Record<string, unknown>): Res => ({ status, body });
const NOT_READY = res(503, { error: 'parity_not_ready' });
const DAY = 86_400_000;
type Env = Readonly<Record<string, string | undefined>>;

// ── the coach ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function coachBoard(db: CheckinDb, coachId: string, q: { formId?: string | null } = {}, now: Date = new Date(), env: Env = process.env): Promise<Res> {
  const nowMs = now.getTime();
  if (!(await parityReady(db, nowMs))) return res(200, { available: false });
  const [forms, assigns, people] = await Promise.all([formsForCoach(db, coachId, nowMs), assignsForCoach(db, coachId, nowMs), coachPeople(db, coachId, now)]);
  if (!forms || !assigns) return res(200, { available: false });
  const answers = (await answersForCoach(db, coachId, new Date(nowMs - 120 * DAY), nowMs)) ?? [];
  const nameOf = (scope: Scope, id: string) => (scope === 'team' ? people.teams.find((t) => t.id === id)?.name : people.roster.find((r) => r.id === id)?.name) ?? null;
  const reach = (formId: string) => {
    const ids = new Set<string>();
    for (const a of assigns.filter((x) => x.formId === formId)) {
      if (a.scope === 'athlete' && people.roster.some((r) => r.id === a.scopeId)) ids.add(a.scopeId);
      if (a.scope === 'team') for (const m of people.teams.find((t) => t.id === a.scopeId)?.memberIds ?? []) ids.add(m);
    }
    return [...ids];
  };
  const viewers = await healthViewers(db, coachId, people.roster);
  const list = forms.filter((f) => !f.archivedAt).map((f) => {
    const athletes = reach(f.id);
    const mine = answers.filter((a) => a.formId === f.id);
    const thisPeriod = periodFor(f.cadence, now);
    return {
      id: f.id, title: f.title, cadence: f.cadence, painCheck: f.painCheck, questions: f.questions, line: formLine(f), createdAt: f.createdAt,
      assigned: assigns.filter((a) => a.formId === f.id).map((a) => ({ scope: a.scope, scopeId: a.scopeId, name: nameOf(a.scope, a.scopeId) ?? 'No longer on your roster' })),
      reach: athletes.length,
      answeredNow: athletes.filter((id) => mine.some((a) => a.athleteId === id && a.period === thisPeriod)).length,
    };
  });
  let detail: Record<string, unknown> | null = null;
  const pick = q.formId ? forms.find((f) => f.id === q.formId) : null;
  if (pick) {
    const athletes = reach(pick.id);
    const extra = [...new Set(answers.filter((a) => a.formId === pick.id).map((a) => a.athleteId))].filter((id) => people.roster.some((r) => r.id === id));
    detail = {
      formId: pick.id, title: pick.title, cadence: pick.cadence,
      athletes: [...new Set([...athletes, ...extra])].map((id) => {
        const rows = answers.filter((a) => a.formId === pick.id && a.athleteId === id);
        const h = history(pick.questions, rows, viewers.has(id));
        return {
          id, name: people.roster.find((r) => r.id === id)?.name ?? 'Athlete', healthShared: viewers.has(id),
          columns: h.columns.map((c) => ({ id: c.id, prompt: c.prompt, kind: c.kind, topic: c.topic })), rows: h.rows.map((r) => ({ period: r.period, cells: r.cells })),
          series: Object.fromEntries(h.columns.map((c) => [c.id, series(c, h.rows)]).filter(([, s]) => (s as unknown[]).length > 1)),
          compliance: pick.cadence === 'weekly' ? weeksAnswered(rows, now, 4, Date.parse(pick.createdAt)) : { answered: rows.length ? 1 : 0, of: 1 },
        };
      }).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
  const healthEnabled = parityHealthEnabled(env);
  return res(200, {
    available: true, forms: list, detail, roster: people.roster, teams: people.teams.map((t) => ({ id: t.id, name: t.name, members: t.memberIds.length })),
    healthEnabled, lines: { health: healthEnabled ? COACH_HEALTH_NOTE_DRAFT : HEALTH_OFF_LINE, pain: PAIN_LINE },
  });
}

export async function coachAct(db: CheckinDb, coachId: string, body: unknown, now: Date = new Date(), env: Env = process.env): Promise<Res> {
  const nowMs = now.getTime();
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (!(await parityReady(db, nowMs))) return NOT_READY;
  const action = b.action;
  if (action === 'create' || action === 'update') {
    const c = cleanForm(b, { healthEnabled: parityHealthEnabled(env) });
    if (!c.ok) return res(400, { error: c.error, at: c.at ?? null });
    if (action === 'create') {
      const mine = await formsForCoach(db, coachId, nowMs);
      if (mine && mine.filter((f) => !f.archivedAt).length >= LIMITS.formsPerCoach) return res(409, { error: 'too_many_forms' });
      const id = await insertForm(db, { coachId, ...c.form }, nowMs);
      return id ? res(201, { ok: true, id }) : res(500, { error: 'not_saved' });
    }
    if (typeof b.id !== 'string' || !b.id) return res(400, { error: 'bad_id' });
    return (await updateForm(db, b.id, { coachId, ...c.form }, nowMs)) ? res(200, { ok: true, id: b.id }) : res(404, { error: 'not_found' });
  }
  if (typeof b.formId !== 'string' && typeof b.id !== 'string') return res(400, { error: 'bad_id' });
  const formId = String(b.formId ?? b.id);
  const own = (await formsForCoach(db, coachId, nowMs))?.find((f) => f.id === formId && !f.archivedAt);
  if (!own) return res(404, { error: 'not_found' });
  if (action === 'archive') return (await archiveForm(db, formId, coachId, nowMs)) ? res(200, { ok: true }) : res(404, { error: 'not_found' });
  if (action === 'assign' || action === 'unassign') {
    const people = await coachPeople(db, coachId, now);
    if (action === 'unassign') {
      if ((b.scope !== 'athlete' && b.scope !== 'team') || typeof b.scopeId !== 'string') return res(400, { error: 'bad_scope' });
      return (await unassign(db, formId, coachId, b.scope, b.scopeId, nowMs)) ? res(200, { ok: true }) : res(404, { error: 'not_found' });
    }
    if (!mayAssign(people, b.scope, b.scopeId)) return res(403, { error: b.scope === 'team' ? 'not_your_team' : 'not_your_athlete' });
    const r = await assign(db, formId, coachId, b.scope as Scope, String(b.scopeId), nowMs);
    return r === null ? res(500, { error: 'not_saved' }) : res(200, { ok: true, already: !r });
  }
  return res(400, { error: 'unknown_action' });
}

// ── the athlete ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** What the athlete reaches: forms from their live coaches, assigned to them or a team of theirs. */
async function reachable(db: CheckinDb, athleteId: string, nowMs: number) {
  const coaches = await liveCoaches(db, athleteId);
  if (!coaches.length) return { coaches, forms: [] as CheckinFormRow[] };
  const teamIds = await teamIdsOf(db, athleteId, nowMs);
  const assigns = (await assignsFor(db, athleteId, teamIds, coaches.map((c) => c.coachId), nowMs)) ?? [];
  const forms = (await formsByIds(db, [...new Set(assigns.map((a) => a.formId))], nowMs)) ?? [];
  return { coaches, forms: forms.filter((f) => coaches.some((c) => c.coachId === f.coachId)) };
}

export async function myForms(db: CheckinDb, athleteId: string, now: Date = new Date(), env: Env = process.env): Promise<Res> {
  const nowMs = now.getTime();
  if (!(await parityReady(db, nowMs))) return res(200, { available: false });
  const { coaches, forms } = await reachable(db, athleteId, nowMs);
  if (!forms.length) return res(200, { available: true, forms: [] });
  const who = await whoIs(db, athleteId, parityHealthEnabled(env), now);
  if (!who.ok) return res(200, { available: true, forms: [], blocked: who.body });
  const answers = (await answersForAthlete(db, athleteId, forms.map((f) => f.id), nowMs)) ?? [];
  const out = forms.map((f) => {
    const period = periodFor(f.cadence, now);
    const qs = questionsFor(f.questions, { band: who.band, healthShown: who.healthShown, healthConsent: who.healthConsent });
    const mine = answers.find((a) => a.formId === f.id && a.period === period) ?? null;
    const skipped = f.questions.length - qs.training.length - qs.health.length;
    return {
      id: f.id, title: f.title, cadence: f.cadence, period, coachName: coaches.find((c) => c.coachId === f.coachId)?.name ?? 'Your coach',
      due: isDue(f.cadence, answers.filter((a) => a.formId === f.id).map((a) => a.period), now),
      questions: qs.training,
      health: qs.health.length ? { questions: qs.health, allowed: who.healthConsent, line: HEALTH_SECTION_LINE_DRAFT, consentLine: who.healthConsent ? null : HEALTH_CONSENT_NEEDED_DRAFT } : null,
      painCheck: offersPainCheck(f, who),
      answers: mine?.answers ?? {}, healthAnswers: who.healthConsent ? mine?.health ?? {} : {},
      lines: { seen: TRAINING_SEEN_LINE, skipped: skipped > 0 && who.band === 'teen' ? TEEN_SKIPPED_LINE_DRAFT : null },
    };
  }).filter((f) => f.questions.length || f.health || f.painCheck);
  return res(200, { available: true, band: who.band, forms: out.sort((a, b) => Number(b.due) - Number(a.due)) });
}

export async function submit(db: CheckinDb, athleteId: string, body: unknown, now: Date = new Date(), env: Env = process.env): Promise<Res> {
  const nowMs = now.getTime();
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (!(await parityReady(db, nowMs))) return NOT_READY;
  if (typeof b.formId !== 'string' || !b.formId) return res(400, { error: 'bad_id' });
  const { forms } = await reachable(db, athleteId, nowMs);
  const f = forms.find((x) => x.id === b.formId);
  if (!f) return res(404, { error: 'not_found' });
  // the teen gate first: no coached training is saved for anyone it refuses (lib/coach/teenGate.ts)
  const who = await whoIs(db, athleteId, parityHealthEnabled(env), now);
  if (!who.ok) return res(403, who.body);
  const qs = questionsFor(f.questions, { band: who.band, healthShown: who.healthShown, healthConsent: who.healthConsent });
  const t = cleanAnswers(qs.training, b.answers);
  if (!t.ok) return res(400, { error: t.error, id: t.id ?? null });
  // health answers: the health rules in their own order — adults only (403), then the health_data grant (412) — and a
  // health question this athlete is not shown is not answerable at all
  let health: Answers | null = null;
  const rawHealth = b.health && typeof b.health === 'object' ? b.health as Record<string, unknown> : null;
  if (rawHealth && Object.values(rawHealth).some((v) => v !== null && v !== undefined && v !== '')) {
    if (!who.adult) return res(403, { error: 'health_data_adults_only', saved: false });
    if (!who.healthShown) return res(400, { error: 'health_off' });
    if (!who.healthConsent) return res(412, { error: 'health_data_consent_required', saved: false });
    const h = cleanAnswers(qs.health, rawHealth);
    if (!h.ok) return res(400, { error: h.error, id: h.id ?? null });
    health = Object.keys(h.answers).length ? h.answers : null;
  }
  if (!Object.keys(t.answers).length && !health) return res(400, { error: 'no_answers' });
  const period = periodFor(f.cadence, now);
  if (f.cadence === 'once') {
    const before = (await answersForAthlete(db, athleteId, [f.id], nowMs)) ?? [];
    if (before.some((a) => a.period === 'once' && Date.parse(a.createdAt) < nowMs - DAY)) return res(409, { error: 'already_answered' });
  }
  const ok = await saveAnswer(db, { formId: f.id, coachId: f.coachId, athleteId, period, answers: t.answers, health }, nowMs);
  return ok ? res(200, { ok: true, period }) : res(500, { error: 'not_saved' });
}
