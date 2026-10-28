// hoops-p02 (1v1/3v3 phase 2): the hand meets the ball — geometry, never a roll.
import { describe, expect, it } from 'vitest';
import { releaseFrom, RELEASE_JUMPER_M, RELEASE_LAYUP_M, jumpRise, reachTop, reachGap, handOnBall, meetsRelease, deflect, aiBlockJumpAtSec, ballOnArc, SHOULDER_M, ARM_M, CONTACT_M, JUMP_SEC, JUMP_RISE_M, AI_BLOCK_LEAD_SEC, BLOCK_DICE_ON, type Blocker } from './blocks';
import { shotArcShape } from '../core/BasketballCore';

const RIM = { x: 0, y: 3.05, z: -0.6 };
const at = (x: number, z: number, jumpAge = Infinity, handsUp = true): Blocker => ({ x, z, jumpAge, handsUp });

describe('hoops/blocks — the hand meets the ball', () => {
  it('ships with the dice off', () => { expect(BLOCK_DICE_ON).toBe(false); });

  it('the jump is the modes\' own curve: on the floor 0, apex at half the clock, landed 0', () => {
    expect(jumpRise(Infinity)).toBe(0);
    expect(jumpRise(0)).toBe(0);
    expect(jumpRise(JUMP_SEC / 2)).toBeCloseTo(JUMP_RISE_M, 6);
    expect(jumpRise(JUMP_SEC)).toBe(0);
    expect(reachTop(at(0, 0))).toBeCloseTo(SHOULDER_M + ARM_M, 6);
    expect(reachTop(at(0, 0, JUMP_SEC / 2))).toBeCloseTo(SHOULDER_M + ARM_M + JUMP_RISE_M, 6);
  });

  it('hands down never touch; a landed jump is hands down', () => {
    expect(reachGap(at(0, 0, Infinity, false), { x: 0, y: 2, z: 0 })).toBe(Infinity);
    expect(reachGap(at(0, 0, JUMP_SEC + 0.5, false), { x: 0, y: 2, z: 0 })).toBe(Infinity);
    expect(reachGap(at(0, 0, 0.2, false), { x: 0, y: 2, z: 0 })).toBe(0);   // in the air the hands are up
  });

  it('a ball inside the reach is touched, one a hand beyond it is not', () => {
    const b = at(0, 0);
    expect(handOnBall(b, { x: 0, y: SHOULDER_M + ARM_M + CONTACT_M - 0.01, z: 0 })).toBe(true);
    expect(handOnBall(b, { x: 0, y: SHOULDER_M + ARM_M + CONTACT_M + 0.02, z: 0 })).toBe(false);
    expect(handOnBall(b, { x: ARM_M + CONTACT_M + 0.05, y: SHOULDER_M, z: 0 })).toBe(false);
  });

  it('the release reads the ShotArc curve (same duration and bow as the flight)', () => {
    const from = { x: 0, y: 2.5, z: 5 };
    const sh = shotArcShape('jumper', Math.hypot(RIM.x - from.x, RIM.y - from.y, RIM.z - from.z));
    const mid = ballOnArc(from, RIM, sh.duration, sh.apex, sh.duration / 2);
    expect(mid.y).toBeCloseTo((from.y + RIM.y) / 2 + sh.apex, 6);
    const end = ballOnArc(from, RIM, sh.duration, sh.apex, sh.duration * 2);
    expect(end.x).toBeCloseTo(RIM.x, 6); expect(end.y).toBeCloseTo(RIM.y, 6); expect(end.z).toBeCloseTo(RIM.z, 6);
  });

  // The defender between the shooter and the rim, 1.1 m off: the ball comes over him.
  const shooter = { x: 0, z: 5 };
  const ball = { x: 0, y: 2.45, z: 4.75 };
  const defZ = shooter.z - 1.1;
  it('a jump timed to the release meets the ball; the same defender on the floor does not', () => {
    expect(meetsRelease(at(0, defZ, JUMP_SEC / 2 - 0.05), ball, RIM, 'jumper').hit).toBe(true);
    expect(meetsRelease(at(0, defZ, Infinity, true), ball, RIM, 'jumper').hit).toBe(false);
  });
  it('a jump far too early (coming down) or far too late (still on the floor) misses', () => {
    expect(meetsRelease(at(0, defZ, JUMP_SEC - 0.02), ball, RIM, 'jumper').hit).toBe(false);
    expect(meetsRelease(at(0, defZ, -0.2), ball, RIM, 'jumper', 0).hit).toBe(false);
  });
  it('the same timed jump from 2.2 m does not reach', () => {
    expect(meetsRelease(at(0, shooter.z - 2.2, JUMP_SEC / 2), ball, RIM, 'jumper').hit).toBe(false);
  });
  it('a blocker BEHIND the shooter (the ball flies away from him) gets less of it than one in front', () => {
    const front = meetsRelease(at(0, shooter.z - 1.3, JUMP_SEC / 2), ball, RIM, 'jumper');
    const behind = meetsRelease(at(0, shooter.z + 1.3, JUMP_SEC / 2), ball, RIM, 'jumper');
    expect(front.gap).toBeLessThan(behind.gap);
  });

  it('the ball flies off along the line it was hit: away from the blocker, up off a rising hand, down off a falling one', () => {
    const v = deflect(at(0, 0, 0.1), { x: 0, y: 2.8, z: 0.5 });
    expect(v.z).toBeGreaterThan(0); expect(v.y).toBeGreaterThan(0);
    expect(deflect(at(0, 0, 0.6), { x: 0, y: 2.8, z: 0.5 }).y).toBeLessThan(0);
    expect(deflect(at(0, 0, 0.1), { x: 0.5, y: 2.8, z: 0 }).x).toBeGreaterThan(0);
  });

  it('the AI times its jump to the release it expects', () => {
    expect(aiBlockJumpAtSec(0.6, 0.22)).toBeCloseTo(0.6 - AI_BLOCK_LEAD_SEC, 6);
    expect(aiBlockJumpAtSec(0.5, 0.42)).toBeCloseTo(0.5 - AI_BLOCK_LEAD_SEC, 6);   // timed off his read at the gather (the reaction wait is the A/B knob, off)
    expect(aiBlockJumpAtSec(0.1, 0)).toBeCloseTo(0.05, 6);
  });

  it('the ball is read from where it leaves the hand: a chest-high "release" is lifted to the release height over his feet', () => {
    expect(releaseFrom({ x: 1, y: 1.7, z: 2 }, 0, 'layup')).toEqual({ x: 1, y: RELEASE_LAYUP_M, z: 2 });
    expect(releaseFrom({ x: 1, y: 1.7, z: 2 }, 0.3, 'jumper').y).toBeCloseTo(0.3 + RELEASE_JUMPER_M, 6);
    expect(releaseFrom({ x: 1, y: 3.1, z: 2 }, 0, 'jumper').y).toBe(3.1);   // already higher: as drawn
  });
  it('a late jump does not reach a ball leaving from the release height; one on the gather does', () => {
    const from = releaseFrom({ x: 0, y: 1.7, z: 4.75 }, 0, 'layup');
    expect(meetsRelease(at(0, 3.9, 0.12), from, RIM, 'layup').hit).toBe(false);   // the rig bot: 0.12 s into his jump
    expect(meetsRelease(at(0, 3.9, 0.33), from, RIM, 'layup').hit).toBe(true);    // jumped on the gather
  });
  it('no dice: the same geometry gives the same answer every time', () => {
    const r = () => meetsRelease(at(0.2, defZ, 0.3), ball, RIM, 'layup').hit;
    const first = r(); for (let i = 0; i < 20; i++) expect(r()).toBe(first);
  });
});
