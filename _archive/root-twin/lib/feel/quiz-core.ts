/**
 * lib/feel/quiz-core.ts
 * =====================
 * M9 — mode-agnostic timed multiple-choice engine (Rhythm/UI archetype).
 *
 * Direct TypeScript port of the proven engineering-line `QuizCore`
 * (systems__QuizCore.js). Shared primitive for the quiz modes (Brain Brawl,
 * Who-Scene-It). Question banks are DATA — the core only handles shuffling,
 * per-question countdowns, streak/multiplier scoring and result tallies.
 * Answering faster earns more of the question's points.
 *
 * Deterministic: inject `rng` for seeded shuffles (replay honesty) and `now`
 * (a fixed clock) for headless tests. Pure logic, no THREE / DOM.
 */

export interface QuizQuestion {
  q: string;
  options: string[];
  /** Index of the correct option. */
  answer: number;
  /** Base points for this question (default 100). // TUNE(elijah) */
  points?: number;
}

export interface QuizCoreOpts {
  questions: QuizQuestion[];
  /** Countdown per question (ms). // TUNE(elijah) */
  questionTimeMs?: number;
  /** Multiplier added per streak step. // TUNE(elijah) */
  streakStep?: number;
  /** Multiplier ceiling. // TUNE(elijah) */
  maxMultiplier?: number;
  /** Seeded RNG for deterministic shuffles. */
  rng?: () => number;
  /** Monotonic clock (ms). Inject a fixed clock for determinism. */
  now?: () => number;
}

export type QuizResult =
  | { result: 'correct'; earned: number; correctIndex: number }
  | { result: 'wrong'; correctIndex: number }
  | { result: 'timeout'; correctIndex: number }
  | { result: 'done' };

export interface QuizStats {
  correct: number;
  wrong: number;
  timeout: number;
}

export class QuizCore {
  questionTimeMs: number;
  streakStep: number;
  maxMultiplier: number;
  private _rng: () => number;
  private _now: () => number;
  private _deck: QuizQuestion[];
  index = -1;
  current: QuizQuestion | null = null;
  private _askedAt = 0;
  score = 0;
  streak = 0;
  stats: QuizStats = { correct: 0, wrong: 0, timeout: 0 };
  finished = false;

  constructor({ questions, questionTimeMs = 12000, streakStep = 0.25, maxMultiplier = 3, rng, now }: QuizCoreOpts) {
    this._rng = rng ?? Math.random;
    this._now = now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.questionTimeMs = questionTimeMs; // TUNE(elijah)
    this.streakStep = streakStep; // TUNE(elijah)
    this.maxMultiplier = maxMultiplier; // TUNE(elijah)
    this._deck = this._shuffle([...(questions ?? [])]);
  }

  private _shuffle(arr: QuizQuestion[]): QuizQuestion[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this._rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  get multiplier(): number {
    return Math.min(this.maxMultiplier, 1 + this.streak * this.streakStep);
  }

  get total(): number {
    return this._deck.length;
  }

  /** Advance to the next question (null when the deck is done). */
  next(): QuizQuestion | null {
    this.index += 1;
    if (this.index >= this._deck.length) {
      this.current = null;
      this.finished = true;
      return null;
    }
    this.current = this._deck[this.index];
    this._askedAt = this._now();
    return this.current;
  }

  /** Remaining ms on the current question (0 = expired). */
  remainingMs(): number {
    if (!this.current) return 0;
    return Math.max(0, this.questionTimeMs - (this._now() - this._askedAt));
  }

  /** Call when the timer hits zero without an answer. */
  timeout(): QuizResult {
    if (!this.current) return { result: 'done' };
    this.stats.timeout += 1;
    this.streak = 0;
    const correctIndex = this.current.answer;
    return { result: 'timeout', correctIndex };
  }

  /** Answer the current question with an option index. */
  answer(optionIndex: number): QuizResult {
    if (!this.current) return { result: 'done' };
    const q = this.current;
    if (optionIndex === q.answer) {
      const speedFactor = 0.5 + 0.5 * (this.remainingMs() / this.questionTimeMs); // 0.5..1
      const earned = Math.round((q.points ?? 100) * this.multiplier * speedFactor);
      this.score += earned;
      this.streak += 1;
      this.stats.correct += 1;
      return { result: 'correct', earned, correctIndex: q.answer };
    }
    this.streak = 0;
    this.stats.wrong += 1;
    return { result: 'wrong', correctIndex: q.answer };
  }
}

export default QuizCore;
