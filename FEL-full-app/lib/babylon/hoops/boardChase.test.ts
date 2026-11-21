// hoops-play (2026-11-21): the 1v1 rival goes and gets a loose ball (knob hoops.rivalChaseBoardOn) — 3v3's rule, on 1v1's rival brain.
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { rivalChaseTarget, RIVAL_CHASE_BOARD_ON } from './boardChase';
import { DefenderBrain } from '../core/BasketballCore';
import { resetFeelForTests, setFeelOverride, setFeelSession, setFeelUser } from '../../feel-panel/feel';

const knob = (v: number): void => { setFeelUser(true); setFeelSession(null); setFeelOverride('hoops.rivalChaseBoardOn', v); };
afterEach(() => resetFeelForTests());
const BALL = new Vector3(-6, 0.12, 2);

describe('rivalChaseTarget', () => {
  it('ships on', () => { expect(RIVAL_CHASE_BOARD_ON).toBe(1); });
  it('on: the ball while a board is live and he is on his feet', () => {
    knob(1);
    expect(rivalChaseTarget(true, true, BALL)).toBe(BALL);
    expect(rivalChaseTarget(true, false, BALL)).toBeNull();   // floored or stunned: he cannot go
    expect(rivalChaseTarget(false, true, BALL)).toBeNull();   // no board
  });
  it('off: never (his seal / his crash, as before)', () => { knob(0); expect(rivalChaseTarget(true, true, BALL)).toBeNull(); });
});

describe('the brain: a chase outranks the seal (the rule 3v3 already runs)', () => {
  const run = (chase: boolean) => {
    const b = new DefenderBrain(0.6, null, () => 0.5);
    const self = new Vector3(0, 0, 1.2), hoop = new Vector3(0, 3.05, 0), me = new Vector3(0.3, 0, 1.8);
    b.boxOut(me);
    if (chase) b.chaseBall(BALL);
    const it = b.decide(1 / 60, self, BALL, hoop, [], [me]);
    return { job: b.job, it, toBall: new Vector3(BALL.x - self.x, 0, BALL.z - self.z).normalize() };
  };
  it('sealing, he stays on his man; chasing, he runs at the ball', () => {
    expect(run(false).job).toBe('boxout');
    const c = run(true);
    expect(c.job).toBe('chase');
    const m = Math.hypot(c.it.moveX, c.it.moveY);
    expect(m).toBeGreaterThan(0.5);
    // the intent points at the ball (the brain's steer: moveX = world x, moveY = world z)
    expect((c.it.moveX * c.toBall.x + c.it.moveY * c.toBall.z) / m).toBeGreaterThan(0.9);
  });
});

describe('1v1 wires it', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'modes', 'OneVOneMode.ts'), 'utf8');
  it('every live-board frame points his chase (null when off, floored or stunned)', () => {
    expect(s).toMatch(/function liveBoard\(ctx: ModeContext, dt: number\): void \{\n\s+if \(!board\) return;\n\s+board\.age \+= dt;\n.*\n\s+foeBrain\?\.chaseBall\(rivalChaseTarget\(true, !foeFloored && foeStunSec <= 0, ballSim\.pos\)\);/);
  });
  it('the chase ends with the board (secured, the stall, out of bounds, a ball in a hand) and with every new possession', () => {
    expect((s.match(/foeBrain\?\.chaseBall\(null\)/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(s).toMatch(/possession = 'mine'; carrying = true;[\s\S]{0,1600}foeBrain\?\.chaseBall\(null\);   \/\/ hoops-play: a new possession ends any board chase/);
  });
  it('off his own miss the crash takes the chase through his slot', () => {
    expect(s).toMatch(/const chasing = !!board && loose && !!foeBrain\?\.chasing;\n\s+const foeCrashSt = chasing \? foeMover\.stepIntent\(dt, foeSlot\.intent\) : foeMover\.track\(dt, wish\);/);
  });
});
