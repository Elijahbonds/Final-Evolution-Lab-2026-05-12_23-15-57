// selfReport — the screen's stations a camera cannot read, asked or handed to a coach, and never scored.
//
// MIRROR-COACH P3 (2026-09-25). The Movement Screen carries three checks the camera cannot take (lib/mirror/screen.ts):
// the breath station (ribAngle, source 'selfReport') and, on the full screen, the pelvis and seated-rotation stations
// (pelvicTilt, thoracicRotation, source 'coach'). Until today the breath station had NO input at all: the runner held the
// athlete for eight seconds, said "take one easy breath in and out", and moved on — nothing asked what they felt, nothing
// stored it, and scoreScreen then listed the check as "not measured" on every screen, so no screen could ever read as
// complete (P1 made completeness need every slot of every check, a self-report slot included).
//
// WHAT THIS FILE DOES, and the lines it holds:
//   · THE QUESTIONS are the breath check's own flag line in screen.ts ("…neck-muscle breathing instead of the lower ribs
//     widening"), split into the two things a person can notice with their own hands, in plain words. FEL's wording;
//     no rib-angle numbers, no named breathing pattern, nothing a camera claims to have seen (the pose model has no rib
//     or abdomen landmark — the P1 critic's correction (a)/(b) — so this is the only honest way to ask).
//   · 'NOT SURE' IS AN ANSWER. A beginner asked whether their lower ribs widened often cannot tell, and a forced yes/no
//     would invent a finding either way.
//   · AN ANSWER IS KEPT AS GIVEN, NEVER GRADED. No answer becomes a CheckResult, a movement flag, a score, a triage or a
//     payout: lib/mirror/screen.ts resultsForScreen drops every non-camera check whatever source a client claims, and
//     the route pays on camera checks only. The coach reads the answers as answers ("they said: not sure").
//   · A COACH CHECK IS SAID TO BE THE COACH'S. The athlete sees "Your coach checks this", not a blank or a grade.
//
// Pure: no DOM, no fetch. The answer card is components/mirror/screen-self-report.tsx; the route that keeps the answers
// is app/api/mirror/screen/route.ts (PATCH).
import { screenFor, type ScreenCheck, type ScreenId } from './screen';

export type SelfReportAnswer = 'yes' | 'no' | 'notSure';
export const SELF_REPORT_ANSWERS: readonly SelfReportAnswer[] = ['yes', 'no', 'notSure'];
export const ANSWER_LABEL: Record<SelfReportAnswer, string> = { yes: 'Yes', no: 'No', notSure: 'Not sure' };

export interface SelfReportQuestion {
  /** Stable id: stored on the screen row, so it is never renamed. */
  id: string;
  /** The screen check this question belongs to (a check whose source is 'selfReport'). */
  checkId: string;
  /** Plain words, asked after the screen when the athlete is back at the phone. */
  text: string;
}

/**
 * The breath station's questions. The station cue (screen.ts, station 'breath') puts their hands on the sides of the
 * lower ribs and says the questions come at the end, so what they are asked about is what they just felt.
 */
export const SELF_REPORT_QUESTIONS: readonly SelfReportQuestion[] = [
  { id: 'lowerRibsWiden', checkId: 'ribAngle', text: 'When you breathed in, did your hands on your lower ribs move out to the sides?' },
  { id: 'neckShouldersLift', checkId: 'ribAngle', text: 'When you breathed in, did your shoulders or neck lift?' },
];

/**
 * Said beside the answers on the athlete's card: kept as given, never graded — and (MIRROR-COACH P3 review, 2026-09-26;
 * owner decision #4) not shown to their coach: a coach sees these only with the athlete's consent, which is phase 5's
 * step (lib/coach/mirrorToProgram.ts ANSWERS_WITHHELD). When phase 5 turns sharing on, this line says how to.
 */
export const SELF_REPORT_NOTE = 'Kept as you answered. Answers are not graded and never change your score or your shards. Your coach does not see them unless you choose to share them.';
/** Said beside every coach-only station. */
export const COACH_CHECK_LINE = 'Your coach checks this. Not graded, not scored.';

export interface SelfReportEntry {
  questionId: string;
  checkId: string;
  answer: SelfReportAnswer;
}

function checksOf(screen: ScreenId, source: ScreenCheck['source']): ScreenCheck[] {
  const seen = new Map<string, ScreenCheck>();
  for (const st of screenFor(screen)) for (const c of st.checks) if (c.source === source && !seen.has(c.id)) seen.set(c.id, c);
  return [...seen.values()];
}

/** The screen's self-report checks, in protocol order. */
export function selfReportChecksFor(screen: ScreenId): ScreenCheck[] { return checksOf(screen, 'selfReport'); }
/** The screen's coach-only checks, in protocol order: the athlete is told their coach checks these. */
export function coachChecksFor(screen: ScreenId): ScreenCheck[] { return checksOf(screen, 'coach'); }

/**
 * Said in place of the questions when the station they ask about was never HELD (MIRROR-COACH P3 follow-up review,
 * 2026-09-28): the screen was ended before it, or the runner ended it because the shot never came good — so its cue
 * ("Hands on the sides of your lower ribs…") was never said and there is no breath to ask about.
 */
export const SELF_REPORT_NOT_REACHED = 'Not asked: the screen ended before this station was held, so there is nothing to answer about.';

/**
 * Whether the screen HELD every station its self-report questions ask about — each has a record whose hold ran
 * (lib/mirror/screenRunner.ts StationRecord.held). Before End posted what was read so far (the P3 follow-up), a screen
 * reached this card only at its end, when the breath station had always run; End at station one or two asked about a
 * breath that never happened, and the answers were saved to the screen and shown to a coach who is shared them.
 */
export function selfReportReached(screen: ScreenId, stations: readonly { stationId: string; held: boolean }[]): boolean {
  const asking = screenFor(screen).filter((st) => st.checks.some((c) => c.source === 'selfReport')).map((st) => st.id);
  return asking.every((id) => stations.some((r) => r.stationId === id && r.held));
}

/** The questions this screen asks, in protocol order. */
export function selfReportQuestionsFor(screen: ScreenId): SelfReportQuestion[] {
  const ids = new Set(selfReportChecksFor(screen).map((c) => c.id));
  return SELF_REPORT_QUESTIONS.filter((q) => ids.has(q.checkId));
}

/**
 * Only answers this screen asked, each a real answer, one per question (the LAST one given wins — an athlete who taps
 * "Yes" and then "Not sure" meant "Not sure"). Junk is dropped, never thrown on. Returned in question order.
 */
export function selfReportAnswersFor(screen: ScreenId, raw: unknown): SelfReportEntry[] {
  if (!Array.isArray(raw)) return [];
  const asked = new Map(selfReportQuestionsFor(screen).map((q) => [q.id, q]));
  const byId = new Map<string, SelfReportEntry>();
  for (const a of raw.slice(0, 32)) {
    if (!a || typeof a !== 'object') continue;
    const { questionId, answer } = a as { questionId?: unknown; answer?: unknown };
    const q = typeof questionId === 'string' ? asked.get(questionId) : undefined;
    if (!q || !SELF_REPORT_ANSWERS.includes(answer as SelfReportAnswer)) continue;
    byId.set(q.id, { questionId: q.id, checkId: q.checkId, answer: answer as SelfReportAnswer });
  }
  return [...asked.keys()].filter((id) => byId.has(id)).map((id) => byId.get(id)!);
}

/** One answer as the athlete and the coach read it back: the question, then what they said. Never a verdict. */
export function answerLine(entry: SelfReportEntry): string {
  const q = SELF_REPORT_QUESTIONS.find((x) => x.id === entry.questionId);
  return `${q?.text ?? entry.questionId} You said: ${ANSWER_LABEL[entry.answer].toLowerCase()}.`;
}
