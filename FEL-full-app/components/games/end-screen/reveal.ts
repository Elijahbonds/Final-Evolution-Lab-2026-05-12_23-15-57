// THE REVEAL — the order the finish plays in, how long each beat takes, and how A skips it.
//
// Pure: the component feeds it the run's data and a clock; the tests drive it directly.
//
//   1. THE MOMENT  — the headline slams in, the score counts up, the grade badge (when the mode sent one).
//   2. THE REWARDS — once the server has answered: the callouts (best, win run, streak), then each reward the run
//                    actually earned, one at a time (XP, wallet coins, shards, credits, PRQ, the player level bar with
//                    any LEVEL UP, the season bar with any TIER UP, mastery, today's goals, the story node), or the
//                    honest state instead (NO PLAY, unpaid, capped — and "Coin limit reached today").
//   3. THE OUTCOMES — the Arena / friend-challenge verdicts, when those answers have landed.
//   4. PROGRESS    — what is next to earn, from real numbers only.
// "What's next" (Play again, Next, All modes) is NOT a step: it is on screen from the first frame, and Play again is armed
// after ARM_MS — a press carried over from the last second of play never fires it.
//
// PACE: every beat has a base length, and the whole list is scaled to fit REVEAL_BUDGET_MS (the brief: ≤ ~4 s if not
// skipped). The budget counts the card's own beats, not the server's round-trip: the rewards wait for the answer, and a
// slow answer shows "Tallying rewards…" until it lands. A (Enter, a tap on the panel) reveals everything at once; under
// reduced motion everything is revealed from the first frame.

export type StepId =
  | 'moment' | 'score' | 'grade'
  | 'callouts' | 'noplay' | 'unpaid' | 'cap'
  | 'xp' | 'coins' | 'shards' | 'credits' | 'prq' | 'level' | 'season' | 'mastery' | 'goals' | 'story' | 'storyRefused'
  | 'arena' | 'mp' | 'challenge'
  | 'progress';

export const REVEAL_BUDGET_MS = 4000;
/** Nothing on the card can be activated by A / Enter / a tap before this (a held or mashed button at the final whistle). */
export const ARM_MS = 450;

export const BASE_MS: Record<StepId, number> = {
  moment: 700, score: 650, grade: 320,
  callouts: 380, noplay: 400, unpaid: 400, cap: 300,
  xp: 380, coins: 380, shards: 340, credits: 340, prq: 380, level: 600, season: 800, mastery: 420, goals: 420, story: 450, storyRefused: 400,
  arena: 380, mp: 380, challenge: 380,
  progress: 320,
};
/** Each season tier crossed adds this to the season beat (the bar fills, flashes, starts again); each level crossed adds
 *  it to the level beat the same way. */
export const TIER_UP_MS = 380;

export interface StepData {
  hasGrade: boolean;
  /** null = the server has not answered yet. */
  recap: null | {
    noPlay?: boolean; unpaid?: string; capMessage?: string;
    xp: number; shards: number; credits: number; prqDelta: number;
    season?: { tierUps: unknown[] } | null;
    mastery?: { ups: unknown[] } | null;
  };
  coins: { coins: number; capped: boolean } | null;
  hasCallouts: boolean;
  storyReward: boolean;
  storyRefused: boolean;
  arena: boolean;
  mp: boolean;
  challenge: boolean;
  hasProgress: boolean;
  /** IMPROVE (2026-10-06): the level bar has its numbers (the answer's profileXp and xp). */
  hasLevel?: boolean;
  /** IMPROVE (2026-10-06): the answer carried today's goals. */
  hasGoals?: boolean;
}

/** PURE: the beats this run plays, in order. */
export function buildSteps(d: StepData): StepId[] {
  const out: StepId[] = ['moment', 'score'];
  if (d.hasGrade) out.push('grade');
  const r = d.recap;
  if (!r) return out;   // the moment plays while the server answers; the rest waits for it
  if (d.hasCallouts) out.push('callouts');
  if (r.noPlay) {
    out.push('noplay');
  } else {
    if (r.unpaid) out.push('unpaid');
    if (r.capMessage) out.push('cap');
    if (!r.unpaid) {
      if (r.xp > 0) out.push('xp');
      // ECONOMY-CAPS F-P1: never a "+0" coins tile. IMPROVE (2026-10-06, owner decision): a cap that cut the earn to
      // nothing is said — the coins beat shows "Coin limit reached today" instead of no tile at all
      if (d.coins && (d.coins.coins > 0 || d.coins.capped)) out.push('coins');
      if (r.shards > 0) out.push('shards');
      if (r.credits > 0) out.push('credits');
      if (r.prqDelta !== 0) out.push('prq');
      if (d.hasLevel && r.xp > 0) out.push('level');
    }
  }
  if (d.storyRefused) out.push('storyRefused');
  if (d.storyReward) out.push('story');
  if (d.mp) out.push('mp');
  if (d.challenge) out.push('challenge');
  if (d.arena) out.push('arena');
  if (r.season) out.push('season');
  if (r.mastery && r.mastery.ups.length > 0) out.push('mastery');
  if (d.hasGoals && !r.noPlay && !r.unpaid) out.push('goals');
  if (d.hasProgress) out.push('progress');
  return out;
}

/** PURE: each beat's length, the whole list scaled down (never up) to fit the budget. */
export function stepDurations(steps: readonly StepId[], tierUps = 0, budget = REVEAL_BUDGET_MS, levelUps = 0): number[] {
  const crossings = (n: number) => Math.min(3, Math.max(0, n)) * TIER_UP_MS;
  const base = steps.map((s) => BASE_MS[s] + (s === 'season' ? crossings(tierUps) : s === 'level' ? crossings(levelUps) : 0));
  const total = base.reduce((a, b) => a + b, 0);
  const k = total > budget ? budget / total : 1;
  return base.map((ms) => Math.round(ms * k));
}

export interface RevealState {
  /** How many beats are on screen. */
  shown: number;
  /** A was pressed (or reduced motion): every beat, present and future, is on screen. */
  skipped: boolean;
}

export type RevealAction = { type: 'advance'; total: number } | { type: 'skip' };

export function initialReveal(reduced: boolean): RevealState {
  return { shown: reduced ? 0 : 1, skipped: reduced };
}

/** PURE: one beat on, or everything at once. */
export function revealReducer(s: RevealState, a: RevealAction): RevealState {
  if (a.type === 'skip') return s.skipped ? s : { ...s, skipped: true };
  if (s.skipped || s.shown >= a.total) return s;
  return { ...s, shown: s.shown + 1 };
}

export function isShown(s: RevealState, index: number): boolean {
  return s.skipped || index < s.shown;
}

/** The sequence has nothing left to play (for the beats known so far). */
export function revealDone(s: RevealState, total: number): boolean {
  return s.skipped || s.shown >= total;
}

/** What A does right now: before ARM_MS nothing; while beats are still to come, it skips; after, it presses the focus. */
export function pressIntent(s: RevealState, total: number, sinceMountMs: number): 'ignore' | 'skip' | 'activate' {
  if (sinceMountMs < ARM_MS) return 'ignore';
  return revealDone(s, total) ? 'activate' : 'skip';
}

/** The sound and buzz each beat plays — presentation only. */
export type Cue = 'tick' | 'win' | 'levelUp' | 'record' | 'soft';
export function cueFor(step: StepId, ctx: { won: boolean; newBest: boolean; tierUps: number; levelUps?: number; goalsDone?: number }): Cue {
  switch (step) {
    case 'moment': return ctx.won ? 'win' : 'soft';
    case 'callouts': return ctx.newBest ? 'record' : 'tick';
    case 'season': return ctx.tierUps > 0 ? 'levelUp' : 'tick';
    case 'level': return (ctx.levelUps ?? 0) > 0 ? 'levelUp' : 'tick';
    case 'goals': return (ctx.goalsDone ?? 0) > 0 ? 'record' : 'tick';
    case 'mastery': return 'levelUp';
    case 'noplay': case 'unpaid': case 'cap': case 'storyRefused': return 'soft';
    default: return 'tick';
  }
}
