import { afterEach, describe, expect, it, vi } from 'vitest';
import { dunkTake, DUNK_TAKE_READ_ON, DUNK_TAKE_BY_SEC } from './dunkTake';
import { DUNK_HAND } from './dunkHand';
import { resetFeelForTests, setFeelOverride, setFeelSession, setFeelUser } from '../../feel-panel/feel';
import { FEEL_KNOB_BY_ID } from '../../feel-panel/knobs';

// A carry stub: pickUp answers `answer`; while reading, settlePickUp parents the ball to the hand it was last asked for.
function stub(answer: 'now' | 'reading') {
  const ball = { parent: null as null | { name: string } } as unknown as { parent: null | { name: string } };
  let reading = false, hand: string | undefined;
  const carry = {
    update: vi.fn(),
    pickUp: vi.fn((h?: string) => { if (reading) { hand = h ?? hand; return 'reading' as const; } if (answer === 'reading') { reading = true; hand = h; return 'reading' as const; } ball.parent = { name: 'RightHand' }; return 'now' as const; }),
    settlePickUp: vi.fn(() => { if (reading) { reading = false; ball.parent = { name: hand ?? 'RightHand' }; } }),
    get pickingUp() { return reading; },
  };
  return { ball, carry };
}
const SK = {} as never;

describe('dunkTake (hoops-gather G4: the dunk take-off reads the bounce)', () => {
  afterEach(() => resetFeelForTests());
  const on = () => { resetFeelForTests(); setFeelUser(true); setFeelSession(null); setFeelOverride('hoops.dunkTakeReadOn', 1); };
  it('off (the default): the old park, update(0, 0, false), and no pick-up', () => {
    expect(FEEL_KNOB_BY_ID.get('hoops.dunkTakeReadOn')!.def).toBe(DUNK_TAKE_READ_ON);
    const { ball, carry } = stub('reading');
    ball.parent = { name: DUNK_HAND };   // (already in the dunking hand: the pass is a no-op, no skeleton needed)
    dunkTake(ball as never, SK, carry as never);
    expect(carry.update).toHaveBeenCalledWith(0, 0, false);
    expect(carry.pickUp).not.toHaveBeenCalled();
  });
  it('on, reading: the dunking hand is asked for, nothing is forced before DUNK_TAKE_BY_SEC, the take by then at the latest', () => {
    on();
    const { ball, carry } = stub('reading');
    const step = dunkTake(ball as never, SK, carry as never);
    expect(carry.pickUp).toHaveBeenLastCalledWith(DUNK_HAND);
    step(0.05); expect(carry.settlePickUp).not.toHaveBeenCalled(); expect(ball.parent).toBeNull();
    step(DUNK_TAKE_BY_SEC); expect(carry.settlePickUp).toHaveBeenCalled(); expect(ball.parent!.name).toBe(DUNK_HAND);
    step(DUNK_TAKE_BY_SEC + 0.1);   // taken into the dunking hand: no pass after
    expect(ball.parent!.name).toBe(DUNK_HAND);
  });
  it('on, taken at once (near the top): no update(0, 0, false) of its own — the pick-up already parked it', () => {
    on();
    const { ball, carry } = stub('now');
    dunkTake(ball as never, SK, carry as never);
    expect(carry.pickUp).toHaveBeenCalledTimes(1);
    expect(carry.update).not.toHaveBeenCalled();
  });
});
