// lane/improve-hoops-2 phase 4 (2026-11-22): hoops rules, one way in both modes — each switch at 0 is the game as before.
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setFeelOverride, setFeelSession, setFeelUser } from '../../feel-panel/feel';
import { MAKE_BEAT_HOLDS_SHOT, SPIN_SHOT_CUTS_HALF, SPIN_CUT_AT, makeBeatHoldsShot, spinCutNow, spinShotCutsHalf } from './oneRule';
import { ChaseAround, CHASE_STALL_SEC, RIVAL_CHASE_AROUND_BODY, detourPoint } from './boardChase';
import { DRIVE_BY_HAND_ON, driveByHandOk } from './steals';

beforeAll(() => { setFeelUser(true); setFeelSession(null); });
afterEach(() => {
  setFeelOverride('hoops.makeBeatHoldsShot', MAKE_BEAT_HOLDS_SHOT); setFeelOverride('hoops.spinShotCutsHalf', SPIN_SHOT_CUTS_HALF);
  setFeelOverride('hoops.rivalChaseAroundBody', RIVAL_CHASE_AROUND_BODY); setFeelOverride('hoops.driveByHandOn', DRIVE_BY_HAND_ON);
});
const ONEVONE = readFileSync('lib/babylon/modes/OneVOneMode.ts', 'utf8');
const THREEV = readFileSync('lib/babylon/modes/ThreeVThreeMode.ts', 'utf8');

describe('(a) the make beat holds the shot (hoops.makeBeatHoldsShot, ships ON)', () => {
  it('defaults on; 0 turns it off', () => {
    expect(MAKE_BEAT_HOLDS_SHOT).toBe(1); expect(makeBeatHoldsShot()).toBe(true);
    setFeelOverride('hoops.makeBeatHoldsShot', 0); expect(makeBeatHoldsShot()).toBe(false);
  });
  it('is wired: my make marks the possession, and the shot start and the hop step are closed while it is the live one', () => {
    expect(ONEVONE).toMatch(/carrying = true;\n\s+if \(makeBeatHoldsShot\(\)\) makeBeatToken = possessionToken;/);
    expect(ONEVONE).toMatch(/if \(!shooting && !dunking && !spin && carrying && \(meSlot\.intent\.actionHeld[^\n]*&& !dunkGather && makeBeatToken !== possessionToken\) \{/);
    expect(ONEVONE).toMatch(/if \(edge && carrying && !dunking && !posting && makeBeatToken !== possessionToken && hopOnDoubleTap/);
    // the check-up is a new possession: every reset counts the token on
    expect((ONEVONE.match(/possessionToken\+\+/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(ONEVONE).toMatch(/let makeBeatToken = -1;/);
  });
});

describe('(b) the rival\'s chase goes round a body (hoops.rivalChaseAroundBody, shipped OFF: its bar was not met)', () => {
  const self = { x: 0, z: 0 }, ball = { x: 0, z: 6 };
  it('a body across his line, at the standoff, gives a waypoint off its shoulder on his side and past it', () => {
    const w = detourPoint(self, ball, { x: 0.3, z: 1.1 })!;
    expect(w).not.toBeNull();
    expect(w.x).toBeLessThan(0);   // the body is to his right of the line (+x): he goes round its left, the side he is on
    expect(w.z).toBeGreaterThan(1.1);
    expect(Math.hypot(w.x - 0.3, w.z - 1.1 - 0.4)).toBeGreaterThan(1.5);
  });
  it('no waypoint for a body off his line, behind him or past the ball', () => {
    expect(detourPoint(self, ball, { x: 2.5, z: 1.5 })).toBeNull();
    expect(detourPoint(self, ball, { x: 0, z: -1 })).toBeNull();
    expect(detourPoint(self, ball, { x: 0, z: 7 })).toBeNull();
  });
  it('steps round only after the chase has stalled for CHASE_STALL_SEC; 0 = the straight chase', () => {
    expect(RIVAL_CHASE_AROUND_BODY).toBe(0);
    setFeelOverride('hoops.rivalChaseAroundBody', 1);
    const c = new ChaseAround(); const body = { x: 0.2, z: 1.1 };
    let w = null, t = 0;
    for (; t < CHASE_STALL_SEC - 0.05; t += 1 / 60) { w = c.next(1 / 60, t, true, self, ball, body); expect(w).toBeNull(); }
    for (; t < CHASE_STALL_SEC + 0.2 && !w; t += 1 / 60) w = c.next(1 / 60, t, true, self, ball, body);
    expect(w).not.toBeNull(); expect(c.count).toBe(1);
    // a chase that is closing makes no detour
    const d = new ChaseAround(); let z = 0;
    for (let k = 0; k < 120; k++) { z += 0.05; expect(d.next(1 / 60, k / 60, true, { x: 0, z }, ball, { x: 0.2, z: z + 1.1 })).toBeNull(); }
    setFeelOverride('hoops.rivalChaseAroundBody', 0);
    const e = new ChaseAround();
    for (let k = 0; k < 120; k++) expect(e.next(1 / 60, k / 60, true, self, ball, body)).toBeNull();
  });
  it('is wired after the chase line, so the straight chase stays the base', () => {
    expect(ONEVONE).toMatch(/foeBrain\?\.chaseBall\(rivalChaseTarget\(true, !foeFloored && foeStunSec <= 0, ballSim\.pos\)\);\n\s+\{ const n0 = chaseAround\.count; const w = chaseAround\.next\(dt, board\.age/);
  });
});

describe('(c) the 3v3 drive-by must reach the ball (hoops.driveByHandOn, ships OFF: the owner\'s feel call)', () => {
  it('off by default: the drive-by as before, wherever the ball is', () => {
    expect(DRIVE_BY_HAND_ON).toBe(0);
    expect(driveByHandOk({ x: 0, z: 0 }, { x: 0.6, z: 0 }, { x: 1.6, z: 0, y: 0.5 })).toBe(true);
  });
  it('on: the poke\'s hand test — a ball on his far side, his body between, is not reached', () => {
    setFeelOverride('hoops.driveByHandOn', 1);
    expect(driveByHandOk({ x: 0, z: 0 }, { x: 0.6, z: 0 }, { x: 1.0, z: 0.05, y: 0.5 })).toBe(false);
    expect(driveByHandOk({ x: 0, z: 0 }, { x: 0.3, z: 0.8 }, { x: 0.5, z: 0, y: 0.5 })).toBe(true);
  });
  it('is wired on the 3v3 drive-by read', () => {
    expect(THREEV).toMatch(/if \(driveByRead\(\{ x: me\.drib\.vel\.x, z: me\.drib\.vel\.z \}, me\.char\.root\.position, driver\.char\.root\.position\)\n\s+&& driveByHandOk\(me\.char\.root\.position, driver\.char\.root\.position, ballWorld\(\)\)\) \{ driveBySteal\(ctx\); return; \}/);
  });
});

describe('(d) a shot pressed mid-spin, one rule in both modes (hoops.spinShotCutsHalf, ships OFF: the owner\'s feel call)', () => {
  it('off by default: never cuts', () => {
    expect(SPIN_SHOT_CUTS_HALF).toBe(0); expect(spinShotCutsHalf()).toBe(false);
    expect(spinCutNow(0.5, 0.6, true, false)).toBe(false);
  });
  it('on: a waiting press cuts from the half, never before, never a pivot', () => {
    setFeelOverride('hoops.spinShotCutsHalf', 1);
    expect(spinCutNow(0.6 * SPIN_CUT_AT - 0.01, 0.6, true, false)).toBe(false);
    expect(spinCutNow(0.6 * SPIN_CUT_AT, 0.6, true, false)).toBe(true);
    expect(spinCutNow(0.5, 0.6, false, false)).toBe(false);
    expect(spinCutNow(0.5, 0.6, true, true)).toBe(false);
  });
  it('both modes read it at the same place: after the shot buffer, before the shot start', () => {
    for (const src of [ONEVONE, THREEV]) {
      expect(src).toMatch(/shotBuffer\.hold\([^\n]*\n\s+if \(spin && spinCutNow\(spin\.t, spin\.plan\.sec, shotBuffer\.pending, spinClip\.startsWith\('bball_pivot'\)\)\) cutSpin\(\);/);
      expect(src).toMatch(/function cutSpin\(\): void \{/);
    }
  });
});
