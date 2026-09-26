// screenClaims — what the server keeps from a posted Movement Screen, and what it refuses.
//
// MIRROR-COACH P3 (2026-09-25). Until today POST /api/mirror/screen took the client's GRADES at their word: a result was
// {checkId, grade: 'stable'|'borderline'|'fail'} and the route scored, stored and paid on whatever arrived. The P1
// critic named it (crossref "unsafe": "the protocol gate and screen payouts rest on client-declared grades"): no grade
// could be checked because no grader existed. Phase 3 wrote the graders (lib/mirror/stationGraders.ts, lane 1), and this
// file is the server's half of them:
//
//   · THE CLIENT SENDS THE GRADER'S SUMMARY, NOT A GRADE: per camera check, the StationGrade the phone worked out
//     ({checkId, status, value, unit, frames, readableFrames, …the numbers the decision used}) plus the station's view
//     (claimFromGrade). The frames themselves never leave the device.
//   · THE SERVER RE-DECIDES IT with the SAME decision and the same table (stationGraders.regradeFromSummary →
//     decideGrade over STATION_THRESHOLDS), so the phone and the server cannot disagree by construction, and REFUSES the
//     whole screen (422) when a posted status is not the one its own numbers give — a 'pass' beside a value over the
//     line, a 'pass' on fewer readable frames than the table's minimum ('too_few_frames_for_pass'), a 'pass' from the
//     wrong view. It cannot check the frames (it never sees them): a tampered STATUS is caught; a tampered VALUE is not,
//     and nothing without the footage could catch it — which is why the payout stays behind the wallet's daily cap and
//     why nothing unlocks load from a screen on its own (phase 8's protocol gate must ask isServerGradedScreen).
//   · A CLAIM MAY ALWAYS GIVE UP: a posted 'unreadable' is kept as unreadable whatever its numbers say — the phone can
//     know it could not read a station for reasons a summary does not carry — and unreadable never scores or pays.
//   · DROPPED, NOT REFUSED: junk; checks the claimed variant does not have (P1's resultsForScreen rule); checks that are
//     not camera checks (the breath answers and the coach's checks are never scored — lib/mirror/selfReport.ts); bare
//     grades with no summary behind them (the pre-P3 shape); counts no hold of the station could make (more frames than
//     the hold at the fastest pose rate, more seconds on one leg than the hold — stationGraders.regradeFromSummary with
//     the station's holdSec, P3 review); and duplicates — per check (per leg, for the single-leg stance) the WORST read
//     is kept, flag over pass over unreadable, the same rule as resultsForScreen and the runner's retest (P3 review,
//     2026-09-26: it kept the FIRST, so [pass, flag] of one check stored the pass and dropped a valid flag).
//   · PROVISIONAL: fewer than MIN_READABLE_CAMERA_CHECKS different camera checks readable, OR all of them from one
//     station (MIN_READABLE_CAMERA_STATIONS, P3 review) → the screen is stored, scored for what it has, and pays nothing.
//
// Pure: no database, no session. app/api/mirror/screen/route.ts does the IO around decideScreenPost.
import {
  cameraSlots, protocolSourceOf, resultsForScreen, screenFor, screenVariantFor, scoreScreen, type CheckResult, type ScreenId,
  type ScreenResultSummary, type ScreenStation, type StationView,
} from './screen';
import { decideScreenReward, MIN_CHECKS_FOR_REWARD, type ScreenRewardDecision } from './screenReward';
import { SHORT_LABEL } from './screenCorrectives';
import { selfReportAnswersFor, type SelfReportEntry } from './selfReport';
import {
  GRADER_VIEW, isGraderId, minReadableFrames, regradeFromSummary, retestHintFor, toCheckResult, type GradeStatus, type StationGrade,
  type UnreadableReason,
} from './stationGraders';

export type ClaimStatus = GradeStatus;
const STATUSES: readonly ClaimStatus[] = ['pass', 'flag', 'unreadable'];
const VIEWS: readonly StationView[] = ['front', 'side', 'back'];

/**
 * One camera check as the client posts it: the phone's StationGrade (lib/mirror/stationGraders.ts) and the view of the
 * station it was graded at (optional when the grade names its station, whose view is then used). The note is not read —
 * the server writes its own.
 */
export type CameraCheckClaim = Omit<StationGrade, 'note'> & { view?: StationView; note?: string };

/** What the harness posts for one grade: the grade's numbers plus the station's view. */
export function claimFromGrade(g: StationGrade, view: StationView): CameraCheckClaim {
  const { note: _note, ...numbers } = g;
  void _note;
  return { ...numbers, view };
}

/**
 * A claim after the server's re-check: the server's own StationGrade (value, note and side re-derived from the posted
 * numbers), the view it was posted from, and the status the client said beside the one the server stores.
 */
export type RegradedCheck = StationGrade & { view: StationView; claimed: ClaimStatus };

export type DropReason = 'malformed' | 'not_in_screen' | 'not_camera' | 'unverifiable' | 'duplicate';
export type RefuseReason = 'status_does_not_follow' | 'too_few_frames_for_pass';

export interface ClaimRefusal {
  checkId: string;
  side?: 'left' | 'right';
  claimed: ClaimStatus;
  /** What the numbers give. */
  expected: ClaimStatus;
  reason: RefuseReason;
}

export interface ScreenClaimsOutcome {
  /** Camera results for scoreScreen (stationGraders.toCheckResult): pass → stable, flag → fail, unreadable → none. */
  results: CheckResult[];
  /** Every kept claim, readable or not, as the server re-decided it (stored as the screen's evidence). */
  camera: RegradedCheck[];
  /** Claims whose status does not follow from their numbers. Any refusal refuses the whole screen (422). */
  refused: ClaimRefusal[];
  dropped: { checkId: string | null; reason: DropReason }[];
  /** How many DIFFERENT camera checks were readable (pass or flag). The single-leg stance on both legs is one. */
  readableChecks: number;
  /** How many DIFFERENT stations those readable checks came from (the two single-leg stations are two). */
  readableStations: number;
  /** Under the screen bar (isScreenNotStation): kept, never paid. */
  provisional: boolean;
}

/**
 * A screen needs this many DIFFERENT camera checks readable to pay (MIRROR-COACH P3, 2026-09-25) — the reward's own
 * MIN_CHECKS_FOR_REWARD, so "provisional" and "does not pay" are one number, not two that can drift. FEL's judgement:
 * three of the six camera checks is the least that reads as a screen rather than a station or two.
 */
export const MIN_READABLE_CAMERA_CHECKS = MIN_CHECKS_FOR_REWARD;

/**
 * …and they must come from at least this many different STATIONS (MIRROR-COACH P3 review, 2026-09-26). The front stack
 * alone carries three camera checks (knee window, hip level, shoulder height — screen.ts frontStack), so one station
 * read — heels, head and both legs unread — was paid, stored as a current screen (attention.ts isScanEquivalentScreen)
 * and triaged as data, against this file's own "a screen rather than a station or two" and screenReward.ts's "one
 * station does not make a screen". And a tampering client could post that one station and skip the rest.
 */
export const MIN_READABLE_CAMERA_STATIONS = 2;

/** The station of this screen a camera result belongs to: the one that asks the check (the single-leg stance: by leg). */
export function stationIdFor(screen: ScreenId, checkId: string, side?: 'left' | 'right'): string | null {
  const asking = screenFor(screen).filter((st) => st.checks.some((c) => c.id === checkId));
  if (asking.length === 1) return asking[0].id;
  return asking.find((st) => st.stance && st.stance === side)?.id ?? null;
}

/** How much of a screen the camera read: DIFFERENT checks, and the DIFFERENT stations they came from. */
export function screenCoverage(screen: ScreenId, results: readonly unknown[]): { checks: number; stations: number } {
  const kept = resultsForScreen(screen, results);
  const stations = new Set(kept.map((r) => stationIdFor(screen, r.checkId, r.side)).filter((x): x is string => !!x));
  return { checks: new Set(kept.map((r) => r.checkId)).size, stations: stations.size };
}

/** A screen, not a station or two: the bar the payout, the stored `provisional` and the coach's "current data" share. */
export function isScreenNotStation(c: { checks: number; stations: number }): boolean {
  return c.checks >= MIN_READABLE_CAMERA_CHECKS && c.stations >= MIN_READABLE_CAMERA_STATIONS;
}

/** Cap on claims read from one post: the screen has 7 camera slots; anything past a few dozen is not a screen. */
export const MAX_CLAIMS = 64;

/** The station a claim names, in the claimed screen — only if that station asks this check. */
function stationOf(screen: ScreenId, stationId: unknown, checkId: string): ScreenStation | undefined {
  if (typeof stationId !== 'string') return undefined;
  const st = screenFor(screen).find((s) => s.id === stationId);
  return st && st.checks.some((c) => c.id === checkId) ? st : undefined;
}

/** What a kept claim says when the phone gave up on a check its numbers would have read (FEL's copy). */
export const GAVE_UP_NOTE = 'Not read: the phone could not read this one.';

function isRecord(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

/**
 * Re-check a posted screen's camera claims. See the file header for every rule; in order: drop junk, bare grades,
 * foreign and non-camera checks; re-decide every survivor from its own numbers and refuse any status they do not give;
 * then keep the worst read per check (per leg for the single-leg stance): flag over pass over unreadable.
 */
export function regradeClaims(screen: ScreenId, raw: readonly unknown[]): ScreenClaimsOutcome {
  const slots = cameraSlots(screen);
  const dropped: ScreenClaimsOutcome['dropped'] = [];
  const refused: ClaimRefusal[] = [];
  const kept = new Map<string, RegradedCheck>();

  for (const r of raw.slice(0, MAX_CLAIMS)) {
    if (!isRecord(r) || typeof r.checkId !== 'string' || !r.checkId) { dropped.push({ checkId: null, reason: 'malformed' }); continue; }
    const checkId = r.checkId.slice(0, 64);
    const source = protocolSourceOf(screen, checkId);
    if (source === null) { dropped.push({ checkId, reason: 'not_in_screen' }); continue; }
    if (!slots.has(checkId) || !isGraderId(checkId)) { dropped.push({ checkId, reason: 'not_camera' }); continue; }
    // a grade with no grader summary behind it is the client's word, which is exactly what this file stops taking
    if (!('status' in r) || !('readableFrames' in r)) { dropped.push({ checkId, reason: 'unverifiable' }); continue; }
    // the station the phone graded it at, when it says (the runner's grades always do): it must be a station of this
    // screen that asks this check, and its view is the view the check was read from when the claim does not say one
    const station = stationOf(screen, r.stationId, checkId);
    if (r.stationId !== undefined && !station) { dropped.push({ checkId, reason: 'malformed' }); continue; }
    const claimed = r.status as ClaimStatus;
    const view = (r.view ?? station?.view) as StationView;
    if (!STATUSES.includes(claimed) || !VIEWS.includes(view)) { dropped.push({ checkId, reason: 'malformed' }); continue; }

    // the single-leg stance is asked twice, one leg a station: the leg is the claim's side, and a station id that names
    // the other leg is a claim that disagrees with itself
    const twoSlots = (slots.get(checkId) ?? 1) > 1;
    const stationLeg = station?.stance;
    const postedSide = r.side === 'left' || r.side === 'right' ? r.side : undefined;
    if (stationLeg && postedSide && checkId === 'singleLeg' && stationLeg !== postedSide) { dropped.push({ checkId, reason: 'malformed' }); continue; }
    const leg = checkId === 'singleLeg' ? (postedSide ?? stationLeg) : undefined;
    if (twoSlots && !leg) { dropped.push({ checkId, reason: 'malformed' }); continue; }

    // THE RE-DECISION: the grader's own decision over the posted numbers only (status, note and a flag's side are
    // re-derived, never read). Null = the numbers are not a grade (wrong unit, readable > frames, a value missing its
    // per-side reads, counts no hold of this station could make…).
    const holdSec = (station ?? screenFor(screen).find((st) => st.id === stationIdFor(screen, checkId, leg)))?.holdSec;
    const server = regradeFromSummary(leg ? { ...r, side: leg } : r, { holdSec });
    if (!server) { dropped.push({ checkId, reason: 'malformed' }); continue; }
    // a check graded from the wrong view is not a read, whatever its numbers (a heel line "read" from the front)
    const expected: ClaimStatus = view !== GRADER_VIEW[checkId] ? 'unreadable' : server.status;

    if (claimed !== expected && claimed !== 'unreadable') {
      const frames = typeof r.frames === 'number' ? r.frames : 0;
      const fewFrames = server.reason === 'tooFewFrames' || (r.readableFrames as number) < minReadableFrames(frames);
      refused.push({
        checkId, ...(leg ? { side: leg } : {}), claimed, expected,
        reason: claimed === 'pass' && fewFrames ? 'too_few_frames_for_pass' : 'status_does_not_follow',
      });
      continue;
    }

    const key = twoSlots ? `${checkId}|${leg}` : checkId;
    const readable = claimed !== 'unreadable' && expected !== 'unreadable';
    // a duplicate: the worse read of the two stays (flag > pass > unreadable); the first on a tie
    const prior = kept.get(key);
    if (prior) {
      if (KEEP_RANK[readable ? expected : 'unreadable'] <= KEEP_RANK[prior.status]) { dropped.push({ checkId, reason: 'duplicate' }); continue; }
      dropped.push({ checkId, reason: 'duplicate' });
    }
    const stored: RegradedCheck = readable
      ? { ...server, view, claimed }
      : expected === 'unreadable'
        ? { ...server, status: 'unreadable', value: null, view, claimed }
        // the phone gave up on a check its numbers would have read: kept as unreadable, and said so
        : { ...server, status: 'unreadable', value: null, note: GAVE_UP_NOTE, view, claimed };
    if (!readable) { delete stored.bySide; if (checkId !== 'singleLeg') delete stored.side; }
    kept.set(key, stored);
  }
  for (let i = MAX_CLAIMS; i < raw.length; i++) dropped.push({ checkId: null, reason: 'malformed' });

  // protocol order, the left leg before the right
  const camera = [...slots.keys()].flatMap((id) => [...kept.values()].filter((c) => c.checkId === id)
    .sort((a, b) => (a.side === 'right' ? 1 : 0) - (b.side === 'right' ? 1 : 0)));
  // the grader's own bridge to a screen result, then the screen's own filter (one per slot, camera checks only)
  const results = resultsForScreen(screen, camera.map(toCheckResult).filter((x): x is CheckResult => x !== null));
  const coverage = screenCoverage(screen, results);
  return {
    results, camera, refused, dropped, readableChecks: coverage.checks, readableStations: coverage.stations,
    provisional: !isScreenNotStation(coverage),
  };
}

const KEEP_RANK: Record<ClaimStatus, number> = { unreadable: 0, pass: 1, flag: 2 };

/**
 * What a screen that does not count says, from what the camera read and why the rest was not read (MIRROR-COACH P3
 * review, 2026-09-26) — the checks it read by name, and for the rest the commonest reason with its one fix
 * (stationGraders RETEST_HINT). It replaces "…Step back and run it again." (screenReward.ts PROVISIONAL_LINE says why).
 * Null for a screen that counts, or one with no camera claims at all (NOT_GRADED_LINE says that).
 */
export function screenReadLine(outcome: Pick<ScreenClaimsOutcome, 'results' | 'camera' | 'provisional' | 'readableStations'>): string | null {
  if (!outcome.provisional || !outcome.camera.length) return null;
  const read = [...new Set(outcome.results.map((r) => r.checkId))];
  const unread = outcome.camera.filter((c) => c.status === 'unreadable');
  const n = new Map<string, number>();
  for (const c of unread) n.set(c.reason ?? '', (n.get(c.reason ?? '') ?? 0) + 1);
  const top = [...n].sort((a, b) => b[1] - a[1])[0]?.[0];
  const sample = unread.find((c) => (c.reason ?? '') === top);
  const said = sample?.note ? sample.note.replace(/^Not read: /, '').replace(/\.$/, '') : '';
  const hint = sample ? retestHintFor({ reason: (sample.reason as UnreadableReason | undefined), side: sample.side }) : '';
  const why = said ? ` Most of the rest: ${said}.${hint ? ` ${hint}` : ''}` : '';
  if (!read.length) return `The camera could not read any of this screen's checks, so it does not count and pays nothing.${why}`;
  const names = read.map((id) => (isGraderId(id) ? SHORT_LABEL[id] : id)).join(', ');
  const where = outcome.readableStations === 1 ? ', all at one station' : '';
  return `The camera read ${read.length} check${read.length === 1 ? '' : 's'} (${names})${where} — not enough to count as a screen, so it pays nothing this time.${unread.length ? why : ''}`;
}

/** The posted body, cut to what the pipeline reads. */
export interface ScreenPostBody {
  screenId?: unknown;
  screen?: unknown;
  /** The grader summaries (MIRROR-COACH P3): claimFromGrade per camera check, view included. */
  checks?: unknown;
  /**
   * The runner's own grades (lib/mirror/screenRunner.ts RunnerState.grades, which the harness posts): the same
   * summaries without a view — each carries its station id, and the station's view is used. Read when `checks` is absent.
   */
  grades?: unknown;
  /**
   * The client's own CheckResults — its grades, which the server no longer takes (MIRROR-COACH P3). Read only when
   * neither list above is there (a pre-P3 client), and every bare grade in it is dropped as 'unverifiable'.
   */
  results?: unknown;
  /** Self-report answers, if the athlete answered before the screen was posted (usually they arrive by PATCH). */
  answers?: unknown;
}

export type ScreenPostDecision =
  | { ok: false; status: 400 | 422; body: Record<string, unknown> }
  | {
    ok: true;
    screenId: string;
    screen: ScreenId;
    outcome: ScreenClaimsOutcome;
    summary: ScreenResultSummary;
    answers: SelfReportEntry[];
    reward: ScreenRewardDecision;
  };

/** The screen id a client may use: 64 characters of [A-Za-z0-9_:-], else '' (refused). */
export function cleanScreenId(raw: unknown): string {
  return String(raw ?? '').slice(0, 64).replace(/[^A-Za-z0-9_:-]/g, '');
}

/** What a refused screen says (FEL's copy): nothing about the athlete, because the fault is in what was sent. */
export const SCREEN_REFUSED_LINE = 'That screen could not be checked, so it was not saved or paid. Run it again from the start.';

/**
 * The whole decision for one POST, minus the IO — the route runs this, then grants and stores what it says; the dev
 * proof route runs the same function, so there is one implementation of every rule. The movement-flag count and the
 * score are scoreScreen's over the server's results; the client's own summary is never read.
 */
export function decideScreenPost(body: unknown, athleteId: string): ScreenPostDecision {
  const b = (isRecord(body) ? body : {}) as ScreenPostBody;
  const screenId = cleanScreenId(b.screenId);
  if (!screenId) return { ok: false, status: 400, body: { error: 'missing_screen_id' } };
  const claimed: ScreenId = b.screen === 'full' ? 'full' : 'modified';
  const raw = Array.isArray(b.checks) ? b.checks : Array.isArray(b.grades) ? b.grades : Array.isArray(b.results) ? b.results : [];
  const outcome = regradeClaims(claimed, raw);
  if (outcome.refused.length) {
    return { ok: false, status: 422, body: { error: 'status_does_not_follow', message: SCREEN_REFUSED_LINE, refused: outcome.refused } };
  }
  const screen = screenVariantFor(claimed, outcome.results);
  // attempted: the camera sent grades (P3 review — "not graded yet" is for a screen with none)
  const summary = scoreScreen(screen, outcome.results, { attempted: outcome.camera.length > 0 });
  const answers = selfReportAnswersFor(screen, b.answers);
  const reward = decideScreenReward({
    screenId, athleteId, provisional: outcome.provisional, checksTaken: outcome.readableChecks,
    readLine: screenReadLine(outcome) ?? undefined,
  });
  return { ok: true, screenId, screen, outcome, summary, answers, reward };
}

/**
 * THE STORED ROW IS THE SCREEN (MIRROR-COACH P3 review, 2026-09-26). The route deduped a retried post by comparing the
 * NEWEST row's screen id only, and re-decided pay from whatever body came in: re-posting an old screen after a newer one
 * stored it again as the newest (the coach's draft and triage's stale-scan then read it as fresh); and posting a screen
 * provisional (stored, unpaid) and then re-posting the same id with three checks read PAID it — its key had never been
 * granted — while the stored row still said provisional. Now a post whose screen id is already stored is answered from
 * that row: its own summary, its own coverage, the reward decided from it (so a retry of a paid screen is the same
 * idempotent grant), and nothing stored again. Null for a row that is not a readable stored screen.
 */
export function decisionFromStoredRow(metrics: unknown, athleteId: string): {
  screenId: string; summary: ScreenResultSummary; provisional: boolean; readableChecks: number; reward: ScreenRewardDecision;
} | null {
  if (!isRecord(metrics) || typeof metrics.screenId !== 'string' || !metrics.screenId) return null;
  const screen: ScreenId = metrics.screen === 'full' ? 'full' : 'modified';
  const results = Array.isArray(metrics.results) ? resultsForScreen(screen, metrics.results) : [];
  const camera = Array.isArray(metrics.camera) ? metrics.camera as RegradedCheck[] : [];
  const coverage = screenCoverage(screen, results);
  const provisional = metrics.provisional === true || !isScreenNotStation(coverage);
  const summary = scoreScreen(screen, results, { attempted: camera.length > 0 });
  const readLine = screenReadLine({ results, camera, provisional, readableStations: coverage.stations });
  const reward = decideScreenReward({
    screenId: metrics.screenId, athleteId, provisional, checksTaken: coverage.checks, readLine: readLine ?? undefined,
  });
  return { screenId: metrics.screenId, summary, provisional, readableChecks: coverage.checks, reward };
}
