// WHAT A STORY NODE MAY ASK FOR, MODE BY MODE.
//
// HOTFIX (2026-09-24): the Nexus Initiative's targets were one 400–1,650 ladder across thirteen modes that do not
// share a scale. Ones ends at 11 points, tennis at 4 games, the shootout pays 20 a goal — so the first node of the
// campaign asked a 1v1 for 400 and nobody could ever clear it. lib/babylon/core/scoreScale.ts refuses to guess a
// mode's scale, and so does this file: every line below says what a session's `score` counts in that mode and
// what the mode's OWN rules (or a measured run) show a player posts, with the evidence written next to it.
//
// `reach` is the most a node may ask. It is never a hoped-for number: it is the mode's win line, a par the mode
// defines, a total its rules guarantee for a defined outcome, or a measured run. lib/story-yardstick.test.ts
// re-derives each one from the mode's code (running the pure rule cores where they exist) and holds every one of
// the 52 nodes under its mode's reach — so a retune that outruns the evidence fails in CI instead of in a player's
// hands.
//
// Derived from the live Babylon hosts' code (and training's DOM game, its only host) — karate's is the one measured
// line (scoreScale's 1,250 run); every other number is read off the rules, none was played live for this file. The
// NEXT_PUBLIC_DISABLE_3D fallbacks score differently and are not held here.
//
// HOTFIX (2026-09-24): a rule path to a win is not a player beating the AI. `winEvidence` says why a bare "win it"
// boss is within a player's reach — the win is against the course (no rival to out-balance) or a run is on record
// winning it. A mode with none (Ones, Beach Rally, the shootout: no recorded run has beaten those rivals under
// the current code) may still ask for the win, but its boss must also take a score on the mode's line (`orScore`
// on the node), so AI balance can never become the campaign's dead end.
//
// Pure data: no Prisma, no Babylon, no React — the completion route, GET /api/story and the tests all read it.

import { MODE_INFO } from './game-data';

export interface StoryYardstick {
  /** What `score` counts in this mode, [one, many]. */
  unit: readonly [string, string];
  /** How a score goal reads on the node card: "Score 8 points", "Take 2 games". */
  verb: string;
  /** The mode posts `won: true` from its own rules, so a node may ask for a win. */
  postsWin: boolean;
  /** How a win goal reads on the node card (only meaningful when postsWin). */
  winGoal: string;
  /** Why the bare win is within a player's reach — against the course, or a run on record winning it. null: no such
   *  evidence, so a boss asking for this mode's win must also take an `orScore` (lib/story-yardstick.test.ts). */
  winEvidence: string | null;
  /** The most one session can post under the rules, or null when the rules put no ceiling on it. */
  ceiling: number | null;
  /** The most a node may ask — see the header. */
  reach: number;
  /** Where `reach` (and `ceiling`) come from. Required: an uncited number here is a guess. */
  basis: string;
}

const POINTS = ['point', 'points'] as const;

/** Keyed by the GameSession mode (the GameShell prop), not the /play route — see storySessionMode. */
export const STORY_YARDSTICKS: Readonly<Record<string, StoryYardstick>> = {
  hoops1v1: {
    unit: POINTS, verb: 'Score', postsWin: true, winGoal: 'Win the game — first to 11',
    // no recorded run has won a Ones game: every driver-ended game in the mechanics runs (2026-09) is a LOSS
    winEvidence: null,
    ceiling: 13, reach: 11,
    basis: 'OneVOneMode: first to TARGET_SCORE 11, buckets are 2s and 3s — a win posts 11 to 13, a loss at most 10',
  },
  karateEndless: {
    unit: POINTS, verb: 'Score', postsWin: false, winGoal: '', winEvidence: null,
    ceiling: null, reach: 1250,
    basis: 'measured: a mediocre 106 s run scored 1,250 (lib/babylon/core/scoreScale.ts). Endless — every run ends on '
      + 'defeat, so the host never posts a win',
  },
  volleyball: {
    unit: POINTS, verb: 'Score', postsWin: true, winGoal: 'Win the set',
    // NETPREC-10PHASE (2026-09-22): no driver has ended a set against the pit's duo (300 s, 16 points, not over)
    winEvidence: null,
    ceiling: 30, reach: 25,
    basis: 'RallyCore VolleyScore(25): rally scoring to 25, win by 2, hard cap 30 — the session posts your points',
  },
  skateboarding: {
    unit: POINTS, verb: 'Score', postsWin: true, winGoal: 'Win the run — 1,500 banked',
    winEvidence: 'solo: the win is a banked score, no rival to out-balance',
    ceiling: null, reach: 1500,
    basis: 'SkateRunMode: SKATE_WIN_SCORE 1500 — the run is won on that banked par',
  },
  surfing: {
    unit: POINTS, verb: 'Score', postsWin: true, winGoal: 'Win the heat — a barrel or 800',
    winEvidence: 'solo: the win is a barrel or a score, no rival to out-balance',
    ceiling: null, reach: 800,
    basis: 'SurfBreakMode: SURF_WIN_SCORE 800 — a heat is won on a ridden barrel or on that score',
  },
  snowboarding: {
    unit: POINTS, verb: 'Score', postsWin: true, winGoal: 'Crash half the gates',
    winEvidence: 'solo: the win is half the gates, no rival to out-balance',
    ceiling: null, reach: 1500,
    basis: 'SnowboardSlalomMode: a clean gate pays 100 and GATE CRASHER (the win) is half of SLALOM_GATES 30 — a clean '
      + 'winning run banks 1,500 from its gates alone',
  },
  golf: {
    unit: POINTS, verb: 'Score', postsWin: true, winGoal: 'Card par or better',
    winEvidence: 'solo against the course\'s own par, no rival to out-balance — and NETPREC-10PHASE (2026-09-22): the '
      + 'intent driver held PAR and BIRDIE holes with 0 OB',
    ceiling: null, reach: 420,
    basis: 'GolfMode: par 3-4-3, a hole pays max(20, 120 − 40 × strokes over par), the last ×1.5 (CLUTCH_MULT) — a '
      + 'par card posts 420 before rings and banks; the round is won at par or better',
  },
  baseball: {
    unit: POINTS, verb: 'Score', postsWin: true, winGoal: 'Win the derby — 3 homers',
    winEvidence: 'solo against the wall (three homers), no rival to out-balance — and NETPREC-10PHASE (2026-09-22): the '
      + 'intent driver\'s derby ended on 4 homers (DERBY_END 302), over the host\'s line',
    ceiling: null, reach: 321,
    basis: 'DerbyMode: a homer pays round(q × (80 + 60 × launch)); a pure, square swing (q 1, launch 0.45) clears the '
      + 'wall out of every fielder\'s reach for 107 — three of them (the derby\'s own win) post 321',
  },
  football: {
    unit: POINTS, verb: 'Score', postsWin: false, winGoal: '', winEvidence: null,
    ceiling: null, reach: 300,
    // HOTFIX (2026-09-24): a FLOOR, not a ceiling. Evades (+20, ×2 in a breakaway), pounces, trucks, coins (×5),
    // ramps and rails all add, and a touchdown is 100 + 10 per evade so far — one long drive can post 300 alone.
    basis: 'FootballRushMode: 3 drives, a touchdown pays 100 + 10 per evade so far (×1.5 in a breakaway) — 300 is the '
      + 'least three touchdowns can post, a floor the rules guarantee, not a measured run (evades, trucks, coins, ramps '
      + 'and rails all add). The host checks for a TOUCHDOWN outcome the mode never sends, so football never posts a '
      + 'win (owner item)',
  },
  soccer: {
    unit: POINTS, verb: 'Score', postsWin: true, winGoal: 'Win the shootout',
    // the keeper reads the shot now: every driver-ended shootout since (NETPREC n3/n6, 2026-09-22) is a SHOOTOUT_LOSS
    winEvidence: null,
    ceiling: null, reach: 60,
    basis: 'PenaltyMode: a goal pays 20 (+ style); ShootoutCore never decides a shootout before each side has taken '
      + 'three kicks, so three converted kicks post 60',
  },
  tennis: {
    unit: ['game', 'games'], verb: 'Take', postsWin: true, winGoal: 'Win the match — first to 4 games',
    winEvidence: 'NETPREC-10PHASE (2026-09-22), run to the end: the intent driver won the match, 4 games in 84 s',
    ceiling: 4, reach: 4,
    basis: 'RallyCore TennisScore(4): first to 4 games — the session posts the games you took',
  },
  training: {
    unit: POINTS, verb: 'Score', postsWin: true, winGoal: 'Win the session — 1,000',
    winEvidence: 'solo: the win is a score in a 60 s round, no rival to out-balance',
    ceiling: null, reach: 1000,
    basis: 'training-game: WIN_SCORE 1000 in a 60 s round',
  },
  freerun: {
    unit: POINTS, verb: 'Score', postsWin: true, winGoal: 'Finish first',
    // the win is a RACE (place 1 against the rivals), not the grade — and no Lab node asks for it
    winEvidence: null,
    ceiling: null, reach: 2200,
    basis: 'FreeRunCore.runGrade: the rookie course\'s bar is parSec 55 × 40 = 2,200 — in the mode\'s own words, '
      + '"par time at a modest trick line"',
  },
};

export function yardstickFor(sessionMode: string): StoryYardstick | null {
  return STORY_YARDSTICKS[sessionMode] ?? null;
}

/** The goal a node card prints: "Score 8 points", "Take 2 games", "Win the set", "Win the set (or score 22 points)". */
export function storyGoalLabel(
  sessionMode: string,
  node: { targetScore: number; mustWin?: boolean; orScore?: number },
): string {
  const y = yardstickFor(sessionMode);
  const scoreGoal = (n: number) => `${y?.verb ?? 'Score'} ${n.toLocaleString('en-US')} ${y ? y.unit[n === 1 ? 0 : 1] : 'points'}`;
  if (node.mustWin) {
    const win = y?.winGoal || 'Win';
    // HOTFIX (2026-09-24): a win boss that also takes a score says so — the player is never left guessing the way through.
    return node.orScore !== undefined ? `${win} (or ${scoreGoal(node.orScore).replace(/^\w/, (c) => c.toLowerCase())})` : win;
  }
  return scoreGoal(node.targetScore);
}

/**
 * The player-facing name of a mode ("Ones", "Iron Paradise").
 *
 * HOTFIX (2026-09-24): the zone panel printed the raw route id ("Act 1 · onevone"); it reads the same names the
 * rest of the app shows (MODE_INFO) now.
 */
export function storyModeLabel(sessionMode: string): string {
  return MODE_INFO[sessionMode]?.name ?? sessionMode;
}
