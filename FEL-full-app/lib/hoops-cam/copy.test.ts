import { describe, expect, it } from 'vitest';
import { FIXED_LINES, BETA_LINE, placementLine, statusLine } from './copy';
import { PLACEMENT_IDS } from './spot';

// Owner: NO ACCURACY CLAIMS. The tracker is a beta that says it can be wrong; no line may claim correctness.
const CLAIM = /accura|precis|exact|reliab|guarantee|\bAI\b|perfect|always right|\d+\s?%/i;

describe('the tracker\'s words', () => {
  it('no fixed line claims accuracy, and the beta line says a call can be wrong and fixed', () => {
    const all = [...FIXED_LINES, ...PLACEMENT_IDS.map(placementLine), ...(['no_rim', 'looking', 'tracking'] as const).flatMap((s) => [statusLine(s, 'shots'), statusLine(s, 'dribble')])];
    for (const l of all) expect(l, l).not.toMatch(CLAIM);
    expect(BETA_LINE).toMatch(/beta/i);
    expect(BETA_LINE).toMatch(/miss|wrong/);
    expect(BETA_LINE).toMatch(/fix/);
  });
});
