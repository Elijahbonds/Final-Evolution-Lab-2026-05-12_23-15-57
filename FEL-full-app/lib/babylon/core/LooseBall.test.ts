// Does a miss tell you what you did wrong, and does somebody have to go and get the ball?
//
// These two questions are the whole point of the rim + loose-ball work, so they are what the tests
// ask. Not "does the function return a value" — whether a short shot comes BACK TO THE SHOOTER and a
// long one RUNS AWAY, because that is the feedback loop a shooter learns their stroke from.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Vector3 } from '@babylonjs/core';
import { resolveRim, missProfileFor, forcedMissProfile, RIM_RADIUS, BALL_RADIUS } from './RimPhysics';
import { ballVsBodies, resolvePickup, bobbleVelocity, boardOutcome, ballOutOfPlay, HOOPS_BALL_BOUNDS, type BodyRef } from './LooseBall';

const RIM = new Vector3(0, 3.05, -6);
/** Shooter stands at +z of the rim, so "toward the shooter" is +z. */
const TO_SHOOTER = new Vector3(0, 0, 1);

const body = (id: string, x: number, z: number, over: Partial<BodyRef> = {}): BodyRef =>
  ({ id, pos: new Vector3(x, 0, z), radius: 0.32, reachY: 2.1, ...over });

describe('rim: the miss is the feedback', () => {
  it('a shot short off the front iron comes back toward the shooter', () => {
    const r = resolveRim(RIM, TO_SHOOTER, { depthError: -0.2, lateralError: 0.01, descentSpeed: 6 });
    expect(r.kind).toBe('front');
    expect(r.made).toBe(false);
    // the whole promise: it returns to the shooter's side
    expect(r.outVel.z).toBeGreaterThan(0.5);
    // and it contacts the near edge of the ring, not the centre
    expect(r.contact.z).toBeCloseTo(RIM.z + RIM_RADIUS, 5);
  });

  it('a shot long off the back iron runs away from the shooter', () => {
    const r = resolveRim(RIM, TO_SHOOTER, { depthError: 0.22, lateralError: 0.01, descentSpeed: 6 });
    expect(r.kind).toBe('back');
    expect(r.outVel.z).toBeLessThan(-0.5);        // opposite sign to the short miss
    expect(r.contact.z).toBeCloseTo(RIM.z - RIM_RADIUS, 5);
  });

  it('short and long kick the ball to OPPOSITE sides of the rim — the reason a miss is readable', () => {
    const short = resolveRim(RIM, TO_SHOOTER, { depthError: -0.25, lateralError: 0, descentSpeed: 6 });
    const long = resolveRim(RIM, TO_SHOOTER, { depthError: 0.25, lateralError: 0, descentSpeed: 6 });
    expect(Math.sign(short.outVel.z)).toBe(-Math.sign(long.outVel.z));
  });

  it('a lateral error glances off that side, and the side follows the shot line (not a world axis)', () => {
    const r = resolveRim(RIM, TO_SHOOTER, { depthError: 0.02, lateralError: 0.3, descentSpeed: 6 });
    expect(r.kind).toBe('right');
    expect(r.contact.x).not.toBeCloseTo(RIM.x, 2);

    // shoot from the opposite side: the same lateral error must mirror, because "right" is relative
    const mirrored = resolveRim(RIM, new Vector3(0, 0, -1), { depthError: 0.02, lateralError: 0.3, descentSpeed: 6 });
    expect(Math.sign(mirrored.contact.x - RIM.x)).toBe(-Math.sign(r.contact.x - RIM.x));
  });

  it('dead centre is a swish and drops straight through', () => {
    const r = resolveRim(RIM, TO_SHOOTER, { depthError: 0.01, lateralError: 0.01, descentSpeed: 6 });
    expect(r.kind).toBe('swish');
    expect(r.made).toBe(true);
    expect(r.outVel.y).toBeLessThan(0);
  });

  it('a soft shot with good depth is rewarded — it drops in off the iron', () => {
    const soft = resolveRim(RIM, TO_SHOOTER, { depthError: -0.09, lateralError: 0, descentSpeed: 4 });
    expect(soft.made).toBe(true);
    // the identical error thrown hard is NOT rewarded; arc has to matter
    const hard = resolveRim(RIM, TO_SHOOTER, { depthError: -0.09, lateralError: 0, descentSpeed: 9 });
    expect(hard.made).toBe(false);
  });

  it('the iron damps — a rim shot never leaves faster than it arrived', () => {
    for (const d of [-0.3, 0.3, 0.18]) {
      const r = resolveRim(RIM, TO_SHOOTER, { depthError: d, lateralError: 0, descentSpeed: 8 });
      expect(r.outVel.length()).toBeLessThan(8);
    }
  });

  it('a worse shot misses by more, and a perfect one is centred', () => {
    // scatter pinned to its positive extreme: with no bias, scatter is the ONLY error source, so
    // rand()===0.5 would zero it and the test would compare 0 with 0 and prove nothing
    const rand = () => 1;
    const perfect = missProfileFor(1, {}, rand);
    expect(Math.hypot(perfect.depthError, perfect.lateralError)).toBeLessThan(0.01);
    const awful = missProfileFor(0, {}, rand);
    expect(Math.abs(awful.depthError)).toBeGreaterThan(Math.abs(perfect.depthError));
  });

  it('a shot the mode already scored as a miss can never deflect as a make', () => {
    // the worst case: a perfect-quality profile with no bias lands dead centre, which resolveRim
    // would call a swish while the scoreboard has already recorded the miss
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const p = forcedMissProfile(1, {}, () => r);
      const out = resolveRim(RIM, TO_SHOOTER, p);
      expect(out.made).toBe(false);
    }
  });

  it('the forced miss still goes the way the shot earned — short stays short', () => {
    const p = forcedMissProfile(0.9, { short: 1 }, () => 0.5);
    expect(p.depthError).toBeLessThan(0);
    expect(resolveRim(RIM, TO_SHOOTER, p).kind).toBe('front');
  });

  it('a hand in the face pushes the miss SHORT, not in a random direction', () => {
    const rand = () => 0.5;
    const contested = missProfileFor(0.4, { short: 1 }, rand);
    expect(contested.depthError).toBeLessThan(0);          // short, reliably
  });
});

describe('loose ball: it hits bodies', () => {
  it('a ball travelling into a torso is deflected, not passed through', () => {
    const hit = ballVsBodies(
      new Vector3(0, 1.2, 1), new Vector3(0, 1.2, 0.2), new Vector3(0, 0, -6), BALL_RADIUS, [body('d', 0, 0)],
    );
    expect(hit).not.toBeNull();
    expect(hit!.body.id).toBe('d');
    expect(hit!.outVel.z).toBeGreaterThan(0);               // came back off the chest
  });

  it('a body absorbs — the ball comes off slower than it arrived', () => {
    const hit = ballVsBodies(
      new Vector3(0, 1.2, 1), new Vector3(0, 1.2, 0.2), new Vector3(0, 0, -6), BALL_RADIUS, [body('d', 0, 0)],
    );
    expect(hit!.outVel.length()).toBeLessThan(6);
  });

  it('a ball crossing a torso inside one frame is still caught (swept, not sampled)', () => {
    // 9 m/s over a 16 ms frame is 14 cm — but start and end are both clear of the body
    const hit = ballVsBodies(
      new Vector3(0, 1.2, 0.5), new Vector3(0, 1.2, -0.5), new Vector3(0, 0, -9), BALL_RADIUS, [body('d', 0, 0)],
    );
    expect(hit).not.toBeNull();
  });

  it('a ball over the head or under the knees passes untouched', () => {
    const over = ballVsBodies(
      new Vector3(0, 2.6, 1), new Vector3(0, 2.6, -1), new Vector3(0, 0, -6), BALL_RADIUS, [body('d', 0, 0)],
    );
    expect(over).toBeNull();
    const under = ballVsBodies(
      new Vector3(0, 0.1, 1), new Vector3(0, 0.1, -1), new Vector3(0, 0, -6), BALL_RADIUS, [body('d', 0, 0)],
    );
    expect(under).toBeNull();
  });

  it('with two bodies in the path, the NEARER one is struck', () => {
    const hit = ballVsBodies(
      new Vector3(0, 1.2, 3), new Vector3(0, 1.2, -2), new Vector3(0, 0, -8), BALL_RADIUS,
      [body('far', 0, -1), body('near', 0, 1.5)],
    );
    expect(hit!.body.id).toBe('near');
  });
});

describe('loose ball: somebody has to come down with it', () => {
  const FAST = new Vector3(0, -2, 0);
  const calm = () => 0.99;                                  // never bobble, so position is what is read

  it('nobody near it means nobody gets it — the ball stays live', () => {
    const r = resolvePickup(new Vector3(0, 0.4, 0), FAST, [body('a', 5, 5)], { rand: calm });
    expect(r.winner).toBeNull();
  });

  it('the closer body secures it', () => {
    const r = resolvePickup(new Vector3(0, 0.4, 0), FAST, [body('far', 0, 0.9), body('close', 0, 0.2)], { rand: calm });
    expect(r.winner!.id).toBe('close');
  });

  it('boxing out is worth real position: the further body wins the seal', () => {
    const open = resolvePickup(new Vector3(0, 0.4, 0), FAST, [body('sealed', 0, 0.75, { boxingOut: true }), body('quick', 0, 0.35)], { rand: calm });
    expect(open.winner!.id).toBe('sealed');
  });

  it('but the seal is not a guarantee — beat it by enough and you still get the ball', () => {
    const r = resolvePickup(new Vector3(0, 0.4, 0), FAST, [body('sealed', 0, 0.9, { boxingOut: true }), body('quick', 0, 0.05)], { rand: calm });
    expect(r.winner!.id).toBe('quick');
  });

  it('two bodies equally close is a contested board', () => {
    const r = resolvePickup(new Vector3(0, 0.4, 0), FAST, [body('a', -0.2, 0), body('b', 0.2, 0)], { rand: calm });
    expect(r.contested).toBe(true);
  });

  it('a floored or stunned body cannot secure it', () => {
    const r = resolvePickup(new Vector3(0, 0.4, 0), FAST, [body('down', 0, 0.05, { unavailable: true }), body('up', 0, 0.8)], { rand: calm });
    expect(r.winner!.id).toBe('up');
  });

  it('a ball above everyone reach is nobody ball yet', () => {
    const high = resolvePickup(new Vector3(0, 3.0, 0), FAST, [body('a', 0, 0.1)], { rand: calm });
    expect(high.winner).toBeNull();
  });

  it('a taller reach secures a ball a shorter body cannot', () => {
    const tall = resolvePickup(new Vector3(0, 2.2, 0), FAST, [body('tall', 0, 0.2, { reachY: 2.3 }), body('short', 0, 0.1, { reachY: 1.7 })], { rand: calm });
    expect(tall.winner!.id).toBe('tall');
  });

  it('a hot ball in traffic squirts loose — and the bobble keeps it live', () => {
    const hot = new Vector3(0, -3, 14);
    const r = resolvePickup(new Vector3(0, 0.5, 0), hot, [body('a', -0.15, 0), body('b', 0.15, 0)], { rand: () => 0.01 });
    expect(r.bobbled).toBe(true);
    const out = bobbleVelocity(hot, () => 0.5);
    expect(out.y).toBeGreaterThan(0);                       // pops up, stays in play
    expect(out.length()).toBeLessThan(hot.length());        // but slower than it came in
  });

  it('a slow ball with one body on it is secured cleanly', () => {
    const r = resolvePickup(new Vector3(0, 0.4, 0), new Vector3(0, -1, 0.5), [body('a', 0, 0.1)], { rand: () => 0.5 });
    expect(r.winner!.id).toBe('a');
    expect(r.bobbled).toBe(false);
  });
});

describe('what winning a board MEANS depends on whose miss it was', () => {
  it('my board off my own miss is a PUTBACK — the play does not stop', () => {
    expect(boardOutcome('me', 'me')).toBe('putback');
  });

  it('their board off their own miss is their putback — they go straight back up', () => {
    expect(boardOutcome('foe', 'foe')).toBe('putback');
  });

  it('my board off THEIR miss is a change of possession, not a putback', () => {
    expect(boardOutcome('me', 'foe')).toBe('possession');
  });

  it('their board off MY miss is a change of possession', () => {
    expect(boardOutcome('foe', 'me')).toBe('possession');
  });

  it('an offensive rebound is never worth the same as losing it — the bug this rule fixes', () => {
    // resetting on EVERY board meant these two were identical outcomes
    expect(boardOutcome('me', 'me')).not.toBe(boardOutcome('foe', 'me'));
  });
});

describe('a rebound that leaves the floor is dead, not a four-second wait', () => {
  const B = HOOPS_BALL_BOUNDS;

  it('a ball on the floor is in play', () => {
    expect(ballOutOfPlay({ x: 0, z: 6 }, B)).toBe(false);
    expect(ballOutOfPlay({ x: 7.5, z: 14 }, B)).toBe(false);
  });

  it('THE BALL BOUNDS ARE NOT THE BODY CLAMP — a ball at the rim is in play', () => {
    // the rim is at z -0.6 and bodies are clamped to z >= 0.5, so reusing the body clamp called every
    // rebound out of bounds: measured 5 of 5, and the dead-ball rule ate the entire board
    expect(ballOutOfPlay({ x: 0, z: -0.6 }, B)).toBe(false);
    expect(ballOutOfPlay({ x: 0.23, z: -0.83 }, B)).toBe(false);   // off the back iron, behind the ring
  });

  it('a ball past the sideline is out', () => {
    expect(ballOutOfPlay({ x: 11, z: 6 }, B)).toBe(true);
    expect(ballOutOfPlay({ x: -11, z: 6 }, B)).toBe(true);
  });

  it('a ball well behind the backboard, or past the half line, is out', () => {
    expect(ballOutOfPlay({ x: 0, z: -4 }, B)).toBe(true);
    expect(ballOutOfPlay({ x: 0, z: 18 }, B)).toBe(true);
  });

  it('the measured failure: a ball every clamped body sits equidistant from is out', () => {
    expect(ballOutOfPlay({ x: 12, z: 6 }, B)).toBe(true);
  });
});

// HOTFIX (2026-09-24): the 3v3 STALE BOARD. The rival's miss scheduled the old dice race (boardAfterMiss) 900 ms after the
// release while the same shot's arc was setting a LIVE board — and neither possession change cleared `board`, so the live
// board kept awarding rebounds in the next possession. The mode is one closure over a scene; its contract is read off the source.
describe('3v3: one owner for a miss, and a possession change ends the board', () => {
  const SRC = readFileSync(path.join(__dirname, '../modes/ThreeVThreeMode.ts'), 'utf8');
  const CODE = SRC.replace(/\/\/.*$/gm, '');   // the comments may name the old call
  /** One of the mode's own functions, up to the next one. */
  const fn = (name: string): string => {
    const at = CODE.indexOf(`function ${name}(`);
    expect(at, name).toBeGreaterThan(-1);
    const rest = CODE.slice(at + 1);
    const end = rest.search(/\n {2}(async )?function |\n {2}return \{/);
    return end < 0 ? rest : rest.slice(0, end);
  };

  it('dropBoard ends the board, its chase and the loose ball', () => {
    const drop = fn('dropBoard');
    expect(drop).toContain('board = null');
    expect(drop).toContain('endChase()');
    expect(drop).toContain('ballSim.stop()');
  });

  it('both possession changes drop the board', () => {
    expect(fn('resetPossession')).toContain('dropBoard();');
    expect(fn('opponentPossession')).toContain('dropBoard();');
  });

  it("their miss is not raced at the release: the live board decides it (a make is still scheduled)", () => {
    const opp = fn('opponentPossession');
    expect(opp).not.toContain('boardAfterMiss');
    expect(opp).toMatch(/if \(made\) later\(900, \(\) => resetPossession\(true\)\);/);
  });

  it('while their miss is live, the pokes need a man WITH the ball (no strip of the empty-handed shooter)', () => {
    // the parry-vault / drive-by press and the poke / reach-in: both read `driver`, who stays set until the next possession
    expect(CODE.match(/driver && ball\.parent && !driveStolen/g) ?? []).toHaveLength(2);
    expect(CODE).not.toMatch(/driver && !driveStolen/);
  });

  it('the miss that flies still sets the live board (the owner this defers to)', () => {
    expect(CODE).toMatch(/if \(r === 'missed'\) \{[^}]*board = \{ age: 0, contestedCalled: false, shooter: mateMiss\?\.team \?\? 'foe' \};/);
  });

  it('their live miss ends their shooter\'s drive: he lets go of the finish and is no longer pinned as the driver', () => {
    // the `f === driver` branch stands him still facing the rim and skips his brain's chase; the board can now run 4 s
    const missed = CODE.slice(CODE.indexOf("if (r === 'missed') {"));
    expect(missed.slice(0, missed.indexOf('} else if'))).toMatch(/if \(board\.shooter === 'foe' && driver && !ball\.parent\) \{ driver\.tree\.release\(\); driver = null; \}/);
  });
});
