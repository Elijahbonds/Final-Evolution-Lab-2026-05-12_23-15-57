// QuizCore — the shared engine for BOTH quiz modes.
//
// Brain Brawl and Who Scene It are the same game with different prompts: a
// timed question, four options, a streak that pays, and an opponent answering
// alongside you. So this is written once and each mode is a content pack plus
// a config — the reasoning that made RallyCore serve tennis and volleyball,
// and BasketballCore serve 1v1/3v3/dunk.
//
// Babylon-free and React-free, so it can be executed as a test rather than
// only read.
//
// SCORING SHAPE, AND WHY
// Speed matters more than certainty in a party quiz, but not so much that a
// lucky fast guess beats a considered correct answer. So points are
//   base + speedBonus × remainingFraction
// with a streak multiplier applied on top. A wrong answer breaks the streak
// but never goes negative: a mode people play with friends should not punish
// falling behind so hard that the loser stops playing.

export interface QuizOption {
  id: string;
  label: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: QuizOption[];
  /** id of the correct option. */
  answer: string;
  /** Optional: a venue id to render behind the question (Who Scene It). */
  sceneVenueId?: string;
  /** Shown after answering. Teaching beats scolding. */
  explain?: string;
  difficulty: 1 | 2 | 3;
}

export interface QuizPack {
  id: string;
  title: string;
  questions: QuizQuestion[];
}

export interface QuizConfig {
  /** Seconds per question. */
  timeLimit: number;
  basePoints: number;
  speedBonus: number;
  /** Multiplier added per streak step, capped by maxStreakMultiplier. */
  streakStep: number;
  maxStreakMultiplier: number;
  questionsPerRound: number;
}

export const BRAIN_BRAWL: QuizConfig = {
  timeLimit: 10, basePoints: 100, speedBonus: 100,
  streakStep: 0.25, maxStreakMultiplier: 2.5, questionsPerRound: 10,
};

/** Longer clock: you are looking at a rendered venue and identifying it, which
 *  takes longer than recalling a fact. */
export const WHO_SCENE_IT: QuizConfig = {
  timeLimit: 14, basePoints: 120, speedBonus: 120,
  streakStep: 0.25, maxStreakMultiplier: 2.5, questionsPerRound: 8,
};

export type AnswerOutcome = 'correct' | 'wrong' | 'timeout';

export interface AnswerResult {
  outcome: AnswerOutcome;
  points: number;
  streak: number;
  multiplier: number;
  correctId: string;
}

/** Deterministic PRNG so a seeded round is reproducible — same reasoning as
 *  DanceCore: an unrepeatable round cannot be retried or shared. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates. Used for both question order and option order. */
export function shuffle<T>(items: T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Draw a round. Options are shuffled too — otherwise the correct answer sits
 * in the position the author happened to write it, and players learn the
 * position instead of the material.
 */
export function drawRound(pack: QuizPack, cfg: QuizConfig, seed: number): QuizQuestion[] {
  const rnd = mulberry32(seed);
  const picked = shuffle(pack.questions, rnd).slice(0, cfg.questionsPerRound);
  return picked.map((q) => ({ ...q, options: shuffle(q.options, rnd) }));
}

export function scoreAnswer(
  cfg: QuizConfig, correct: boolean, secondsLeft: number, streakBefore: number,
): { points: number; streak: number; multiplier: number } {
  if (!correct) return { points: 0, streak: 0, multiplier: 1 };
  const streak = streakBefore + 1;
  const multiplier = Math.min(cfg.maxStreakMultiplier, 1 + (streak - 1) * cfg.streakStep);
  const remaining = Math.max(0, Math.min(1, secondsLeft / cfg.timeLimit));
  const raw = cfg.basePoints + cfg.speedBonus * remaining;
  return { points: Math.round(raw * multiplier), streak, multiplier };
}

export interface QuizPlayerState {
  score: number;
  streak: number;
  answered: number;
  correct: number;
}

const freshPlayer = (): QuizPlayerState => ({ score: 0, streak: 0, answered: 0, correct: 0 });

/**
 * A two-player round. The opponent is an AI whose accuracy and reaction time
 * are config, so the same class serves a solo practice run and a duel.
 */
export class QuizRound {
  readonly questions: QuizQuestion[];
  private cfg: QuizConfig;
  index = 0;
  /** Seconds remaining on the current question. */
  timeLeft: number;
  you: QuizPlayerState = freshPlayer();
  foe: QuizPlayerState = freshPlayer();
  /** Set once the current question is resolved for the human. */
  resolved = false;
  finished = false;

  private foeAnswerAt: number | null = null;
  private rnd: () => number;
  private foeSkill: number;
  private foeSpeed: number;

  /**
   * @param foeSkill 0–1 chance the opponent answers correctly.
   * @param foeSpeed 0–1; higher answers sooner.
   */
  constructor(questions: QuizQuestion[], cfg: QuizConfig, seed = 1, foeSkill = 0.65, foeSpeed = 0.5) {
    this.questions = questions;
    this.cfg = cfg;
    this.timeLeft = cfg.timeLimit;
    this.rnd = mulberry32(seed ^ 0x9e37);
    this.foeSkill = foeSkill;
    this.foeSpeed = foeSpeed;
    this.armFoe();
  }

  get current(): QuizQuestion | null {
    return this.questions[this.index] ?? null;
  }

  private armFoe(): void {
    // The opponent commits to an answer time up front. Deciding it lazily
    // would let a slow human "outrun" an opponent that never actually
    // scheduled a response.
    const earliest = this.cfg.timeLimit * 0.15;
    const latest = this.cfg.timeLimit * (1 - this.foeSpeed * 0.7);
    this.foeAnswerAt = earliest + this.rnd() * Math.max(0.1, latest - earliest);
  }

  /** Advance the clock. Returns events the mode should react to. */
  tick(dt: number): { foeAnswered?: AnswerResult; timedOut?: boolean } {
    if (this.finished || !this.current) return {};
    const out: { foeAnswered?: AnswerResult; timedOut?: boolean } = {};

    const before = this.timeLeft;
    this.timeLeft = Math.max(0, this.timeLeft - dt);

    // opponent answers at its committed moment
    if (this.foeAnswerAt !== null) {
      const elapsedBefore = this.cfg.timeLimit - before;
      const elapsedNow = this.cfg.timeLimit - this.timeLeft;
      if (elapsedBefore < this.foeAnswerAt && elapsedNow >= this.foeAnswerAt) {
        const correct = this.rnd() < this.foeSkill;
        const s = scoreAnswer(this.cfg, correct, this.timeLeft, this.foe.streak);
        this.foe.score += s.points;
        this.foe.streak = s.streak;
        this.foe.answered++;
        if (correct) this.foe.correct++;
        this.foeAnswerAt = null;
        out.foeAnswered = {
          outcome: correct ? 'correct' : 'wrong',
          points: s.points, streak: s.streak, multiplier: s.multiplier,
          correctId: this.current.answer,
        };
      }
    }

    if (this.timeLeft <= 0 && !this.resolved) {
      this.you.streak = 0;
      this.you.answered++;
      this.resolved = true;
      out.timedOut = true;
    }
    return out;
  }

  /** The human answers. Ignored once resolved, so a double-tap cannot double-score. */
  answer(optionId: string): AnswerResult | null {
    const q = this.current;
    if (!q || this.resolved || this.finished) return null;
    const correct = optionId === q.answer;
    const s = scoreAnswer(this.cfg, correct, this.timeLeft, this.you.streak);
    this.you.score += s.points;
    this.you.streak = s.streak;
    this.you.answered++;
    if (correct) this.you.correct++;
    this.resolved = true;
    return {
      outcome: correct ? 'correct' : 'wrong',
      points: s.points, streak: s.streak, multiplier: s.multiplier, correctId: q.answer,
    };
  }

  /** Move to the next question. Returns false when the round is over. */
  next(): boolean {
    if (this.index + 1 >= this.questions.length) {
      this.finished = true;
      return false;
    }
    this.index++;
    this.timeLeft = this.cfg.timeLimit;
    this.resolved = false;
    this.armFoe();
    return true;
  }

  get winner(): 'you' | 'foe' | 'draw' {
    if (this.you.score > this.foe.score) return 'you';
    if (this.foe.score > this.you.score) return 'foe';
    return 'draw';
  }

  get accuracy(): number {
    return this.you.answered === 0 ? 0 : this.you.correct / this.you.answered;
  }
}
