// The handbook is only worth having if the rules in it are the rules that get enforced.
//
// So these tests read like a rulebook quiz rather than a unit suite: who gets the ball, does play stop,
// how many shots. The cases that matter most are the ones the modes used to get wrong on their own.

import { describe, it, expect } from 'vitest';
import {
  HANDBOOK, rule, judge, contactFoul, shotFoul, isGoaltending, paintClock,
  THREE_SECOND_LIMIT, type RuleId, possessionAfterScore, FREE_THROWS_IMPLEMENTED, foulAward} from './Ref';

describe('the handbook is a rulebook, not a config blob', () => {
  it('every rule says what it means in plain language', () => {
    for (const r of HANDBOOK) {
      expect(r.says.length).toBeGreaterThan(40);
      expect(r.call.length).toBeGreaterThan(0);
    }
  });

  it('no rule id appears twice — one rule, one entry, one place to change it', () => {
    const ids = HANDBOOK.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a flow rule carries no whistle, a violation always does', () => {
    expect(rule('make_it_take_it').whistle).toBe(false);
    expect(rule('backcourt').whistle).toBe(false);
    expect(rule('charge').whistle).toBe(true);
    expect(rule('out_of_bounds').whistle).toBe(true);
  });

  it('asking for a rule that does not exist is an error, not a silent undefined', () => {
    expect(() => rule('nonsense' as RuleId)).toThrow(/no handbook entry/);
  });
});

describe('out of bounds', () => {
  it('a missed shot that goes out gives it to the team that did not shoot', () => {
    const c = judge('out_of_bounds', { offense: 'me', shooter: 'me' });
    expect(c.ball).toBe('foe');
    expect(c.deadBall).toBe(true);
  });

  it('and the other way round, symmetrically', () => {
    expect(judge('out_of_bounds', { offense: 'foe', shooter: 'foe' }).ball).toBe('me');
  });

  it('with no shooter named it falls back to the offence having shot it', () => {
    expect(judge('out_of_bounds', { offense: 'me' }).ball).toBe('foe');
  });
});

describe('contact: the charge and its mirror', () => {
  const FOUL_SPEED = 3.2;

  it('running at foul speed into a SET body is a charge, and the defence gets it', () => {
    expect(contactFoul(4.0, 0.2, FOUL_SPEED)).toBe('charge');
    expect(judge('charge', { offense: 'me' }).ball).toBe('foe');
  });

  it('a defender still MOVING into the handler has fouled — it is on him, not the handler', () => {
    // 1v1 does read this case (it has a "FOUL ON THE DEFENDER" branch), but it reads it from a
    // different condition in a different place than its charge — which is exactly how two readings of
    // one collision drift apart. Here the two answers come from ONE function and one threshold.
    expect(contactFoul(4.0, 2.5, FOUL_SPEED)).toBe('blocking_foul');
    expect(judge('blocking_foul', { offense: 'me' }).ball).toBe('me');
  });

  it('the same collision reads as opposite fouls purely on whether the defender was set', () => {
    expect(contactFoul(4.0, 0.1, FOUL_SPEED)).not.toBe(contactFoul(4.0, 3.0, FOUL_SPEED));
  });

  it('slow contact is not a foul at all — bodies are allowed to touch', () => {
    expect(contactFoul(1.2, 0.0, FOUL_SPEED)).toBeNull();
  });
});

describe('a shooter met in the air', () => {
  it('a make is an and-one: one shot, and the basket stands', () => {
    expect(shotFoul(true)).toBe('and_one');
    expect(rule('and_one').shots).toBe(1);
  });

  it('a miss is a shooting foul worth two, and the ball goes to the shooter who was fouled', () => {
    expect(shotFoul(false)).toBe('shooting_foul');
    expect(rule('shooting_foul').shots).toBe(2);
    expect(judge('shooting_foul', { offense: 'me', fouled: 'me' }).ball).toBe('me');
  });

  it('the detail rides the banner so the ref can say WHERE it happened', () => {
    expect(judge('shooting_foul', { offense: 'me', detail: 'ON THE FINISH' }).banner)
      .toBe('FOUL ON THE SHOT — ON THE FINISH');
  });
});

describe('a loose ball belongs to nobody, so a foul on it goes to whoever was fouled', () => {
  it('the offence being fouled on the scramble keeps it', () => {
    expect(judge('loose_ball_foul', { offense: 'me', fouled: 'me' }).ball).toBe('me');
  });

  it('the DEFENCE being fouled on the scramble gets it — not the offence by default', () => {
    // the case an inline rule gets wrong: on a rebound neither team is on offence
    expect(judge('loose_ball_foul', { offense: 'me', fouled: 'foe' }).ball).toBe('foe');
  });
});

describe('goaltending: legal on the way up, not on the way down', () => {
  const RIM_Y = 3.05;

  it('a ball swatted while FALLING above the ring is goaltending', () => {
    expect(isGoaltending(-3, 3.4, RIM_Y)).toBe(true);
  });

  it('a ball blocked on the way UP is a clean block', () => {
    expect(isGoaltending(4, 3.4, RIM_Y)).toBe(false);
  });

  it('a ball falling BELOW the ring is not goaltending either', () => {
    expect(isGoaltending(-3, 2.0, RIM_Y)).toBe(false);
  });

  it('the basket counts, so the ball goes to the team that did not shoot', () => {
    expect(judge('goaltending', { offense: 'me', shooter: 'me' }).ball).toBe('foe');
  });
});

describe('three seconds is about camping, not passing through', () => {
  it('standing in the paint accumulates toward the call', () => {
    let t = 0;
    for (let i = 0; i < 60; i++) t = paintClock(t, true, 1 / 60);
    expect(t).toBeCloseTo(1, 5);
  });

  it('leaving the paint RESETS it — a cut through is not a violation', () => {
    let t = 2.9;
    t = paintClock(t, false, 1 / 60);
    expect(t).toBe(0);
  });

  it('the limit is reachable by standing still and never by cutting', () => {
    let camp = 0, cutter = 0;
    for (let i = 0; i < 300; i++) {
      camp = paintClock(camp, true, 1 / 60);
      cutter = paintClock(cutter, i % 30 < 20, 1 / 60);   // in and out
    }
    expect(camp).toBeGreaterThan(THREE_SECOND_LIMIT);
    expect(cutter).toBeLessThan(THREE_SECOND_LIMIT);
  });

  it('the call turns the ball over', () => {
    expect(judge('three_seconds', { offense: 'me' }).ball).toBe('foe');
  });
});

describe('flow rules keep the ball live', () => {
  it('make it take it is not a whistle and does not stop play', () => {
    const c = judge('make_it_take_it', { offense: 'me' });
    expect(c.ball).toBe('me');
    expect(c.deadBall).toBe(false);
    expect(c.whistle).toBe(false);
  });

  it('taking it back is the offence keeping the ball, not a violation', () => {
    expect(judge('backcourt', { offense: 'foe' }).ball).toBe('foe');
    expect(rule('backcourt').deadBall).toBe(false);
  });
});

// ── THE FORMAT (2026-09-13) ──────────────────────────────────────────────────────────────────────────────
//
// The rule the two modes actually disagreed about, and the one the Ref existed to end. 1v1 ran
// make-it-take-it; 3v3 handed the ball over on every make. Neither is wrong — one is streetball, the other
// is FIBA 3x3 — but the difference lived in two `later(…)` calls buried in scoring branches, so it was an
// accident rather than a decision.

describe('possessionAfterScore', () => {
  it('make-it-take-it keeps the ball with the scorer', () => {
    expect(possessionAfterScore('make_it_take_it', 'me')).toBe('me');
    expect(possessionAfterScore('make_it_take_it', 'foe')).toBe('foe');
  });

  it('alternating hands it over, whoever scored', () => {
    expect(possessionAfterScore('alternating', 'me')).toBe('foe');
    expect(possessionAfterScore('alternating', 'foe')).toBe('me');
  });

  it('IT IS SYMMETRIC — the format cannot favour one side', () => {
    // 1v1's original bug was exactly this: their make gave ME the ball (loser's ball) while my make kept it
    for (const f of ['make_it_take_it', 'alternating'] as const) {
      const mine = possessionAfterScore(f, 'me');
      const theirs = possessionAfterScore(f, 'foe');
      expect(mine, f).not.toBe(theirs);
    }
  });
});

describe('what a foul is worth in a game with no free throws', () => {
  it('the handbook still says what a foul SHOULD be worth', () => {
    expect(rule('and_one').shots).toBe(1);
    expect(rule('shooting_foul').shots).toBe(2);
  });

  it('BUT NOTHING IMPLEMENTS THEM, and the flag says so rather than implying it', () => {
    // `Call.shots` has been computed and returned since the Ref was written and read by nobody. Both modes
    // play a pickup format where a foul is answered with the ball. This is the honest statement of that.
    expect(FREE_THROWS_IMPLEMENTED).toBe(false);
    expect(foulAward(judge('and_one', { offense: 'me', fouled: 'me' }))).toBe('ball_back');
    expect(foulAward(judge('shooting_foul', { offense: 'me', fouled: 'me' }))).toBe('ball_back');
  });

  it('and a foul gives the ball to the fouled team, which is what both modes now do', () => {
    expect(judge('and_one', { offense: 'me', shooter: 'me', fouled: 'me' }).ball).toBe('me');
    expect(judge('shooting_foul', { offense: 'me', shooter: 'me', fouled: 'me' }).ball).toBe('me');
  });
});
