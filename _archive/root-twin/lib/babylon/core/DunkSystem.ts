// DunkSystem — Mode 1 Phase 6: the freestyle in-air dunk core.
//
// NBA Live 07/08's dunk contest was great because of THREE things this
// module implements as pure, testable logic:
//   1. TRICK-INPUT COMBOS — real gesture sequences (stick snaps / button
//      taps) thrown DURING the flight window, each mapping to a distinct
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
export interface DunkTrick {
  id: string;
  label: string;
  /** Stick gesture tokens, e.g. ['down','up'] = snap down then up. */
  gesture: string[];
  clip: string;              // resolver-backed dunk animation
  difficulty: number;        // added to the attempt's difficulty
  windowCost: number;        // fraction of remaining air window consumed
}

export const DUNK_TRICKS: DunkTrick[] = [
  { id: 'windmill', label: 'WINDMILL', gesture: ['down', 'up'], clip: 'dunk_off_board_windmill', difficulty: 2.4, windowCost: 0.30 },
  { id: 'spin360', label: '360', gesture: ['left', 'right'], clip: 'dunk_360_scoop', difficulty: 2.8, windowCost: 0.34 },
  { id: 'eastbay', label: 'EASTBAY', gesture: ['down', 'left'], clip: 'dunk_360_eastbay', difficulty: 3.4, windowCost: 0.40 },
  { id: 'tomahawk', label: 'TOMAHAWK', gesture: ['up', 'down'], clip: 'dunk_finish_tomahawk', difficulty: 2.0, windowCost: 0.24 },
  { id: 'betweenlegs', label: 'BETWEEN THE LEGS', gesture: ['right', 'left', 'right'], clip: 'dunk_360_fake_eastbay', difficulty: 3.8, windowCost: 0.46 },
];

/** Combo bonus multiplier for chaining a second trick before the slam. */
export const COMBO_CHAIN_BONUS = 1.35;
/** Extra difficulty nod for a combo the judges haven't seen this contest. */
export const FRESH_COMBO_NOD = 0.5;

// ── Gesture recognizer ─────────────────────────────────────────────────────
type Token = 'up' | 'down' | 'left' | 'right' | 'tap';
const STICK_THRESH = 0.7;
const GESTURE_TIMEOUT_MS = 900;

export class GestureRecognizer {
  private tokens: { t: Token; at: number }[] = [];
  private lastDir: Token | null = null;

  /** Feed raw input events. Stick direction EDGES become tokens (crossing
   *  the threshold into a new cardinal), B-button presses become 'tap'. */
  feed(e: FelInput, now = performance.now()): void {
    if (e.t === 'stick' && e.side === 'R') {
      let dir: Token | null = null;
      if (Math.abs(e.x) > Math.abs(e.y)) {
        if (Math.abs(e.x) > STICK_THRESH) dir = e.x > 0 ? 'right' : 'left';
      } else if (Math.abs(e.y) > STICK_THRESH) {
        dir = e.y > 0 ? 'up' : 'down';
      }
      if (dir && dir !== this.lastDir) {
        this.tokens.push({ t: dir, at: now });
      }
      this.lastDir = dir;
    }
    if (e.t === 'button' && e.btn === 'B' && e.pressed) {
      this.tokens.push({ t: 'tap', at: now });
    }
    // expire old tokens
    this.tokens = this.tokens.filter((tk) => now - tk.at <= GESTURE_TIMEOUT_MS);
  }

  /** Match the longest trick gesture ending NOW. Consumes matched tokens. */
  match(now = performance.now()): DunkTrick | null {
    this.tokens = this.tokens.filter((tk) => now - tk.at <= GESTURE_TIMEOUT_MS);
    let best: DunkTrick | null = null;
    for (const trick of DUNK_TRICKS) {
      const g = trick.gesture;
      if (g.length > this.tokens.length) continue;
      const tail = this.tokens.slice(-g.length).map((x) => x.t);
      if (g.every((tok, i) => tok === tail[i])) {
        if (!best || g.length > best.gesture.length) best = trick;
      }
    }
    if (best) this.tokens.length = 0;
    return best;
  }

  reset(): void { this.tokens = []; this.lastDir = null; }
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
  launch(approachSpeed01: number, styleTier: number): void {
    this.phase = 'airborne';
    this.tricks = [];
    this.baseDifficulty = styleTier;
    this.airTotal = 0.85 + approachSpeed01 * 0.55 + styleTier * 0.05; // 0.85–1.8s
    this.airLeft = this.airTotal;
    this.recognizer.reset();
  }

  /** Mid-air: feed input; each recognized trick spends window. */
  feedInput(e: FelInput, now?: number): DunkTrick | null {
    if (this.phase !== 'airborne') return null;
    this.recognizer.feed(e, now);
    const trick = this.recognizer.match(now);
    if (trick && this.tricks.length < 2) {
      this.tricks.push(trick);
      this.airLeft *= 1 - trick.windowCost;    // showboating costs air
      this.slamWindow *= 1 - trick.windowCost * 0.5;
    }
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
    this.recognizer.reset();
  }
}
