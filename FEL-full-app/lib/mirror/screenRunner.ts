// screenRunner — walking an athlete through the stations, one at a time, alone in a room.
//
// The screen protocol (./screen) knows WHAT the stations are and the framing check (./framing) knows whether the shot
// is good. Neither knows how to run a session: when to say the cue, when to start counting, what to do when somebody
// wanders out of frame in the middle of a thirty-second hold. That is this file, and it is a state machine rather
// than a countdown because of one fact about the owner's setup — the athlete is across the room from the phone and
// cannot see it. Every transition has to survive them getting it wrong and fixing it without a word from anybody.
//
//   · THE CLOCK ONLY RUNS ON A GOOD SHOT. Stand out of frame for ten seconds of a thirty-second hold and you have
//     twenty left, not zero. A timer that ran regardless would grade the wall behind them.
//   · LEAVING THE SHOT DOES NOT FAIL THE STATION, it pauses it. They stepped out to move a chair. The station
//     resumes where it was, and only a long absence sends it back to the top.
//   · THE TURN CUE COMES FIRST. When the view changes — front to back for the heels, front to side for the head
//     float — the athlete is told to turn and the station does not start until the new shot is good. (Since the P3
//     follow-up, 2026-09-28, it is said again at spaced intervals while they have not turned, and a station they never
//     turn for ends as not read — see below.)
//
// MIRROR-COACH P3 (2026-09-26) — THE STATIONS ARE GRADED HERE NOW. record() had no caller (P1 report, "Phase 3"), so
// every screen finished with zero results and read "Not graded yet". Now:
//   · THE GRADERS SEE ONLY THE FRAMES THE CLOCK RAN ON. Every frame the hold counts (a good shot, facing the right way)
//     is kept for the station; a frame the clock refused (positioning, out of shot, the wrong way round) never is. When
//     the hold ends, lib/mirror/stationGraders.ts grades every camera check at the station over those frames — a
//     MEDIAN over the hold, never the last frame (the athlete settling, or stepping off, as the count ends is one frame
//     of hundreds). A repeated camera frame (the same timestamp) is kept once.
//   · A PASS OR A FLAG IS RECORDED; AN UNREADABLE CHECK IS NOT. It becomes no CheckResult, so scoreScreen names it as
//     not measured and it can never count as a pass. It is kept in `grades` (status 'unreadable') for the card and the
//     server's regrade.
//   · ONE RETEST, THEN IT MOVES ON. A station that ends with an unreadable check is run once more: the runner says why
//     and what to change (RETEST_HINT), pauses RETEST_PAUSE_MS so the line is heard, and holds the station again from
//     the top. Per check the WORSE readable read of the two is kept (mergeRetest: a flag over a pass, either over not
//     read); a check still unreadable after it is recorded as unreadable and the screen goes on. There is no second
//     retest and no loop — P1 removed a "step back and run it again" loop that could never succeed, and this must not
//     bring one back. skipRetest() lets someone at the phone decline it.
//   · THE CAMERA'S SHAPE RIDES EVERY FRAME (MIRROR-COACH P3 review, 2026-09-26): the aspect set last (the harness
//     re-reads the video's size on every frame) is stamped on each frame kept, so the graders read each frame at the
//     shape it was taken at, and a station held across a turn of the phone reads 'cameraMoved' instead of a false flag.
//
// MIRROR-COACH P3 follow-up (2026-09-28) — THE WRONG VIEW ENDS. The clock runs only on a good shot, and nothing ended a
// station whose hold never started: in the P3 live proof an athlete who stayed facing the camera at the side station
// saw the clock sit at 10 for 45.6 s, heard the turn cue once, and got no retest and no timeout — a dead end. Now, while
// the thing to fix is the turn, the turn line is said again every STATION_THRESHOLDS.wrongView.remindMs (RunnerState
// .sayAgain tells the harness to say it again; the text does not change), and after wrongView.endMs of it the station
// ENDS: every camera check at it NOT READ, reason 'wrongView' (stationGraders.ts notReadStation), through the same
// one-retest rule as a hold that ended unreadable — the retest line says the turn — and then the screen moves on. And
// readSoFar() hands End what the screen has read, so pressing End no longer throws the finished stations away.
//
// …AND ITS REVIEW (2026-09-28), the holes in that:
//   · ONE FRAME IS NOT A TURN. Any passing frame reset the wrong-view wait, so a body flickering across the side-on line
//     (one frame in 3 s, or in 8 s) never reached it: still at the side station after 10 and 30 minutes. The wait now
//     resets only after STATION_THRESHOLDS.wrongView.resetAfterMs of consecutive right-view frames.
//   · A BACKSTOP FOR EVERY OTHER REASON (STATION_THRESHOLDS.stalled): time on frames the clock did not run on, with a body
//     in the shot, for any framing reason, adds up per attempt; at stalled.endMs the attempt ends not read for the
//     reason the camera saw MOST, and its retest says the fix the framing check asked for most — not the turn line to
//     somebody who stood side-on (but off-centre) for a minute.
//   · ONE TICK IS AT MOST A FRAME (STATION_THRESHOLDS.clock.maxTickMs), and a gap of ABANDON_MS is an absence: a render
//     loop paused 25 s no longer ends a station on its next frame, or banks 25 s of hold.
//   · THE TURN IS SAID ONLY FOR THE RUNNER'S OWN WRONG-VIEW END. A grader's 'wrongView' over frames the framing check
//     passed (the head turned from the body at the side station) keeps the grader's hint (retestHintFor).
//   · WHAT IT SAYS ON LEAVING comes from what the station read: "That one wasn't read" only when nothing at it was.
//   · DIM ALL OVER IS DIM for the waits (the graders' own order): a dim room at a front station is not a wrong view.
//   · END'S CARDS: readSoFar() also hands back the per-station records as End leaves them (a pending retest kept as not
//     read), so the harness draws "What to work on" from what End posted; and every record says whether its hold RAN
//     (StationRecord.held), so the breath questions are asked only about a breath station that was held.
//
// Pure: the caller feeds it frames and a clock, and renders what it returns.
import { checkFraming, framingLine, type FramingCheck, type FramingFrame, type FramingIssue } from './framing';
import { TURN_CUE, screenFor, type ScreenId, type ScreenStation, type CheckResult } from './screen';
import {
  STATION_THRESHOLDS, gradeScreenStation, notReadStation, resultsFromGrades, retestHintFor, toCheckResult,
  type GraderFrame, type GraderPoint, type StationGrade, type UnreadableReason,
} from './stationGraders';

export type RunnerPhase =
  | 'positioning'   // the shot is not good enough to start
  | 'holding'       // counting down this station
  | 'retest'        // the station ended unreadable: saying so, then holding it once more
  | 'stationDone'   // the hold finished, about to move on
  | 'complete';

/** A finished (or retest-pending) station's grades, for the per-station card. */
export interface StationRecord {
  stationId: string;
  stationIndex: number;
  /** 1 = its first run, 2 = after its one retest. */
  attempts: number;
  /** True while its one retest is pending or running; the grades are then the first run's. */
  retesting: boolean;
  /**
   * The attempt these grades are from RAN ITS HOLD to the end (MIRROR-COACH P3 follow-up review, 2026-09-28). False when
   * the runner ended it — the athlete never turned (wrongView), or the shot never came good (stalled) — so nothing was
   * done at the station: the breath station's questions are not asked about a breath nobody was cued to take.
   */
  held: boolean;
  /** One per camera check at the station (none for a self-report or coach station). */
  grades: StationGrade[];
}

export interface RunnerState {
  /**
   * Which screen this runner is running — the variant whose stations it walks, and so the ONLY variant its results
   * may be stored as. MIRROR-COACH P1 (2026-09-25): the harness built every runner as 'modified' (start() closed over
   * the picker's first value with [] deps, mirror-harness.tsx:208,337) but posted the picker's CURRENT value
   * (:430,:442), so a "Full" screen was stored and scored as full over the modified screen's six stations. The post
   * now reads the variant from here.
   */
  screen: ScreenId;
  phase: RunnerPhase;
  stationIndex: number;
  station: ScreenStation | null;
  /** Seconds still to hold. Only moves while the shot is good. */
  remainingSec: number;
  /** What to say out loud right now: the turn, the fix, or the station's own cue. */
  say: string;
  framing: FramingCheck;
  /** Filled as stations complete, for scoreScreen: passes and flags only — never an unreadable check. */
  results: CheckResult[];
  /** Every finished station's final grades, unreadable included, in station order (what the server regrades). */
  grades: StationGrade[];
  /** Every station graded so far, the one awaiting its retest included (the card). */
  stations: StationRecord[];
  /**
   * How many times the runner has asked for its line to be said AGAIN (MIRROR-COACH P3 follow-up, 2026-09-28): the spaced
   * turn reminder while the view is wrong (STATION_THRESHOLDS.wrongView.remindMs). It only ever goes up. The harness says a
   * line when `say` or this changes (spokenKey) — once per change, as before, and never every frame.
   */
  sayAgain: number;
}

/**
 * What the harness compares to decide whether to speak (MIRROR-COACH P3 follow-up, 2026-09-28): the line, and how many
 * times it has been asked for again. The same line with a new reminder count is said again; the same state is not.
 */
export function spokenKey(s: Pick<RunnerState, 'say' | 'sayAgain'>): string {
  return `${s.sayAgain}|${s.say}`;
}

/** Out of shot for longer than this and the station restarts rather than resuming. */
export const ABANDON_MS = 6000;
/** How long the retest line gets before the station is held again — one spoken sentence, heard across a room. */
export const RETEST_PAUSE_MS = 4000;

/**
 * What the runner says when a station ends unreadable and gets its one retest: why, and the one thing to change.
 *
 * `fix` is the RUNNER'S OWN fix, given only when the runner ended the attempt itself: the turn (TURN_CUE — "Turn side-on
 * — left shoulder to the camera." says more across a room than "Face the way the cue says for this one"; MIRROR-COACH P3
 * follow-up, 2026-09-28), or the framing fix it asked for most (the stalled backstop). A grade a GRADER read over frames
 * the framing check passed keeps the grader's hint (retestHintFor): the follow-up's review found its 'wrongView' — the
 * head turned from the body, or hips turned from the lens — answered with the turn cue, to somebody already turned.
 */
export function retestLine(grades: readonly StationGrade[], opts: { fix?: string } = {}): string {
  const first = grades.find((g) => g.status === 'unreadable');
  const hint = !first ? '' : opts.fix || retestHintFor(first);
  return `I couldn't read that one — once more.${hint ? ` ${hint}` : ''}`;
}

/** Leaving a station whose checks were all read. */
export const NEXT_LINE = 'Good. Next one.';
/** Leaving a station where NOTHING was read (every camera check at it not read), or one with nothing for the camera to
 *  grade that the runner ended before its hold ran. */
export const MOVE_ON_LINE = "That one wasn't read. Next one.";
/** Leaving a station where some checks were read and some were not (MIRROR-COACH P3 follow-up review, 2026-09-28: it said
 *  MOVE_ON_LINE over a front stack whose hip flag and shoulder pass were kept). */
export const PART_READ_LINE = 'Part of that one was read. Next one.';

/** What the runner says as it leaves a station, from the grades it KEEPS for it (after its one retest, merged). */
export function moveOnLine(grades: readonly StationGrade[], held: boolean): string {
  if (!grades.length) return held ? NEXT_LINE : MOVE_ON_LINE;
  const unread = grades.filter((g) => g.status === 'unreadable').length;
  return unread === 0 ? NEXT_LINE : unread === grades.length ? MOVE_ON_LINE : PART_READ_LINE;
}

/**
 * The framing issue → the reason a station the shot never came good for is NOT READ (STATION_THRESHOLDS.stalled). Nobody
 * in the shot is not here: leaving the shot pauses a station (P1), it never ends one.
 */
const STALL_REASON: Record<Exclude<FramingIssue, 'noBody'>, UnreadableReason> = {
  turned: 'wrongView',
  cutOffTop: 'outOfFrame', cutOffBottom: 'outOfFrame', offCentre: 'outOfFrame', tooClose: 'outOfFrame',
  tooFar: 'tooSmall',
  dim: 'lowVisibility',
};

/** flag > pass > unreadable: the order a check's two reads are kept in. */
const KEEP_RANK: Record<StationGrade['status'], number> = { unreadable: 0, pass: 1, flag: 2 };

/**
 * The final grades of a retested station: per check, the WORSE READABLE read of the two — a flag over a pass, either
 * over unreadable; on a tie, the retest's (MIRROR-COACH P3 review, 2026-09-26). It kept the retest's read whenever the
 * retest read the check at all, and a retest is triggered by ANY unreadable check at the station — so at frontStack a
 * hip flag on the first run, with the knee unreadable, came back a pass after the athlete stood more carefully the
 * second time (the cue says "do not fix anything"; they did anyway), and the flag reached nobody: not the card, the
 * server, the triage or the coach. P1's rule (screen.ts resultsForScreen) is that a later stable cannot launder an
 * earlier fail; this keeps it for the retest.
 */
export function mergeRetest(first: readonly StationGrade[], retest: readonly StationGrade[]): StationGrade[] {
  return retest.map((g, i) => {
    const before = first.find((f) => f.checkId === g.checkId && f.stationId === g.stationId) ?? first[i];
    return before && KEEP_RANK[before.status] > KEEP_RANK[g.status] ? before : g;
  });
}

export interface ScreenRunnerOptions {
  /** The camera image's width over its height, for the graders (stationGraders GradeOptions.aspect). */
  aspect?: number;
}

export class ScreenRunner {
  private readonly stations: ScreenStation[];
  private index = 0;
  private heldMs = 0;
  private lastTickMs: number | null = null;
  private badSinceMs: number | null = null;
  private announcedTurnFor = -1;
  private readonly results: CheckResult[] = [];
  private readonly grades: StationGrade[] = [];
  private readonly records: StationRecord[] = [];
  private done = false;
  private aspect: number | undefined;
  /** The good frames of the current station's current attempt. */
  private frames: GraderFrame[] = [];
  /** The first run's grades while the station's one retest is pending or running; null otherwise. */
  private firstTry: StationGrade[] | null = null;
  /** Until when the retest line is being said (the clock does not run); null when no retest pause is on. */
  private retestUntilMs: number | null = null;
  private retestSay = '';
  /** Time on frames whose first fix is the turn, this attempt, since the last right-view STRETCH (STATION_THRESHOLDS.wrongView). */
  private wrongViewMs = 0;
  /** Reminders said in this stretch of wrong view, and in the whole run (RunnerState.sayAgain). */
  private remindedThisStretch = 0;
  private sayAgain = 0;
  /** How long the current run of consecutive good frames has lasted (null: the last frame was not good). */
  private goodRunMs: number | null = null;
  /** This attempt's time on frames the clock did not run on with a body in the shot, by framing issue, and what the
   *  framing check said for each (STATION_THRESHOLDS.stalled). */
  private stalledMs = 0;
  private readonly stalledBy = new Map<Exclude<FramingIssue, 'noBody'>, number>();
  private readonly stalledSaid = new Map<Exclude<FramingIssue, 'noBody'>, string>();
  /** Whether the first run of the station awaiting its retest ran its hold (StationRecord.held). */
  private firstTryHeld = true;

  constructor(readonly screen: ScreenId, opts: ScreenRunnerOptions = {}) {
    this.stations = screenFor(screen);
    this.aspect = opts.aspect;
  }

  get station(): ScreenStation | null { return this.stations[this.index] ?? null; }

  /** The camera's aspect: known only once the video plays, and it changes if the phone is turned — the harness sets
   *  it from the video's size on every frame, and every frame kept from then on carries it. */
  setAspect(aspect: number): void {
    if (Number.isFinite(aspect) && aspect > 0) this.aspect = aspect;
  }

  /** The view the PREVIOUS station used, so a turn is announced only when it actually changes. */
  private get turnNeeded(): boolean {
    const st = this.station;
    if (!st) return false;
    if (this.index === 0) return true;                       // the first station always says which way to face
    return this.stations[this.index - 1].view !== st.view;
  }

  /** Record a result directly (a caller-decided grade). The graders record through the hold; this stays for tests. */
  record(result: CheckResult): void {
    this.results.push(result);
  }

  /**
   * Decline the pending retest (someone at the phone pressed "skip"): the station's first-run grades are kept as they
   * are — its unreadable checks recorded as unreadable — and the screen moves on. A no-op when no retest is pending.
   */
  skipRetest(): void {
    if (!this.firstTry || !this.station) return;
    this.finishStation(this.firstTry, 1, this.firstTryHeld);
  }

  /**
   * What the screen has read so far, for End (MIRROR-COACH P3 follow-up, 2026-09-28): every finished station's final
   * grades, and a station waiting on (or running) its one retest counted with its first run's grades as they are — what
   * skipRetest would keep. The harness posted only at 'complete', so End after three stations lost all three. Unreadable
   * grades ride along (the server regrades them and they are listed as not read); they are never results.
   *
   * `stations` (the follow-up's review, 2026-09-28) is the per-station card as End leaves it: the station that was waiting
   * on its retest is no longer retesting (its unread checks kept as not read, as skipRetest keeps them). The harness shows
   * the card and "What to work on" from THIS after End, not from the last runner state — which kept the pending
   * station's grades out of runner.grades, so the panel headlined a hip flag the next-steps card said was not there.
   */
  readSoFar(): { screen: ScreenId; results: CheckResult[]; grades: StationGrade[]; stations: StationRecord[] } {
    const pending = this.firstTry ?? [];
    return {
      screen: this.screen, results: [...this.results, ...resultsFromGrades(pending)], grades: [...this.grades, ...pending],
      stations: this.records.map((r) => ({ ...r, retesting: false, grades: [...r.grades] })),
    };
  }

  private resetWrongView(): void {
    this.wrongViewMs = 0;
    this.remindedThisStretch = 0;
  }

  /** A new attempt at a station (the next station, or the retest): its waits start again. */
  private resetAttempt(): void {
    this.resetWrongView();
    this.goodRunMs = null;
    this.stalledMs = 0;
    this.stalledBy.clear();
    this.stalledSaid.clear();
  }

  /** The reason the camera saw for most of this attempt's stalled time, and the fix the framing check asked for most. */
  private stalledReason(st: ScreenStation): { reason: UnreadableReason; fix: string } {
    const byReason = new Map<UnreadableReason, number>();
    for (const [issue, ms] of this.stalledBy) byReason.set(STALL_REASON[issue], (byReason.get(STALL_REASON[issue]) ?? 0) + ms);
    const reason = [...byReason].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'outOfFrame';
    const issue = [...this.stalledBy].filter(([i]) => STALL_REASON[i] === reason).sort((a, b) => b[1] - a[1])[0]?.[0];
    const fix = issue === 'turned' ? TURN_CUE[st.view] : (issue && this.stalledSaid.get(issue)) || '';
    return { reason, fix };
  }

  private snapshot(frame: FramingFrame & { timestampMs?: number }, nowMs: number): void {
    const t = nowMs;
    const last = this.frames[this.frames.length - 1];
    if (last && t <= last.timestampMs) return;             // a repeated camera frame is one frame
    if (frame.present === false || !frame.landmarks?.length) return;
    // copied: an adapter may reuse its landmark objects between frames
    this.frames.push({
      present: true, timestampMs: t,
      landmarks: frame.landmarks.map((p: GraderPoint) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility })),
      // the shape the camera had when this frame was taken (see the header): the graders read it with this one
      ...(this.aspect !== undefined ? { aspect: this.aspect } : {}),
    });
  }

  private upsertRecord(rec: StationRecord): void {
    const i = this.records.findIndex((r) => r.stationIndex === rec.stationIndex);
    if (i >= 0) this.records[i] = rec; else this.records.push(rec);
  }

  /** Keep a station's final grades and move to the next station. */
  private finishStation(grades: StationGrade[], attempts: number, held: boolean): void {
    const st = this.station!;
    this.upsertRecord({ stationId: st.id, stationIndex: this.index, attempts, retesting: false, held, grades });
    for (const g of grades) {
      this.grades.push(g);
      const r = toCheckResult(g);
      if (r) this.results.push(r);
    }
    this.firstTry = null;
    this.retestUntilMs = null;
    this.frames = [];
    this.heldMs = 0;
    this.resetAttempt();
    this.index += 1;
    if (this.index >= this.stations.length) this.done = true;
  }

  /**
   * An attempt at the current station is over, with these grades: its hold ran out (graded over its frames — `held`), or
   * the runner ended it (every camera check not read: the athlete never turned, or the shot never came good — `fix` is
   * then what the runner asked for). ONE RETEST when the first attempt left a check unreadable; otherwise the station is
   * kept and the screen moves on. One path for every end, so each gets exactly the retest rule a dim shot gets — no
   * second retest, no loop (MIRROR-COACH P3 follow-up, 2026-09-28).
   */
  private endAttempt(graded: StationGrade[], st: ScreenStation, nowMs: number, framing: FramingCheck, how: { held: boolean; fix?: string }): RunnerState {
    const finishedIndex = this.index;
    const attempt = this.firstTry ? 2 : 1;
    const grades = this.firstTry ? mergeRetest(this.firstTry, graded) : graded;
    if (attempt === 1 && grades.some((g) => g.status === 'unreadable')) {
      // ONE retest: say why, pause, hold it again from the top
      this.firstTry = grades;
      this.firstTryHeld = how.held;
      this.upsertRecord({ stationId: st.id, stationIndex: this.index, attempts: 1, retesting: true, held: how.held, grades });
      this.frames = [];
      this.heldMs = 0;
      this.badSinceMs = null;
      this.resetAttempt();
      this.retestSay = retestLine(grades, { fix: how.fix });
      this.retestUntilMs = nowMs + RETEST_PAUSE_MS;
      return this.state('retest', st, st.holdSec, this.retestSay, framing);
    }
    this.finishStation(grades, attempt, how.held);
    // what it says on leaving comes from the grades it KEEPS (the follow-up's review: "That one wasn't read" was said
    // over a station whose first run had read and flagged two of its three checks)
    return this.state(this.done ? 'complete' : 'stationDone', st, 0,
      this.done ? 'That is the screen done.' : moveOnLine(grades, how.held), framing, finishedIndex);
  }

  private state(phase: RunnerPhase, st: ScreenStation | null, remainingSec: number, say: string, framing: FramingCheck, stationIndex = this.index): RunnerState {
    return {
      screen: this.screen, phase, stationIndex, station: st, remainingSec, say, framing,
      results: [...this.results], grades: [...this.grades], stations: this.records.map((r) => ({ ...r, grades: [...r.grades] })),
      sayAgain: this.sayAgain,
    };
  }

  /**
   * Drive one frame. `nowMs` is a real clock so a dropped frame cannot stall the hold — and it is the frame's time for
   * the graders (the harness passes the camera frame's own timestamp).
   */
  tick(frame: FramingFrame & { timestampMs?: number }, nowMs: number): RunnerState {
    const st = this.station;
    const framing = checkFraming(frame, st?.view ?? 'front');
    const gap = this.lastTickMs == null ? 0 : Math.max(0, nowMs - this.lastTickMs);
    this.lastTickMs = nowMs;
    // ONE TICK IS AT MOST A FRAME (STATION_THRESHOLDS.clock, the follow-up's review): the render loop paused — a hidden
    // tab, a switched window — is not time the athlete held the station, or time they spent facing the wrong way
    const away = gap >= ABANDON_MS;
    const dt = away ? 0 : Math.min(gap, STATION_THRESHOLDS.clock.maxTickMs);

    if (this.done || !st) return this.state('complete', null, 0, 'That is the screen done.', framing);

    // the retest line gets its moment: the clock does not run and nothing is kept while it is said
    if (this.retestUntilMs !== null) {
      if (nowMs < this.retestUntilMs) return this.state('retest', st, st.holdSec, this.retestSay, framing);
      this.retestUntilMs = null;
    }

    // a gap as long as an abandon is an absence: the hold starts again (as after ABANDON_MS out of the shot), and the
    // waits neither gain nor lose anything from it
    if (away) { this.heldMs = 0; this.frames = []; this.goodRunMs = null; }

    // the turn is announced once, before anything else, and only when the view actually changed
    const mustTurn = this.turnNeeded && this.announcedTurnFor !== this.index;

    if (!framing.ok) {
      this.badSinceMs ??= nowMs;
      this.goodRunMs = null;                                  // a right-view stretch is CONSECUTIVE good frames
      if (nowMs - this.badSinceMs >= ABANDON_MS) { this.heldMs = 0; this.frames = []; }   // gone long enough: restart
      // When the thing to fix IS the turn, the turn cue says it once. MIRROR-COACH P1 (2026-09-25): it used to be
      // followed by the framing check's own turn line, so a side station said "Turn side-on — left shoulder to the
      // camera. Turn side-on to the camera — I read a hinge from the side." (and the station reads no hinge).
      const say = !mustTurn ? framing.instruction
        : framing.worst === 'turned' ? TURN_CUE[st.view]
        : `${TURN_CUE[st.view]} ${framing.instruction}`;
      // DIM ALL OVER IS DIM, NOT TURNED — the graders' own order (stationGraders.ts gate), here for the waits (the
      // follow-up's review, 2026-09-28): the framing check reads a face it can barely see as a face turned away, so a dim
      // room at a front station read 'turned' first and would have ended as a wrong view, the turn said to somebody facing
      // the camera. (The line said while positioning is still the framing check's own.)
      const issue: FramingIssue | null = framing.worst === 'turned' && framing.issues.includes('dim') ? 'dim' : framing.worst;
      // THE WRONG VIEW ENDS (MIRROR-COACH P3 follow-up, 2026-09-28; STATION_THRESHOLDS.wrongView). Only while the first
      // fix is the turn: a body out of the shot pauses the station as before, and adds nothing here.
      if (issue === 'turned') {
        const W = STATION_THRESHOLDS.wrongView;
        this.wrongViewMs += dt;
        if (this.wrongViewMs >= W.endMs) {
          // never turned: every camera check at the station NOT READ, 'wrongView', graded over no frame — and the
          // one-retest rule, whose line says the turn
          return this.endAttempt(notReadStation(st, 'wrongView'), st, nowMs, framing, { held: false, fix: TURN_CUE[st.view] });
        }
        // a spaced reminder: the same turn line, said again (the harness speaks on sayAgain), never every frame
        if (this.wrongViewMs >= (this.remindedThisStretch + 1) * W.remindMs) {
          this.remindedThisStretch += 1;
          this.sayAgain += 1;
        }
      }
      // THE BACKSTOP (STATION_THRESHOLDS.stalled, the follow-up's review): every frame the clock refused with somebody in
      // the shot, whatever the reason, adds to the attempt's stalled time; at endMs the attempt ends not read for the
      // reason the camera saw most — never on a frame with nobody in it (that pauses a station, P1)
      if (issue && issue !== 'noBody') {
        this.stalledMs += dt;
        this.stalledBy.set(issue, (this.stalledBy.get(issue) ?? 0) + dt);
        this.stalledSaid.set(issue, issue === framing.worst ? framing.instruction : framingLine(issue));
        if (this.stalledMs >= STATION_THRESHOLDS.stalled.endMs) {
          const { reason, fix } = this.stalledReason(st);
          return this.endAttempt(notReadStation(st, reason), st, nowMs, framing, { held: false, fix });
        }
      }
      return this.state('positioning', st, Math.max(0, st.holdSec - this.heldMs / 1000), say, framing);
    }

    this.badSinceMs = null;
    // THE TURN IS A STRETCH, NOT A FRAME (STATION_THRESHOLDS.wrongView.resetAfterMs, the follow-up's review): the wrong-view
    // wait resets once the right view has held this long — one lucky frame in a body flickering across the side-on line
    // reset it, and the station never ended
    this.goodRunMs = this.goodRunMs === null ? 0 : this.goodRunMs + dt;
    if (this.goodRunMs >= STATION_THRESHOLDS.wrongView.resetAfterMs) this.resetWrongView();
    if (mustTurn) {
      // the shot is good and they are facing the right way: say the station's own cue and start counting now
      this.announcedTurnFor = this.index;
    }

    this.heldMs += dt;
    this.snapshot(frame, nowMs);                              // a frame the clock ran on: the graders' frame
    const remainingSec = Math.max(0, st.holdSec - this.heldMs / 1000);
    if (remainingSec > 0) return this.state('holding', st, remainingSec, st.cue, framing);

    // the hold is over: grade the station over the frames the clock ran on
    return this.endAttempt(gradeScreenStation(st, this.frames, { aspect: this.aspect }), st, nowMs, framing, { held: true });
  }
}
