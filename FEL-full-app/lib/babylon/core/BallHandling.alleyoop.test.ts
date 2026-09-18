import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { LOB_MIN_CUT_SPEED, LOB_RIM_RADIUS, PassFlight, choosePassType } from './BallHandling';

const rim = new Vector3(0, 3.05, 0.6);
describe('the alley-oop lob', () => {
  it('is chosen only for a teammate cutting hard toward the rim from close', () => {
    const passer = new Vector3(4, 0, 6);
    const cutter = new Vector3(1.5, 0, 2.5);                    // ~2.4 m from the rim
    const towardRim = rim.subtract(cutter); towardRim.y = 0; towardRim.normalize();
    expect(choosePassType(passer, cutter, [], { rim, targetVel: towardRim.scale(LOB_MIN_CUT_SPEED + 1) })).toBe('lob');
    expect(choosePassType(passer, cutter, [], { rim, targetVel: towardRim.scale(0.5) })).toBe('chest');          // jogging: no lob
    expect(choosePassType(passer, cutter, [], { rim, targetVel: towardRim.scale(-3) })).toBe('chest');           // cutting away
    const far = new Vector3(-4, 0, LOB_RIM_RADIUS + 3);
    expect(choosePassType(passer, far, [], { rim, targetVel: new Vector3(1, 0, -3) })).toBe('chest');           // too far out
  });
  it('a lob goes over a corridor defender that would force a bounce pass', () => {
    const passer = new Vector3(4, 0, 6), cutter = new Vector3(1.5, 0, 2.5);
    const mid = Vector3.Lerp(passer, cutter, 0.5);
    const towardRim = rim.subtract(cutter); towardRim.y = 0; towardRim.normalize();
    expect(choosePassType(passer, cutter, [mid])).toBe('bounce');
    expect(choosePassType(passer, cutter, [mid], { rim, targetVel: towardRim.scale(3) })).toBe('lob');
  });
  it('the lob flight peaks high and arrives above the catcher', () => {
    const f = new PassFlight(); const ball = new Vector3();
    f.start(new Vector3(4, 1.2, 6), new Vector3(1.5, 1.2, 2.5), 'lob');
    let peak = 0; let done = false;
    for (let i = 0; i < 200 && !done; i++) { done = f.step(1 / 60, ball); peak = Math.max(peak, ball.y); }
    expect(peak).toBeGreaterThan(2.8);
    expect(ball.y).toBeGreaterThan(2.3);
  });
});
