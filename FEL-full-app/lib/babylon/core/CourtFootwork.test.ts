// CourtFootwork — the rules that make court position a game (2026-09-13).
//
// The state being fixed: tennis had no player positioning at all, so the opponent's carefully planned
// placement landed on a player who was always already there. These assert the things that have to be true
// for moving your feet to MATTER — most of them are measurements of the court against the clock, because
// "can you get there?" is a physics question with a real answer.

import { describe, it, expect } from 'vitest';
import {
  TENNIS_FOOTWORK, VOLLEY_FOOTWORK, FOOTWORK_IDLE, stepFootwork, splitTimed, splitBoostActive,
  SPLIT_EARLY_SEC, SPLIT_LATE_SEC, SPLIT_BOOST, SPLIT_BOOST_SEC,
  reachOf, canReach, reachQuality, gradeAfterStretch, COMFORT_M, MAX_REACH_M,
  recoveryX, outOfPosition, aiTargetX, AI_LINE_SAFETY,
  type FootworkState,
} from './CourtFootwork';
import { TENNIS } from './RallyCore';

/** Run the footwork forward at 60 Hz with a fixed stick. */
function run(s: FootworkState, intent: number, sec: number, m = TENNIS_FOOTWORK): FootworkState {
  const dt = 1 / 60;
  for (let t = 0; t < sec; t += dt) s = stepFootwork(s, intent, dt, m);
  return s;
}

describe('the court is sized against the clock', () => {
  it('a corner-to-corner ball CANNOT be run down from the far corner — that is why position matters', () => {
    const start: FootworkState = { ...FOOTWORK_IDLE, x: -TENNIS.halfWidth };
    const after = run(start, 1, TENNIS.baseFlightTime);
    const travelled = after.x - start.x;
    expect(travelled).toBeLessThan(TENNIS.halfWidth * 2);        // did not cover the full width
    expect(reachOf(after.x, TENNIS.halfWidth)).toBeGreaterThan(MAX_REACH_M);
  });

  it('the same ball IS reachable from a good recovery position — only just', () => {
    const start: FootworkState = { ...FOOTWORK_IDLE, x: recoveryX(0, TENNIS.halfWidth) };
    const after = run(start, 1, TENNIS.baseFlightTime);
    expect(reachOf(after.x, TENNIS.halfWidth)).toBeLessThanOrEqual(MAX_REACH_M);
  });

  it('top speed is a real lateral sprint and is actually reached', () => {
    const after = run(FOOTWORK_IDLE, 1, 1.0);
    expect(after.vx).toBeCloseTo(TENNIS_FOOTWORK.topSpeed, 1);
  });
});

describe('a body has momentum', () => {
  it('releasing the stick decelerates rather than stopping dead', () => {
    const moving = run(FOOTWORK_IDLE, 1, 0.6);
    const coasting = stepFootwork(moving, 0, 1 / 60, TENNIS_FOOTWORK);
    expect(coasting.vx).toBeGreaterThan(0);
    expect(coasting.vx).toBeLessThan(moving.vx);
  });

  it('turning ROUND is slower than starting — that is what being wrong-footed costs', () => {
    const movingRight = run(FOOTWORK_IDLE, 1, 0.6);
    const turning = run(movingRight, -1, 0.2);
    const fromRest = run(FOOTWORK_IDLE, -1, 0.2);
    expect(turning.vx).toBeGreaterThan(fromRest.vx);   // less negative: still unwinding the old direction
  });

  it('the player is clamped a little past the sideline, and the clamp kills the velocity into it', () => {
    const wide = run(FOOTWORK_IDLE, 1, 4);
    expect(wide.x).toBeCloseTo(TENNIS_FOOTWORK.halfWidth + TENNIS_FOOTWORK.overrun, 5);
    expect(wide.vx).toBeLessThanOrEqual(0);
    // and it can leave again
    expect(run(wide, -1, 0.3).x).toBeLessThan(wide.x);
  });
});

describe('THE SPLIT STEP', () => {
  it('lands as the opponent strikes: early is forgiven, late is not', () => {
    expect(splitTimed(SPLIT_EARLY_SEC - 0.01)).toBe(true);
    expect(splitTimed(0)).toBe(true);
    expect(splitTimed(-SPLIT_LATE_SEC + 0.01)).toBe(true);
    expect(splitTimed(SPLIT_EARLY_SEC + 0.1)).toBe(false);
    expect(splitTimed(-SPLIT_LATE_SEC - 0.05)).toBe(false);
  });

  it('the early window is more forgiving than the late one — hopping early only costs a little', () => {
    expect(SPLIT_EARLY_SEC).toBeGreaterThan(SPLIT_LATE_SEC * 2);
  });

  it('a timed split buys a genuinely faster first step', () => {
    const split: FootworkState = { ...FOOTWORK_IDLE, sinceSplit: 0 };
    const boosted = run(split, 1, 0.18);
    const flat = run(FOOTWORK_IDLE, 1, 0.18);
    expect(boosted.vx).toBeGreaterThan(flat.vx);
    expect(boosted.x).toBeGreaterThan(flat.x);
  });

  it('the boost is ONE push, not a buff you carry through the point', () => {
    expect(splitBoostActive({ ...FOOTWORK_IDLE, sinceSplit: 0 })).toBe(true);
    expect(splitBoostActive({ ...FOOTWORK_IDLE, sinceSplit: SPLIT_BOOST_SEC + 0.01 })).toBe(false);
    expect(splitBoostActive(FOOTWORK_IDLE)).toBe(false);   // never split: Infinity
    expect(SPLIT_BOOST).toBeGreaterThan(1);
  });

  it('the boost cannot raise top speed — it is acceleration, not a sprint button', () => {
    // 0.8 s, not longer: at 1.5 s of holding one direction the player is pinned against the sideline clamp
    // and vx is legitimately 0, which is the clamp working, not the boost failing.
    const split: FootworkState = { ...FOOTWORK_IDLE, sinceSplit: 0 };
    const boosted = run(split, 1, 0.8);
    expect(boosted.vx).toBeCloseTo(TENNIS_FOOTWORK.topSpeed, 1);
    expect(Math.abs(boosted.x)).toBeLessThan(TENNIS_FOOTWORK.halfWidth + TENNIS_FOOTWORK.overrun);
  });
});

describe('THE STRETCH', () => {
  it('inside the stance costs nothing; past full reach is untouchable', () => {
    expect(reachQuality(0)).toBe(1);
    expect(reachQuality(COMFORT_M)).toBe(1);
    expect(reachQuality(MAX_REACH_M)).toBe(0);
    expect(canReach(MAX_REACH_M)).toBe(true);
    expect(canReach(MAX_REACH_M + 0.01)).toBe(false);
  });

  it('it degrades smoothly — a cliff would read as the ball going randomly dead', () => {
    const mid = (COMFORT_M + MAX_REACH_M) / 2;
    const q = reachQuality(mid);
    expect(q).toBeGreaterThan(0.2);
    expect(q).toBeLessThan(0.8);
    expect(reachQuality(COMFORT_M + 0.1)).toBeGreaterThan(reachQuality(MAX_REACH_M - 0.1));
  });

  it('A PERFECT SWING AT FULL STRETCH IS NOT A PERFECT SHOT', () => {
    expect(gradeAfterStretch('perfect', 0.2)).toBe('perfect');
    expect(gradeAfterStretch('perfect', MAX_REACH_M - 0.05)).not.toBe('perfect');
    expect(gradeAfterStretch('perfect', MAX_REACH_M + 1)).toBe('miss');
  });

  it('timing and position MULTIPLY — a bad swing at a stretch is worse than either alone', () => {
    expect(gradeAfterStretch('good', 0.2)).toBe('good');
    const stretched = gradeAfterStretch('good', MAX_REACH_M - 0.05);
    expect(['late', 'miss']).toContain(stretched);
  });

  it('a miss stays a miss however well placed the feet were', () => {
    expect(gradeAfterStretch('miss', 0)).toBe('miss');
  });
});

describe('RECOVERY IS NOT THE MIDDLE OF THE COURT', () => {
  it('recovery shades TOWARD the side you hit to', () => {
    const wideRight = recoveryX(TENNIS.halfWidth, TENNIS.halfWidth);
    expect(wideRight).toBeGreaterThan(0);
    expect(recoveryX(-TENNIS.halfWidth, TENNIS.halfWidth)).toBeLessThan(0);
  });

  it('a ball down the middle recovers to the middle', () => {
    expect(recoveryX(0, TENNIS.halfWidth)).toBe(0);
  });

  it('it never shades past the singles sideline — that would be standing in the tramlines', () => {
    expect(Math.abs(recoveryX(TENNIS.halfWidth * 2, TENNIS.halfWidth))).toBeLessThan(TENNIS.halfWidth);
  });

  it('being out of position is measured against where you should be', () => {
    expect(outOfPosition(0, 0, TENNIS.halfWidth)).toBe(0);
    expect(outOfPosition(TENNIS.halfWidth, -TENNIS.halfWidth, TENNIS.halfWidth)).toBe(1);
    expect(outOfPosition(1, 0, TENNIS.halfWidth)).toBeGreaterThan(0);
  });
});

describe('the AI hits into the space you left', () => {
  it('it aims AWAY from where the player is standing', () => {
    expect(aiTargetX(4, TENNIS.halfWidth)).toBeLessThan(0);
    expect(aiTargetX(-4, TENNIS.halfWidth)).toBeGreaterThan(0);
  });

  it('it commits harder the further out of position you are', () => {
    expect(Math.abs(aiTargetX(5, TENNIS.halfWidth))).toBeGreaterThan(Math.abs(aiTargetX(1, TENNIS.halfWidth)));
  });

  it('IT NEVER PAINTS THE LINE — an AI that always hits the line is not playing tennis', () => {
    for (const px of [-6, -3, 0, 3, 6]) {
      expect(Math.abs(aiTargetX(px, TENNIS.halfWidth))).toBeLessThanOrEqual(TENNIS.halfWidth * AI_LINE_SAFETY + 1e-9);
    }
    expect(AI_LINE_SAFETY).toBeLessThan(1);
  });

  it('a lower aggression plays it safer', () => {
    expect(Math.abs(aiTargetX(5, TENNIS.halfWidth, 0.3))).toBeLessThan(Math.abs(aiTargetX(5, TENNIS.halfWidth, 1)));
  });
});

describe('volleyball gets its own model, not tennis with a smaller number', () => {
  it('a smaller court comes with a lower top speed and a sharper first step', () => {
    expect(VOLLEY_FOOTWORK.halfWidth).toBeLessThan(TENNIS_FOOTWORK.halfWidth);
    expect(VOLLEY_FOOTWORK.topSpeed).toBeLessThan(TENNIS_FOOTWORK.topSpeed);
    expect(VOLLEY_FOOTWORK.accel).toBeGreaterThan(TENNIS_FOOTWORK.accel);
  });

  it('both models stop harder than they start', () => {
    for (const m of [TENNIS_FOOTWORK, VOLLEY_FOOTWORK]) expect(m.decel).toBeGreaterThan(m.accel);
  });
});
