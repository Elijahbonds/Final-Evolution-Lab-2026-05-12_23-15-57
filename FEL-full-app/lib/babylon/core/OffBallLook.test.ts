// H3c: where a body off the ball keeps its chest and eyes (OffBallLook). Before, the offence off the ball looked at the rim (the ball
// out of view about half the time) and every defender's chest faced the handler, his own man or not.
import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { OffBallLook, MAN_GLANCE_EVERY, MAN_GLANCE_SEC, MID_Y } from './OffBallLook';

const RIM = new Vector3(0, 3.05, -0.6);
const self = new Vector3(0, 0, 0);
const ball = new Vector3(4, 1, 0);    // the ball to his right
const man = new Vector3(0, 0, 4);     // his man ahead
const yawOf = (from: Vector3, to: Vector3) => Math.atan2(to.x - from.x, to.z - from.z);

describe('OffBallLook', () => {
  it('offence off the ball: the eyes on the ball, the chest on the job', () => {
    const l = new OffBallLook().update({ self, ball, jobAim: RIM, man: null, side: 'offense', job: 'space', dt: 1 / 60 });
    expect(l.eyes.equals(ball)).toBe(true);
    expect(l.aim.equals(RIM)).toBe(true);
  });
  it('a screener: the eyes on the man he screens', () => {
    const l = new OffBallLook().update({ self, ball, jobAim: man, man, side: 'offense', job: 'screen', dt: 1 / 60 });
    expect(l.reading).toBe('man');
    expect(l.eyes.y).toBeCloseTo(man.y + MID_Y, 9);
  });
  it('an off-ball defender: the chest between the ball and his man (the pistols), the eyes on the ball, a glance at the man', () => {
    const l = new OffBallLook(); let glance = 0; const n = Math.round(MAN_GLANCE_EVERY * 4 * 60);
    for (let i = 0; i < n; i++) { l.update({ self, ball, jobAim: ball, man, side: 'defense', job: 'deny', dt: 1 / 60 }); if (l.reading === 'man') glance++; }
    const a = yawOf(self, l.aim), b = yawOf(self, ball), m = yawOf(self, man);
    expect(a).toBeCloseTo((b + m) / 2, 6);   // the bisector (45° between a ball at 90° and a man at 0°)
    expect(glance / 60).toBeGreaterThan(4 * MAN_GLANCE_SEC - 0.05);
    expect(glance / 60).toBeLessThan(4 * MAN_GLANCE_SEC + 0.05);
  });
  it('the on-ball defender: chest and eyes on his man', () => {
    const l = new OffBallLook().update({ self, ball, jobAim: ball, man, side: 'defense', job: 'onball', dt: 1 / 60 });
    expect(l.aim.equals(man)).toBe(true);
    expect(l.eyes.asArray()).toEqual([man.x, man.y + MID_Y, man.z]);
  });
  it('a box-out or a chase keeps the job\'s chest, the eyes on the ball (the shot off the iron, the loose ball)', () => {
    const box = new Vector3(1, 0, 1);
    for (const job of ['boxout', 'chase']) {
      const l = new OffBallLook().update({ self, ball, jobAim: box, man, side: 'defense', job, dt: 1 / 60 });
      expect(l.aim.equals(box)).toBe(true); expect(l.eyes.equals(ball)).toBe(true);
    }
  });
});
