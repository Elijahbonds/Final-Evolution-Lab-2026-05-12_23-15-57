import { describe, expect, it } from 'vitest';
import { rejectionForPart, rejectionFromInvalidWhy } from './rejection';

describe('rejection reasons in plain words', () => {
  it('T2 heel lift', () => {
    expect(rejectionForPart('T2-left', 'notRead').text).toBe('Keep your heel flat on the floor.');
  });

  it('T5 invalid why', () => {
    expect(rejectionFromInvalidWhy('your hands left your hips').reason).toBe('handsOff');
  });
});
