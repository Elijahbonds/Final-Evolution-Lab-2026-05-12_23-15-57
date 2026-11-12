// lib/cue-style/corpus.ts — CUE-REWRITE (2026-10-27): every line in scope of the style guide, with its tier.
//
// "Every word a person reads or hears while doing or reviewing a fitness movement" (the owner's ask, the lane brief), read
// from the modules that hold it — not copied — so a line changed anywhere is screened here. lib/cue-style/corpus.test.ts
// runs lintStyle (lib/cue-style/style.ts) over every entry and shapeProblems (result.ts) over every result.
//
// OUT OF SCOPE (not listed here, on purpose):
//   · Today's drill (lib/daily-drill/**, the drill page, lib/drills/**): the today-drill lane owns them; it has
//     docs/CUE-STYLE.md.
//   · Legal, consent and policy lines (the "not a medical exam" / "not a diagnosis" disclaimers, the privacy page, the
//     guardian and health gates): out of this lane's scope by the brief.
//   · The coach-facing words (the coach's alert lines, the prescribe draft): they are read by a coach, not the athlete.
//
// Test-only in practice (it imports most of the movement copy), but pure: no DOM, no Prisma.
import { CUES as MIRROR_COACH_CUES, fadeReviewLines, type FaultId, type SetReport } from '@/lib/babylon/nexus/neuro-mirror/rules/cue-engine';
import { MIRROR_PATTERNS } from '@/lib/mirror/patterns';
import { DEEPER_LINE, SQUARE_UP_LINE, SQUAT_FAULT_LABEL, squatBreathLine, squatReviewVerdict, kneeReadLine } from '@/lib/mirror/squatStage';
import { LUNGE_FAULT_LABEL, lungeSideResult, initialLungeSession } from '@/lib/mirror/lungeStage';
import { HINGE_FAULT_LABEL, HINGE_FRAMING, HINGE_SETUP_LINE } from '@/lib/mirror/hingeStage';
import { PUSHUP_FAULT_LABEL, PUSHUP_FRAMING, PUSHUP_SETUP_LINE } from '@/lib/mirror/pushupStage';
import { PRESS_ROW_FAULT_LABEL } from '@/lib/mirror/pressRowStage';
import { sideRepStageLine } from '@/lib/mirror/sideRepStage';
import { framingLine, SIDE_TURNED, type FramingIssue } from '@/lib/mirror/framing';
import { MIRROR_LIVE_MOVEMENTS } from '@/lib/mirror/liveMovements';
import { FULL_SCREEN, MODIFIED_SCREEN, TURN_CUE, fixLine, meaningLine } from '@/lib/mirror/screen';
import { RETEST_HINT } from '@/lib/mirror/stationGraders';
import { NOT_READ_AFTER_RETEST, NOT_READ_SKIPPED, RETEST_OFFER, STATUS_LABEL } from '@/lib/mirror/stationCard';
import { FIRST_LINE, TOO_FEW_LINE } from '@/lib/mirror/progressReading';
import { MOVE_ON_LINE, NEXT_LINE, PART_READ_LINE } from '@/lib/mirror/screenRunner';
import { MOVEMENT_SPECS, REVIEW_MOVEMENTS } from '@/lib/coach/formReview/movements';
import { flagResult } from '@/lib/coach/formReview/view';
import {
  CHECK_MEANING, FRAMING_FIX_LINES, GREEN_MEANING, GREEN_NEXT, JUMP_BEST_MEANS, JUMP_BEST_NEXT, SCREEN_TEST_NAMES, TRY_THIS,
  UNREAD_MEANING, UNREAD_NEXT,
} from '@/lib/screen/copy';
import { DRAFT_CUES, GRADED_CHECKS, cueOf } from '@/lib/screen/PROPOSED-thresholds';
import { FAULT_NAMES, MOVEMENT_NAMES } from './names';
import { SETUP_CUES } from '@/lib/coach/taxonomy';
import { TEMPLATE_EXERCISES } from '@/lib/coach/templateCatalogue';
import { PRIMERS, ROCK_HOLDS } from '@/lib/coach/warmupContent';
import { DEFAULT_NEXT } from '@/lib/coach/readiness/next';
import { E1RM_LINE, ESTIMATE_LINE as VBT_ESTIMATE, TEEN_LINE, setResult, stopLine } from '@/lib/vbt/copy';
import { ESTIMATE_LINE as SPRINT_ESTIMATE, FV_SLOPE_LINE, REACTION_LINE, RESULT_MEANS as SPRINT_MEANS, RESULT_NEXT as SPRINT_NEXT } from '@/lib/sprint/copy';
import { PAIN_REFERRAL } from '@/lib/assess/why';
import { result, type ResultLine } from './result';
import type { CueTier } from './style';
import { LEVEL_WORD, REVIEW_COPY } from './review';
import { CONFIRM_LINE } from '@/lib/babylon/nexus/neuro-mirror/rules/cue-engine';

export interface StyleEntry {
  /** Stable id: '<surface>:<key>'. */
  id: string;
  text: string;
  tier: CueTier;
  /** The surface the owner named (mirror, quick-screen, form-review, jump, readiness, vbt, sprint, library, programs). */
  surface: string;
  file: string;
}

export interface ResultEntry { id: string; surface: string; file: string; result: ResultLine }

const ISSUES: readonly FramingIssue[] = ['noBody', 'cutOffBottom', 'cutOffTop', 'turned', 'tooClose', 'tooFar', 'offCentre', 'dim'];

/** Every line, with its tier. */
export function styleCorpus(): StyleEntry[] {
  const out: StyleEntry[] = [];
  const add = (surface: string, id: string, text: string, tier: CueTier, file: string) => out.push({ id: `${surface}:${id}`, text, tier, surface, file });

  // ── the Mirror's live coach: cue / escalate / reply are said mid-rep (live); regress when the set stops (prompt) ──
  const engine = 'lib/babylon/nexus/neuro-mirror/rules/cue-engine.ts';
  for (const [f, c] of Object.entries(MIRROR_COACH_CUES)) {
    add('mirror', `coach:${f}:cue`, c.cue, 'live', engine);
    add('mirror', `coach:${f}:escalate`, c.escalate, 'live', engine);
    if (c.reply) add('mirror', `coach:${f}:reply`, c.reply, 'live', engine);
    add('mirror', `coach:${f}:regress`, c.regress, 'prompt', engine);
  }
  for (const p of MIRROR_PATTERNS) {
    add('mirror', `pattern:${p.id}:label`, p.label, 'label', 'lib/mirror/patterns.ts');
    for (const c of p.cues) {
      if (p.id === 'squat') continue;   // the squat's table is the coach's, above
      const file = `lib/mirror/patterns.ts (${p.id})`;
      add('mirror', `pattern:${p.id}:${c.faultId}:cue`, c.cue, 'live', file);
      add('mirror', `pattern:${p.id}:${c.faultId}:escalate`, c.escalate, 'live', file);
      if (c.reply) add('mirror', `pattern:${p.id}:${c.faultId}:reply`, c.reply, 'live', file);
      add('mirror', `pattern:${p.id}:${c.faultId}:regress`, c.regress, 'prompt', file);
    }
  }
  add('mirror', 'coach:confirm', CONFIRM_LINE, 'live', engine);
  for (const [k, l] of Object.entries(REVIEW_COPY)) add('mirror', `review:${k}`, l, 'prompt', 'lib/cue-style/review.ts');
  for (const [k, l] of Object.entries(LEVEL_WORD)) add('mirror', `review:level:${k}`, l, 'label', 'lib/cue-style/review.ts');
  // the said lines around a set
  for (const i of ISSUES) add('mirror', `framing:${i}`, framingLine(i), 'prompt', 'lib/mirror/framing.ts');
  add('mirror', 'framing:sideTurned', SIDE_TURNED, 'prompt', 'lib/mirror/framing.ts');
  add('mirror', 'squat:deeper', DEEPER_LINE, 'prompt', 'lib/mirror/squatStage.ts');
  add('mirror', 'squat:squareUp', SQUARE_UP_LINE, 'prompt', 'lib/mirror/squatStage.ts');
  add('mirror', 'squat:breath', squatBreathLine(), 'prompt', 'lib/mirror/squatStage.ts');
  for (const st of ['check', 'work'] as const) add('mirror', `sideRep:${st}`, sideRepStageLine({ checkReps: 3, workReps: 8 }, st)!, 'prompt', 'lib/mirror/sideRepStage.ts');
  HINGE_FRAMING.forEach((l, i) => add('mirror', `hinge:framing${i}`, l, 'card', 'lib/mirror/hingeStage.ts'));
  add('mirror', 'hinge:setup', HINGE_SETUP_LINE, 'prompt', 'lib/mirror/hingeStage.ts');
  PUSHUP_FRAMING.forEach((l, i) => add('mirror', `pushup:framing${i}`, l, 'card', 'lib/mirror/pushupStage.ts'));
  add('mirror', 'pushup:setup', PUSHUP_SETUP_LINE, 'prompt', 'lib/mirror/pushupStage.ts');
  for (const m of MIRROR_LIVE_MOVEMENTS) {
    add('mirror', `movement:${m.id}:title`, m.title, 'label', 'lib/mirror/liveMovements.ts');
    // a tab's description is read before starting: two short sentences at most
    m.reads.split(/(?<=\.)\s+/).forEach((s, i) => add('mirror', `movement:${m.id}:reads${i}`, s, 'card', 'lib/mirror/liveMovements.ts'));
  }
  // the review's fault names, every movement
  const labels: [string, Readonly<Record<string, string>>][] = [
    ['squat', SQUAT_FAULT_LABEL], ['lunge', LUNGE_FAULT_LABEL], ['hinge', HINGE_FAULT_LABEL], ['pushup', PUSHUP_FAULT_LABEL], ['pressRow', PRESS_ROW_FAULT_LABEL],
  ];
  for (const [m, l] of labels) for (const [f, t] of Object.entries(l)) add('mirror', `label:${m}:${f}`, t, 'label', `lib/mirror/${m}Stage.ts`);
  // the Movement Screen
  for (const st of [...MODIFIED_SCREEN, ...FULL_SCREEN.filter((s) => !MODIFIED_SCREEN.some((m) => m.id === s.id))]) {
    st.cue.split(/(?<=\.)\s+/).forEach((s, i) => add('mirror', `screen:${st.id}:cue${i}`, s, 'prompt', 'lib/mirror/screen.ts'));
    for (const c of st.checks) {
      add('mirror', `screen:${c.id}:label`, c.label, 'label', 'lib/mirror/screen.ts');
      add('mirror', `screen:${c.id}:flag`, c.flag, 'card', 'lib/mirror/screen.ts');
    }
  }
  for (const v of ['front', 'side', 'back'] as const) add('mirror', `screen:turn:${v}`, TURN_CUE[v], 'prompt', 'lib/mirror/screen.ts');
  for (const [r, h] of Object.entries(RETEST_HINT)) add('mirror', `screen:retestHint:${r}`, h, 'prompt', 'lib/mirror/stationGraders.ts');
  for (const [k, l] of Object.entries(STATUS_LABEL)) add('mirror', `screen:status:${k}`, l, 'label', 'lib/mirror/stationCard.ts');
  for (const [k, l] of Object.entries({ RETEST_OFFER, NOT_READ_AFTER_RETEST, NOT_READ_SKIPPED, NEXT_LINE, MOVE_ON_LINE, PART_READ_LINE, TOO_FEW_LINE, FIRST_LINE })) {
    add('mirror', `line:${k}`, l, 'prompt', 'lib/mirror');
  }

  // ── the form review: the flag names are the canonical names; the set-up line is read before filming ──
  for (const m of REVIEW_MOVEMENTS) add('form-review', `setup:${m}`, MOVEMENT_SPECS[m].setup, 'card', 'lib/coach/formReview/movements.ts');

  // ── the Quick Screen ──
  for (const [k, l] of Object.entries(SCREEN_TEST_NAMES)) add('quick-screen', `test:${k}`, l, 'label', 'lib/screen/copy.ts');
  for (const [k, l] of Object.entries(FRAMING_FIX_LINES)) add('quick-screen', `framing:${k}`, l, 'prompt', 'lib/screen/copy.ts');
  for (const c of GRADED_CHECKS) add('quick-screen', `check:${c.id}:name`, c.name.replace(/\s*\([^)]*\)$/, ''), 'label', 'lib/screen/PROPOSED-thresholds.ts');
  for (const [k, l] of Object.entries(DRAFT_CUES)) add('quick-screen', `drill:${k}`, l, 'card', 'lib/screen/PROPOSED-thresholds.ts');
  add('quick-screen', 'tryThis', TRY_THIS, 'label', 'lib/screen/copy.ts');

  // the review lines after a set: the fade schedule's report and the knee read
  const fade = (level: 'everyRep' | 'everyThird' | 'summaryOnly', next: 'everyRep' | 'everyThird' | 'summaryOnly', o: Partial<SetReport['faults'][number]>): SetReport<FaultId> =>
    ({ reps: 8, faults: [{ fault: 'heelRise', level, next, faultReps: 2, spoken: 0, landed: false, returned: false, slipped: false, ...o }] });
  const fades: SetReport<FaultId>[] = [
    fade('everyRep', 'everyRep', { returned: true, faultReps: 4 }), fade('summaryOnly', 'everyThird', { slipped: true, faultReps: 4 }),
    fade('summaryOnly', 'summaryOnly', {}), fade('everyThird', 'everyThird', { faultReps: 2 }),
    fade('everyRep', 'everyThird', { landed: true, faultReps: 1, spoken: 1 }), fade('everyThird', 'summaryOnly', { landed: true, faultReps: 0 }),
  ];
  fades.forEach((r, i) => fadeReviewLines(r, (f) => SQUAT_FAULT_LABEL[f as 'heelRise']).forEach((l, j) => add('mirror', `fade:${i}:${j}`, l, 'result', 'lib/babylon/nexus/neuro-mirror/rules/cue-engine.ts')));
  for (const [k, rec] of Object.entries({ none: { squareFrames: 0, notSquareFrames: 0 }, turned: { squareFrames: 0, notSquareFrames: 30 }, part: { squareFrames: 10, notSquareFrames: 30 } })) {
    const l = kneeReadLine({ left: null, right: null, flaggedFrames: 0, ...rec } as never);
    if (l) add('mirror', `kneeRead:${k}`, l, 'result', 'lib/mirror/squatStage.ts');
  }

  // ── programs and the coach's session player: the set-up pick list, the template exercises, the warm-up ──
  for (const c of SETUP_CUES) add('programs', `setupCue:${c.id}`, c.text, 'card', 'lib/coach/taxonomy.ts');
  for (const e of TEMPLATE_EXERCISES) {
    e.catalogue.primaryCues.forEach((t, i) => add('programs', `template:${e.key}:cue${i}`, t, 'card', 'lib/coach/templateCatalogue.ts'));
    e.catalogue.commonFaults.forEach((f, i) => {
      add('programs', `template:${e.key}:fault${i}`, f.fault, 'label', 'lib/coach/templateCatalogue.ts');
      add('programs', `template:${e.key}:fix${i}`, f.correctionCue, 'card', 'lib/coach/templateCatalogue.ts');
    });
  }
  for (const r of ROCK_HOLDS) { add('programs', `warmup:${r.id}:setup`, r.setup, 'setup', 'lib/coach/warmupContent.ts'); add('programs', `warmup:${r.id}:cue`, r.cue, 'setup', 'lib/coach/warmupContent.ts'); }
  for (const p of PRIMERS) add('programs', `primer:${p.id}:cue`, p.cue, 'card', 'lib/coach/warmupContent.ts');

  // ── readiness, bar speed, sprint, the Quick Screen's pain stop ──
  for (const [b, l] of Object.entries(DEFAULT_NEXT)) add('readiness', `next:${b}`, l, 'result', 'lib/coach/readiness/next.ts');
  for (const [k, l] of Object.entries({ VBT_ESTIMATE, TEEN_LINE, E1RM_LINE })) add('vbt', `line:${k}`, l, 'result', 'lib/vbt/copy.ts');
  add('vbt', 'stop', stopLine(20), 'prompt', 'lib/vbt/copy.ts');
  for (const [k, l] of Object.entries({ SPRINT_ESTIMATE, FV_SLOPE_LINE, REACTION_LINE })) add('sprint', `line:${k}`, l, 'result', 'lib/sprint/copy.ts');
  add('quick-screen', 'painReferral', PAIN_REFERRAL, 'result', 'lib/assess/why.ts');

  // ── the canonical names themselves ──
  for (const [k, l] of Object.entries(FAULT_NAMES)) add('names', `fault:${k}`, l, 'label', 'lib/cue-style/names.ts');
  for (const [k, l] of Object.entries(MOVEMENT_NAMES)) add('names', `movement:${k}`, l, 'label', 'lib/cue-style/names.ts');
  return out;
}

/** Every result this lane builds, in the three-part shape. */
export function resultCorpus(): ResultEntry[] {
  const out: ResultEntry[] = [];
  const add = (surface: string, id: string, file: string, r: ResultLine) => out.push({ id: `${surface}:${id}`, surface, file, result: r });

  // the Mirror's squat review, every kind
  const opts = { cueable: (f: readonly string[]) => [...f] as never[], kneeJudged: true };
  const sq = 'lib/mirror/squatStage.ts';
  add('mirror', 'squat:clean', sq, squatReviewVerdict([[], []], [], opts as never).result);
  add('mirror', 'squat:kneeUnjudged', sq, squatReviewVerdict([[], []], [], { ...opts, kneeJudged: false } as never).result);
  add('mirror', 'squat:faultsNotCued', sq, squatReviewVerdict([['heelRise'], []], [], opts as never).result);
  add('mirror', 'squat:tooFewReps', sq, squatReviewVerdict([[]], [{ fault: 'heelRise', level: 'cue' }], opts as never).result);
  add('mirror', 'squat:stillShowing', sq, squatReviewVerdict([['heelRise'], ['heelRise']], [{ fault: 'heelRise', level: 'cue' }], opts as never).result);
  add('mirror', 'squat:stillShowingRegressed', sq, squatReviewVerdict([['heelRise'], ['heelRise']], [{ fault: 'heelRise', level: 'regress' }], opts as never).result);
  add('mirror', 'squat:held', sq, squatReviewVerdict([['heelRise'], [], []], [{ fault: 'heelRise', level: 'cue' }], opts as never).result);
  add('mirror', 'lunge:notDone', 'lib/mirror/lungeStage.ts', lungeSideResult(initialLungeSession(), 'right').result);
  // the form review's flags, every fault of every movement
  for (const m of REVIEW_MOVEMENTS) {
    for (const f of MOVEMENT_SPECS[m].faults) add('form-review', `flag:${m}:${f}`, 'lib/coach/formReview/view.ts', flagResult(m, { rep: 4, fault: f, reason: `${MOVEMENT_SPECS[m].label_of[f]} on rep 4` }));
  }
  // the Movement Screen: a flag's saw (the check's flag line) / means / fix
  for (const st of FULL_SCREEN) {
    for (const c of st.checks) {
      const fix = fixLine(c.id), means = meaningLine(c.id);
      if (fix && means) add('mirror', `screen:${c.id}`, 'lib/mirror/screen.ts', result(c.flag, means, fix));
    }
  }
  // the Quick Screen's cards
  for (const c of GRADED_CHECKS) {
    add('quick-screen', `card:${c.id}`, 'app/play/mirror/assess/_components/results-view.tsx',
      result(c.name.replace(/\s*\([^)]*\)$/, '') + '.', CHECK_MEANING[c.id], `${TRY_THIS} ${cueOf(c.id)}`));
  }
  add('quick-screen', 'card:green', 'app/play/mirror/assess/_components/results-view.tsx', result('Good to go.', GREEN_MEANING, GREEN_NEXT));
  add('quick-screen', 'card:unread', 'app/play/mirror/assess/_components/results-view.tsx', result('Not read.', UNREAD_MEANING, UNREAD_NEXT));
  for (const [k, o] of Object.entries({ none: { bestMcv: null, lossPct: null }, one: { bestMcv: 0.62, lossPct: null }, under: { bestMcv: 0.62, lossPct: 12 }, over: { bestMcv: 0.62, lossPct: 25 } })) {
    add('vbt', `set:${k}`, 'lib/vbt/copy.ts', setResult({ ...o, stopPct: 20 }));
  }
  add('sprint', 'run', 'components/sprint/run-result.tsx', result('40 yd: 4.82 s ± 0.03.', SPRINT_MEANS, SPRINT_NEXT));
  add('quick-screen', 'card:jump', 'app/play/mirror/assess/_components/results-view.tsx', result('Your best jump: about 17 in.', JUMP_BEST_MEANS, JUMP_BEST_NEXT));
  return out;
}

/**
 * The exercise library's words (data/library/**, read through lib/library/files.ts): every unique cue (card), fault (label),
 * fix (card), set-up (setup) and caution (card). Unique strings, each once: ~3,500 lines across 5,020 entries.
 */
export function libraryCorpus(entries: readonly { setup: string; cues: string[]; faults: { fault: string; fix: string }[]; cautions: string[] }[]): StyleEntry[] {
  const seen = new Set<string>();
  const out: StyleEntry[] = [];
  const add = (kind: string, text: string, tier: CueTier) => {
    if (!text || seen.has(`${kind}|${text}`)) return;
    seen.add(`${kind}|${text}`);
    out.push({ id: `library:${kind}:${out.length}`, text, tier, surface: 'library', file: 'data/library' });
  };
  for (const e of entries) {
    add('setup', e.setup, 'setup');
    for (const c of e.cues) add('cue', c, 'card');
    for (const f of e.faults) { add('fault', f.fault, 'label'); add('fix', f.fix, 'card'); }
    for (const c of e.cautions) add('caution', c, 'card');
  }
  return out;
}
