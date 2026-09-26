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
}

export interface ScreenStation {
  id: string;
  view: StationView;
  /** What the Mirror says to get them into position. Never a posture cue. */
  cue: string;
  /** Roughly how long the athlete stands there. */
  holdSec: number;
  checks: ScreenCheck[];
}

/** The turn cue, so the athlete is told which way to face rather than left to guess. */
export const TURN_CUE: Record<StationView, string> = {
  front: 'Face the camera.',
  side: 'Turn side-on — left shoulder to the camera.',
  back: 'Turn all the way around, back to the camera.',
};

const HEEL: ScreenCheck = {
  id: 'heelLine', label: 'Heel line and Achilles', source: 'camera', sided: true,
  flag: 'One heel rolls inward while the other stays vertical.',
};
const KNEE: ScreenCheck = {
  id: 'kneeWindow', label: 'Knee window', source: 'camera', sided: true,
  flag: 'Kneecaps point inward, especially on the jumping leg.',
};
const HIPS: ScreenCheck = {
  id: 'hipLevel', label: 'Hip points level', source: 'camera', sided: true,
  flag: 'One hip point sits noticeably higher than the other.',
};
const RIBS: ScreenCheck = {
  id: 'ribAngle', label: 'Rib angle and breath', source: 'selfReport', sided: false,
  flag: 'A wide flared rib V with neck-muscle breathing instead of the lower ribs widening.',
};
const HEAD: ScreenCheck = {
  id: 'headFloat', label: 'Head float', source: 'camera', sided: false,
  flag: 'The ear sits clearly forward of the shoulder.',
};
const WOBBLE: ScreenCheck = {
  id: 'singleLeg', label: 'Single-leg stance, 30 seconds a side', source: 'camera', sided: true,
  flag: 'Cannot hold thirty seconds without the pelvis dropping or the knee caving.',
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
  id: 'shoulderLevel', label: 'Shoulder height', source: 'camera', sided: true,
  flag: 'One shoulder rides higher than the other in a default stance.',
};

/**
 * THE MODIFIED SCREEN — the Playbook's five checks plus the wobble test, in its own order: heels from behind, then
 * knees and hips from the front, then the head from the side, then thirty seconds a leg. Five minutes, no hands.
 */
export const MODIFIED_SCREEN: ScreenStation[] = [
  { id: 'heels', view: 'back', cue: 'Turn all the way around, back to the camera. Feet about hip-width. Look straight ahead.', holdSec: 12, checks: [HEEL] },
  { id: 'frontStack', view: 'front', cue: 'Turn and face the camera. Same stance — do not fix anything.', holdSec: 14, checks: [KNEE, HIPS, SHOULDER_LEVEL] },
  { id: 'breath', view: 'front', cue: 'Stay facing me. Take one easy breath in and out.', holdSec: 8, checks: [RIBS] },
  { id: 'profile', view: 'side', cue: 'Turn side-on — left shoulder to the camera. Look straight ahead.', holdSec: 10, checks: [HEAD] },
  { id: 'wobbleL', view: 'front', cue: 'Face me. Stand on your LEFT leg, other knee up to hip height, arms by your sides.', holdSec: 30, checks: [WOBBLE] },
  { id: 'wobbleR', view: 'front', cue: 'Now the RIGHT leg. Same thing — thirty seconds.', holdSec: 30, checks: [WOBBLE] },
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
   * 0–100, for the app's own grade bands, scored down hardest by one-sided fails. NULL when nothing was graded, and
   * NULL for a PARTLY graded screen too (MIRROR-COACH P1, 2026-09-25): a score over the checks that happened to come
   * back reads as a score for the screen, and one stable check out of eight scored 100.
   */
  score: number | null;
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
   * Every check the screen expects that came back without a result, named rather than hidden, WHATEVER its source.
   * MIRROR-COACH P1 (2026-09-25): on a graded screen this listed only the missing self-report and coach checks, so a
   * screen with one camera result silently dropped the other five camera checks and read as complete.
   */
  notMeasured: string[];
  /** Every station's every check came back (a two-sided check needs both sides: see checkSlots). */
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

/** Every slot of every check has a result: the only screen that can read as clear. */
export function isCompleteScreen(screen: ScreenId, results: readonly CheckResult[]): boolean {
  const kept = resultsForScreen(screen, results);
  return [...checkSlots(screen)].every(([id, n]) => kept.filter((r) => r.checkId === id).length >= n);
}

/** How many DIFFERENT checks came back — what the reward counts, so three copies of one check are one check. */
export function distinctChecks(results: readonly Pick<CheckResult, 'checkId'>[]): number {
  return new Set(results.map((r) => r.checkId)).size;
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
const SOURCES: readonly CheckSource[] = ['camera', 'selfReport', 'coach'];
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
 */
export function resultsForScreen(screen: ScreenId, results: readonly unknown[]): CheckResult[] {
  const slots = checkSlots(screen);
  const byKey = new Map<string, CheckResult>();
  for (const raw of results) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Partial<Record<keyof CheckResult, unknown>>;
    if (typeof r.checkId !== 'string' || !slots.has(r.checkId)) continue;
    if (!GRADES.includes(r.grade as Grade) || !SOURCES.includes(r.source as CheckSource)) continue;
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
 */
export function screenVariantFor(claimed: ScreenId, results: readonly CheckResult[]): ScreenId {
  if (claimed !== 'full' || !results.length) return claimed;
  const modifiedIds = new Set(checkSlots('modified').keys());
  return results.some((r) => !modifiedIds.has(r.checkId)) ? 'full' : 'modified';
}

const MEANING: Record<string, string> = {
  heelLine: 'The foot is not giving the leg a level platform, so everything above it starts crooked.',
  kneeWindow: 'The knee is being asked to control rotation it should not have to, which is where landing forces go wrong.',
  hipLevel: 'The pelvis is starting every jump and cut from a tilt, so one side works harder than the other.',
  shoulderLevel: 'The rib cage is sitting rotated or shifted under the shoulders rather than square.',
  ribAngle: 'The cylinder is leaking pressure — breathing is happening at the neck instead of the lower ribs.',
  headFloat: 'The head is riding forward of the shoulders, so the neck is holding a brace all day.',
  singleLeg: 'The hip cannot hold the pelvis level on one leg, which is the position every stride and landing is.',
  pelvicTilt: 'The pelvis is parked at one end of its range rather than sitting in the middle of it.',
  thoracicRotation: 'Rotation is not shared evenly between the two sides.',
};

const FIX: Record<string, string> = {
  heelLine: 'Foot tripod work before anything loaded — short-foot holds, then slow calf raises with the heel tracking straight.',
  kneeWindow: 'Hip external-rotation and glute-medius work, and slow tempo squats watching the knee track over the second toe.',
  hipLevel: 'Single-leg hip work on the low side, and stop loading the tilt with heavy bilateral lifts for now.',
  shoulderLevel: 'Breathing work first, then rotation drills to the restricted side.',
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
 * headline, "Train normally") needs every slot of every check (isCompleteScreen). A partial screen has no score; with
 * no flags it is triaged 'partial' and says it is not a clear screen; with flags it is triaged by them.
 * The results are filtered through resultsForScreen here too, so no caller can score what the route would not keep.
 */
export function scoreScreen(screen: ScreenId, rawResults: readonly CheckResult[]): ScreenResultSummary {
  const stations = screenFor(screen);
  const slots = checkSlots(screen);
  const byId = new Map(stations.flatMap((s) => s.checks).map((c) => [c.id, c]));
  const results = resultsForScreen(screen, rawResults);
  const missing = [...slots].filter(([id, n]) => results.filter((r) => r.checkId === id).length < n).map(([id]) => id);
  const notMeasured = missing.map((id) => byId.get(id)!.label);

  // NOTHING GRADED IS NOT A CLEAN SCREEN. With no results the arithmetic below says 100, "Nothing flagged. That is a
  // platform you can load." and "Train normally" — three claims about a body nobody measured. It says so instead.
  if (!isGraded(results)) {
    return {
      screen, graded: false, movementFlags: 0, redFlags: 0, asymmetries: 0, score: null, triage: 'notGraded',
      headline: NOT_GRADED_LINE, meaning: [], suggestions: [], programming: [], notMeasured, ranAll: false,
    };
  }

  const fails = results.filter((r) => r.grade === 'fail');
  const borderline = results.filter((r) => r.grade === 'borderline');
  const movementFlags = fails.length;
  const asymmetries = fails.filter((r) => !!r.side).length;
  const ranAll = missing.length === 0;
  const totalSlots = [...slots.values()].reduce((a, b) => a + b, 0);

  // 0–100: every fail costs, a one-sided fail costs more (the books' rule), borderline costs a little — and only a
  // complete screen has a score at all
  const penalty = fails.reduce((a, r) => a + (r.side ? 22 : 15), 0) + borderline.length * 6;
  const score = ranAll ? Math.max(0, Math.min(100, 100 - penalty)) : null;

  const flagged = [...fails, ...borderline];
  const meaning = flagged.map((r) => MEANING[r.checkId]).filter(Boolean);
  const suggestions = fails.map((r) => FIX[r.checkId]).filter(Boolean);

  const triage: ScreenResultSummary['triage'] = !ranAll && movementFlags === 0 ? 'partial' : triageFor(movementFlags);
  const programming = triage === 'seeSpecialist'
    ? ['Keep practising skills at controlled intensity.',
       'Hold off on heavy load and high-volume jumping until this is looked at in person.',
       'This is not medical clearance — pain, swelling, numbness or a pop belongs with a physician.']
    : triage === 'addressFirst'
      ? ['Keep training.', 'Do the corrective work above before you add intensity, not instead of training.',
         'Re-run this screen in two weeks and compare the sides.']
      : triage === 'partial'
        ? []
        // 'an ankle injury', not 'an ankle sprain': the screen names no condition (lib/share/screen.ts)
        : ['Train normally.', 'Re-run this screen monthly, or after an ankle injury, a growth spurt, or a jump in workload.'];

  const worstSided = fails.find((r) => r.side);
  const headline = triage === 'partial'
    ? `Partly graded: ${results.length} of ${totalSlots} checks came back without a flag and the rest were not measured, so this is not a clear screen.`
    : movementFlags === 0
      ? 'Nothing flagged. That is a platform you can load.'
      : worstSided
        ? `${byId.get(worstSided.checkId)?.label ?? 'A check'} failed on the ${worstSided.side} side. One side off and one side fine matters more than both being mildly off.`
        : `${movementFlags} flag${movementFlags > 1 ? 's' : ''} worth clearing before you add intensity.`;

  return {
    screen, graded: true, movementFlags, redFlags: movementFlags, asymmetries, score, triage, headline, meaning,
    suggestions, programming, notMeasured, ranAll,
  };
}

/** The line that rides every screen result. It is not medical clearance and the books say so first. */
export const SCREEN_DISCLAIMER =
  'A movement screen from a single camera, scored on what was visible. It is not medical clearance. Chest pain, acute '
  + 'swelling, numbness, or anything that sounded like a pop belongs with a physician, not an app.';
