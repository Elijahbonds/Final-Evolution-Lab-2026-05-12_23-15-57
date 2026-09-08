// DunkSystem — Mode 1 Phase 6: the freestyle in-air dunk core.
//
// NBA Live 07/08's dunk contest was great because of THREE things this
// module implements as pure, testable logic:
//   1. TRICK-INPUT COMBOS — THPS2-style: hold a d-pad direction, tap a face
//      button, thrown DURING the flight window, each mapping to a distinct
//      dunk animation and difficulty. Chain two before the slam window and
//      it's a combo dunk (windmill → 360) worth more than its parts.
//   2. THE IN-AIR WINDOW — airtime is a budget set by approach speed and
//      launch quality; every trick spends window (showboating shrinks your
//      finish timing). Ambition is risk.
//   3. THE FINISH — the SLAM timing window closes the flight: accuracy vs
//      remaining window decides flush / clank / blown.
//
// Animation names are resolver-backed registry clips — distinct animation
// per trick today via the authored/aliased dunk suite.

import type { FelInput } from '../core/InputBus';

// ── Trick definitions ──────────────────────────────────────────────────────
// THPS2 / NBA Live 08 style: hold a d-pad DIRECTION, tap a FACE BUTTON — the
// combo fires immediately, no stick-swipe timing to fumble. This is the same
// grammar the board sports already use for grabs/flips (a direction plus a
// button), so the whole game now speaks one physical-input language, and it
// works identically on touch, keyboard, and a real pad (the old version only
// worked on a physical right stick — unreachable on touch or keyboard).
export interface DunkTrick {
  id: string;
  label: string;
  dir: 'up' | 'down' | 'left' | 'right';
  btn: 'A' | 'B' | 'Y';       // X is reserved (inert) on the touch deck for tricks
  clip: string;              // resolver-backed dunk animation
  difficulty: number;        // added to the attempt's difficulty
  windowCost: number;        // fraction of remaining air window consumed
}

export const DUNK_TRICKS: DunkTrick[] = [
  { id: 'windmill', label: 'WINDMILL', dir: 'up', btn: 'A', clip: 'dunk_off_board_windmill', difficulty: 2.4, windowCost: 0.30 },
  { id: 'spin360', label: '360', dir: 'right', btn: 'B', clip: 'dunk_360_scoop', difficulty: 2.8, windowCost: 0.34 },
  { id: 'eastbay', label: 'EASTBAY', dir: 'down', btn: 'Y', clip: 'dunk_360_eastbay', difficulty: 3.4, windowCost: 0.40 },
  { id: 'tomahawk', label: 'TOMAHAWK', dir: 'up', btn: 'Y', clip: 'dunk_finish_tomahawk', difficulty: 2.0, windowCost: 0.24 },
  { id: 'betweenlegs', label: 'BETWEEN THE LEGS', dir: 'down', btn: 'B', clip: 'dunk_360_fake_eastbay', difficulty: 3.8, windowCost: 0.46 },
  // DUNK-CONTROL-JUICE (2026-09-08): the named air dunks — same grammar (hold a direction, tap a button), authored bodies
  { id: 'scorpion', label: 'SCORPION', dir: 'right', btn: 'Y', clip: 'dunk_scorpion', difficulty: 3.2, windowCost: 0.36 },
  { id: 'lostfound', label: 'LOST & FOUND', dir: 'left', btn: 'B', clip: 'dunk_lost_found', difficulty: 3.6, windowCost: 0.42 },
  { id: 'hideseek', label: 'HIDE & SEEK', dir: 'left', btn: 'A', clip: 'dunk_hide_seek', difficulty: 3.0, windowCost: 0.38 },
];

// ── Runway tricks (DUNK-CONTROL-JUICE, 2026-09-08) ─────────────────────────
// Thrown DURING THE HOLD-RUN (the stick steers, so no direction is held): a bare face button while RUN is down. The
// self-lob and the kick-up put the ball in the air ahead of the dunker (a catch in the hang finishes them), the
// cartwheel tosses the lob itself and rolls under it, the double-up is the two-foot hop gather into the takeoff.
// None of them spend the air budget — they are judged as difficulty on top of the flight's own tricks.
export interface RunwayTrick {
  id: 'selflob' | 'kickup' | 'cartwheel' | 'doubleup';
  label: string;
  btn: 'A' | 'B' | 'X' | 'Y';
  clip: string;
  /** Clip seconds. */
  sec: number;
  difficulty: number;
  /** The ball leaves the body on this clip second (a toss / a kick); undefined = the ball stays in hand. */
  releaseAt?: number;
  /** The run keeps going under the beat at this fraction of the hold-run speed. */
  runScale: number;
}
export const RUNWAY_TRICKS: RunwayTrick[] = [
  { id: 'selflob', label: 'SELF-LOB', btn: 'Y', clip: 'dunk_self_lob', sec: 0.5, difficulty: 1.6, releaseAt: 0.3, runScale: 0.85 },
  { id: 'kickup', label: 'KICK-UP', btn: 'B', clip: 'dunk_kick_up', sec: 0.55, difficulty: 2.2, releaseAt: 0.32, runScale: 0.55 },
  { id: 'cartwheel', label: 'CARTWHEEL', btn: 'X', clip: 'dunk_cartwheel', sec: 0.8, difficulty: 2.8, releaseAt: 0.05, runScale: 0.7 },
  { id: 'doubleup', label: 'DOUBLE-UP', btn: 'A', clip: 'dunk_double_up', sec: 0.5, difficulty: 1.5, runScale: 0.6 },
];
export function runwayTrickFor(btn: string): RunwayTrick | null { return RUNWAY_TRICKS.find((t) => t.btn === btn) ?? null; }
/** The double-up is only a double-up inside the last stretch before the takeoff line (metres) at a real run (m/s). */
export const DOUBLE_UP_WINDOW_M = 1.8, DOUBLE_UP_MIN_SPEED = 4;
/** A dunk that catches its own toss (or a passer's) is judged on top of the flight. */
export const CATCH_DIFFICULTY = 1.2;

/** Combo bonus multiplier for chaining a second trick before the slam. */
export const COMBO_CHAIN_BONUS = 1.35;
/** Extra difficulty nod for a combo the judges haven't seen this contest. */
export const FRESH_COMBO_NOD = 0.5;

// ── Trick input recognizer ──────────────────────────────────────────────────
type Dir = 'up' | 'down' | 'left' | 'right';

export class GestureRecognizer {
  private heldDir: Dir | null = null;

  /** Feed raw input: d-pad presses set/clear the held direction; a face
   *  button tap while a direction is held looks up that combo's trick. A
   *  bare button press (no direction held) matches nothing here — DunkMode
   *  treats that as the separate STYLE TAP showboat, not a named trick. */
  feed(e: FelInput): DunkTrick | null {
    if (e.t === 'dpad') {
      if (e.pressed) this.heldDir = e.dir;
      else if (this.heldDir === e.dir) this.heldDir = null;
      return null;
    }
    if (e.t === 'button' && e.pressed && this.heldDir && (e.btn === 'A' || e.btn === 'B' || e.btn === 'Y')) {
      const dir = this.heldDir;
      return DUNK_TRICKS.find((t) => t.dir === dir && t.btn === e.btn) ?? null;
    }
    return null;
  }

  reset(): void { this.heldDir = null; }
}

// ── Dunk flight state machine ──────────────────────────────────────────────
export type DunkFlightPhase = 'idle' | 'airborne' | 'slamWindow' | 'finished';
export type DunkOutcome = 'flush' | 'clank' | 'blown';

export interface DunkAttempt {
  tricks: DunkTrick[];
  difficulty: number;
  isCombo: boolean;
}

export class DunkFlight {
  phase: DunkFlightPhase = 'idle';
  readonly recognizer = new GestureRecognizer();
  private tricks: DunkTrick[] = [];
  private airTotal = 0;
  private airLeft = 0;
  private baseDifficulty = 0;
  private slamWindow = 0.32;             // seconds of finish timing at full window

  /** Launch: approach speed (0..1) and style tier buy airtime. */
  launch(approachSpeed01: number, styleTier: number, approachDifficulty = 0): void {
    this.phase = 'airborne';
    this.tricks = [];
    this.rejectedForAir = false;
    // Free approach (2026-09-03): the angle and the takeoff foot are judged too.
    this.baseDifficulty = styleTier + approachDifficulty;
    this.airTotal = 0.85 + approachSpeed01 * 0.55 + styleTier * 0.05; // 0.85–1.8s
    this.airLeft = this.airTotal;
    this.recognizer.reset();
  }

  /** Set (once, consumable) when a recognized trick was refused because the
   *  air budget couldn't pay for it. Modes surface this — a silent refusal
   *  reads as a dropped input. */
  rejectedForAir = false;

  /** Mid-air: feed input; each recognized trick spends window. The air
   *  budget is now ENFORCED: a trick needs 30% of the air left, a combo
   *  trick 42% — so the run-up genuinely decides what exists in the air.
   *  Before this, `airTotal` was computed and never consulted: a walk-up and
   *  a full-speed runway attack had the same trick menu. */
  feedInput(e: FelInput): DunkTrick | null {
    this.rejectedForAir = false;
    const trick = this.recognizer.feed(e);
    if (!trick) return null;
    // A recognized trick in a spent budget is a REFUSAL, not a non-input —
    // whether the air ran out early (threshold) or entirely (slamWindow).
    if (this.phase === 'slamWindow') { this.rejectedForAir = true; return null; }
    if (this.phase !== 'airborne') return null;
    if (this.tricks.length >= 2) return null;
    const need = this.tricks.length === 0 ? 0.30 : 0.42;
    if (this.airRemaining01 < need) { this.rejectedForAir = true; return null; }
    this.tricks.push(trick);
    this.airLeft *= 1 - trick.windowCost;    // showboating costs air
    this.slamWindow *= 1 - trick.windowCost * 0.5;
    return trick;
  }

  update(dt: number): void {
    if (this.phase !== 'airborne') return;
    this.airLeft -= dt;
    if (this.airLeft <= this.airTotal * 0.28) this.phase = 'slamWindow';
  }

  /** The attempt summary for scoring/animation. */
  get attempt(): DunkAttempt {
    const isCombo = this.tricks.length >= 2;
    const raw = this.baseDifficulty + this.tricks.reduce((s, t) => s + t.difficulty, 0);
    return {
      tricks: [...this.tricks],
      difficulty: isCombo ? raw * COMBO_CHAIN_BONUS : raw,
      isCombo,
    };
  }

  get currentTrick(): DunkTrick | null { return this.tricks[this.tricks.length - 1] ?? null; }
  get inSlamWindow(): boolean { return this.phase === 'slamWindow'; }
  get airRemaining01(): number { return this.airTotal > 0 ? Math.max(0, this.airLeft / this.airTotal) : 0; }
  /** Product of each trick's window tax — modes multiply their slam window
   *  by this (showboating tightens the finish, like Live's risk ladder). */
  get slamWindowScale(): number {
    return this.tricks.reduce((s, t) => s * (1 - t.windowCost * 0.5), 1);
  }

  /** Finish with a timing accuracy (0..1 — 1 = dead-center slam press). */
  finish(accuracy01: number): DunkOutcome {
    this.phase = 'finished';
    const need = 1 - Math.min(0.9, this.slamWindow);   // harder windows demand accuracy
    if (accuracy01 >= Math.max(0.55, need)) return 'flush';
    if (accuracy01 >= 0.3) return 'clank';
    return 'blown';
  }

  reset(): void {
    this.phase = 'idle';
    this.tricks = [];
    this.rejectedForAir = false;
    this.recognizer.reset();
  }
}
