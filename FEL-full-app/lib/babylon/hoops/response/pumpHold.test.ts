import { afterEach, describe, expect, it } from 'vitest';
import { pumpHoldSec, pumpHolding, PUMP_BALL_HAND_ON } from './pumpHold';
import { resetFeelForTests, setFeelOverride, setFeelSession, setFeelUser } from '../../../feel-panel/feel';
import { FEEL_KNOB_BY_ID } from '../../../feel-panel/knobs';

describe('pumpHold (hoops-gather: the pump keeps the ball)', () => {
  afterEach(() => resetFeelForTests());
  it('holds for the pump clip, from the pump, inside the step-through window', () => {
    const hold = pumpHoldSec(0.5);
    expect(hold).toBe(0.5);
    expect(pumpHolding(1.0, hold, 1.0)).toBe(true);    // the pump frame
    expect(pumpHolding(0.6, hold, 1.0)).toBe(true);    // 0.4 s in
    expect(pumpHolding(0.45, hold, 1.0)).toBe(false);  // the clip is over: the dribble may come back
    expect(pumpHolding(0, hold, 1.0)).toBe(false);     // a reset / the step-through
  });
  it('no clip, no hold', () => { expect(pumpHoldSec(null)).toBe(0); expect(pumpHoldSec(NaN)).toBe(0); expect(pumpHolding(1, 0, 1)).toBe(false); });
  it('knob hoops.pumpBallHandOn 0 is the old pump (no hold); its default is the constant', () => {
    expect(FEEL_KNOB_BY_ID.get('hoops.pumpBallHandOn')!.def).toBe(PUMP_BALL_HAND_ON);
    resetFeelForTests(); setFeelUser(true); setFeelSession(null); setFeelOverride('hoops.pumpBallHandOn', 0);
    expect(pumpHoldSec(0.5)).toBe(0);
  });
});
