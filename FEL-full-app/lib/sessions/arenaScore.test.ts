// lane/physics-arena (owner 2026-11-24): the arena's score rules — the server rebuilds a game's totals from its play log.
import { describe, expect, it } from 'vitest';
import {
  ARENA_MIRRORED, ARENA_SESSION_KEYS, ARENA_XP_ON, ARENA_XP_ONLY, arenaDerivedBounds, basketPoints, contestPoints, isArenaSession,
  rebuildArenaScore, type ArenaBasket,
} from './arenaScore';
import { MODE_SCORE_RULES, checkRunScore } from './modeScoreRules';
import { isCatalogueMode, sessionWon } from '@/lib/session-payout';
import { MODE_INFO } from '@/lib/game-data';
import { ARENA_GAME_TO, SCORED_PAUSE_SEC } from '@/lib/babylon/modes/PhysicsArenaMode';
import { ARENA_3V3_GAME_TO } from '@/lib/babylon/modes/PhysicsArena3v3Mode';
import { BALLS_PER_RACK, CONTEST_SEC, END_PAUSE_SEC, GATHER_SEC, RACKS, RACK_MOVE_SEC, pointsFor } from '@/lib/babylon/modes/PhysicsArena3ptMode';
import { ARC_M, COURT, RIM_FLOOR } from '@/lib/babylon/arena/hoopGeometry';
import { SCORED_SEC, SOCCER_GAME_TO } from '@/lib/babylon/modes/PhysicsArenaSoccerMode';
import { GOAL as SOCCER_GOAL, SOCCER_BALL } from '@/lib/babylon/arena/soccerGeometry';

/** A game where `seq` says who scored each basket ('m' me, 'f' foe, upper case a 2 from past the arc), 3 s apart. */
function game(seq: string, gap = 3): ArenaBasket[] {
  return [...seq].map((c, i) => ({ t: 5 + i * gap, side: c.toLowerCase() === 'm' ? 'me' : 'foe', shot: true, fromM: c === c.toUpperCase() ? 7.4 : 4.2 }));
}
const totals = (b: ArenaBasket[]) => b.reduce((o, x) => { o[x.side] += basketPoints(x.shot, x.fromM); return o; }, { me: 0, foe: 0 });
const hoops = (b: ArenaBasket[], o: { sec?: number; score?: number; opp?: number; mode?: string } = {}) => {
  const t = totals(b);
  return rebuildArenaScore(o.mode ?? 'arenaHoops', { v: 1, baskets: b }, { durationMs: (o.sec ?? 600) * 1000, sentScore: o.score ?? t.me, sentOpponent: o.opp ?? t.foe });
};

describe('DRIFT: the mirrored numbers are still what the games say', () => {
  it('the targets, the arc, the scored pause, the court', () => {
    expect(ARENA_MIRRORED.hoopsTo).toBe(ARENA_GAME_TO);
    expect(ARENA_MIRRORED.threesTo).toBe(ARENA_3V3_GAME_TO);
    expect(ARENA_MIRRORED.arcM).toBe(ARC_M);
    expect(ARENA_MIRRORED.scoredPauseSec).toBe(SCORED_PAUSE_SEC);
    const far = Math.max(...[COURT.minX, COURT.maxX].flatMap((x) => [COURT.minZ, COURT.maxZ].map((z) => Math.hypot(x - RIM_FLOOR.x, z - RIM_FLOOR.z))));
    expect(far).toBeLessThanOrEqual(ARENA_MIRRORED.maxShotM);
    expect(ARENA_MIRRORED.maxShotM - far).toBeLessThan(0.2);
  });
  it('the contest: racks, balls, the 2-point ball, the gather, the walk, the final pause', () => {
    expect(ARENA_MIRRORED.racks).toBe(RACKS.length);
    expect(ARENA_MIRRORED.ballsPerRack).toBe(BALLS_PER_RACK);
    expect(ARENA_MIRRORED.contestSec).toBe(CONTEST_SEC);
    expect(ARENA_MIRRORED.gatherSec).toBe(GATHER_SEC);
    expect(ARENA_MIRRORED.rackMoveSec).toBe(RACK_MOVE_SEC);
    expect(ARENA_MIRRORED.contestEndPauseSec).toBe(END_PAUSE_SEC);
    for (let i = 0; i < 25; i++) expect(contestPoints(i), String(i)).toBe(pointsFor(i % BALLS_PER_RACK));
  });
});

describe('DRIFT: soccer', () => {
  it('first to 5, the ball-in-the-net pause, the mouth, the ball', () => {
    expect(ARENA_MIRRORED.soccerTo).toBe(SOCCER_GAME_TO);
    expect(ARENA_MIRRORED.soccerScoredSec).toBe(SCORED_SEC);
    expect(ARENA_MIRRORED.goalHalfW).toBe(SOCCER_GOAL.halfW);
    expect(ARENA_MIRRORED.goalH).toBe(SOCCER_GOAL.h);
    expect(ARENA_MIRRORED.soccerBallR).toBe(SOCCER_BALL.r);
  });
});

describe('rebuildArenaScore: soccer', () => {
  /** `seq`: who scored each goal ('m' / 'f'), `gap` s apart, crossing at (x, y). */
  const goals = (seq: string, gap = 6, x = 0.4, y = 0.5) => [...seq].map((c, i) => ({ t: 10 + i * gap, side: c === 'm' ? 'me' : 'foe', x, y }));
  const soccer = (g: ReturnType<typeof goals>, o: { sec?: number; score?: number; opp?: number } = {}) => {
    const me = g.filter((x) => x.side === 'me').length, foe = g.length - me;
    return rebuildArenaScore('arenaSoccer', { v: 1, goals: g }, { durationMs: (o.sec ?? 600) * 1000, sentScore: o.score ?? me, sentOpponent: o.opp ?? foe });
  };
  it('an honest 5–2 win and a 3–5 loss rebuild; the win is the board\'s; the row is first to 5', () => {
    expect(soccer(goals('mmfmfmm'))).toMatchObject({ ok: true, score: 5, opponentScore: 2, won: true });
    expect(soccer(goals('mffmfmff'))).toMatchObject({ ok: true, score: 3, opponentScore: 5, won: false });
    expect(sessionWon('arenaSoccer', true, null, 120, { score: 5, opponentScore: 2 })).toBe(true);
    expect(sessionWon('arenaSoccer', true, null, 120, { score: 3, opponentScore: 5 })).toBe(false);
    expect(MODE_SCORE_RULES.arenaSoccer).toMatchObject({ maxScore: 5, maxScoreFrom: 'derived' });
  });
  it('forged goal logs are refused with the rule they broke', () => {
    expect(soccer(goals('mmmmm', 6, 1.6))).toMatchObject({ ok: false, detail: 'arena_goal_mouth' });      // wide of the post
    expect(soccer(goals('mmmmm', 6, 0.2, 2.3))).toMatchObject({ ok: false, detail: 'arena_goal_mouth' }); // over the bar
    expect(soccer(goals('mmmmm', 0.5))).toMatchObject({ ok: false, detail: 'arena_too_fast' });           // no kick-off between
    expect(soccer(goals('mmmmm', SCORED_SEC))).toMatchObject({ ok: true });                              // exactly the pause
    expect(soccer(goals('mmmmmm'))).toMatchObject({ ok: false, detail: 'arena_after_final' });
    expect(soccer(goals('mmm'))).toMatchObject({ ok: false, detail: 'arena_not_final' });
    expect(soccer(goals('mmmmm'), { score: 6 })).toMatchObject({ ok: false, detail: 'arena_score_mismatch' });
    expect(soccer(goals('mmmmm'), { sec: 20 })).toMatchObject({ ok: false, detail: 'arena_clock' });
    expect(rebuildArenaScore('arenaSoccer', { v: 1, baskets: [] }, { durationMs: 1e6, sentScore: 5 })).toMatchObject({ ok: false });
  });
});

describe('the keys (owner 2026-11-24 a): session keys of their own, off every list', () => {
  it('the session routes know them; MODE_INFO (every list, venue, pick and the staked Arena) does not', () => {
    for (const k of ARENA_SESSION_KEYS) {
      expect(isCatalogueMode(k), k).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(MODE_INFO, k), k).toBe(false);
      expect(isArenaSession(k)).toBe(true);
      expect(ARENA_XP_ONLY.has(k), k).toBe(true);   // (c) XP and progress only: no LC
    }
    expect(isArenaSession('hoops1v1')).toBe(false);
    expect(isArenaSession('arenahoops')).toBe(false);
  });
  it('with the switch on, each key has a derived rule: first to 11 → 12, first to 21 → 22, the contest 30', () => {
    expect(ARENA_XP_ON).toBe(1);
    expect(MODE_SCORE_RULES.arenaHoops).toMatchObject({ maxScore: 12, maxScoreFrom: 'derived', enabled: true });
    expect(MODE_SCORE_RULES.arenaThrees).toMatchObject({ maxScore: 22, maxScoreFrom: 'derived' });
    expect(MODE_SCORE_RULES.arenaThreePoint).toMatchObject({ maxScore: 30, maxScoreFrom: 'derived' });
    const b = arenaDerivedBounds() as Record<string, { runSec: number }>;
    expect(b.arenaHoops.runSec).toBeCloseTo(5 * SCORED_PAUSE_SEC, 9);   // six 2s, five pauses
    // an honest fast win (eleven 1s at the scored pause) is inside the pace; a forged 12 in 3 s is not
    expect(checkRunScore({ mode: 'arenaHoops', score: 11, durationMs: 11 * 1.5 * 1000 })).toMatchObject({ ok: true });
    expect(checkRunScore({ mode: 'arenaHoops', score: 12, durationMs: 3000 })).toMatchObject({ ok: false, detail: 'above_max_rate' });
    expect(checkRunScore({ mode: 'arenaHoops', score: 13, durationMs: 600_000 })).toMatchObject({ ok: false, detail: 'above_max_score' });
  });
});

describe('the win: the rebuilt board, never the claim alone', () => {
  it('a game is won by reaching the target first; a claimed win on a lost board is not; the contest never wins', () => {
    expect(sessionWon('arenaHoops', true, null, 120, { score: 11, opponentScore: 4 })).toBe(true);
    expect(sessionWon('arenaHoops', true, null, 120, { score: 7, opponentScore: 11 })).toBe(false);
    expect(sessionWon('arenaHoops', false, null, 120, { score: 11, opponentScore: 4 })).toBe(false);   // the less-paying answer
    expect(sessionWon('arenaThrees', true, null, 300, { score: 21, opponentScore: 19 })).toBe(true);
    expect(sessionWon('arenaThrees', true, null, 300, { score: 12, opponentScore: 3 })).toBe(false);
    expect(sessionWon('arenaThreePoint', true, null, 70, { score: 30, opponentScore: 0 })).toBe(false);
  });
});

describe('rebuildArenaScore: hoops', () => {
  it('an honest win and an honest loss are rebuilt, with the win the board\'s', () => {
    const w = hoops(game('mmfmmMfmmmmm'));
    expect(w).toMatchObject({ ok: true, won: true, score: 11, opponentScore: 2 });
    const l = hoops(game('mFFfffffff'));   // 1 to 2 + 2 + 7
    expect(l).toMatchObject({ ok: true, won: false, score: 1, opponentScore: 11 });
    expect(hoops(game('ffffffffffF'))).toMatchObject({ ok: true, won: false, opponentScore: 12 });   // 10, then a 2: 12
    // a 2 from past the arc is the server's call: a tip-in (no shot) from far is still 1
    expect(basketPoints(true, ARC_M + 0.01)).toBe(2);
    expect(basketPoints(true, ARC_M)).toBe(1);
    expect(basketPoints(false, 9)).toBe(1);
  });
  it('the 3v3 plays to 21', () => {
    expect(hoops(game('m'.repeat(21)), { mode: 'arenaThrees' })).toMatchObject({ ok: true, won: true, score: 21 });
    expect(hoops(game('m'.repeat(11)), { mode: 'arenaThrees' })).toMatchObject({ ok: false, detail: 'arena_not_final' });
  });
  it('a sent score that is not the rebuilt one is refused (never corrected)', () => {
    const b = game('mmmmmmmmmmm');
    expect(hoops(b, { score: 12 })).toMatchObject({ ok: false, detail: 'arena_score_mismatch', limit: 11 });
    expect(hoops(b, { opp: 3 })).toMatchObject({ ok: false, detail: 'arena_score_mismatch' });
    expect(hoops(b, { score: 11.0000001 as number })).toMatchObject({ ok: false, detail: 'arena_score_mismatch' });
  });
  it('impossible logs are refused with the rule they broke', () => {
    expect(rebuildArenaScore('arenaHoops', undefined, { durationMs: 1e6, sentScore: 11 })).toMatchObject({ ok: false, detail: 'arena_log_missing' });
    expect(rebuildArenaScore('arenaHoops', { v: 2, baskets: [] }, { durationMs: 1e6, sentScore: 11 })).toMatchObject({ ok: false, detail: 'arena_log_malformed' });
    expect(rebuildArenaScore('arenaHoops', { v: 1, baskets: [{ t: 1, side: 'me', shot: 'yes', fromM: 3 }] }, { durationMs: 1e6, sentScore: 1 })).toMatchObject({ ok: false, detail: 'arena_log_malformed' });
    // baskets closer together than the scored pause after every basket
    expect(hoops(game('mmmmmmmmmmm', 1.0))).toMatchObject({ ok: false, detail: 'arena_too_fast' });
    expect(hoops(game('mmmmmmmmmmm', SCORED_PAUSE_SEC))).toMatchObject({ ok: true });   // exactly the pause: an honest fast game
    // a game clock past the server's own duration of the run
    expect(hoops(game('mmmmmmmmmmm'), { sec: 20 })).toMatchObject({ ok: false, detail: 'arena_clock' });
    // a basket after the game was over; a game that never ended
    expect(hoops(game('mmmmmmmmmmmm'))).toMatchObject({ ok: false, detail: 'arena_after_final' });
    expect(hoops(game('mmmmm'))).toMatchObject({ ok: false, detail: 'arena_not_final' });
    // a shot from off the court
    const far = game('mmmmmmmmmmm'); far[3] = { ...far[3], fromM: 30 };
    expect(hoops(far)).toMatchObject({ ok: false, detail: 'arena_basket_far' });
    // a clock that runs backwards
    const back = game('mmmmmmmmmmm'); back[4] = { ...back[4], t: 1 };
    expect(hoops(back)).toMatchObject({ ok: false });
    // the wrong key, or another mode's
    expect(rebuildArenaScore('hoops1v1', { v: 1, baskets: game('m') }, { durationMs: 1e6, sentScore: 1 })).toMatchObject({ ok: false });
  });
});

describe('rebuildArenaScore: the contest', () => {
  /** n releases 1 s apart (with the walk between racks), and makes 1 s after each release in `made`. */
  const contest = (n: number, made: number[], score?: number, sec = 600) => {
    const shots: { t: number }[] = [];
    let t = 0.5;
    for (let i = 0; i < n; i++) { if (i > 0) t += 1 + (i % 5 === 0 ? RACK_MOVE_SEC : 0); shots.push({ t }); }
    const makes = made.map((i) => ({ t: shots[i].t + 1, shot: i }));
    const pts = made.reduce((a, i) => a + contestPoints(i), 0);
    return rebuildArenaScore('arenaThreePoint', { v: 1, shots, makes }, { durationMs: sec * 1000, sentScore: score ?? pts });
  };
  it('an honest contest: the points are the server\'s (the last ball of a rack is 2)', () => {
    expect(contest(25, [0, 4, 9, 24])).toMatchObject({ ok: true, score: 1 + 2 + 2 + 2, won: false });
    expect(contest(25, Array.from({ length: 25 }, (_, i) => i))).toMatchObject({ ok: true, score: 30 });
  });
  it('forged contests are refused', () => {
    expect(contest(25, [3, 3])).toMatchObject({ ok: false, detail: 'arena_contest_make' });     // one ball made twice
    expect(contest(25, [1], 2)).toMatchObject({ ok: false, detail: 'arena_score_mismatch' });  // a 1-point ball claimed as 2
    expect(contest(25, [0], 1, 5)).toMatchObject({ ok: false, detail: 'arena_clock' });          // the contest's clock past the run's
    const shots = Array.from({ length: 26 }, (_, i) => ({ t: 1 + i * 2 }));
    expect(rebuildArenaScore('arenaThreePoint', { v: 1, shots, makes: [] }, { durationMs: 1e6, sentScore: 0 })).toMatchObject({ ok: false, detail: 'arena_contest_shots' });
    const quick = Array.from({ length: 5 }, (_, i) => ({ t: 1 + i * 0.05 }));
    expect(rebuildArenaScore('arenaThreePoint', { v: 1, shots: quick, makes: [] }, { durationMs: 1e6, sentScore: 0 })).toMatchObject({ ok: false, detail: 'arena_too_fast' });
    const late = [{ t: 70 }];
    expect(rebuildArenaScore('arenaThreePoint', { v: 1, shots: late, makes: [] }, { durationMs: 1e6, sentScore: 0 })).toMatchObject({ ok: false, detail: 'arena_clock' });
    const instant = { v: 1, shots: [{ t: 1 }], makes: [{ t: 1.05, shot: 0 }] };
    expect(rebuildArenaScore('arenaThreePoint', instant, { durationMs: 1e6, sentScore: 1 })).toMatchObject({ ok: false, detail: 'arena_contest_make' });
  });
});
