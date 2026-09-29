// youth.test — isMinorForMirror is a thin wrapper over screenCorrectives.ts's youthGateFor, not a second age rule
// (MIRROR-COACH P4, 2026-09-29). screenCorrectives.test.ts already proves youthGateFor's own edge cases (2 years
// either side of 18, non-finite/negative years) against lib/coach/taxonomy.ts's youthRules; this file only proves
// isMinorForMirror collapses that gate's two non-adult outcomes into one boolean, correctly, for both.
import { describe, expect, it } from 'vitest';
import { youthGateFor } from './screenCorrectives';
import { isMinorForMirror } from './youth';

const NOW = new Date('2026-09-29T00:00:00Z');

describe('isMinorForMirror', () => {
  it('is true for a birth year under 18', () => {
    expect(youthGateFor(2012, NOW)).toBe('minor');
    expect(isMinorForMirror(2012, NOW)).toBe(true);
  });

  it('is false for a birth year that reads as an adult', () => {
    expect(youthGateFor(1990, NOW)).toBeNull();
    expect(isMinorForMirror(1990, NOW)).toBe(false);
  });

  it('is true when no birth year is on file at all (owner decision #20: blank = minor)', () => {
    expect(youthGateFor(null, NOW)).toBe('unknownAge');
    expect(isMinorForMirror(null, NOW)).toBe(true);
    expect(isMinorForMirror(undefined, NOW)).toBe(true);
  });

  it('defaults `now` to the real clock (no fixture-only behaviour)', () => {
    expect(isMinorForMirror(1950)).toBe(false);
    expect(isMinorForMirror(new Date().getFullYear())).toBe(true);
  });
});
