/**
 * lib/sessions/arenaScore.ts — the Physics Arena's score rules (owner 2026-11-24: "the arena counts for XP and progress", through
 * server-side score rules — plausibility caps, server-computed totals, nothing client-trusted; docs/PHYSICS-ARENA-PLAN.md §8).
 * PURE: no DB, no network, no Babylon (the route imports it; the games' constants are MIRRORED below and held by arenaScore.test.ts).
 *
 * THE OWNER'S ANSWERS (2026-11-24, docs/OWNER-DECISIONS.md):
 *   a. own session keys — arenaHoops, arenaThrees, arenaThreePoint, arenaSoccer (2026-11-24, under the same decision) — off every mode list and the staked Arena's rival draw (they are
 *      catalogue keys for the session routes only: session-payout isCatalogueMode, never MODE_INFO);
 *   b. the server rebuilds the score from the game's play log now (a full server replay is a later step);
 *   c. XP and progress only to start: NO Lab Credits on an arena win (the route pays no LC, no wallet coins, no shards — see
 *      ARENA_XP_ONLY and the route);
 *   d. fouls and knockdowns do not touch the score rules.
 *
 * WHAT THE CLIENT SENDS (POST /api/sessions, `stats.arena`), and what the server makes of it:
 *   hoops (arenaHoops, arenaThrees)  { v: 1, baskets: [{ t, side, shot, fromM }] }
 *     t      the game's own clock (s, the physics clock from the game's first check)
 *     side   'me' (the player's side; the 3v3's home team) or 'foe'
 *     shot   the basket came from a shot (a release); false = a tip or a ball knocked in (always 1)
 *     fromM  where the shot left from (m, flat to the ring's centre)
 *   The server works out each basket's points itself (2 for a shot from past the arc, else 1), adds both sides up, and refuses the
 *   run when the log is impossible by the game's own rules: a basket from off the court, two baskets closer together than the
 *   scored pause that follows every basket, a clock that runs backwards or past the server's own duration of the run, a game that
 *   did not end where it ends (first to the target, on the last basket), or a sent score / opponent score that is not the rebuilt one.
 *   The win is the rebuilt board's.
 *   threepoint (arenaThreePoint)     { v: 1, shots: [{ t }], makes: [{ t, shot }] }
 *     shots  every release, in order (the racks are shot in order: shot i is rack ⌊i/5⌋, ball i mod 5); t the contest's clock
 *     makes  a release that went in (`shot` its index) and when
 *   soccer (arenaSoccer)               { v: 1, goals: [{ t, side, x, y }] }
 *     x, y   where the ball wholly crossed the goal line (across the mouth, up): it must be inside the mouth; first to 5, a goal is 1,
 *            two goals at least the ball-in-the-net pause apart (the kick-off reset), the game over exactly at 5
 *   The points are the server's (the last ball of a rack is worth 2): at most 25 shots, each made at most once, released before the
 *   horn and at least a gather apart, a make after its release and inside the flight a ball can have.
 *
 * WHAT IT DOES NOT STOP, said plainly: the log is written by the client. A forged log that obeys every rule here is paid as what it
 * claims, and never more than the rules allow (a won 1v1 is at most 12 points: 1.5 × 12 + 50 = 68 XP, then the daily caps).
 */
/**
 * The XP switch (feel knob `arena.xpOn`, lib/babylon/arena/arenaConfig.ts reads this as its default). 1 = the arena's games post a
 * run when they end and the three keys have score rules; 0 = the games post nothing and the keys have no rule (a stray finish is
 * recorded unpaid, NO_RULES — fail closed). ON since the server path was tested end to end against a throwaway Postgres
 * (lib/sessions/arenaScore.integration.test.ts: a forged log refused, a won game paid its XP and no LC).
 */
export const ARENA_XP_ON = 1;

export const ARENA_SESSION_KEYS = ['arenaHoops', 'arenaThrees', 'arenaThreePoint', 'arenaSoccer'] as const;
export type ArenaSessionKey = (typeof ARENA_SESSION_KEYS)[number];

/** Is this one of the arena's session keys (exactly as stored: no aliases)? */
export function isArenaSession(mode: unknown): mode is ArenaSessionKey {
  return typeof mode === 'string' && (ARENA_SESSION_KEYS as readonly string[]).includes(mode);
}

/** One basket of a game's play log (the client's record: the server works out its points). */
export interface ArenaBasket { t: number; side: 'me' | 'foe'; shot: boolean; fromM: number }
/** One goal of a soccer game's play log: when, for whom, and where the ball crossed the goal line (x across the mouth, y up). */
export interface ArenaGoal { t: number; side: 'me' | 'foe'; x: number; y: number }
/** A soccer game's play log, sent as `stats.arena`. */
export interface ArenaSoccerLog { v: 1; goals: ArenaGoal[] }
/** A hoops game's play log, sent as `stats.arena`. */
export interface ArenaHoopsLog { v: 1; baskets: ArenaBasket[] }
/** The contest's play log: every release (in order) and the releases that went in. */
export interface ArenaContestLog { v: 1; shots: Array<{ t: number }>; makes: Array<{ t: number; shot: number }> }

/** Owner 2026-11-24 (c): XP and progress only — the route pays these keys no Lab Credits, no wallet coins and no profile shards. */
export const ARENA_XP_ONLY: ReadonlySet<string> = new Set<string>(ARENA_SESSION_KEYS);

/**
 * The games' own numbers, mirrored (the route must not import Babylon). arenaScore.test.ts imports the games and fails the day one
 * drifts.
 */
export const ARENA_MIRRORED = {
  /** PhysicsArenaMode ARENA_GAME_TO / PhysicsArena3v3Mode ARENA_3V3_GAME_TO. */
  hoopsTo: 11, threesTo: 21,
  /** PhysicsArenaSoccerMode SOCCER_GAME_TO and SCORED_SEC (the ball sits in the net this long before the kick-off), soccerGeometry
   *  GOAL (the mouth's half width and height) and SOCCER_BALL's radius. */
  soccerTo: 5, soccerScoredSec: 2.0, goalHalfW: 1.5, goalH: 2.0, soccerBallR: 0.11,
  /** hoopGeometry ARC_M: a shot from past it is worth 2. */
  arcM: 6.75,
  /** The farthest a body can stand from the ring's centre on the arena's court (hoopGeometry COURT's far corner: 14.22 m). */
  maxShotM: 14.3,
  /** PhysicsArenaMode / PhysicsArena3v3Mode SCORED_PAUSE_SEC: after every basket the game stops this long before the check. */
  scoredPauseSec: 1.4,
  /** PhysicsArena3ptMode CONTEST_SEC, RACKS.length, BALLS_PER_RACK, the 2-point ball (pointsFor), GATHER_SEC. */
  contestSec: 60, racks: 5, ballsPerRack: 5, moneyWorth: 2, gatherSec: 0.14,
  /** PhysicsArena3ptMode: the walk to the next rack (moveT) and the final's pause before the reset (the card is sent then). */
  rackMoveSec: 0.7, contestEndPauseSec: 4.5,
} as const;

/** How far the game's clock may run past the server's own duration of the run (s): the start's round trip. */
export const ARENA_CLOCK_SLACK_SEC = 3;
/** A shot from a rack reaches the ring in under this (s): 7 m at a jump shot's ~9 m/s is ~0.8 s; the bounce in off the iron more. */
export const CONTEST_MIN_FLIGHT_SEC = 0.3;
/** The games count their pauses per frame (at most ARENA_MAX_STEPS steps of 1/120 s, 33 ms): a timed rule forgives one frame. */
export const ARENA_FRAME_SLACK_SEC = 0.05;
export const CONTEST_MAX_FLIGHT_SEC = 6;

export type ArenaInvalidDetail =
  | 'arena_log_missing' | 'arena_log_malformed' | 'arena_basket_far' | 'arena_too_fast' | 'arena_clock'
  | 'arena_not_final' | 'arena_after_final' | 'arena_score_mismatch' | 'arena_contest_shots' | 'arena_contest_make' | 'arena_goal_mouth';

export type ArenaRebuild =
  | { ok: true; score: number; opponentScore: number; won: boolean; baskets: number }
  | { ok: false; detail: ArenaInvalidDetail; limit: number | null };

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const bad = (detail: ArenaInvalidDetail, limit: number | null = null): ArenaRebuild => ({ ok: false, detail, limit });

/** A basket's points, the server's rule: a shot from past the arc is 2, everything else 1. */
export function basketPoints(shot: boolean, fromM: number, m = ARENA_MIRRORED): number {
  return shot && fromM > m.arcM ? 2 : 1;
}

/** The win on a (rebuilt) board: a game is won by reaching the target first; the contest has no win. */
export function arenaWon(mode: ArenaSessionKey, score: number, opponentScore: number, m = ARENA_MIRRORED): boolean {
  if (mode === 'arenaThreePoint') return false;
  const to = mode === 'arenaHoops' ? m.hoopsTo : mode === 'arenaSoccer' ? m.soccerTo : m.threesTo;
  return score >= to && score > opponentScore;
}

/** The contest's ball i (0-based, rack-major): its points. */
export function contestPoints(i: number, m = ARENA_MIRRORED): number {
  return i % m.ballsPerRack === m.ballsPerRack - 1 ? m.moneyWorth : 1;
}

/** The most one game can score: the target from one under it with the biggest basket (first to 11 → 12). */
export function firstToMax(to: number): number {
  return to - 1 + 2;
}

/**
 * Rebuild one finished game's totals from its log. `durationMs` is the SERVER's duration of the run (now − its start);
 * `sentScore` / `sentOpponent` are what the client posted (they must equal the rebuilt totals).
 */
export function rebuildArenaScore(
  mode: string, log: unknown, o: { durationMs: number; sentScore: unknown; sentOpponent?: unknown }, m = ARENA_MIRRORED,
): ArenaRebuild {
  if (!isArenaSession(mode)) return bad('arena_log_malformed');
  if (!log || typeof log !== 'object') return bad('arena_log_missing');
  const L = log as Record<string, unknown>;
  if (L.v !== 1) return bad('arena_log_malformed');
  const serverSec = Math.max(0, o.durationMs) / 1000 + ARENA_CLOCK_SLACK_SEC;
  if (mode === 'arenaThreePoint') return rebuildContest(L, serverSec, o.sentScore, m);
  if (mode === 'arenaSoccer') return rebuildSoccer(L, serverSec, o.sentScore, o.sentOpponent, m);

  const to = mode === 'arenaHoops' ? m.hoopsTo : m.threesTo;
  const baskets = L.baskets;
  if (!Array.isArray(baskets) || baskets.length === 0 || baskets.length > 2 * to) return bad('arena_log_malformed', 2 * to);
  const total = { me: 0, foe: 0 };
  let lastT = -Infinity;
  for (let i = 0; i < baskets.length; i++) {
    const b = baskets[i] as Record<string, unknown> | null;
    if (!b || typeof b !== 'object' || !num(b.t) || !num(b.fromM) || typeof b.shot !== 'boolean' || (b.side !== 'me' && b.side !== 'foe')) return bad('arena_log_malformed');
    if (b.t < 0 || b.t > serverSec) return bad('arena_clock', Math.floor(serverSec));
    if (b.fromM < 0 || b.fromM > m.maxShotM) return bad('arena_basket_far', m.maxShotM);
    if (i > 0 && b.t - lastT < m.scoredPauseSec - ARENA_FRAME_SLACK_SEC) return bad('arena_too_fast', m.scoredPauseSec);
    // a basket after one side already reached the target: the game was over
    if (total.me >= to || total.foe >= to) return bad('arena_after_final', to);
    total[b.side] += basketPoints(b.shot, b.fromM, m);
    lastT = b.t;
  }
  const won = total.me >= to;
  if (!won && total.foe < to) return bad('arena_not_final', to);
  if (!Number.isInteger(o.sentScore) || o.sentScore !== total.me) return bad('arena_score_mismatch', total.me);
  if (o.sentOpponent !== undefined && o.sentOpponent !== total.foe) return bad('arena_score_mismatch', total.foe);
  return { ok: true, score: total.me, opponentScore: total.foe, won, baskets: baskets.length };
}

/**
 * Soccer: every goal is the ball wholly over the line inside the mouth (its crossing point between the posts and under the bar, as
 * the mode's own sensor reads it); two goals at least the ball-in-the-net pause apart (the kick-off reset); the clock no longer than
 * the run; the game over exactly at the target, on the last goal; the sent score and opponent score the rebuilt ones.
 */
function rebuildSoccer(L: Record<string, unknown>, serverSec: number, sentScore: unknown, sentOpponent: unknown, m: typeof ARENA_MIRRORED): ArenaRebuild {
  const to = m.soccerTo, goals = L.goals;
  if (!Array.isArray(goals) || goals.length === 0 || goals.length > 2 * to - 1) return bad('arena_log_malformed', 2 * to - 1);
  const total = { me: 0, foe: 0 };
  let lastT = -Infinity;
  for (let i = 0; i < goals.length; i++) {
    const g = goals[i] as Record<string, unknown> | null;
    if (!g || typeof g !== 'object' || !num(g.t) || !num(g.x) || !num(g.y) || (g.side !== 'me' && g.side !== 'foe')) return bad('arena_log_malformed');
    if (g.t < 0 || g.t > serverSec) return bad('arena_clock', Math.floor(serverSec));
    if (Math.abs(g.x) >= m.goalHalfW || g.y < 0 || g.y >= m.goalH) return bad('arena_goal_mouth', m.goalHalfW);
    if (i > 0 && g.t - lastT < m.soccerScoredSec - ARENA_FRAME_SLACK_SEC) return bad('arena_too_fast', m.soccerScoredSec);
    if (total.me >= to || total.foe >= to) return bad('arena_after_final', to);
    total[g.side] += 1;
    lastT = g.t;
  }
  const won = total.me >= to;
  if (!won && total.foe < to) return bad('arena_not_final', to);
  if (!Number.isInteger(sentScore) || sentScore !== total.me) return bad('arena_score_mismatch', total.me);
  if (sentOpponent !== undefined && sentOpponent !== total.foe) return bad('arena_score_mismatch', total.foe);
  return { ok: true, score: total.me, opponentScore: total.foe, won, baskets: goals.length };
}

function rebuildContest(L: Record<string, unknown>, serverSec: number, sentScore: unknown, m: typeof ARENA_MIRRORED): ArenaRebuild {
  const n = m.racks * m.ballsPerRack;
  const shots = L.shots, makes = L.makes;
  if (!Array.isArray(shots) || !Array.isArray(makes) || shots.length > n || makes.length > shots.length) return bad('arena_contest_shots', n);
  const releasedAt: number[] = [];
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i] as Record<string, unknown> | null;
    if (!s || typeof s !== 'object' || !num(s.t)) return bad('arena_log_malformed');
    if (s.t < m.gatherSec - 1e-6 || s.t > m.contestSec + ARENA_FRAME_SLACK_SEC || s.t > serverSec) return bad('arena_clock', m.contestSec);
    if (i > 0) {
      // a gather between two releases; the walk to the next rack before a rack's first ball
      const gap = m.gatherSec + (i % m.ballsPerRack === 0 ? m.rackMoveSec - ARENA_FRAME_SLACK_SEC : 0);
      if (s.t - releasedAt[i - 1] < gap - 1e-6) return bad('arena_too_fast', gap);
    }
    releasedAt.push(s.t);
  }
  let score = 0;
  const made = new Set<number>();
  for (const k of makes) {
    const mk = k as Record<string, unknown> | null;
    if (!mk || typeof mk !== 'object' || !num(mk.t) || !Number.isInteger(mk.shot)) return bad('arena_log_malformed');
    const i = mk.shot as number;
    if (i < 0 || i >= shots.length || made.has(i)) return bad('arena_contest_make');
    const flight = mk.t - releasedAt[i];
    if (flight < CONTEST_MIN_FLIGHT_SEC || flight > CONTEST_MAX_FLIGHT_SEC) return bad('arena_contest_make', CONTEST_MAX_FLIGHT_SEC);
    if (mk.t > m.contestSec + m.contestEndPauseSec + 2 * ARENA_FRAME_SLACK_SEC || mk.t > serverSec) return bad('arena_clock', m.contestSec + m.contestEndPauseSec);
    made.add(i);
    score += contestPoints(i, m);
  }
  if (!Number.isInteger(sentScore) || sentScore !== score) return bad('arena_score_mismatch', score);
  return { ok: true, score, opponentScore: 0, won: false, baskets: makes.length };
}

/**
 * The three keys' score rules, as DERIVED bounds (modeScoreRules derivedBounds: a per-run bound from the game's own code, the
 * owner's 2026-09-28 category): the most a game can score, over the shortest game that can score it. Empty with the switch off.
 */
export function arenaDerivedBounds(m = ARENA_MIRRORED): Record<ArenaSessionKey, { maxScore: number; runSec: number; basis: string }> | Record<string, never> {
  if (ARENA_XP_ON !== 1) return {};
  const game = (to: number) => {
    const max = firstToMax(to);
    // the fewest baskets that reach the target (all 2s), each after the scored pause of the one before
    const fewest = Math.ceil(to / 2);
    return { maxScore: max, runSec: Math.max(1, (fewest - 1) * m.scoredPauseSec), basis: `first to ${to}, no basket worth more than 2 (${to - 1} + 2); the fewest baskets (${fewest}) at least the scored pause (${m.scoredPauseSec} s) apart; rebuilt from the play log (lib/sessions/arenaScore.ts)` };
  };
  const n = m.racks * m.ballsPerRack;
  const contestMax = m.racks * ((m.ballsPerRack - 1) + m.moneyWorth);
  // 25 releases a gather apart, plus the walk between racks
  const contestSec = n * m.gatherSec + (m.racks - 1) * m.rackMoveSec;
  return {
    arenaHoops: game(m.hoopsTo),
    arenaThrees: game(m.threesTo),
    arenaThreePoint: { maxScore: contestMax, runSec: contestSec, basis: `${m.racks} racks of ${m.ballsPerRack}, each with one ${m.moneyWorth}-point ball; rebuilt from the play log (lib/sessions/arenaScore.ts)` },
    // soccer: first to 5, a goal is 1; the fewest goals (5) each after the ball-in-the-net pause of the one before
    arenaSoccer: { maxScore: m.soccerTo, runSec: (m.soccerTo - 1) * m.soccerScoredSec, basis: `first to ${m.soccerTo}, a goal is 1; ${m.soccerTo} goals at least ${m.soccerScoredSec} s apart (the kick-off reset); rebuilt from the goal log (lib/sessions/arenaScore.ts)` },
  };
}
