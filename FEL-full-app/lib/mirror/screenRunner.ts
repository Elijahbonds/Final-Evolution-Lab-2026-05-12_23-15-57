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
// Pure: the caller feeds it frames and a clock, and renders what it returns.
import { checkFraming, type FramingCheck, type FramingFrame } from './framing';
import { TURN_CUE, screenFor, type ScreenId, type ScreenStation, type CheckResult } from './screen';

export type RunnerPhase =
  | 'positioning'   // the shot is not good enough to start
  | 'holding'       // counting down this station
  | 'stationDone'   // the hold finished, about to move on
  | 'complete';

export interface RunnerState {
  phase: RunnerPhase;
  stationIndex: number;
  station: ScreenStation | null;
  /** Seconds still to hold. Only moves while the shot is good. */
  remainingSec: number;
  /** What to say out loud right now: the turn, the fix, or the station's own cue. */
  say: string;
  framing: FramingCheck;
  /** Filled as stations complete, for scoreScreen. */
  results: CheckResult[];
}

/** Out of shot for longer than this and the station restarts rather than resuming. */
export const ABANDON_MS = 6000;

export class ScreenRunner {
  private readonly stations: ScreenStation[];
  private index = 0;
  private heldMs = 0;
  private lastTickMs: number | null = null;
  private badSinceMs: number | null = null;
  private announcedTurnFor = -1;
  private readonly results: CheckResult[] = [];
  private done = false;

  constructor(private readonly screen: ScreenId) {
    this.stations = screenFor(screen);
  }

  get station(): ScreenStation | null { return this.stations[this.index] ?? null; }

  /** The view the PREVIOUS station used, so a turn is announced only when it actually changes. */
  private get turnNeeded(): boolean {
    const st = this.station;
    if (!st) return false;
    if (this.index === 0) return true;                       // the first station always says which way to face
    return this.stations[this.index - 1].view !== st.view;
  }

  /** Record what a station measured. The caller decides the grade; the runner keeps the order. */
  record(result: CheckResult): void {
    this.results.push(result);
  }

  /** Drive one frame. `nowMs` is a real clock so a dropped frame cannot stall the hold. */
  tick(frame: FramingFrame, nowMs: number): RunnerState {
    const st = this.station;
    const framing = checkFraming(frame, st?.view ?? 'front');
    const dt = this.lastTickMs == null ? 0 : Math.max(0, nowMs - this.lastTickMs);
    this.lastTickMs = nowMs;

    if (this.done || !st) {
      return { phase: 'complete', stationIndex: this.index, station: null, remainingSec: 0,
        say: 'That is the screen done.', framing, results: [...this.results] };
    }

    // the turn is announced once, before anything else, and only when the view actually changed
    const mustTurn = this.turnNeeded && this.announcedTurnFor !== this.index;

    if (!framing.ok) {
      this.badSinceMs ??= nowMs;
      if (nowMs - this.badSinceMs >= ABANDON_MS) this.heldMs = 0;   // gone long enough that the station restarts
      return {
        phase: 'positioning', stationIndex: this.index, station: st,
        remainingSec: Math.max(0, st.holdSec - this.heldMs / 1000),
        say: mustTurn ? `${TURN_CUE[st.view]} ${framing.instruction}` : framing.instruction,
        framing, results: [...this.results],
      };
    }

    this.badSinceMs = null;
    if (mustTurn) {
      // the shot is good and they are facing the right way: say the station's own cue and start counting now
      this.announcedTurnFor = this.index;
    }

    this.heldMs += dt;
    const remainingSec = Math.max(0, st.holdSec - this.heldMs / 1000);
    if (remainingSec > 0) {
      return { phase: 'holding', stationIndex: this.index, station: st, remainingSec, say: st.cue, framing, results: [...this.results] };
    }

    // station complete — move on, or finish
    const finishedIndex = this.index;
    this.index += 1;
    this.heldMs = 0;
    if (this.index >= this.stations.length) this.done = true;
    return {
      phase: this.done ? 'complete' : 'stationDone',
      stationIndex: finishedIndex, station: st, remainingSec: 0,
      say: this.done ? 'That is the screen done.' : 'Good. Next one.',
      framing, results: [...this.results],
    };
  }
}
