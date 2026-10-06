// IMPROVE (2026-10-06, skate item 2) — the HUD goes out only when a value moved.
import { describe, expect, it } from 'vitest';
import { HudDelta } from './rideHud';

describe('HudDelta', () => {
  it('sends everything the first time, then only what changed, then nothing', () => {
    const d = new HudDelta();
    expect(d.diff({ combo: '', pot: 0, time: 90 })).toEqual({ combo: '', pot: 0, time: 90 });
    expect(d.diff({ combo: '', pot: 0, time: 90 })).toBeNull();
    expect(d.diff({ combo: '2x', pot: 0, time: 90 })).toEqual({ combo: '2x' });
    expect(d.diff({ time: 89 })).toEqual({ time: 89 });
  });
  it('a null is a value (a meter that goes away is a change), and a reset sends it all again', () => {
    const d = new HudDelta();
    d.diff({ balance: 40 });
    expect(d.diff({ balance: null })).toEqual({ balance: null });
    expect(d.diff({ balance: null })).toBeNull();
    d.reset();
    expect(d.diff({ balance: null })).toEqual({ balance: null });
  });
});
