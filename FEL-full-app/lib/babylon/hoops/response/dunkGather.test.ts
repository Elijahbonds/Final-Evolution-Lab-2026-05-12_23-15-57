import { afterEach, describe, expect, it } from 'vitest';
import { dunkGatherDone, DUNK_GATHER_ON, DUNK_GATHER_MAX_SEC } from './dunkGather';
import { resetFeelForTests } from '../../../feel-panel/feel';
import { FEEL_KNOB_BY_ID } from '../../../feel-panel/knobs';

describe('dunkGather (the drive dunk gathers, then goes up)', () => {
  afterEach(() => resetFeelForTests());
  it('the knobs default to the constants', () => {
    expect(FEEL_KNOB_BY_ID.get('hoops.dunkGatherOn')!.def).toBe(DUNK_GATHER_ON);
    expect(FEEL_KNOB_BY_ID.get('hoops.dunkGatherMaxSec')!.def).toBe(DUNK_GATHER_MAX_SEC);
  });
  it('goes up when the ball is in the hands, or at the longest wait — never before', () => {
    expect(dunkGatherDone(false, 0)).toBe(true);
    expect(dunkGatherDone(true, 0.1)).toBe(false);
    expect(dunkGatherDone(true, DUNK_GATHER_MAX_SEC)).toBe(true);
  });
});
