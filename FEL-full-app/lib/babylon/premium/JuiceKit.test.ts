// The flash must not hide the thing it is celebrating (dunk visuals pass, 2026-09-16).
//
// Measured on the dunk's flush frame: the overlay painted the whole viewport at opacity 0.85, so the ball on the ring,
// the hand on the ball and the net were all behind a sheet of cream for the first frames after the make. Twenty-odd
// callers across ten modes shared it. These tests are the shape of a flash that still reads as a hit.
import { describe, expect, it } from 'vitest';
import { flashBackground, rgba, FLASH_EDGE, FLASH_CORE, FLASH_CORE_STOP } from './JuiceKit';

describe('rgba', () => {
  it('turns a hex into an alpha colour', () => {
    expect(rgba('#fff6dd', 0.5)).toBe('rgba(255, 246, 221, 0.5)');
    expect(rgba('#FFD700', 1)).toBe('rgba(255, 215, 0, 1)');
    expect(rgba('#fff', 0.25)).toBe('rgba(255, 255, 255, 0.25)');
  });
  it('passes anything it does not understand straight through rather than painting black', () => {
    expect(rgba('rebeccapurple', 0.5)).toBe('rebeccapurple');
  });
});

describe('the flash', () => {
  it('is CLEAR through the middle, where the action is', () => {
    expect(FLASH_CORE).toBeLessThan(0.15);
    expect(flashBackground('#fff6dd')).toContain(rgba('#fff6dd', FLASH_CORE));
  });

  it('is brightest at the EDGE, where light spills in', () => {
    expect(FLASH_EDGE).toBeGreaterThan(FLASH_CORE * 3);
    expect(flashBackground('#fff6dd')).toContain(rgba('#fff6dd', FLASH_EDGE));
  });

  it('keeps the clear middle wide enough to hold a subject', () => {
    expect(FLASH_CORE_STOP).toBeGreaterThanOrEqual(0.25);
    expect(flashBackground('#fff6dd')).toContain(`${FLASH_CORE_STOP * 100}%`);
  });

  it('never goes back to a whiteout, whatever a caller asks for', () => {
    // the rc-baseline value, and the number this exists to prevent
    for (const k of [1, 2, 10, 1e6]) {
      const edge = Number(flashBackground('#ffffff', k).match(/1\)|0\.\d+\)/g)!.pop()!.replace(')', ''));
      expect(edge).toBeLessThanOrEqual(0.8);
    }
    expect(flashBackground('#ffffff', 10)).not.toContain('0.85');
  });

  it('a caller asking for nothing still gets something visible', () => {
    expect(flashBackground('#ffffff', 0)).toContain('rgba(255, 255, 255, 0.0');
    expect(flashBackground('#ffffff', 0)).not.toContain(', 0)');
  });
});
