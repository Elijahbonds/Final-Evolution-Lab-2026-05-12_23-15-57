import { describe, expect, it } from 'vitest';
import { AirTrick } from './air-trick';

describe('AirTrick spin direction (big air D4)', () => {
  it('defaults frontside and accumulates positive half-turns', () => {
    const t = new AirTrick({ now: () => 0 });
    t.trick(); t.trick();
    expect(t.rotation).toBe(1);
  });
  it('backside spins accumulate negative rotation and still grade clean on a full turn', () => {
    let now = 0;
    const t = new AirTrick({ now: () => now });
    t.setDir(-1); t.trick(); t.trick();
    expect(t.rotation).toBe(-1);
    t.stick(); now = 50;
    const r = t.land();
    expect(r.grade).toBe('stuck');
    expect(r.rotations).toBe(-1);
  });
  it('the direction cannot flip after the first tap', () => {
    const t = new AirTrick({ now: () => 0 });
    t.trick(); t.setDir(-1); t.trick();
    expect(t.rotation).toBe(1);
  });
  it('landing resets the direction to frontside for the next air', () => {
    const t = new AirTrick({ now: () => 0 });
    t.setDir(-1); t.trick(); t.land();
    expect(t.dir).toBe(1);
  });
});
