// Claim-free copy (owner rule: no accuracy claims until the force-plate pilot; JUMP-TESTS 2026-10-25). Shared by the
// screen's copy test (lib/screen/flight-jump.test.tsx) and the jump tools' (tests/jump-tests/claims.test.tsx).
//
// CLAIM_WORDS: what copy may not say about a measurement — that it is accurate, lab- or research-grade, validated,
// clinical, precise, a gold standard, as good as a device, or "within ±N". A force plate may be named only to say the
// number is NOT one ("an estimate, not a force-plate reading"); a Vertec not at all.
export const CLAIM_WORDS =
  /vertec|(?<!not a )force[- ]plate|lab[- ]grade|research[- ]grade|as accurate as|accura(te|cy)|validated|clinical(ly)?\b|precis(e|ion)|gold[- ]standard|as good as a|within ±|±\s?\d/i;

/** A source file's text with its comments taken out (what a user can see is in the strings and the JSX). */
export function withoutComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n');
}
