// mirrorToProgram — the screen writes the corrective work.
//
// THIS IS THE TIE THE WHOLE PLATFORM WAS MISSING, and it is the one thing in the competitive audit that the field
// cannot answer quickly. ATG's flagship is form coaching — a human watching uploaded video, on a delay. THP's is an
// assessment — a questionnaire, filled once, routed by hand into a pre-built cycle. Both are the same idea done by
// people: look at how the athlete moves, then program for what you saw.
//
// Here the looking is already automated (lib/mirror/screen scores a movement screen from the athlete's own camera)
// and the programming already exists (CoachingProgram → Block → Session → exercises). Nothing joined them. A coach
// could read a screen result on one page and type the corrective work into another, from memory, which is exactly
// the manual step the competition charges for.
//
// So: findings in, prescribed work out, ordered by the finding that cost the most.
//
// TWO RULES IT WILL NOT BREAK:
//
//   1. IT PRESCRIBES FROM THE COACH'S OWN CATALOGUE. No invented exercise names, no hard-coded library — the caller
//      passes what the coach actually has, and a finding with nothing to match against returns the finding with no
//      exercise rather than a made-up one. A coach who opens their program and sees a movement they have never
//      heard of stops trusting the tool.
//   2. IT IS A DRAFT, NOT A COMMIT. Every prescription carries the finding it came from so the coach can see why it
//      is there and throw it out. The Mirror suggests; the coach still writes the program.
//
// MIRROR-COACH P3 (2026-09-26) — FROM REAL RESULTS. The screen grades now (lib/mirror/stationGraders.ts) and the server
// re-decides every grade (lib/mirror/screenClaims.ts), so this module reads what the camera actually saw. What changed:
//   · EACH FLAG MAPS TO ITS FIX LINE AND A CORRECTIVE BLOCK (lib/mirror/screenCorrectives.ts — the same mapping the
//     athlete sees after the screen), with the value the camera read, labelled estimated. The prescription used to say
//     "From the screen: hip level failed on the left side." — no number, and "failed" is a verdict on the athlete.
//   · A CHECK THE CAMERA COULD NOT READ IS 'RETEST', NEVER CLEAR; A PASS PRESCRIBES NOTHING.
//   · THREE GROUPS, NEVER MIXED (reviewScreen): what the camera saw; what the athlete answered — kept as their own
//     words, never a grade; and the hands-on checks that are the coach's to do in person.
//   · MATCHED ON THE CATALOGUE'S TAGS, not its names (the P2 report's deferred item). A name match was a word hunt:
//     "hip" found "Hip thrust" for the knee window, and a row the coach had tagged as a plyometric could be picked for a
//     breath finding because its name had "breath" in it. The tags P2 added (pattern, skill layer — lib/coach/
//     taxonomy.ts) say what an exercise trains; a name is only read for a row the coach has not tagged at all, and the
//     draft says so ("matched by its name — tag it to be sure").
//   · ONE TAP ADDS IT: every matched corrective goes into the PREP section (taxonomy.ts: "Get ready to move: breath,
//     feet and joints") through the program builder's own add path (lib/coach/builderServer.ts builderAction 'add').
//
// Pure: no database, no session, no fetch. app/api/coach/prescribe/route.ts is the IO around coachDraft.
import type { MovementPattern } from '@/public/_prisma/client';
import type { CheckId } from '@/lib/mirror/assessment';
import type { ScreenResultSummary, CheckResult, ScreenId } from '@/lib/mirror/screen';
import type { PlaybookBlock } from '@/lib/mirror/program';
import {
  CAMERA_NOT_DIAGNOSIS, SHORT_LABEL, outcomeTitle, outcomesFromGrades, outcomesFromResults, withoutBlocks,
  type CheckOutcome, type YouthGate,
} from '@/lib/mirror/screenCorrectives';
import { ANSWER_LABEL, coachChecksFor, selfReportQuestionsFor, type SelfReportAnswer, type SelfReportEntry } from '@/lib/mirror/selfReport';
import { isServerGradedScreen, isUngradedStoredScreen, readStoredScreen, type StoredScreen } from '@/lib/mirror/screenStore';
import { RETEST_HINT, isGraderId, unreadableLine, type GraderId, type UnreadableReason } from '@/lib/mirror/stationGraders';
import { isScreenNotStation, screenCoverage } from '@/lib/mirror/screenClaims';
import { PIN_EXERCISE, skillLayer } from './taxonomy';

export interface CatalogueExercise {
  id: string;
  name: string;
  category?: string | null;
  /** The P2 tags (ProgramExercise.pattern / skillLayer). null = the coach has not tagged it. */
  pattern?: MovementPattern | string | null;
  skillLayer?: string | null;
  /** The row's own tempo ("0-0-0-0" for a timed or contact drill), carried onto the add. */
  defaultTempo?: string | null;
}

export interface Prescription {
  /** The screen check this answers. */
  findingId: string;
  /** singleLeg: the leg; any other check: the side of a one-sided flag. */
  side?: 'left' | 'right';
  /** "Hip level, right side". */
  title: string;
  /** What the camera read, labelled estimated; null for a legacy row with no detail. */
  value: string | null;
  /** Why it is in the program, in the coach's language. Always starts "From the screen:" (coverage.ts reads that). */
  because: string;
  /** The check's FIX line (lib/mirror/screen.ts). */
  fix: string | null;
  /** The corrective block it maps to (lib/mirror/program.ts); null when none fits (the heel line). */
  block: PlaybookBlock | null;
  /** The exercise from the coach's own catalogue, or null when they have nothing that matches. */
  exercise: CatalogueExercise | null;
  /** How the exercise was found: on its tags, or on its name because the row is untagged. */
  matchedBy: 'tags' | 'name' | null;
  sets: number;
  reps: string;
  /**
   * Seconds per set when the dose is timed, else null (MIRROR-COACH P2, 2026-09-25). The single-leg dose was the
   * string "30 seconds each side" in `reps`, because a prescription had nowhere else to put a time; SessionExercise
   * has workSeconds now, so the builder can run a timer on it.
   */
  workSeconds: number | null;
  /** Where it goes in a session: always the Prep section (MIRROR-COACH P3). */
  section: typeof CORRECTIVE_SECTION;
  /** What to look for if there is no match — the tags that would match, in words, so an empty slot is actionable. */
  wanted: string[];
}

/** Correctives go in the session's Prep section: "breath, feet and joints" before the main work (taxonomy.ts). */
export const CORRECTIVE_SECTION = 'prep' as const;
/** Rest between corrective sets: low-load prep work, not a lift (FEL's choice; the schema default is 90 s). */
export const CORRECTIVE_REST_SECONDS = 30;
/** Every prescription's coach note starts with this; lib/coach/coverage.ts mentionsShoulder skips such notes. */
export const SCREEN_NOTE_PREFIX = 'From the screen:';
/** The coach note is a SessionExercise.coachNote, which lib/coach/loop.ts caps at 300 characters. */
const COACH_NOTE_CHARS = 300;

// ── what each flag looks for in a catalogue ─────────────────────────────────────────────────────────────────────────
//
// One or more TAG WANTS per check, most wanted first, read off the check's FIX line (lib/mirror/screen.ts) against the
// skill layers of the owner's Playbook (lib/coach/taxonomy.ts). A catalogue row matches a want when its tags carry
// every tag the want names. The 'joints' layer spans "ankle, hip and upper back" (taxonomy.ts), so a joints want also
// names the joint, and the row's NAME must say it — the only place a name decides anything for a tagged row.
export interface TagWant { pattern?: MovementPattern; skillLayer?: string; joint?: readonly string[] }

export const WANTED_TAGS: Record<GraderId, readonly TagWant[]> = {
  // "Foot tripod work before anything loaded — short-foot holds, then slow calf raises…"
  heelLine: [{ skillLayer: 'tripod' }, { skillLayer: 'joints', joint: ['ankle', 'calf', 'foot'] }],
  // "Hip external-rotation and glute-medius work, and slow tempo squats watching the knee…"
  kneeWindow: [{ skillLayer: 'joints', joint: ['hip'] }, { skillLayer: 'strength', pattern: 'squat' }],
  // "Single-leg hip work on the low side…"
  hipLevel: [{ skillLayer: 'strength', pattern: 'lunge' }, { pattern: 'lunge' }],
  // "Breathing work first, then easy rotation drills to both sides."
  shoulderLevel: [{ skillLayer: 'cylinder', pattern: 'breath' }, { pattern: 'rotation' }],
  // "Chin nods and thoracic extension over a roller…"
  headFloat: [{ skillLayer: 'joints', joint: ['thoracic', 'upper back', 't-spine', 'mid-back', 'chin'] }],
  // "Thirty-second stance holds daily, then step-downs…"
  singleLeg: [{ skillLayer: 'tripod' }, { pattern: 'lunge' }],
};

/**
 * Words for an UNTAGGED row's name (both tags null) — the P2 matcher's list for these six checks, kept only for rows
 * nobody has tagged yet, most specific first. A row with any tag is read by its tags alone.
 */
const NAME_HINTS: Record<GraderId, readonly string[]> = {
  heelLine: ['ankle', 'calf', 'foot', 'tibialis', 'dorsiflex'],
  kneeWindow: ['glute med', 'hip abduction', 'band walk', 'clamshell', 'hip'],
  hipLevel: ['single leg', 'split squat', 'step up', 'hip hike', 'hip'],
  shoulderLevel: ['thoracic', 'rotation', 'breath'],
  headFloat: ['thoracic', 'chin', 'neck', 'extension'],
  singleLeg: ['single leg', 'balance', 'step down', 'hip'],
};

/** How the corrective is dosed. Low and daily beats heavy and occasional for this work. */
const DOSE: Record<GraderId, { sets: number; reps: string; workSeconds?: number }> = {
  heelLine: { sets: 3, reps: '12 slow' },
  kneeWindow: { sets: 3, reps: '12 each side' },
  hipLevel: { sets: 3, reps: '8 each side' },
  shoulderLevel: { sets: 2, reps: '10 each way' },
  headFloat: { sets: 2, reps: '10' },
  singleLeg: { sets: 3, reps: '30 s each side', workSeconds: 30 },
};

const low = (s: string | null | undefined) => (s ?? '').toLowerCase();
const isUntagged = (e: CatalogueExercise) => !e.pattern && !e.skillLayer;
const fits = (e: CatalogueExercise, w: TagWant) =>
  (!w.pattern || e.pattern === w.pattern) && (!w.skillLayer || e.skillLayer === w.skillLayer)
  && (!w.joint || w.joint.some((j) => low(e.name).includes(j)));

/** A want in words, for the "look for" line under an empty slot: "Joints layer, naming the hip". */
export function wantLine(w: TagWant): string {
  const layer = w.skillLayer ? `${skillLayer(w.skillLayer)?.label ?? w.skillLayer} layer` : null;
  const parts = [layer, w.pattern ? `${w.pattern} pattern` : null].filter(Boolean).join(', ');
  return w.joint ? `${parts}, naming the ${w.joint[0]}` : parts;
}

/** What a check looks for, in words. */
export function wantedFor(checkId: string): string[] {
  return isGraderId(checkId) ? WANTED_TAGS[checkId].map(wantLine) : [];
}

/**
 * Pick the best match for a check out of the coach's catalogue: the first want that any TAGGED row fits (catalogue
 * order breaks a tie), else an UNTAGGED row whose name carries one of the check's words, else nothing.
 */
export function matchExercise(checkId: string, catalogue: readonly CatalogueExercise[]): { exercise: CatalogueExercise; by: 'tags' | 'name' } | null {
  if (!isGraderId(checkId)) return null;
  for (const w of WANTED_TAGS[checkId]) {
    const hit = catalogue.find((e) => !isUntagged(e) && fits(e, w));
    if (hit) return { exercise: hit, by: 'tags' };
  }
  const untagged = catalogue.filter(isUntagged);
  for (const term of NAME_HINTS[checkId]) {
    const hit = untagged.find((e) => low(e.name).includes(term));
    if (hit) return { exercise: hit, by: 'name' };
  }
  return null;
}

/** The coach note for a flag: what the camera saw, in one line. Starts with SCREEN_NOTE_PREFIX; at most 300 characters. */
export function becauseLine(o: Pick<CheckOutcome, 'checkId' | 'label' | 'side' | 'value' | 'borderline'>): string {
  const seen = o.value ? ` (${o.value})` : '';
  const what = o.borderline ? 'came back borderline' : 'was flagged for a closer look';
  return `${SCREEN_NOTE_PREFIX} ${outcomeTitle(o)} ${what}${seen}.`.slice(0, COACH_NOTE_CHARS);
}

/**
 * Turn a screen's camera outcomes into a draft of corrective work: flags only (a pass prescribes nothing, a retest is
 * not a finding), the pre-P3 borderlines after the flags, one-sided before bilateral, at most `max` — three
 * correctives an athlete does beats nine they skip — and no catalogue row twice.
 */
export function prescribeFromOutcomes(outcomes: readonly CheckOutcome[], catalogue: readonly CatalogueExercise[], max = 3): Prescription[] {
  const ranked = outcomes
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => o.status === 'flag')
    .sort((a, b) => {
      if (!!a.o.borderline !== !!b.o.borderline) return a.o.borderline ? 1 : -1;   // flags before borderlines
      const sided = (b.o.side ? 1 : 0) - (a.o.side ? 1 : 0);                        // one-sided before bilateral
      return sided || a.i - b.i;                                                     // then protocol order
    })
    .map(({ o }) => o);

  const out: Prescription[] = [];
  const used = new Set<string>();
  for (const o of ranked) {
    if (out.length >= max) break;
    const m = matchExercise(o.checkId, catalogue.filter((e) => !used.has(e.id)));
    if (m) used.add(m.exercise.id);
    const dose = DOSE[o.checkId];
    out.push({
      findingId: o.checkId,
      ...(o.side ? { side: o.side } : {}),
      title: outcomeTitle(o),
      value: o.value,
      because: becauseLine(o),
      fix: o.fix,
      block: o.block,
      exercise: m?.exercise ?? null,
      matchedBy: m?.by ?? null,
      sets: dose.sets,
      reps: dose.reps,
      workSeconds: dose.workSeconds ?? null,
      section: CORRECTIVE_SECTION,
      wanted: wantedFor(o.checkId),
    });
  }
  return out;
}

/**
 * The pre-P3 entry point, kept for callers that hold only a summary and its findings: the findings are read as camera
 * results over the modified screen's camera slots (both variants have the same six camera checks) and drafted as above.
 * A finding that is not a camera check (the breath answers, a coach's check, an id no screen has) drafts nothing.
 */
export function prescribeFromScreen(
  summary: Pick<ScreenResultSummary, 'meaning' | 'suggestions'> & { findings: readonly { checkId: string; grade: string; side?: 'left' | 'right'; detail?: string }[] },
  catalogue: readonly CatalogueExercise[],
  max = 3,
): Prescription[] {
  const results = summary.findings.filter((f) => isGraderId(f.checkId)) as unknown as CheckResult[];
  return prescribeFromOutcomes(outcomesFromResults('modified', results), catalogue, max);
}

// ── one tap: the draft into the program ─────────────────────────────────────────────────────────────────────────────

/**
 * The body POST /api/coach/programs/:id/exercises takes (builderAction 'add') for one prescription, or null when the
 * coach has nothing in their catalogue for it. Prep section, no load (a prep item read "@ RPE7" otherwise — the P2
 * review), the row's own tempo when it has one, a short rest, and the finding as the coach note.
 */
export function addBodyFor(p: Prescription, sessionId: string): Record<string, unknown> | null {
  if (!p.exercise) return null;
  const tempo = p.exercise.defaultTempo && /^\d+-\d+-\d+-\d+$/.test(p.exercise.defaultTempo) ? { tempo: p.exercise.defaultTempo } : {};
  return {
    action: 'add', sessionId, exerciseId: p.exercise.id, section: CORRECTIVE_SECTION,
    sets: p.sets, reps: p.reps, workSeconds: p.workSeconds, load: '', restSeconds: CORRECTIVE_REST_SECONDS, ...tempo,
    coachNote: p.because,
  };
}

/** Every matched corrective of a draft as add bodies, in draft order: what "add the block" sends, one after another. */
export function blockAddBodies(prescriptions: readonly Prescription[], sessionId: string): Record<string, unknown>[] {
  return prescriptions.map((p) => addBodyFor(p, sessionId)).filter((b): b is Record<string, unknown> => b !== null);
}

// ── the coach's view: three groups ──────────────────────────────────────────────────────────────────────────────────

export const REVIEW_GROUPS = {
  camera: 'What the camera saw · estimated',
  answers: 'What they answered · their words, not graded',
  coach: 'Yours to check in person',
} as const;

/** The coach's status words. "Retest" is what a check the camera could not read asks for; it is never "clear". */
export const COACH_STATUS: Record<CheckOutcome['status'], string> = {
  flag: 'Flagged for a closer look',
  pass: 'Pass',
  retest: 'Retest',
};

export interface CameraRow {
  checkId: GraderId;
  side?: 'left' | 'right';
  title: string;
  status: CheckOutcome['status'];
  statusLabel: string;
  value: string | null;
  /** Flags: the FIX line. */
  fix: string | null;
  /** Flags: the corrective block. */
  block: PlaybookBlock | null;
  /** Retests: why it was not read, and what to ask for. */
  retest: string | null;
}

export interface AnswerRow {
  questionId: string;
  question: string;
  answer: SelfReportAnswer | null;
  /** 'They said: "Not sure".' — the client's own word, quoted; or 'Not answered.' */
  said: string;
}

export interface CoachCheckRow { checkId: string; label: string; line: string }

export interface ScreenReview {
  camera: CameraRow[];
  /** The questions, with the client's answers only when they shared them (answersShared); else every answer is null. */
  answers: AnswerRow[];
  /** True when the client's answers were withheld (no consent to share them yet): the rows say ANSWERS_WITHHELD. */
  answersWithheld: boolean;
  coachChecks: CoachCheckRow[];
  /** Said when the screen has no hands-on checks (the modified screen). */
  coachChecksNote: string | null;
  note: string;
}

/** Said beside every hands-on check on the coach's side. */
export const COACH_OWN_CHECK_LINE = 'The camera does not read this, and it is never scored.';
export const MODIFIED_NO_COACH_CHECKS = 'The modified screen has no hands-on checks. The full screen adds the pelvic tilt and the seated rotation for you to check in person.';
export const ANSWERS_NOTE = 'Kept as they answered. Answers are never graded and never change the score.';

/**
 * OWNER DECISION #4 — "coach sees it only with client consent" (MIRROR-COACH P3 review, 2026-09-26). The breath answers
 * are the athlete's own report of how their body moved as they breathed; they are not pain answers, but they are
 * self-reported body data, and the consent step that decision asks for is phase 5's (the health intake). Until it exists
 * the coach sees the questions and not the answers — the conservative reading, one switch (answersShared) away from the
 * other: phase 5 passes the client's consent here. The answers stay on the athlete's own screen row, as before; nothing
 * under lib/share or the share routes reads mirror_screen rows.
 */
export const ANSWERS_WITHHELD = 'Their answers stay with them until they choose to share them with you — that step comes with the health intake.';

/** Youth rules for the client (owner decisions #6, #20; PLAN item 9), said on the coach's side. */
export const YOUTH_DRAFT_NOTE: Record<Exclude<YouthGate, null>, string> = {
  minor: 'Under 18: the written corrective blocks are off, and pin-and-stretch rows in your catalogue are not offered.',
  unknownAge: 'No birth year on file, so youth rules apply: the written corrective blocks are off, and pin-and-stretch rows in your catalogue are not offered.',
};

/** A catalogue row that pins (a pin-and-stretch or a pinned release) — never offered to a youth client (decision #6). */
export const PIN_ROW = PIN_EXERCISE;

/** The client's answer as their own word, quoted — never a grade. */
export function saidLine(answer: SelfReportAnswer | null): string {
  return answer ? `They said: "${ANSWER_LABEL[answer]}".` : 'Not answered.';
}

/** A stored screen's camera outcomes: the server's re-checked grades when the row has them, else its results. */
export function outcomesOf(stored: Pick<StoredScreen, 'screen' | 'results' | 'camera'>): CheckOutcome[] {
  return Array.isArray(stored.camera) && stored.camera.length
    ? outcomesFromGrades(stored.screen, stored.camera)
    : outcomesFromResults(stored.screen, stored.results);
}

export function cameraRows(outcomes: readonly CheckOutcome[]): CameraRow[] {
  return outcomes.map((o) => ({
    checkId: o.checkId, ...(o.side ? { side: o.side } : {}), title: outcomeTitle(o),
    status: o.status, statusLabel: o.borderline ? 'Borderline' : COACH_STATUS[o.status],
    value: o.value, fix: o.fix, block: o.block,
    retest: o.status === 'retest' ? `${o.note ?? ''} ${o.hint ?? ''}`.trim() : null,
  }));
}

/** The three groups for one stored screen. The answers are shown only when the client shared them (ANSWERS_WITHHELD). */
export function reviewScreen(
  stored: Pick<StoredScreen, 'screen' | 'results' | 'camera' | 'selfReport'>,
  outcomes: readonly CheckOutcome[] = outcomesOf(stored),
  opts: { answersShared?: boolean } = {},
): ScreenReview {
  const shared = opts.answersShared === true;
  const given = new Map((shared ? stored.selfReport ?? [] : []).map((a: SelfReportEntry) => [a.questionId, a.answer]));
  const answers = selfReportQuestionsFor(stored.screen).map((q) => {
    const answer = given.get(q.id) ?? null;
    return { questionId: q.id, question: q.text, answer, said: shared ? saidLine(answer) : ANSWERS_WITHHELD };
  });
  const coachChecks = coachChecksFor(stored.screen).map((c) => ({ checkId: c.id, label: c.label, line: COACH_OWN_CHECK_LINE }));
  return {
    camera: cameraRows(outcomes), answers, answersWithheld: !shared, coachChecks,
    coachChecksNote: coachChecks.length ? null : MODIFIED_NO_COACH_CHECKS,
    note: CAMERA_NOT_DIAGNOSIS,
  };
}

// ── the route's whole answer, minus the IO ──────────────────────────────────────────────────────────────────────────

/**
 * 'unread_screen' (MIRROR-COACH P3 review, 2026-09-26): a screen the camera TRIED and read none of — its reasons are
 * stored (the row's `camera`), so the coach is told why; 'ungraded_screen' is kept for a run with no grades at all (every
 * row stored before 2026-09-26), where "the camera could not read any of its checks" was never true.
 */
export type DraftReason = 'no_screen' | 'ungraded_screen' | 'unread_screen' | 'unreadable_screen' | 'clear_screen' | 'partial_screen';

export interface CoachDraft {
  screenAt: Date | string | null;
  screen?: ScreenId;
  headline?: string;
  complete?: boolean;
  /** Fewer than three camera checks were read: stored, never paid (lib/mirror/screenClaims.ts). */
  provisional?: boolean;
  /** The grades were re-checked by the server (every screen stored since P3); false = the posting phone's own word. */
  serverGraded?: boolean;
  /** How many camera slots came back 'retest'. */
  retests?: number;
  prescriptions: Prescription[];
  review?: ScreenReview;
  reason?: DraftReason;
  /** A newer run than the screen drafted from was not graded. */
  newerRunAt?: Date | string | null;
  /** 'unread_screen': why the camera could not read it (the commonest stored reason) and the one fix. */
  unread?: { why: string; hint: string };
  /** The client is under youth rules: blocks off, pin rows not offered (YOUTH_DRAFT_NOTE). */
  youth?: Exclude<YouthGate, null>;
  youthNote?: string;
  /** Catalogue rows left out because they pin and the client is under youth rules. */
  pinRowsSkipped?: number;
}

export interface DraftOptions {
  /** The client's youth gate (lib/mirror/screenCorrectives.ts youthGateFor(User.dobYear)). The route always passes it. */
  youth?: YouthGate;
  /** The client consented to share their self-report answers with this coach (phase 5). Absent = not shared. */
  answersShared?: boolean;
}

/** Why the camera read nothing on a stored row: the commonest stored reason, in the athlete's words, and its fix. */
function unreadOf(metrics: unknown): { why: string; hint: string } | null {
  const cam = (metrics as { camera?: unknown } | null)?.camera;
  if (!Array.isArray(cam) || !cam.length) return null;
  const tally = new Map<UnreadableReason, number>();
  for (const c of cam) {
    const r = (c as { reason?: unknown })?.reason;
    if (typeof r === 'string' && r in RETEST_HINT) tally.set(r as UnreadableReason, (tally.get(r as UnreadableReason) ?? 0) + 1);
  }
  const top = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!top) return { why: 'the phone could not read them', hint: RETEST_HINT.tooFewFrames };
  const sample = cam.find((c) => (c as { reason?: unknown })?.reason === top) as
    { checkId?: unknown; frames?: unknown; readableFrames?: unknown; stanceSec?: unknown } | undefined;
  const cid = sample?.checkId;
  const id: GraderId = isGraderId(cid) ? cid : 'hipLevel';
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  const counts = { frames: n(sample?.frames), readableFrames: n(sample?.readableFrames), stanceSec: n(sample?.stanceSec) };
  return { why: unreadableLine(id, top, counts).replace(/^Not read: /, '').replace(/\.$/, ''), hint: RETEST_HINT[top] };
}

/**
 * The draft for a coach from a client's screens, newest first (what GET /api/coach/prescribe reads).
 *
 * THE LAST GRADED SCREEN (MIRROR-COACH P1's read of 20 rows, kept and now tested here): the newest row readStoredScreen
 * can read. A newer run that graded nothing — every camera check unreadable, or an old client that posted no grades —
 * is skipped and named as `newerRunAt`, rather than hiding the graded screen before it.
 * 'clear_screen' needs a COMPLETE screen with no flag and no retest; anything with a retest is 'partial_screen'.
 */
export function coachDraft(
  scans: readonly { metrics: unknown; createdAt: Date | string }[], catalogue: readonly CatalogueExercise[], opts: DraftOptions = {},
): CoachDraft {
  if (!scans.length) return { screenAt: null, prescriptions: [], reason: 'no_screen' };
  const newest = scans[0];
  const graded = scans.map((s) => ({ scan: s, stored: readStoredScreen(s.metrics) })).find((x) => x.stored);
  if (!graded) {
    const unread = isUngradedStoredScreen(newest.metrics) ? unreadOf(newest.metrics) : null;
    const reason: DraftReason = unread ? 'unread_screen' : isUngradedStoredScreen(newest.metrics) ? 'ungraded_screen' : 'unreadable_screen';
    return { screenAt: newest.createdAt, prescriptions: [], reason, ...(unread ? { unread } : {}) };
  }
  const stored = graded.stored!;
  // YOUTH RULES (MIRROR-COACH P3 review, 2026-09-26; owner decisions #6, #20, PLAN item 9): the written blocks are off,
  // and a catalogue row that pins is never offered — the Mirror's own mapping holds no pin (screenCorrectives.ts), but a
  // coach's "Calf pin and stretch" tagged 'joints' matched a heel-line flag and went into a 15-year-old's Prep in one tap
  const youth = opts.youth ?? null;
  const outcomes = youth ? withoutBlocks(outcomesOf(stored)) : outcomesOf(stored);
  const offered = youth ? catalogue.filter((e) => !PIN_ROW.test(e.name)) : catalogue;
  const prescriptions = prescribeFromOutcomes(outcomes, offered);
  const retests = outcomes.filter((o) => o.status === 'retest').length;
  const flags = outcomes.filter((o) => o.status === 'flag').length;
  const complete = stored.summary.ranAll && retests === 0;
  const reason: Partial<CoachDraft> = flags ? {} : { reason: complete ? 'clear_screen' : 'partial_screen' };
  return {
    screenAt: graded.scan.createdAt,
    screen: stored.screen,
    headline: stored.summary.headline,
    complete,
    // re-derived from the row's own results, not only its stored flag (P3 review: one station is not a screen)
    provisional: stored.provisional === true || !isScreenNotStation(screenCoverage(stored.screen, stored.results)),
    serverGraded: isServerGradedScreen(graded.scan.metrics),
    retests,
    prescriptions,
    review: reviewScreen(stored, outcomes, { answersShared: opts.answersShared }),
    ...reason,
    ...(graded.scan === newest ? {} : { newerRunAt: newest.createdAt }),
    ...(youth ? { youth, youthNote: YOUTH_DRAFT_NOTE[youth], pinRowsSkipped: catalogue.length - offered.length } : {}),
  };
}

/** Short labels for the six camera checks, re-exported for the coach's panel. */
export { SHORT_LABEL };
export type { CheckId };
