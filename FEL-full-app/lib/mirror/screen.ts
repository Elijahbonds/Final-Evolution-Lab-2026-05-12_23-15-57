// screen — the Mirror runs the athlete through a movement screen, scores it, and says what to do about it.
//
// THE SOURCE IS THE OWNER'S OWN BOOKS, not invented protocol: the Neuro-Mechanic Playbook's "5-Minute Movement Check"
// (Ch. 3) for the modified screen, and the Neuro-Mechanic Blueprint's Station 1–2 audit for the full one. The
// structure here follows them station for station, including the parts that make them work:
//
//   · DEFAULT POSTURE IS THE MEASUREMENT. The books' first instruction is not to tell the athlete to stand up
//     straight — the moment you cue "shoulders back", you are grading a performance instead of a default. So the
//     Mirror never cues posture during a station. It cues WHERE TO STAND and WHICH WAY TO FACE, and nothing else.
//   · ASYMMETRY BEATS SEVERITY. One side clearly off and one side fine is a bigger problem than both sides mildly
//     off; the scoring weights a one-sided finding above a bilateral one rather than averaging them away.
//   · ASSESS → CORRECT → LOAD → PERFORM. The screen is the Assess step and it hands off to the other three, which is
//     what makes the result a plan rather than a verdict.
//
// WHAT A CAMERA CANNOT DO, said out loud rather than faked. The Blueprint's full audit includes palpation — ASIS/PSIS
// tilt by hand, transverse rotation from above — and a phone cannot palpate. Its rib-angle check needs the
// infrasternal margins, which the pose model does not give. Those checks are carried here as SELF-REPORT or COACH
// stations, marked as such, and they never pretend to be measured. A screen that silently drops half its own protocol
// is worth less than one that tells you which half it ran.
//
// MIRROR-COACH P3 (2026-09-26): the six camera checks have graders now (lib/mirror/stationGraders.ts, each check's
// `grader`), fed by the runner from each station's good frames. Their `flag` lines and the MEANING lines below say what
// the CAMERA reads — a knee against its hip–ankle line, not a kneecap's direction; sway and touch-downs on one leg, not a
// pelvis dropping — and nothing about ribs, a pelvis's tilt or a cause the landmarks cannot show.
import type { GraderId } from './stationGraders';

export type ScreenId = 'modified' | 'full';
export type StationView = 'front' | 'side' | 'back';
/** How a finding arrives: the camera measured it, the athlete answered, or a coach in the room did. */
export type CheckSource = 'camera' | 'selfReport' | 'coach';
/** The books grade the wobble test in three words. Everything scored here uses the same three. */
export type Grade = 'stable' | 'borderline' | 'fail';

export interface ScreenCheck {
  id: string;
  /** What the athlete or coach is looking at, in the book's own language. */
  label: string;
  source: CheckSource;
  /** True when a one-sided result is the finding — these are weighted above bilateral ones. */
  sided: boolean;
  /**
   * The movement flag this check looks for, in plain words. Named `redFlag` until 2026-09-25 (MIRROR-COACH P1):
   * "red flag" is kept for clinical warning signs (the health intake, a later phase), and a kneecap pointing in is
   * not one of those. Static protocol data — never stored — so the rename breaks no saved row.
   */
  flag: string;
  /**
   * The grader that reads this check from the camera (lib/mirror/stationGraders.ts) — set on every 'camera' check and
   * on no other (MIRROR-COACH P3, 2026-09-26). Until today no camera check had one, so every screen was ungraded. A
   * self-report or coach check has none: the camera does not grade what it cannot see.
   */
  grader?: GraderId;
}

export interface ScreenStation {
  id: string;
  view: StationView;
  /** What the Mirror says to get them into position. Never a posture cue. */
  cue: string;
  /** Roughly how long the athlete stands there. */
  holdSec: number;
  checks: ScreenCheck[];
  /** The single-leg stations' leg (MIRROR-COACH P3): the side their singleLeg grade is kept under (checkSlots). */
  stance?: 'left' | 'right';
}

/** The turn cue, so the athlete is told which way to face rather than left to guess. */
export const TURN_CUE: Record<StationView, string> = {
  front: 'Face the camera.',
  side: 'Turn side-on — left shoulder to the camera.',
  back: 'Turn all the way around, back to the camera.',
};

const HEEL: ScreenCheck = {
  // MIRROR-COACH P3 review (2026-09-26): what two landmarks show from behind — the ankle→heel line. There is no Achilles
  // landmark (the label was "Heel line and Achilles") and the camera sees a line tilt, not a heel "roll inward" (the
  // flag was "One heel rolls inward while the other stays vertical.").
  id: 'heelLine', label: 'Heel line', source: 'camera', sided: true, grader: 'heelLine',
  flag: 'One heel line reads tilted from behind; the other does not.',
};
const KNEE: ScreenCheck = {
  id: 'kneeWindow', label: 'Knee window', source: 'camera', sided: true, grader: 'kneeWindow',
  // MIRROR-COACH P3 (2026-09-26): what the camera reads — the knee against its own hip–ankle line. It cannot see which
  // way a kneecap points (the line was "Kneecaps point inward, especially on the jumping leg.").
  flag: 'A knee sits inside the line from its hip to its ankle.',
};
const HIPS: ScreenCheck = {
  // the camera reads the hip landmarks (joint centres), left against right — not the hip points a hand finds (P3), so
  // the label is "Hip level" (P3 review, 2026-09-26: it was "Hip points level"; stored rows keep only the check id)
  id: 'hipLevel', label: 'Hip level', source: 'camera', sided: true, grader: 'hipLevel',
  flag: 'One hip sits noticeably higher than the other.',
};
const RIBS: ScreenCheck = {
  id: 'ribAngle', label: 'Rib angle and breath', source: 'selfReport', sided: false,
  flag: 'A wide flared rib V with neck-muscle breathing instead of the lower ribs widening.',
};
const HEAD: ScreenCheck = {
  id: 'headFloat', label: 'Head float', source: 'camera', sided: false, grader: 'headFloat',
  flag: 'The ear sits clearly forward of the shoulder.',
};
const WOBBLE: ScreenCheck = {
  id: 'singleLeg', label: 'Single-leg stance, 30 seconds a side', source: 'camera', sided: true, grader: 'singleLeg',
  // P3: what the grader reads (the free foot's touch-downs, the hips' sway). It was "…without the pelvis dropping or the
  // knee caving", neither of which it measures.
  flag: 'Cannot hold thirty seconds on one leg without the free foot coming down or the hips swaying clearly.',
};
const PELVIC_TILT: ScreenCheck = {
  id: 'pelvicTilt', label: 'Pelvic tilt (hands on the hip points)', source: 'coach', sided: false,
  flag: 'The front of the pelvis sits well below the back of it, or well above.',
};
const THORACIC: ScreenCheck = {
  id: 'thoracicRotation', label: 'Seated rotation, each side', source: 'coach', sided: true,
  flag: 'Clearly less rotation to one side than the other.',
};
const SHOULDER_LEVEL: ScreenCheck = {
  id: 'shoulderLevel', label: 'Shoulder height', source: 'camera', sided: true, grader: 'shoulderLevel',
  flag: 'One shoulder rides higher than the other in a default stance.',
};

/**
 * THE MODIFIED SCREEN — the Playbook's five checks plus the wobble test, in its own order: heels from behind, then
 * knees and hips from the front, then the head from the side, then thirty seconds a leg. Five minutes, no hands.
 */
export const MODIFIED_SCREEN: ScreenStation[] = [
  // P3 review (2026-09-26): "toes pointing straight ahead" — a foot turned in moves the heel point sideways from behind,
  // which read as a tilted heel line (stationGraders.ts heelLine.footTurnMaxDiff now reads it as 'feetTurned')
  { id: 'heels', view: 'back', cue: 'Turn all the way around, back to the camera. Feet about hip-width, toes pointing straight ahead. Look straight ahead.', holdSec: 12, checks: [HEEL] },
  { id: 'frontStack', view: 'front', cue: 'Turn and face the camera. Same stance — do not fix anything.', holdSec: 14, checks: [KNEE, HIPS, SHOULDER_LEVEL] },
  // MIRROR-COACH P3 (2026-09-25): the cue puts their hands where the questions will ask about (lib/mirror/selfReport.ts)
  // and says the questions come at the end — the athlete is across the room and cannot tap anything mid-screen. It
  // used to be "Take one easy breath in and out." and nothing ever asked what they felt.
  { id: 'breath', view: 'front', cue: 'Stay facing me. Hands on the sides of your lower ribs, and take one easy breath in and out. Two quick questions about it at the end.', holdSec: 8, checks: [RIBS] },
  { id: 'profile', view: 'side', cue: 'Turn side-on — left shoulder to the camera. Look straight ahead.', holdSec: 10, checks: [HEAD] },
  { id: 'wobbleL', view: 'front', cue: 'Face me. Stand on your LEFT leg, other knee up to hip height, arms by your sides.', holdSec: 30, checks: [WOBBLE], stance: 'left' },
  { id: 'wobbleR', view: 'front', cue: 'Now the RIGHT leg. Same thing — thirty seconds.', holdSec: 30, checks: [WOBBLE], stance: 'right' },
];

/**
 * THE FULL SCREEN — the Blueprint's audit, with the hands-on stations carried as coach checks because a phone cannot
 * palpate. Longer, and it says which parts it measured and which parts somebody had to answer.
 */
export const FULL_SCREEN: ScreenStation[] = [
  ...MODIFIED_SCREEN.slice(0, 4),
  { id: 'pelvis', view: 'side', cue: 'Stay side-on. If a coach is with you, they can check the pelvis now.', holdSec: 12, checks: [PELVIC_TILT] },
  { id: 'rotation', view: 'front', cue: 'Sit tall and rotate to each side as far as is comfortable.', holdSec: 20, checks: [THORACIC] },
  ...MODIFIED_SCREEN.slice(4),
];

export function screenFor(id: ScreenId): ScreenStation[] {
  return id === 'full' ? FULL_SCREEN : MODIFIED_SCREEN;
}

/** The one FIX line for a flagged check — what the result card shows under a flag (MIRROR-COACH P3). */
export function fixLine(checkId: string): string | null {
  return FIX[checkId] ?? null;
}

// ── SCORING ─────────────────────────────────────────────────────────────────

/**
 * The WorkoutScan `kind` a completed Mirror screen is stored under.
 *
 * Its own kind, not the older `movement_screen`: that one holds the v1 workout scan's derived metrics, which is a
 * different measurement with a different shape, and mixing them would make both histories lie.
 */
export const MIRROR_SCREEN_KIND = 'mirror_screen';

export interface CheckResult {
  checkId: string;
  grade: Grade;
  /** Set when the finding is one-sided — the books' headline finding. */
  side?: 'left' | 'right';
  /** What was measured or answered, for the report. */
  detail?: string;
  source: CheckSource;
}

export interface ScreenResultSummary {
  screen: ScreenId;
  /**
   * False when no station came back with a result — nothing was graded, so there is no score, no flag count that
   * means anything, and no triage. MIRROR-COACH P1 (2026-09-25): until then an empty screen scored 100 with 0 flags,
   * because 100 is what "nothing deducted" looks like; see scoreScreen.
   */
  graded: boolean;
  /** How many checks came back failing — the movement flags. The UI's "Movement flags". */
  movementFlags: number;
  /**
   * @deprecated The same number as movementFlags, under its old name. Kept so rows stored before 2026-09-25 and
   * anything that reads them still work; new code reads movementFlagsOf(summary). Not a clinical red flag.
   */
  redFlags: number;
  /** Movement flags that are ONE-SIDED. The books rank these above bilateral findings. */
  asymmetries: number;
  /**
   * 0–100, for the app's own grade bands, scored down hardest by one-sided fails. NULL when nothing was graded.
   *
   * OWNER DECISION #31 (2026-09-26; built in the MIRROR-COACH P3 follow-up, 2026-09-28) — SCORE ON WHAT WAS READ. P1 made
   * a PARTLY graded screen's score null too, because a bare number over the checks that happened to come back read as a
   * score for the screen (one stable check out of eight scored 100). On real phones some check will often be "not read",
   * so "Score —" sat beside "Shards are in your wallet" (the P3 live proof, row 6). The score is now computed over the
   * camera checks that WERE read — an unread check neither costs nor earns — and is never shown without what it is over
   * (readCount of totalCount, scoreLine: "Score 78 · from 5 of 6 checks read"), with the unread ones listed (notRead).
   * The triage, the headline and the payout are unchanged: a partial screen is still 'partial', never "clear".
   */
  score: number | null;
  /**
   * How many DIFFERENT camera checks came back read (a pass or a flag; the single-leg stance read on either leg is one) —
   * THE SAME NUMBER as the server's `readableCameraChecks` and the payout's count, from one function (cameraChecksRead).
   * MIRROR-COACH P3 follow-up (2026-09-28): the panel said "Checks 6" (results, each leg counted) beside the server's 5.
   * Optional only so rows stored before today still type-check; scoreScreen always sets it (readStoredScreen re-scores).
   */
  readCount?: number;
  /** How many camera checks the screen has (6 on either variant — the full screen's extra stations are the coach's). */
  totalCount?: number;
  /**
   * The camera checks that were NOT read, by label — and for the single-leg stance read on one leg only, the leg that was
   * not ("Single-leg stance, 30 seconds a side (right leg)"), so "6 of 6 checks read" never hides a missing leg. What the
   * panel lists as 'not read' (notReadLines). notMeasured keeps its P1 meaning (a check with any slot missing).
   */
  notRead?: string[];
  /**
   * Legs NOT read of a two-sided check that WAS read on its other leg (the single-leg stance: at most 1). readCount counts
   * that check as read (the server's count, the payout's), so the count says the missing leg beside it (readPhrase):
   * "Score 100 · from 6 of 6 checks read, one leg not read". MIRROR-COACH P3 follow-up review (2026-09-28): "from 6 of 6
   * checks read" hid it. Set only when not 0, so a screen with both legs (or neither) stores what it did before.
   */
  legsNotRead?: number;
  /**
   * 'partial' (MIRROR-COACH P1, 2026-09-25): some checks graded, none flagged, and the rest not measured — so NOT the
   * books' 'proceed'. A partial screen that DID flag something is triaged by its flags like any other: a fail the
   * camera measured is real whatever else was missed.
   */
  triage: 'proceed' | 'addressFirst' | 'seeSpecialist' | 'partial' | 'notGraded';
  headline: string;
  /** What it means, in movement language. */
  meaning: string[];
  /** What to do now — the Correct step. */
  suggestions: string[];
  /** What to do with training while that happens — the Load step. */
  programming: string[];
  /**
   * Every CAMERA check the screen expects that came back without a result, named rather than hidden.
   * MIRROR-COACH P1 (2026-09-25): on a graded screen this listed only the missing self-report and coach checks, so a
   * screen with one camera result silently dropped the other five camera checks and read as complete.
   * MIRROR-COACH P3 (2026-09-25): camera checks only — the self-report and coach checks are never measured by anybody's
   * camera and are never scored, so they are named in `notScored` instead of sitting here forever.
   */
  notMeasured: string[];
  /**
   * The checks this screen carries that are NEVER scored — the athlete's own answers and the coach's hands-on checks —
   * named so a reader knows the screen has them (MIRROR-COACH P3, 2026-09-25). Optional only so rows stored before
   * today still type-check; scoreScreen always sets it.
   */
  notScored?: string[];
  /** Every CAMERA check's every slot came back (a two-sided check needs both sides: see cameraSlots). */
  ranAll: boolean;
}

/** The books' triage, unchanged: none, a couple, or three and up. (Of a COMPLETE screen — see scoreScreen for the rest.) */
export function triageFor(movementFlags: number): Exclude<ScreenResultSummary['triage'], 'notGraded' | 'partial'> {
  if (movementFlags >= 3) return 'seeSpecialist';
  if (movementFlags >= 1) return 'addressFirst';
  return 'proceed';
}

/**
 * What an ungraded screen says, everywhere it is said: the Mirror's panel, the spoken line, the reward message.
 * MIRROR-COACH P1 (2026-09-25). No production code calls ScreenRunner.record yet (the graders are phase 3), so every
 * screen finished with zero results — and was shown as Score 100 beside Checks 0, stored as a clean screen, and
 * answered with "Not enough of that was in frame to grade … Step back and run it again", which sent the athlete round
 * a retry that could never succeed and blamed their framing for a grader that does not exist.
 */
export const NOT_GRADED_LINE = "Not graded yet: the camera can't score this screen.";

/**
 * What a screen says when the camera TRIED and read none of its checks (MIRROR-COACH P3 review, 2026-09-26). The graders
 * exist since P3, so NOT_GRADED_LINE's "not graded yet" — a promise of a grader to come — is untrue for such a screen; it
 * is kept for the screens with no grades at all (a pre-P3 client, an empty post, every row stored before 2026-09-26).
 */
export const NOT_READ_LINE = "The camera could not read this screen's checks — each station says why.";

/**
 * What a side MEANS for each check (MIRROR-COACH P3 review, 2026-09-26; moved here from screenCorrectives.ts so the
 * headline says it too): the level checks flag the side that reads HIGHER; the knee and heel checks the knee or heel that
 * read off; the single-leg stance the leg stood on. "Hip level … on the left side" beside a FIX line about "the low side"
 * sent a reader to work the higher hip.
 */
const SIDE_WORDS: Record<string, (side: 'left' | 'right') => string> = {
  hipLevel: (s) => `${s} hip higher`,
  shoulderLevel: (s) => `${s} shoulder higher`,
  kneeWindow: (s) => `${s} knee`,
  heelLine: (s) => `${s} heel`,
  singleLeg: (s) => `${s} leg`,
};
export function sideWords(checkId: string, side: 'left' | 'right'): string {
  return (SIDE_WORDS[checkId] ?? ((x: 'left' | 'right') => `${x} side`))(side);
}
/** The level checks: their side is which one reads HIGHER — a difference between two sides, not one side off. */
const LEVEL_CHECKS = new Set(['hipLevel', 'shoulderLevel']);

/** A screen is graded when at least one station came back with a result. Graded is not complete: see isCompleteScreen. */
export function isGraded(results: readonly unknown[]): boolean {
  return results.length > 0;
}

/**
 * How many results each check can carry in this screen: one per station that asks it. The single-leg stance is asked
 * at two stations (wobbleL, wobbleR), so it takes two — one per leg — and every other check takes one. Two results of
 * one check are told apart by `side` (resultsForScreen keeps one per check per side), so a grader for the single-leg
 * stations (phase 3) records the leg it tested as the result's side.
 */
export function checkSlots(screen: ScreenId): Map<string, number> {
  const slots = new Map<string, number>();
  for (const st of screenFor(screen)) for (const c of st.checks) slots.set(c.id, (slots.get(c.id) ?? 0) + 1);
  return slots;
}

/**
 * The only source that is ever scored (MIRROR-COACH P3, 2026-09-25). A camera check is the one kind the server can
 * re-check from the grader's summary (lib/mirror/screenClaims.ts regrades it against lib/mirror/stationGraders.ts); a
 * self-report answer or a coach's hands-on check arrives from the athlete's own device as a bare claim, and scoring or
 * paying on one would let anybody type their way to a clean screen.
 */
export const SCORED_SOURCE: CheckSource = 'camera';

/** The protocol's source for a check id in this screen, or null when the screen has no such check. */
export function protocolSourceOf(screen: ScreenId, checkId: string): CheckSource | null {
  for (const st of screenFor(screen)) for (const c of st.checks) if (c.id === checkId) return c.source;
  return null;
}

/** checkSlots, camera checks only: what a complete — scoreable — screen needs (MIRROR-COACH P3, 2026-09-25). */
export function cameraSlots(screen: ScreenId): Map<string, number> {
  return new Map([...checkSlots(screen)].filter(([id]) => protocolSourceOf(screen, id) === SCORED_SOURCE));
}

/**
 * Every slot of every CAMERA check has a result: the only screen that can read as clear.
 * MIRROR-COACH P3 (2026-09-25): camera checks only. With the self-report slot in the count (P1) no screen could ever
 * be complete — nothing is allowed to turn an answer into a result — so no screen would ever have a score.
 */
export function isCompleteScreen(screen: ScreenId, results: readonly CheckResult[]): boolean {
  const kept = resultsForScreen(screen, results);
  return [...cameraSlots(screen)].every(([id, n]) => kept.filter((r) => r.checkId === id).length >= n);
}

/** How many DIFFERENT checks came back — what the reward counts, so three copies of one check are one check. */
export function distinctChecks(results: readonly Pick<CheckResult, 'checkId'>[]): number {
  return new Set(results.map((r) => r.checkId)).size;
}

/**
 * THE ONE COUNT OF CHECKS READ (MIRROR-COACH P3 follow-up, 2026-09-28), shared by the athlete's panel, the stored
 * summary, the coach's draft, the server's `readableCameraChecks` and the payout bar (screenClaims.ts screenCoverage):
 * the DIFFERENT camera checks among the results this screen keeps (resultsForScreen — a pass or a flag; an unreadable
 * check is no result), out of the screen's camera checks. The single-leg stance read on either leg is one check read.
 * The panel counted results ("Checks 6": both legs) while the server said 5; a client and a server that count one thing
 * two ways will disagree on a real phone in front of the athlete.
 */
export function cameraChecksRead(screen: ScreenId, results: readonly unknown[]): { readCount: number; totalCount: number } {
  return { readCount: distinctChecks(resultsForScreen(screen, results)), totalCount: cameraSlots(screen).size };
}

/**
 * What a score is over, in words: "5 of 6 checks read" — and a leg read of a two-sided check whose other leg was not,
 * said beside it ("6 of 6 checks read, one leg not read"; MIRROR-COACH P3 follow-up review, 2026-09-28). The one wording
 * scoreLine and the partial headline share. Null without the counts.
 */
export function readPhrase(s: { readCount?: number; totalCount?: number; legsNotRead?: number }, noun = 'checks'): string | null {
  if (typeof s.readCount !== 'number' || typeof s.totalCount !== 'number') return null;
  const legs = typeof s.legsNotRead === 'number' && s.legsNotRead > 0 ? `, ${s.legsNotRead === 1 ? 'one leg' : `${s.legsNotRead} legs`} not read` : '';
  return `${s.readCount} of ${s.totalCount} ${noun} read${legs}`;
}

/**
 * THE SCORE, ALWAYS SAID WITH WHAT IT IS OVER (owner decision #31): "Score 78 · from 5 of 6 checks read". Null when there
 * is no score (nothing read — the not-graded / not-read line says so instead). A summary stored without the counts (a
 * server older than the counts) gets the bare number.
 */
export function scoreLine(s: { score?: number | null; readCount?: number; totalCount?: number; legsNotRead?: number }): string | null {
  if (typeof s.score !== 'number') return null;
  const over = readPhrase(s);
  return over ? `Score ${s.score} · from ${over}` : `Score ${s.score}`;
}

/** The unread camera checks as the panel lists them: "Head float · not read" (owner decision #31). */
export function notReadLines(s: Pick<ScreenResultSummary, 'notRead'>): string[] {
  return (s.notRead ?? []).map((label) => `${label} · not read`);
}

/**
 * The movement-flag count from a summary of any age: the new key, or the old `redFlags` on a row stored before
 * 2026-09-25. 0 for anything unreadable.
 */
export function movementFlagsOf(summary: unknown): number {
  if (!summary || typeof summary !== 'object') return 0;
  const s = summary as { movementFlags?: unknown; redFlags?: unknown };
  const n = typeof s.movementFlags === 'number' ? s.movementFlags : typeof s.redFlags === 'number' ? s.redFlags : 0;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

const GRADES: readonly Grade[] = ['stable', 'borderline', 'fail'];
const GRADE_RANK: Record<Grade, number> = { stable: 0, borderline: 1, fail: 2 };

/**
 * Only the results that belong to the screen that ran, each one well-formed, and no check counted twice.
 *
 * MIRROR-COACH P1 (2026-09-25). What this stops, and what it does not:
 *   · A result for a check the claimed variant does not have is dropped: a MODIFIED claim carrying a full-only check
 *     (pelvicTilt, thoracicRotation) cannot score, pay or be stored with it. It cannot catch the other direction: every
 *     modified check is also a full check (FULL_SCREEN is MODIFIED_SCREEN plus two stations), so a 'full' claim over
 *     the modified stations passes this filter. That bug — the harness built every runner 'modified' and posted the
 *     picker's 'full' — is fixed by the harness posting runner.screen (mirror-harness.tsx submitScreen), and a 'full'
 *     claim with none of its own stations is caught by screenVariantFor below.
 *   · A result whose grade is not one of the three grades, whose source is not a source, or whose side is not a side
 *     is dropped. Measured before this: three copies of {hipLevel, grade:'x'} scored graded, 100, "Nothing flagged",
 *     and paid (checksTaken counted the raw array).
 *   · One result per check per side, the WORST grade kept (a later 'stable' cannot launder an earlier 'fail'), and no
 *     more per check than the screen has stations asking it (checkSlots).
 * It does NOT make a client's grade true: the server cannot check a grade until phase 3's graders exist.
 *
 * MIRROR-COACH P3 (2026-09-25): CAMERA CHECKS ONLY, whatever source the result claims. A self-report answer or a coach
 * check sent as a result ({ribAngle, fail, source:'camera'}, or {pelvicTilt, stable, source:'coach'}) used to be kept,
 * scored, counted toward the reward and stored as a finding; nothing a client declares about a check the camera cannot
 * see is a result now (answers ride separately, lib/mirror/selfReport.ts, and are never scored). And the grade a client
 * posts is no longer what the route keeps either: the route builds these results from the grader summaries it
 * re-checks itself (lib/mirror/screenClaims.ts); this filter is the last line for every other reader (stored rows,
 * the coach's route, the export).
 */
export function resultsForScreen(screen: ScreenId, results: readonly unknown[]): CheckResult[] {
  const slots = cameraSlots(screen);
  const byKey = new Map<string, CheckResult>();
  for (const raw of results) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Partial<Record<keyof CheckResult, unknown>>;
    if (typeof r.checkId !== 'string' || !slots.has(r.checkId)) continue;
    if (!GRADES.includes(r.grade as Grade) || r.source !== SCORED_SOURCE) continue;
    if (r.side !== undefined && r.side !== null && r.side !== 'left' && r.side !== 'right') continue;
    const clean: CheckResult = { checkId: r.checkId, grade: r.grade as Grade, source: r.source as CheckSource };
    if (r.side === 'left' || r.side === 'right') clean.side = r.side;
    if (typeof r.detail === 'string' && r.detail) clean.detail = r.detail.slice(0, 200);
    const key = `${clean.checkId}|${clean.side ?? ''}`;
    const prev = byKey.get(key);
    if (!prev || GRADE_RANK[clean.grade] >= GRADE_RANK[prev.grade]) byKey.set(key, clean);
  }
  const kept = [...byKey.values()];
  // protocol order, the worst first within a check, and never more than the screen asks for
  return [...slots].flatMap(([id, n]) => kept.filter((r) => r.checkId === id)
    .sort((a, b) => GRADE_RANK[b.grade] - GRADE_RANK[a.grade]).slice(0, n));
}

/**
 * The variant a stored screen can honestly carry. A 'full' claim whose results include none of the full screen's own
 * stations (pelvicTilt, thoracicRotation) is indistinguishable from the modified screen, so it is stored as 'modified'
 * rather than as a full screen nobody ran (MIRROR-COACH P1, 2026-09-25: see resultsForScreen for why the filter alone
 * cannot see this). A claim with no results keeps its label; nothing was graded on either variant.
 *
 * MIRROR-COACH P3 (2026-09-25): THE CLAIM STANDS NOW, because it can no longer buy anything. P1's rule existed because
 * the full screen had more slots than the modified one, so the label changed the score and the triage; a 'full' label
 * over modified results read "partial" where the same results read "clear". Only camera checks are scored since P3, and
 * both variants have exactly the same camera checks (the full screen's extra stations are coach checks), so the two
 * score identically and the label only decides which coach checks the athlete and coach are told about. Under P1's
 * rule every real full screen would have been stored as 'modified' — no result can carry a coach check any more — and
 * the P1 picker fix (the harness posts the variant its runner walked) would have been undone at the store.
 */
export function screenVariantFor(claimed: ScreenId, results: readonly CheckResult[]): ScreenId {
  void results;
  return claimed === 'full' ? 'full' : 'modified';
}

// MIRROR-COACH P3 (2026-09-26): the camera checks' lines say what was SEEN and why it matters to how you move — they
// used to name causes the landmarks cannot show ("the rib cage is sitting rotated", "the hip cannot hold the pelvis
// level") and one read as a risk ("where landing forces go wrong"). A graded screen shows them for the first time.
const MEANING: Record<string, string> = {
  heelLine: 'From behind, one heel line tilts and the other does not, so the two feet are not giving the legs the same base.',
  kneeWindow: 'Standing relaxed, a knee sits inside the line from hip to ankle — worth watching when you squat, land and cut.',
  hipLevel: 'Standing relaxed, one hip reads higher than the other, so the two sides start from a tilt.',
  shoulderLevel: 'Standing relaxed, one shoulder rides higher than the other.',
  ribAngle: 'The cylinder is leaking pressure — breathing is happening at the neck instead of the lower ribs.',
  headFloat: 'From the side, the ear sits ahead of the shoulder, so the head is carried forward of the trunk.',
  singleLeg: 'Thirty seconds on one leg was hard to hold still on this side, and one leg is where every stride and landing happens.',
  pelvicTilt: 'The pelvis is parked at one end of its range rather than sitting in the middle of it.',
  thoracicRotation: 'Rotation is not shared evenly between the two sides.',
};

const FIX: Record<string, string> = {
  heelLine: 'Foot tripod work before anything loaded — short-foot holds, then slow calf raises with the heel tracking straight.',
  // MIRROR-COACH P9 fix (2026-09-30): it said "…and glute-medius work" — a muscle by name, which FEL's cue policy
  // (lib/coach/cueLint.ts rule 1) does not use; the same hip work, named by what it is
  kneeWindow: 'Hip external-rotation work and banded side steps, then slow tempo squats watching the knee track over the second toe.',
  // P3 review (2026-09-26): capacity to build, not a restriction — the line said "stop loading the tilt with heavy
  // bilateral lifts for now", reachable from one estimated 2-D camera read
  hipLevel: 'Single-leg hip work on the low side, to build that side up alongside your normal lifting.',
  // P3: the camera saw a height difference, not a restriction — the line no longer names a "restricted side"
  shoulderLevel: 'Breathing work first, then easy rotation drills to both sides.',
  ribAngle: 'Exhale-biased breathing — long exhales, ribs down — before any heavy axial loading.',
  headFloat: 'Chin nods and thoracic extension over a roller, and raise the screen you are looking at all day.',
  singleLeg: 'Thirty-second stance holds daily, then step-downs, before plyometrics go back in.',
  pelvicTilt: 'Position work at both ends of the pelvis range so it can sit in the middle.',
  thoracicRotation: 'Rotation work to the restricted side, held, not bounced.',
};

/**
 * Score a screen the way the books read one: count the movement flags, weight the one-sided ones, and turn the count
 * into a decision rather than a number. The triage bands, the language and the ordering are the Playbook's. A screen
 * with no results is NOT scored (graded: false, score: null) — see NOT_GRADED_LINE.
 *
 * MIRROR-COACH P1 (2026-09-25): and a screen with SOME results is not scored either. Before this, isGraded's "at least
 * one result" was the only bar, so scoreScreen('modified', [{heelLine, stable}]) returned score 100, "Nothing
 * flagged. That is a platform you can load." and "Train normally.", with the five unmeasured camera checks left off
 * notMeasured — and the coach's panel read it as "came back clear". Now "clear" (triage 'proceed', the clean-bill
 * headline, "Train normally") needs every slot of every check (isCompleteScreen). A partial screen with no flags is
 * triaged 'partial' and says it is not a clear screen; with flags it is triaged by them. (Its score: owner decision #31
 * below — P1 gave it none; since 2026-09-28 it is scored over what was read and always said with the count.)
 * The results are filtered through resultsForScreen here too, so no caller can score what the route would not keep.
 *
 * MIRROR-COACH P3 (2026-09-25): scored over the CAMERA checks only (cameraSlots). The breath answers and the coach's
 * checks are named in `notScored` and never reach the score, the flag count, the triage or the reward — the same
 * results give the same summary whatever the athlete answered.
 */
export function scoreScreen(screen: ScreenId, rawResults: readonly CheckResult[], opts: { attempted?: boolean } = {}): ScreenResultSummary {
  const stations = screenFor(screen);
  const slots = cameraSlots(screen);
  const byId = new Map(stations.flatMap((s) => s.checks).map((c) => [c.id, c]));
  const results = resultsForScreen(screen, rawResults);
  const missing = [...slots].filter(([id, n]) => results.filter((r) => r.checkId === id).length < n).map(([id]) => id);
  const notMeasured = missing.map((id) => byId.get(id)!.label);
  const notScored = [...checkSlots(screen).keys()].filter((id) => !slots.has(id)).map((id) => byId.get(id)!.label);
  // the one count (cameraChecksRead), and what was not read — a two-sided check read on one leg names the leg it missed
  const { readCount, totalCount } = cameraChecksRead(screen, results);
  // a two-sided check read on some of its legs: the legs NOT read, per check (the single-leg stance: its one missing leg)
  const legsMissing = new Map<string, ('left' | 'right')[]>();
  const notRead = missing.flatMap((id) => {
    const label = byId.get(id)!.label;
    const got = results.filter((r) => r.checkId === id);
    if (!got.length) return [label];
    const legs = stations.filter((st) => st.stance && st.checks.some((c) => c.id === id)).map((st) => st.stance!);
    const gone = legs.filter((leg) => !got.some((r) => r.side === leg));
    if (gone.length) legsMissing.set(id, gone);
    return gone.length ? gone.map((leg) => `${label} (${leg} leg)`) : [label];
  });
  const legsNotRead = [...legsMissing.values()].reduce((a, g) => a + g.length, 0);
  const legsField = legsNotRead > 0 ? { legsNotRead } : {};

  // NOTHING GRADED IS NOT A CLEAN SCREEN. With no results the arithmetic below says 100, "Nothing flagged. That is a
  // platform you can load." and "Train normally" — three claims about a body nobody measured. It says so instead: that
  // the camera tried and read nothing (NOT_READ_LINE, P3 review), or that nothing was graded at all (NOT_GRADED_LINE).
  // Owner decision #31 leaves this case alone: no check read, no score.
  if (!isGraded(results)) {
    return {
      screen, graded: false, movementFlags: 0, redFlags: 0, asymmetries: 0, score: null, triage: 'notGraded',
      headline: opts.attempted ? NOT_READ_LINE : NOT_GRADED_LINE, meaning: [], suggestions: [], programming: [], notMeasured, notScored, ranAll: false,
      readCount, totalCount, notRead, ...legsField,
    };
  }

  const fails = results.filter((r) => r.grade === 'fail');
  const borderline = results.filter((r) => r.grade === 'borderline');
  // ONE FINDING PER CHECK THAT FAILED ON EVERY SLOT (MIRROR-COACH P3 review, 2026-09-26). The single-leg stance has two
  // slots, one per leg, and each result carries its leg — so both legs flagged were two ONE-SIDED findings: asymmetries
  // 2, a 22-point penalty each, and the headline "…on the left side. One side off and one side fine matters more…" when
  // neither side was fine; one more flag anywhere then triaged it seeSpecialist, one bilateral finding counted twice. A
  // check that failed on every slot it has is now ONE bilateral finding (no side, 15 points); one leg of two is one
  // one-sided finding.
  // …ONLY WHEN THE OTHER LEG WAS READ (MIRROR-COACH P3 follow-up review, 2026-09-28). Scored over what was read (owner
  // decision #31), one leg flagged with the other NOT READ was one-sided — asymmetries 1, the 22-point penalty and "One
  // side off and one side fine" — so the unread leg scored exactly what a pass scores (78, the same as the other leg read
  // clean) and reading it as a flag RAISED the score (85). An unread leg is not a fine one: the leg that was read and
  // flagged is a finding that names its leg (`otherLegUnread`), costs what a finding with no side costs (15), is not an
  // asymmetry, and says the other leg was not read.
  const findings: { checkId: string; side?: 'left' | 'right'; otherLegUnread?: boolean }[] = [];
  for (const [id, n] of slots) {
    const f = fails.filter((r) => r.checkId === id);
    if (!f.length) continue;
    const unreadLeg = n > 1 && legsMissing.has(id);
    if (n > 1 && f.length >= n) findings.push({ checkId: id });
    else for (const r of f) findings.push({ checkId: id, ...(r.side ? { side: r.side } : {}), ...(unreadLeg && r.side ? { otherLegUnread: true } : {}) });
  }
  const oneSided = (r: { side?: 'left' | 'right'; otherLegUnread?: boolean }) => !!r.side && !r.otherLegUnread;
  const movementFlags = findings.length;
  const asymmetries = findings.filter(oneSided).length;
  const ranAll = missing.length === 0;

  // 0–100: every finding costs, a one-sided one costs more (the books' rule), borderline costs a little. OWNER DECISION
  // #31 (MIRROR-COACH P3 follow-up, 2026-09-28): over the checks that WERE read — a check not read neither costs nor earns,
  // and the score is always shown with what it is over (scoreLine). It was null unless every camera check came back.
  const penalty = findings.reduce((a, r) => a + (oneSided(r) ? 22 : 15), 0) + borderline.length * 6;
  const score = Math.max(0, Math.min(100, 100 - penalty));

  const flagged = [...fails, ...borderline];
  const meaning = [...new Set(flagged.map((r) => MEANING[r.checkId]).filter(Boolean))];
  const suggestions = [...new Set(fails.map((r) => FIX[r.checkId]).filter(Boolean))];

  const triage: ScreenResultSummary['triage'] = !ranAll && movementFlags === 0 ? 'partial' : triageFor(movementFlags);
  const programming = triage === 'seeSpecialist'
    // P3 review (2026-09-26): reachable from camera flags alone now, so it says what to BUILD and who to show, not what
    // to stop ("Hold off on heavy load and high-volume jumping until this is looked at in person" read as a risk)
    ? ['Keep practising skills at controlled intensity.',
       'Build the corrective work above into every session, and have a coach look at these flags in person.',
       'This is not medical clearance — pain, swelling, numbness or a pop belongs with a physician.']
    : triage === 'addressFirst'
      ? ['Keep training.', 'Do the corrective work above before you add intensity, not instead of training.',
         'Re-run this screen in two weeks and compare the sides.']
      : triage === 'partial'
        ? []
        // 'an ankle injury', not 'an ankle sprain': the screen names no condition (lib/share/screen.ts)
        : ['Train normally.', 'Re-run this screen monthly, or after an ankle injury, a growth spurt, or a jump in workload.'];

  const worstSided = findings.find(oneSided);
  const unpairedLeg = findings.find((r) => r.otherLegUnread);
  const label = (id: string) => byId.get(id)?.label ?? 'A check';
  // MIRROR-COACH P3 (2026-09-25): "was flagged for a closer look on the left side", not "failed on the left side" — a
  // grade is what the camera saw, and the phase-3 grading contract words a flag that way; "failed" read as a verdict on
  // the athlete. The partial count is over the camera checks (P1 said 8 with the breath slot; P3 7 slots; since the P3
  // follow-up, 2026-09-28, the 6 checks, the one count everything shares — cameraChecksRead).
  // P3 review (2026-09-26): the side is said as what it MEANS (sideWords): a level check names the side that read higher
  // and is a difference between two sides, so it does not get the "one side off and one side fine" line.
  const sidedLine = (f: { checkId: string; side?: 'left' | 'right' }) => LEVEL_CHECKS.has(f.checkId)
    ? `${label(f.checkId)} was flagged for a closer look: the ${sideWords(f.checkId, f.side!).replace(/ higher$/, '')} read higher.`
    : `${label(f.checkId)} was flagged for a closer look on the ${sideWords(f.checkId, f.side!)}. One side off and one side fine matters more than both being mildly off.`;
  // MIRROR-COACH P3 follow-up (2026-09-28): the partial line counts checks the way the panel and the server do
  // (cameraChecksRead — "1 of 6", not "1 of 7" slots beside a "1 of 6" figure) and names what was not read — and, since
  // its review, says a missing leg beside the count (readPhrase: "6 of 6 camera checks read, one leg not read")
  const counted = `${readPhrase({ readCount, totalCount, legsNotRead }, 'camera checks')}${legsNotRead > 0 ? ',' : ''}`;
  const otherLeg = (side: 'left' | 'right') => (side === 'left' ? 'right' : 'left');
  const headline = triage === 'partial'
    ? `Partly graded: ${counted} and none flagged; not read: ${notRead.join(', ')} — so this is not a clear screen.`
    : movementFlags === 0
      ? 'Nothing flagged. That is a platform you can load.'
      : worstSided
        ? sidedLine(worstSided)
        : movementFlags === 1 && unpairedLeg
          // one leg read and flagged, the other not read: named, and not "one side off and one side fine"
          ? `${label(unpairedLeg.checkId)} was flagged for a closer look on the ${sideWords(unpairedLeg.checkId, unpairedLeg.side!)}; the ${otherLeg(unpairedLeg.side!)} leg was not read.`
          : `${movementFlags} flag${movementFlags > 1 ? 's' : ''} worth clearing before you add intensity.`;

  return {
    screen, graded: true, movementFlags, redFlags: movementFlags, asymmetries, score, triage, headline, meaning,
    suggestions, programming, notMeasured, notScored, ranAll, readCount, totalCount, notRead, ...legsField,
  };
}

/** The line that rides every screen result. It is not medical clearance and the books say so first. */
export const SCREEN_DISCLAIMER =
  'A movement screen from a single camera, scored on what was visible. It is not medical clearance. Chest pain, acute '
  + 'swelling, numbness, or anything that sounded like a pop belongs with a physician, not an app.';
