// hoops-p02 (1v1/3v3 phase 2): goaltending needs a touch.
import { describe, expect, it } from 'vitest';
import { isGoaltendTouch, isGoaltending } from './Ref';

describe('isGoaltendTouch', () => {
  it('no touch, no call — even with the ball falling above the ring', () => {
    expect(isGoaltending(-2, 3.3, 3.05)).toBe(true);
    expect(isGoaltendTouch(false, -2, 3.3, 3.05)).toBe(false);
  });
  it('a touch on the way down is goaltending; on the way up it is a block', () => {
    expect(isGoaltendTouch(true, -2, 3.3, 3.05)).toBe(true);
    expect(isGoaltendTouch(true, 2, 3.3, 3.05)).toBe(false);
  });
});
