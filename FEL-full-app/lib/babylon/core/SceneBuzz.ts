// SceneBuzz — Who Scene It as a PARTY round (A+ mission #2; benchmark Wii Sports Resort floor + Mario Party readability).
//
// The live mode asked one player eight questions in a row. The A+ spec asks for four scene CATEGORIES, local buzz-in for
// two or more players on one screen, and rounds with a scoreboard between them. Everything here is pure (no Babylon, no
// DOM) so it is tested and so the mode file only wires input and venues.
//
// Buzz-in rules: the first player to answer LOCKS the question. Correct = that player's points (speed + streak, from
// QuizCore's scoreAnswer). Wrong = that player is out for the question and the other players may still answer (a steal)
// with whatever clock is left. Everyone wrong, or the clock: nobody scores and streaks reset for those who missed.

import { scoreAnswer, type QuizConfig, type QuizPack, type QuizQuestion } from './QuizCore';

export interface SceneCategory {
  id: 'courts' | 'combat' | 'outdoors' | 'stages';
  name: string;
  /** VENUE_SPECS keys whose questions belong here. */
  venueIds: readonly string[];
  color: string;
}

export const SCENE_CATEGORIES: readonly SceneCategory[] = [
  { id: 'courts', name: 'COURTS', venueIds: ['basketball_h2h', 'basketball_dunk', 'basketball_3v3', 'basketball_irl', 'court_carnival', 'tennis', 'volleyball'], color: '#F4C542' },
  { id: 'combat', name: 'COMBAT', venueIds: ['karate_h2h', 'karate_endless'], color: '#FF5E7A' },
  { id: 'outdoors', name: 'OUTDOORS', venueIds: ['surfing', 'snowboarding', 'skateboarding', 'golf', 'golf_loop', 'soccer', 'penalty', 'football', 'football_rush', 'baseball', 'derby'], color: '#7CE577' },
  { id: 'stages', name: 'STAGES', venueIds: ['gymnastics', 'dance', 'brain_brawl', 'who_scene_it', 'market_browse'], color: '#C58BFF' },
];

export function categoryOf(venueId: string | undefined): SceneCategory | null {
  if (!venueId) return null;
  return SCENE_CATEGORIES.find((c) => c.venueIds.includes(venueId)) ?? null;
}

export interface SceneRound {
  category: SceneCategory;
  questions: QuizQuestion[];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** One round per category that has questions, `perCategory` questions each, categories and questions shuffled by seed.
 *  Options are shuffled too, so the right answer is not always the first card. */
export function buildRounds(pack: QuizPack, seed: number, perCategory = 2): SceneRound[] {
  const rnd = mulberry32(seed);
  const rounds: SceneRound[] = [];
  for (const cat of shuffled(SCENE_CATEGORIES, rnd)) {
    const pool = pack.questions.filter((q) => categoryOf(q.sceneVenueId)?.id === cat.id);
    if (pool.length === 0) continue;
    const picked = shuffled(pool, rnd).slice(0, perCategory).map((q) => ({ ...q, options: shuffled(q.options, rnd) }));
    rounds.push({ category: cat, questions: picked });
  }
  return rounds;
}

export interface BuzzPlayer {
  name: string;
  score: number;
  streak: number;
  correct: number;
  /** Categories (round ids) this player won. */
  won: string[];
}

export type Resolution =
  | { kind: 'correct'; player: number; points: number; multiplier: number }
  | { kind: 'nobody'; timeout: boolean };

export const MAX_PLAYERS = 2;
export const PLAYER_NAMES = ['P1', 'P2'] as const;

/** The match: rounds of questions, players buzzing in, a scoreboard between rounds. */
export class BuzzMatch {
  readonly players: BuzzPlayer[];
  roundIndex = 0;
  questionIndex = 0;
  /** Per-question: players who answered wrong and are out until the next question. */
  private lockedOut = new Set<number>();
  /** Per-round points, to decide who takes the category. */
  private roundPoints: number[];
  resolved = false;
  finished = false;

  constructor(readonly rounds: SceneRound[], private cfg: QuizConfig, playerCount = 1) {
    const n = Math.max(1, Math.min(MAX_PLAYERS, playerCount));
    this.players = Array.from({ length: n }, (_, i) => ({ name: PLAYER_NAMES[i], score: 0, streak: 0, correct: 0, won: [] }));
    this.roundPoints = this.players.map(() => 0);
    if (rounds.length === 0 || rounds.every((r) => r.questions.length === 0)) this.finished = true;
  }

  get round(): SceneRound | null { return this.rounds[this.roundIndex] ?? null; }
  get question(): QuizQuestion | null { return this.round?.questions[this.questionIndex] ?? null; }
  get totalQuestions(): number { return this.rounds.reduce((s, r) => s + r.questions.length, 0); }
  /** 1-based position across the whole match, for the "3 / 8" readout. */
  get questionNumber(): number {
    let n = 0;
    for (let i = 0; i < this.roundIndex; i++) n += this.rounds[i].questions.length;
    return n + this.questionIndex + 1;
  }
  isLockedOut(player: number): boolean { return this.lockedOut.has(player); }

  /** A player picks option `choice` with `secondsLeft` on the clock. Returns the resolution when the question ends,
   *  'wrong' when that player is out but others may still answer, or null when the input did nothing. */
  answer(player: number, choice: number, secondsLeft: number): Resolution | 'wrong' | null {
    const q = this.question;
    if (!q || this.resolved || this.finished) return null;
    if (player < 0 || player >= this.players.length || this.lockedOut.has(player)) return null;
    const picked = q.options[choice];
    if (!picked) return null;
    const p = this.players[player];
    if (picked.id === q.answer) {
      const r = scoreAnswer(this.cfg, true, secondsLeft, p.streak);
      p.score += r.points; p.streak = r.streak; p.correct++;
      this.roundPoints[player] += r.points;
      // everyone else who did not buzz keeps their streak; the ones who buzzed wrong already lost it
      this.resolved = true;
      return { kind: 'correct', player, points: r.points, multiplier: r.multiplier };
    }
    p.streak = 0;
    this.lockedOut.add(player);
    if (this.lockedOut.size >= this.players.length) { this.resolved = true; return { kind: 'nobody', timeout: false }; }
    return 'wrong';
  }

  /** The clock ran out on the current question. */
  timeout(): Resolution | null {
    if (!this.question || this.resolved || this.finished) return null;
    for (let i = 0; i < this.players.length; i++) if (!this.lockedOut.has(i)) this.players[i].streak = 0;
    this.resolved = true;
    return { kind: 'nobody', timeout: true };
  }

  /** Step to the next question. Returns 'round' when a round just closed (show the scoreboard), 'question' for the
   *  next question inside the round, or 'match' when the whole match is over. */
  advance(): 'question' | 'round' | 'match' {
    if (this.finished) return 'match';
    this.resolved = false;
    this.lockedOut.clear();
    const r = this.round!;
    if (this.questionIndex + 1 < r.questions.length) { this.questionIndex++; return 'question'; }
    // round over: the category goes to the round's top scorer (a tie goes to nobody)
    const best = Math.max(...this.roundPoints);
    const winners = this.roundPoints.map((v, i) => (v === best && best > 0 ? i : -1)).filter((i) => i >= 0);
    if (winners.length === 1) this.players[winners[0]].won.push(r.category.id);
    this.roundPoints = this.players.map(() => 0);
    this.roundIndex++;
    this.questionIndex = 0;
    if (this.roundIndex >= this.rounds.length) { this.finished = true; return 'match'; }
    return 'round';
  }

  /** Winner index, or -1 for a tie / solo. */
  get leader(): number {
    if (this.players.length < 2) return -1;
    const s = this.players.map((p) => p.score);
    const best = Math.max(...s);
    const idx = s.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0);
    return idx.length === 1 ? idx[0] : -1;
  }

  /** Bezel scoreboard rows (HudScoreCard shape: name · score · line). */
  scoreboard(): { name: string; score: number; line: string }[] {
    return this.players.map((p) => ({
      name: p.name,
      score: p.score,
      line: p.won.length ? p.won.map((id) => SCENE_CATEGORIES.find((c) => c.id === id)?.name ?? id).join(' · ') : '—',
    }));
  }
}
