// lib/coach/weeklyDraft/rules.ts — COACH-AI-DRAFT (2026-10-24): THE RULES ENGINE. Always on, no AI at all.
//
// In: what the app really knows about one client this week (DraftFacts — ./server.ts reads it under every gate). Out:
// a draft of concrete changes to the coming week of their program, each with its reason (citing the data), a
// confidence and a safety class, and the builder bodies that write it once the coach approves. Nothing is written here.
//
// THE OWNER'S METHOD, AS THE REPO ENCODES IT (lib/coach/taxonomy.ts SKILL_LAYERS, PLAYBOOK_STEPS; the Playbook's
// chapters as the catalogue and templates already use them):
//   · Assess → Correct → Load → Perform (Playbook ch. 1): what the Mirror screen found is corrected (Prep work) before
//     the load moves, and a form drop on a movement holds that movement's load;
//   · "Strength Without Strain" (ch. 8, technique before load): double progression — the reps reach the TOP of the
//     range on every set, twice, at an effort with reps left, before the load goes up; a load goes up one plate;
//   · "The Reset Button" (ch. 9): a lighter week when effort has run high, readiness is low, or the PRQ has slipped.
//
// THE ORDER, most careful first. Each later rule yields any row an earlier one already changed:
//   1. the coach marked them Out → nothing (said);
//   2. a pain flag → ease off this week, and "see a professional" if it has not settled; a named exercise steps down
//      its ladder (coach_view consent only — otherwise the coach is told only that an exercise was paused);
//   3. low compliance (stalled, slowing, or MISSED_ALERT_MIN planned sessions missed) → check in, trim support work;
//   4. a lighter week (deload) when effort has run high, readiness is low or the PRQ dropped;
//   5. a Mirror form drop → the squat and lunge work steps back; a jump drop → less jump volume;
//   6. per exercise, two exposures in a row: missed the range → a step back (or the easier version); hit the top with
//      reps left → a step forward;
//   7. the Mirror screen's correctives into the next session's Prep.
// Then every change goes through ./safety.ts classify: a change it marks unsafe is HELD (said, with why), never offered.

import { isHardStop, BODY_AREAS } from '@/lib/health/painRule';
import { MISSED_ALERT_MIN } from '../alerts';
import { nextSession, type TreeExercise, type TreeSession } from '../loop';
import { addBodyFor } from '../mirrorToProgram';
import { easierUngatedStep, isProtocolGated } from '../protocolGate';
import { OFF_BASELINE_DROP } from '../triage';
import { PIN_EXERCISE, skillLayer } from '../taxonomy';
import {
  CHECK_IN_TITLE, COMPLIANCE_CLIENT_LINE, DELOAD_CLIENT_LINE, SKIP_COPY, correctiveClientLine, easeOffClientLine, easeOffReason,
  rowClientLine, swapClientLine,
} from './copy';
import { easeStep, progressStep, readExposure, regressStep, setsOf, volumeDownStep, type ExposureVerdict, type Step } from './dose';
import { contactDeltas, sessionContacts } from './contacts';
import { classify, type SafetyContext } from './safety';
import {
  DELOAD_MEAN_EFFORT, DELOAD_MIN_EXPOSURES, DRAFT_LOOKBACK_DAYS, EXPOSURES_TO_DECIDE, FORM_DROP_PTS, JUMP_DROP_IN, READINESS_LOW_DAYS,
  SWAP_EASIER_SHARE,
} from './thresholds';
import type { ClientDraft, Confidence, DraftCatalogueRow, DraftChange, DraftFacts, DraftOp, Exposure, HeldItem, OpFields } from './types';
import { changeId, weekKeyOf } from './week';
import { draftTrigger as jumpReadinessTrigger } from '../readiness/rules';   // COACH-READINESS (2026-10-25)

const DAY = 86_400_000;
/** Sections whose rows carry the week's training load (prep, prime and cool-down are left as written). */
const WORK_SECTIONS = new Set(['key', 'assist', 'finish']);
const SUPPORT_SECTIONS = new Set(['assist', 'finish']);
const CALM_PATTERNS = new Set(['breath', 'mobility']);
const FORM_PATTERNS = new Set(['squat', 'lunge']); // the Mirror's form number is squat and lunge sets (lib/profile-v2/assemble.ts)

/** The owner's method, cited for a coach (never shown to the athlete). */
const METHOD = {
  doubleProgression: (() => { const l = skillLayer('strength'); return l ? `Playbook ch. ${l.playbook.chapter}, ${l.playbook.title}: technique before load. The reps reach the top of the range before the load moves.` : null; })(),
  correctFirst: 'The Playbook’s order: Assess, Correct, Load, Perform. Correct what the screen found before you load it.',
  reset: (() => { const l = skillLayer('reset'); return l ? `Playbook ch. ${l.playbook.chapter}, ${l.playbook.title}: come back down before you build again.` : null; })(),
} as const;

interface Target { e: TreeExercise; s: TreeSession }

const fields = (e: TreeExercise): OpFields => ({ exerciseId: e.exerciseId, exerciseName: e.name, sets: e.sets, reps: e.reps, load: e.load, effortBand: e.effortBand });
const update = (t: Target, after: OpFields): DraftOp => ({ action: 'update', sessionExerciseId: t.e.id, sessionId: t.s.id, sessionLabel: t.s.label, before: fields(t.e), after });
const dayLine = (ms: number) => new Date(ms).toISOString().slice(5, 10);
const areaLabel = (id: string) => BODY_AREAS.find((a) => a.id === id)?.label.toLowerCase() ?? 'somewhere';
const uniq = <T,>(xs: readonly T[]) => [...new Set(xs)];

type Candidate = Omit<DraftChange, 'id' | 'safety'>;

/** One exposure as a coach reads it: "10-20: 3×10 @ 60 kg, top effort 7". */
function exposureLine(e: Exposure): string {
  const sets = setsOf(e);
  const reps = sets.map((s) => s.reps ?? '–').join(', ');
  const efforts = sets.map((s) => (s.effort != null ? s.effort : s.rir != null ? 10 - s.rir : null)).filter((x): x is number => x != null);
  const load = e.summary.actualLoad ?? e.prescribed.load;
  return `${dayLine(e.atMs)}: ${sets.length} sets (${reps})${load ? ` @ ${load}` : ''}${efforts.length ? `, top effort ${Math.max(...efforts)}` : ''} against ${e.prescribed.sets} × ${e.prescribed.reps}`;
}

function confidenceOf(v: readonly ExposureVerdict[]): Confidence {
  return v.every((x) => x.effortKnown) ? 'high' : 'medium';
}

/** Steps for a set of rows; rows with no step are left out. */
function stepRows(rows: readonly Target[], step: (f: OpFields) => Step): { ops: DraftOp[]; whats: string[] } {
  const ops: DraftOp[] = [];
  const whats: string[] = [];
  for (const t of rows) {
    const s = step(fields(t.e));
    if (s) { ops.push(update(t, s.after)); whats.push(`${t.e.name} (${t.s.label}): ${s.what}`); }
  }
  return { ops, whats };
}

/** The draft for one client. Pure: the same facts give the same draft, ids included. */
export function draftForClient(f: DraftFacts): ClientDraft {
  const youth = f.band === 'teen';
  const draft: ClientDraft = {
    version: 1, weekKey: weekKeyOf(f.nowMs), coachId: f.coachId, clientId: f.clientId, name: f.name,
    programId: f.program?.id ?? null, programName: f.program?.name ?? null, band: f.band,
    status: 'ok', skipReason: null, changes: [], held: [], context: [], engine: 'rules', summary: null,
    guard: { youth, painOpen: !!f.pain?.present, availability: f.availability, lowCompliance: false, easierWeek: false, formDropPatterns: [] },
  };
  if (f.availability === 'out') return { ...draft, status: 'skipped', skipReason: SKIP_COPY.out };
  if (!f.program) return { ...draft, status: 'no_program', context: ['No active program from you for them yet.'] };

  const next = nextSession(f.program.tree, f.completedSessionIds);
  if (!next) return { ...draft, status: 'no_program', context: [`${f.program.name}: every session is done. Time for the next program.`] };

  const done = new Set(f.completedSessionIds);
  const logged = new Set(f.loggedRowIds);
  const cat = new Map<string, DraftCatalogueRow>(f.catalogue.map((r) => [r.id, r]));
  const open = next.block.sessions.filter((s) => !done.has(s.id) && s.kind !== 'recovery');
  const targets: Target[] = open.flatMap((s) => s.exercises.filter((e) => !logged.has(e.id)).map((e) => ({ e, s })));
  const work = targets.filter((t) => WORK_SECTIONS.has(t.e.section) && t.e.workSeconds == null && !CALM_PATTERNS.has(cat.get(t.e.exerciseId)?.pattern ?? ''));
  const since = f.nowMs - DRAFT_LOOKBACK_DAYS * DAY;
  const exposures = f.exposures.filter((e) => e.atMs >= since && e.atMs <= f.nowMs).sort((a, b) => b.atMs - a.atMs);

  const context: string[] = [`${f.program.name}, ${next.block.label}: ${open.length} training session${open.length === 1 ? '' : 's'} still to do.`];
  context.push(exposures.length ? `${exposures.length} logged exercise${exposures.length === 1 ? '' : 's'} in the last ${DRAFT_LOOKBACK_DAYS} days.` : `No logged sets in the last ${DRAFT_LOOKBACK_DAYS} days.`);
  if (f.compliance) context.push(`Compliance: ${f.compliance.note}`);
  if (youth) context.push('Under 18 with a guardian’s consent to coach training: training logs only; conservative rules.');
  else {
    context.push(f.pain == null ? 'Pain check-ins: not read.' : f.pain.present ? (f.pain.detailed ? 'Pain check-ins: shared with you.' : 'Pain check-ins: an exercise was paused; details not shared with you.') : 'Pain check-ins: nothing flagged in two weeks.');
    context.push(f.readiness == null ? 'Readiness: not shared with you.' : `Readiness: low on ${f.readiness.lowDays} of their last ${f.readiness.days} check-ins.`);
    context.push(f.numbersShared || f.form != null || f.jump != null ? 'Mirror form and jump numbers: shared with you.' : 'Mirror form and jump numbers: not shared with you.');
    if (f.jumpReadiness) context.push(`Daily jump check: Low on ${f.jumpReadiness.lowDays} of their last ${f.jumpReadiness.days} checks.`);
  }
  if (f.drill) context.push(`Daily drill focus: ${f.drill.focus}${f.drill.display ? ` (${f.drill.display})` : ''}.`);
  if (f.availability === 'limited') context.push('You marked them Limited: nothing moves up.');

  const cands: Candidate[] = [];
  const held: HeldItem[] = [];
  const formDropPatterns = new Set<string>();

  // ── 2. pain ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const pain = f.pain;
  const painOpen = !!pain?.present;
  if (pain && painOpen) {
    const items = pain.detailed ? pain.items : [];
    const hardStop = items.some((i) => isHardStop(i.decision));
    const named = uniq(items.map((i) => `${i.exerciseName} (${areaLabel(i.bodyArea)})`));
    const { ops, whats } = stepRows(work, (r) => easeStep(r, youth));
    cands.push({
      kind: 'ease_off', exerciseName: null, title: 'Ease off this week',
      reason: easeOffReason({ detailed: pain.detailed, hardStop, teen: youth, items: named }),
      evidence: [...items.map((i) => `${dayLine(i.atMs)}: ${i.exerciseName}, ${areaLabel(i.bodyArea)}`), ...whats],
      confidence: 'high', method: null, ops, clientLine: easeOffClientLine(youth), sensitive: true, priority: 100,
    });
    // a named exercise in this week steps down its ladder (an ungated easier step), or is said to have none
    for (const name of uniq(items.map((i) => i.exerciseName.toLowerCase()))) {
      const rows = targets.filter((t) => t.e.name.toLowerCase() === name);
      if (!rows.length) continue;
      const from = cat.get(rows[0].e.exerciseId);
      const to = from ? easierUngatedStep(from, cat) : null;
      const toRow = to ? cat.get(to.id) : null;
      if (!toRow || (youth && PIN_EXERCISE.test(toRow.name))) { held.push({ title: `${rows[0].e.name}: an easier version`, why: 'Nothing easier is linked to it in your catalogue. Pick one by hand, or leave it out this week.' }); continue; }
      cands.push({
        kind: 'swap_easier', exerciseName: rows[0].e.name, title: `${rows[0].e.name} → ${toRow.name}`,
        reason: `They reported pain on ${rows[0].e.name}. Step down to the easier version this week.`,
        evidence: rows.map((t) => `${t.s.label}: ${t.e.name}`), confidence: 'high', method: null,
        ops: rows.map((t) => update(t, { ...fields(t.e), exerciseId: toRow.id, exerciseName: toRow.name })),
        clientLine: swapClientLine(toRow.name, rows[0].e.name), sensitive: true, priority: 101, // settles before the ease-off: the named row steps down its ladder
      });
    }
  }

  // ── 3. compliance ───────────────────────────────────────────────────────────────────────────────────────────────────
  const c = f.compliance;
  const lowCompliance = !!c && (c.state === 'stalled' || c.state === 'slowing' || c.missed >= MISSED_ALERT_MIN);
  if (c && lowCompliance) {
    const evidence = [c.note, ...(c.planned ? [`${c.doneLast7} of ${c.planned} planned sessions in the last 7 days.`] : [])];
    cands.push({
      kind: 'check_in', exerciseName: null, title: CHECK_IN_TITLE, reason: `${c.note} A message from you is the fastest way back.`,
      evidence, confidence: c.state === 'stalled' ? 'high' : 'medium', method: null, ops: [], clientLine: null, sensitive: false, priority: 90,
    });
    if (c.daysSince != null) {
      const { ops, whats } = stepRows(work.filter((t) => SUPPORT_SECTIONS.has(t.e.section)), volumeDownStep);
      if (ops.length) {
        cands.push({
          kind: 'regress_volume', exerciseName: null, title: 'Trim the support work this week',
          reason: `${c.note} A shorter week they can finish beats a full one they skip. The key lift stays as written.`,
          evidence: [...evidence, ...whats], confidence: 'medium', method: null, ops, clientLine: COMPLIANCE_CLIENT_LINE, sensitive: false, priority: 80,
        });
      }
    }
  }

  // ── 4. a lighter week ───────────────────────────────────────────────────────────────────────────────────────────────
  const verdicts = new Map<Exposure, ExposureVerdict>(exposures.map((e) => [e, readExposure(e, SWAP_EASIER_SHARE)]));
  const tops = [...verdicts.values()].map((v) => v.topEffort).filter((x): x is number => x != null);
  const meanTop = tops.length ? tops.reduce((a, b) => a + b, 0) / tops.length : null;
  const triggers: { line: string; sensitive: boolean }[] = [];
  if (meanTop != null && tops.length >= DELOAD_MIN_EXPOSURES && meanTop >= DELOAD_MEAN_EFFORT) {
    triggers.push({ line: `Their top-set effort has averaged ${Math.round(meanTop * 10) / 10} over ${tops.length} logged exercises in ${DRAFT_LOOKBACK_DAYS} days.`, sensitive: false });
  }
  if (f.readiness && f.readiness.lowDays >= READINESS_LOW_DAYS) triggers.push({ line: `Readiness was low on ${f.readiness.lowDays} of their last ${f.readiness.days} check-ins.`, sensitive: true });
  // COACH-READINESS (2026-10-25): the daily jump check's Low days feed the same lighter week (sensitive: health-adjacent)
  const jumpLow = jumpReadinessTrigger(f.jumpReadiness);
  if (jumpLow) triggers.push({ line: jumpLow, sensitive: true });
  if (f.prq && f.prq.before - f.prq.now >= OFF_BASELINE_DROP) triggers.push({ line: `Their PRQ is down ${Math.round((f.prq.before - f.prq.now) * 10) / 10} (${f.prq.before} → ${f.prq.now}) over two weeks.`, sensitive: false });
  if (!painOpen && triggers.length) {
    const { ops, whats } = stepRows(work, (r) => easeStep(r, youth));
    if (ops.length) {
      cands.push({
        kind: 'deload', exerciseName: null, title: 'A lighter week',
        reason: `${triggers.map((t) => t.line).join(' ')} One easier week now keeps the next block moving.`,
        evidence: [...triggers.map((t) => t.line), ...whats], confidence: triggers.length > 1 ? 'high' : 'medium', method: METHOD.reset, ops,
        clientLine: DELOAD_CLIENT_LINE, sensitive: triggers.some((t) => t.sensitive), priority: 70,
      });
    }
  }

  // ── 5. Mirror form and jump ─────────────────────────────────────────────────────────────────────────────────────────
  if (f.form?.delta != null && f.form.thisWeek != null && f.form.lastWeek != null) {
    const pts = Math.round(-f.form.delta * 100);
    if (pts >= FORM_DROP_PTS) {
      for (const p of FORM_PATTERNS) formDropPatterns.add(p);
      const rows = work.filter((t) => FORM_PATTERNS.has(cat.get(t.e.exerciseId)?.pattern ?? ''));
      const { ops, whats } = stepRows(rows, (r) => regressStep(r, youth));
      const line = `Mirror form score down ${pts} over 2 weeks (${Math.round(f.form.lastWeek * 100)}% → ${Math.round(f.form.thisWeek * 100)}% clean reps on squat and lunge sets).`;
      if (ops.length) {
        cands.push({
          kind: 'regress_load', exerciseName: null, title: 'Squat and lunge work steps back',
          reason: `${line} Clean reps first, then the load comes back.`, evidence: [line, ...whats], confidence: 'medium',
          method: METHOD.doubleProgression, ops, clientLine: 'Your squat and lunge work comes down a step this week so every rep stays clean.', sensitive: false, priority: 60,
        });
      } else context.push(line);
    }
  }
  if (f.jump?.delta != null && -f.jump.delta >= JUMP_DROP_IN) {
    const line = `Best jump down ${Math.round(-f.jump.delta * 10) / 10} in vs last week (${f.jump.lastWeek} → ${f.jump.thisWeek} in).`;
    const rows = targets.filter((t) => { const r = cat.get(t.e.exerciseId); return !!r && isProtocolGated(r); });
    const { ops, whats } = stepRows(rows, volumeDownStep);
    if (ops.length) {
      cands.push({
        kind: 'regress_volume', exerciseName: null, title: 'Less jump volume this week', reason: `${line} Fewer, fresher jumps this week.`,
        evidence: [line, ...whats], confidence: 'medium', method: METHOD.reset, ops, clientLine: 'Fewer jumps this week, so each one is fresh.', sensitive: false, priority: 55,
      });
    } else context.push(line);
  }

  // ── 6. per exercise, from the logs ──────────────────────────────────────────────────────────────────────────────────
  for (const exId of uniq(work.map((t) => t.e.exerciseId))) {
    const rows = work.filter((t) => t.e.exerciseId === exId);
    const name = rows[0].e.name;
    const recent = exposures.filter((e) => e.exerciseId === exId).slice(0, EXPOSURES_TO_DECIDE);
    if (recent.length < EXPOSURES_TO_DECIDE) continue;
    const v = recent.map((e) => verdicts.get(e)!);
    const evidence = recent.map(exposureLine);
    const reps = recent[0].prescribed.reps;
    if (v.every((x) => x.read === 'miss')) {
      const from = cat.get(exId);
      const easier = from && v.every((x) => x.farUnder) ? easierUngatedStep(from, cat) : null;
      const easierRow = easier ? cat.get(easier.id) : null;
      if (easierRow && !(youth && PIN_EXERCISE.test(easierRow.name))) {
        cands.push({
          kind: 'swap_easier', exerciseName: name, title: `${name} → ${easierRow.name}`,
          reason: `Well short of ${reps} in the last ${recent.length} sessions (lowest set ${Math.min(...v.map((x) => x.lowReps ?? 0))} reps). The easier version builds it back.`,
          evidence, confidence: confidenceOf(v), method: METHOD.doubleProgression,
          ops: rows.map((t) => update(t, { ...fields(t.e), exerciseId: easierRow.id, exerciseName: easierRow.name })),
          clientLine: swapClientLine(easierRow.name, name), sensitive: false, priority: 45,
        });
        continue;
      }
      const { ops, whats } = stepRows(rows, (r) => regressStep(r, youth));
      if (!ops.length) continue;
      const first = ops[0] as Extract<DraftOp, { action: 'update' }>;
      const kind: 'regress_volume' | 'regress_load' = first.after.sets !== first.before.sets ? 'regress_volume' : 'regress_load';
      const top = Math.max(...v.map((x) => x.topEffort ?? 0));
      cands.push({
        kind, exerciseName: name, title: `${name}: ${whats[0].split(': ').slice(1).join(': ')}`,
        reason: `Fell short of ${reps} in the last ${recent.length} sessions (lowest set ${Math.min(...v.map((x) => x.lowReps ?? 0))} reps${top ? `, top effort ${top}` : ''}).`,
        evidence: [...evidence, ...whats], confidence: confidenceOf(v), method: METHOD.doubleProgression, ops,
        clientLine: rowClientLine(kind, name, whats[0].split(': ').slice(1).join(': ')), sensitive: false, priority: 40,
      });
    } else if (v.every((x) => x.read === 'top')) {
      const { ops, whats } = stepRows(rows, (r) => progressStep(r, youth));
      const top = v.every((x) => x.effortKnown) ? Math.max(...v.map((x) => x.topEffort ?? 0)) : null;
      const reason = `Hit the top of ${reps} on every set in the last ${recent.length} sessions${top != null ? ` at effort ${top} or less` : ''}.`;
      if (ops.length) {
        const first = ops[0] as Extract<DraftOp, { action: 'update' }>;
        const kind: 'progress_volume' | 'progress_load' = first.after.sets !== first.before.sets ? 'progress_volume' : 'progress_load';
        cands.push({
          kind, exerciseName: name, title: `${name}: ${whats[0].split(': ').slice(1).join(': ')}`, reason, evidence: [...evidence, ...whats],
          confidence: confidenceOf(v), method: METHOD.doubleProgression, ops,
          clientLine: rowClientLine(kind, name, whats[0].split(': ').slice(1).join(': ')), sensitive: false, priority: 20,
        });
      } else {
        // nothing left to add on this row: the harder version, when the catalogue links one (adults; never gated work)
        const from = cat.get(exId);
        const harder = from?.progressionOfId ? cat.get(from.progressionOfId) : null;
        if (harder) {
          cands.push({
            kind: 'swap_harder', exerciseName: name, title: `${name} → ${harder.name}`, reason: `${reason} Nothing left to add to it as written: the harder version is next.`,
            evidence, confidence: confidenceOf(v), method: METHOD.doubleProgression,
            ops: rows.map((t) => update(t, { ...fields(t.e), exerciseId: harder.id, exerciseName: harder.name })),
            clientLine: swapClientLine(harder.name, name), sensitive: false, priority: 15,
          });
        }
      }
    }
  }

  // ── 7. the Mirror screen's correctives ──────────────────────────────────────────────────────────────────────────────
  if (f.screen && f.screen.prescriptions.length) {
    const into = open[0];
    if (into) context.push(`Mirror screen${f.screen.atIso ? ` of ${f.screen.atIso.slice(0, 10)}` : ''}: ${f.screen.prescriptions.length} finding${f.screen.prescriptions.length === 1 ? '' : 's'}.`);
    for (const p of f.screen.prescriptions) {
      if (!p.exercise) { held.push({ title: p.title, why: `Nothing in your catalogue matches this one. Look for: ${p.wanted.join('; ') || 'a corrective for it'}.` }); continue; }
      if (!into) continue;
      if (open.some((s) => s.exercises.some((e) => e.exerciseId === p.exercise!.id))) continue; // already in this week
      const body = addBodyFor(p, into.id);
      if (!body) continue;
      const { action: _a, ...rest } = body;
      cands.push({
        kind: 'add_corrective', exerciseName: p.exercise.name, title: `Add ${p.exercise.name} to Prep (${into.label})`,
        reason: p.because, evidence: [p.title, ...(p.value ? [p.value] : [])], confidence: p.matchedBy === 'tags' ? 'high' : 'medium',
        method: METHOD.correctFirst,
        ops: [{ action: 'add', sessionId: into.id, sessionLabel: into.label, exerciseId: p.exercise.id, exerciseName: p.exercise.name, body: rest }],
        clientLine: correctiveClientLine(p.exercise.name), sensitive: false, priority: 50,
      });
    }
  }

  // ── safety, then one change per row ─────────────────────────────────────────────────────────────────────────────────
  const ctx: SafetyContext = {
    youth, painOpen, availability: f.availability, lowCompliance,
    easierWeek: cands.some((x) => (x.kind === 'deload' || x.kind === 'ease_off') && x.ops.length > 0),
    formDropPatterns, catalogue: cat,
    // YOUTH-CONTACT-CAP: each open session's jump contacts as the coach wrote them (youth rules only)
    ...(youth ? { sessionContacts: Object.fromEntries(open.map((s) => [s.id, sessionContacts(s.exercises, cat)])) } : {}),
  };
  const changes = settle(cands, ctx, held);
  const guard = { ...draft.guard, lowCompliance, easierWeek: ctx.easierWeek, formDropPatterns: [...formDropPatterns] };
  if (!changes.length && !exposures.length && !held.length) return { ...draft, status: 'no_data', context, held, guard };
  return { ...draft, changes, held, context, guard };
}

/** Classify, hold the unsafe, keep one change per row (the most careful first), then fix each change's id. */
export function settle(cands: readonly Candidate[], ctx: SafetyContext, held: HeldItem[]): DraftChange[] {
  const claimed = new Set<string>();
  const out: DraftChange[] = [];
  const sorted = [...cands].sort((a, b) => b.priority - a.priority);
  // YOUTH-CONTACT-CAP: the running count, so two changes that each fit cannot together take a session past the cap
  const running: Record<string, number> | undefined = ctx.sessionContacts ? { ...ctx.sessionContacts } : undefined;
  const live: SafetyContext = running ? { ...ctx, sessionContacts: running } : ctx;
  for (const c of sorted) {
    const s = classify(c, live);
    if (s.safety === 'unsafe') { held.push({ title: c.title, why: s.why ?? 'Not safe to draft.' }); continue; }
    const ops = c.ops.filter((op) => op.action !== 'update' || !claimed.has(op.sessionExerciseId));
    if (c.ops.length && !ops.length) continue; // every row it would change is already changed by a more careful one
    for (const op of ops) if (op.action === 'update') claimed.add(op.sessionExerciseId);
    if (running) for (const d of contactDeltas(ops, ctx.catalogue)) running[d.sessionId] = (running[d.sessionId] ?? d.before) + d.delta;
    out.push({ ...c, ops, safety: s.safety, id: changeId(c.kind, { e: c.exerciseName, ops: ops.map(opSignature) }) });
  }
  return out.sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title));
}

const opSignature = (op: DraftOp) => (op.action === 'update'
  ? ['u', op.sessionExerciseId, op.after.exerciseId, op.after.sets, op.after.reps, op.after.load, op.after.effortBand]
  : ['a', op.sessionId, op.exerciseId]);
