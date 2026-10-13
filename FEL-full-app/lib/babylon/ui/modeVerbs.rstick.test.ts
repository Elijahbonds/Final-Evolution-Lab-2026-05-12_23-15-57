import { describe, it, expect } from 'vitest';
import { MODE_VERBS } from './modeVerbs';
describe('H1: the hoops R stick is the Pro Stick', () => {
  it('1v1 and 3v3 say DRIBBLE', () => { expect(MODE_VERBS.onevone.rStick).toBe('DRIBBLE'); expect(MODE_VERBS.threevthree.rStick).toBe('DRIBBLE'); });
});
