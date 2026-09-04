/**
 * lib/feel/cores/irl-session-core.ts
 * ==================================
 * M9 Step 18 — IRL archetype core (7th and final feel family).
 *
 * The IRL family is NOT a physics/feel core — its gameplay feel is whatever
 * 3D mode drives the run (IRL Dunk uses the Court core's dunk feel, already
 * shipped as family #1). What the IRL family adds is the SESSION layer the
 * engineering line specified for local play (LINEUP_SPEC §IRL):
 *
 *   - local-only runs (no networked opponent)
 *   - Mirror Triumph  — beat your own ghost; streak + longest + total beats
 *   - couch H2H        — two (or more) local players, alternate, compare
 *   - review bridge    — METADATA-ONLY submission payload, built ONLY when a
 *                        competition endpoint is configured
 *
 * This is a headless, DETERMINISTIC session manager built on the already-ported
 * StateMachine + SensoryBus. It forks no feel core and edits no other mode.
 * There is no donor JS reference for the IRL session (the donor lived in the
 * app's own competition/Mirror-Triumph layer), so this core is synthesised as
 * the family archetype — exactly as the Court-rally core was.
 *
 * FIDELITY: the Mirror Triumph streak rules are ported VERBATIM from the app's
 * own /api/mirror-triumph route so the headless session and the server agree:
 *   - first play:  best = score, streak 0, longest 0, totalBeats 0
 *   - beat ghost:  best = score, streak+1, longest = max, totalBeats+1
 *   - no beat:     streak resets to 0 (best unchanged)
 *
 * DETERMINISM: no randomness. Timestamps flow through an injected `now()`
 * (default Date.now) so the harness can assert reproducible submissions.
 */

import { StateMachine, SensoryBus, type SensoryEvent } from '../index';

// ---- Phases -------------------------------------------------------------

export type IrlPhase =
  | 'idle' // nothing in progress
  | 'run' // a single local run is underway
  | 'result' // a run just finished (Mirror Triumph resolved)
  | 'h2h' // a couch head-to-head is underway
  | 'complete'; // a couch head-to-head resolved

// ---- Sensory ------------------------------------------------------------

export type IrlSensoryEvent =
  | 'runStart'
  | 'firstRun' // first-ever run for this mode (no ghost yet)
  | 'newRecord' // beat your ghost
  | 'noBeat' // did not beat your ghost (streak reset)
  | 'h2hScore' // a couch player logged a score
  | 'h2hWin' // couch H2H resolved
  | 'submitted'; // a review-bridge payload was built

// ---- Tuning -------------------------------------------------------------

export interface IrlSessionTuning {
  h2hDefaultPlayers: number; // couch H2H player count default
  tieGoesTo: number | null; // winner index on a tie (null = draw)
}

// ---- Data ---------------------------------------------------------------

export interface IrlMirror {
  bestScore: number;
  currentStreak: number;
  longestStreak: number;
  totalBeats: number;
  lastBeatAt: number | null;
  plays: number;
}

export interface IrlH2H {
  players: number;
  scores: number[]; // one entry per player, in turn order
  current: number; // whose turn (0-based); === players when done
  winner: number | null; // resolved winner index, or null (draw / unresolved)
}

/** Metadata-only payload for the review bridge (never includes raw video/PII). */
export interface IrlSubmission {
  mode: string;
  score: number;
  beatBest: boolean;
  players: number;
  h2hWinner: number | null;
  ts: number;
}

// ---- Skin ---------------------------------------------------------------

export interface IrlSessionSkin {
  /** Mode key used in submissions + Mirror Triumph lookups (e.g. 'irlDunk'). */
  mode: string;
  tuning: IrlSessionTuning;
  /** Review bridge only builds a payload when a competition endpoint exists. */
  submissionConfigured?: boolean;
  sensory?: Partial<Record<IrlSensoryEvent, SensoryEvent>>;
  onSensory?: (evt: IrlSensoryEvent, info: { score?: number; mirror?: IrlMirror; winner?: number | null }) => void;
  onPhase?: (from: IrlPhase, to: IrlPhase) => void;
}

// ---- State --------------------------------------------------------------

export interface IrlSessionState {
  phase: IrlPhase;
  mirror: IrlMirror;
  lastRun: number | null;
  lastBeat: boolean;
  h2h: IrlH2H;
}

function emptyMirror(): IrlMirror {
  return {
    bestScore: 0,
    currentStreak: 0,
    longestStreak: 0,
    totalBeats: 0,
    lastBeatAt: null,
    plays: 0,
  };
}

function emptyH2H(players: number): IrlH2H {
  return { players, scores: [], current: 0, winner: null };
}

// ---- Core ---------------------------------------------------------------

export class IrlSessionCore {
  readonly skin: IrlSessionSkin;
  readonly t: IrlSessionTuning;
  readonly bus: SensoryBus;
  readonly fsm: StateMachine<{ core: IrlSessionCore }>;

  state: IrlSessionState;

  private readonly _now: () => number;

  constructor(
    skin: IrlSessionSkin,
    opts: { bus?: SensoryBus; now?: () => number; mirror?: Partial<IrlMirror> } = {},
  ) {
    this.skin = skin;
    this.t = skin.tuning;
    this.bus = opts.bus ?? new SensoryBus();
    this._now = opts.now ?? Date.now;

    this.state = {
      phase: 'idle',
      mirror: { ...emptyMirror(), ...(opts.mirror ?? {}) },
      lastRun: null,
      lastBeat: false,
      h2h: emptyH2H(this.t.h2hDefaultPlayers),
    };

    this.fsm = new StateMachine<{ core: IrlSessionCore }>({
      initial: 'idle',
      ctx: { core: this },
      states: { idle: {}, run: {}, result: {}, h2h: {}, complete: {} },
      onTransition: (from, to) => {
        this.state.phase = to as IrlPhase;
        this.skin.onPhase?.(from as IrlPhase, to as IrlPhase);
      },
    });
  }

  get phase(): IrlPhase {
    return this.fsm.current as IrlPhase;
  }

  private _emit(
    evt: IrlSensoryEvent,
    info: { score?: number; mirror?: IrlMirror; winner?: number | null } = {},
  ): void {
    const fx = this.skin.sensory?.[evt];
    if (fx) this.bus.emit(fx);
    this.skin.onSensory?.(evt, info);
  }

  // ---- Mirror Triumph (single-player) ----------------------------------

  /** Start a local run. Allowed from idle or after a previous result. */
  beginRun(): boolean {
    if (this.fsm.current !== 'idle' && this.fsm.current !== 'result') return false;
    this.fsm.transition('run');
    this._emit('runStart');
    return true;
  }

  /**
   * Finish the run with a score. Updates Mirror Triumph EXACTLY like the app's
   * /api/mirror-triumph route. Returns whether the ghost was beaten.
   */
  submitRun(score: number): { beatBest: boolean; firstPlay: boolean; mirror: IrlMirror } {
    if (this.fsm.current !== 'run') this.fsm.transition('run');
    const m = this.state.mirror;
    const firstPlay = m.plays === 0;
    let beatBest = false;

    if (firstPlay) {
      m.bestScore = score;
      m.currentStreak = 0;
      m.longestStreak = 0;
      m.totalBeats = 0;
      m.lastBeatAt = null;
    } else if (score > m.bestScore) {
      m.bestScore = score;
      m.currentStreak += 1;
      m.longestStreak = Math.max(m.longestStreak, m.currentStreak);
      m.totalBeats += 1;
      m.lastBeatAt = this._now();
      beatBest = true;
    } else {
      m.currentStreak = 0;
    }
    m.plays += 1;

    this.state.lastRun = score;
    this.state.lastBeat = beatBest;
    this.fsm.transition('result');
    if (firstPlay) this._emit('firstRun', { score, mirror: m });
    else if (beatBest) this._emit('newRecord', { score, mirror: m });
    else this._emit('noBeat', { score, mirror: m });
    return { beatBest, firstPlay, mirror: { ...m } };
  }

  // ---- Couch head-to-head ----------------------------------------------

  /** Start a couch H2H with `players` local competitors (defaults from tuning). */
  beginH2H(players?: number): boolean {
    if (this.fsm.current !== 'idle' && this.fsm.current !== 'complete' && this.fsm.current !== 'result')
      return false;
    const n = Math.max(2, Math.floor(players ?? this.t.h2hDefaultPlayers));
    this.state.h2h = emptyH2H(n);
    this.fsm.transition('h2h');
    return true;
  }

  /** Log the current player's score; auto-resolves when everyone has gone. */
  submitH2HScore(score: number): IrlH2H {
    if (this.fsm.current !== 'h2h') return this.state.h2h;
    const h = this.state.h2h;
    if (h.current >= h.players) return h;
    h.scores.push(score);
    h.current += 1;
    this._emit('h2hScore', { score });
    if (h.current >= h.players) this._resolveH2H();
    return h;
  }

  private _resolveH2H(): void {
    const h = this.state.h2h;
    let best = -Infinity;
    let winner: number | null = null;
    let tie = false;
    h.scores.forEach((s, i) => {
      if (s > best) {
        best = s;
        winner = i;
        tie = false;
      } else if (s === best) {
        tie = true;
      }
    });
    h.winner = tie ? this.t.tieGoesTo : winner;
    this.fsm.transition('complete');
    this._emit('h2hWin', { winner: h.winner });
  }

  // ---- Review bridge ----------------------------------------------------

  /**
   * Build a METADATA-ONLY submission payload for the competition API. Returns
   * null unless the skin marks a submission endpoint as configured — matching
   * the spec's "metadata-only submissions to your competition API WHEN
   * configured". Never carries raw media.
   */
  buildSubmission(): IrlSubmission | null {
    if (!this.skin.submissionConfigured) return null;
    const score = this.state.h2h.winner != null
      ? this.state.h2h.scores[this.state.h2h.winner] ?? this.state.lastRun ?? 0
      : this.state.lastRun ?? 0;
    const payload: IrlSubmission = {
      mode: this.skin.mode,
      score,
      beatBest: this.state.lastBeat,
      players: this.state.phase === 'complete' ? this.state.h2h.players : 1,
      h2hWinner: this.state.h2h.winner,
      ts: this._now(),
    };
    this._emit('submitted', { score });
    return payload;
  }

  /** Return the session to idle (keeps Mirror Triumph history). */
  reset(): void {
    this.fsm.transition('idle');
  }
}

export default IrlSessionCore;
