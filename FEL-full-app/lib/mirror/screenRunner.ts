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
//   · THE TURN CUE COMES FIRST AND ONCE. When the view changes — front to back for the heels, front to side for the
//     head float — the athlete is told to turn and the station does not start until the new shot is good.
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
// Pure: the caller feeds it frames and a clock, and renders what it returns.
import { checkFraming, type FramingCheck, type FramingFrame } from './framing';
import { TURN_CUE, screenFor, type ScreenId, type ScreenStation, type CheckResult } from './screen';
import { gradeScreenStation, retestHintFor, toCheckResult, type GraderFrame, type GraderPoint, type StationGrade } from './stationGraders';

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
}

/** Out of shot for longer than this and the station restarts rather than resuming. */
export const ABANDON_MS = 6000;
/** How long the retest line gets before the station is held again — one spoken sentence, heard across a room. */
export const RETEST_PAUSE_MS = 4000;

/** What the runner says when a station ends unreadable and gets its one retest. */
export function retestLine(grades: readonly StationGrade[]): string {
  const first = grades.find((g) => g.status === 'unreadable');
  const hint = first ? retestHintFor(first) : '';
  return `I couldn't read that one — once more.${hint ? ` ${hint}` : ''}`;
}

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
    this.finishStation(this.firstTry, 1);
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
  private finishStation(grades: StationGrade[], attempts: number): void {
    const st = this.station!;
    this.upsertRecord({ stationId: st.id, stationIndex: this.index, attempts, retesting: false, grades });
    for (const g of grades) {
      this.grades.push(g);
      const r = toCheckResult(g);
      if (r) this.results.push(r);
    }
    this.firstTry = null;
    this.retestUntilMs = null;
    this.frames = [];
    this.heldMs = 0;
    this.index += 1;
    if (this.index >= this.stations.length) this.done = true;
  }

  private state(phase: RunnerPhase, st: ScreenStation | null, remainingSec: number, say: string, framing: FramingCheck, stationIndex = this.index): RunnerState {
    return {
      screen: this.screen, phase, stationIndex, station: st, remainingSec, say, framing,
      results: [...this.results], grades: [...this.grades], stations: this.records.map((r) => ({ ...r, grades: [...r.grades] })),
    };
  }

  /**
   * Drive one frame. `nowMs` is a real clock so a dropped frame cannot stall the hold — and it is the frame's time for
   * the graders (the harness passes the camera frame's own timestamp).
   */
  tick(frame: FramingFrame & { timestampMs?: number }, nowMs: number): RunnerState {
    const st = this.station;
    const framing = checkFraming(frame, st?.view ?? 'front');
    const dt = this.lastTickMs == null ? 0 : Math.max(0, nowMs - this.lastTickMs);
    this.lastTickMs = nowMs;

    if (this.done || !st) return this.state('complete', null, 0, 'That is the screen done.', framing);

    // the retest line gets its moment: the clock does not run and nothing is kept while it is said
    if (this.retestUntilMs !== null) {
      if (nowMs < this.retestUntilMs) return this.state('retest', st, st.holdSec, this.retestSay, framing);
      this.retestUntilMs = null;
    }

    // the turn is announced once, before anything else, and only when the view actually changed
    const mustTurn = this.turnNeeded && this.announcedTurnFor !== this.index;

    if (!framing.ok) {
      this.badSinceMs ??= nowMs;
      if (nowMs - this.badSinceMs >= ABANDON_MS) { this.heldMs = 0; this.frames = []; }   // gone long enough: restart
      // When the thing to fix IS the turn, the turn cue says it once. MIRROR-COACH P1 (2026-09-25): it used to be
      // followed by the framing check's own turn line, so a side station said "Turn side-on — left shoulder to the
      // camera. Turn side-on to the camera — I read a hinge from the side." (and the station reads no hinge).
      const say = !mustTurn ? framing.instruction
        : framing.worst === 'turned' ? TURN_CUE[st.view]
        : `${TURN_CUE[st.view]} ${framing.instruction}`;
      return this.state('positioning', st, Math.max(0, st.holdSec - this.heldMs / 1000), say, framing);
    }

    this.badSinceMs = null;
    if (mustTurn) {
      // the shot is good and they are facing the right way: say the station's own cue and start counting now
      this.announcedTurnFor = this.index;
    }

    this.heldMs += dt;
    this.snapshot(frame, nowMs);                              // a frame the clock ran on: the graders' frame
    const remainingSec = Math.max(0, st.holdSec - this.heldMs / 1000);
    if (remainingSec > 0) return this.state('holding', st, remainingSec, st.cue, framing);

    // the hold is over: grade the station over the frames the clock ran on
    const finishedIndex = this.index;
    const graded = gradeScreenStation(st, this.frames, { aspect: this.aspect });
    const attempt = this.firstTry ? 2 : 1;
    const grades = this.firstTry ? mergeRetest(this.firstTry, graded) : graded;
    if (attempt === 1 && grades.some((g) => g.status === 'unreadable')) {
      // ONE retest: say why, pause, hold it again from the top
      this.firstTry = grades;
      this.upsertRecord({ stationId: st.id, stationIndex: this.index, attempts: 1, retesting: true, grades });
      this.frames = [];
      this.heldMs = 0;
      this.retestSay = retestLine(grades);
      this.retestUntilMs = nowMs + RETEST_PAUSE_MS;
      return this.state('retest', st, st.holdSec, this.retestSay, framing);
    }
    this.finishStation(grades, attempt);
    return this.state(this.done ? 'complete' : 'stationDone', st, 0,
      this.done ? 'That is the screen done.' : 'Good. Next one.', framing, finishedIndex);
  }
}
