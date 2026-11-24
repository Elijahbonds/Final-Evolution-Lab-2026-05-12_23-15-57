// stageFit — a game's stage takes the screen the header leaves it, not the screen a one-row header would leave
// (improve-screens, phase 1 of docs/IMPROVE-10-PHASE-AUDIT.md; owner 2026-11-22: "Do a 10 phase pass improving the areas
// that need it most").
//
// WHAT WAS MEASURED (scripts/probes/improve-audit/walk.mts, 390 x 844 portrait, before this file): the hoops hosts are
// `h-[calc(100dvh-3.25rem)]`, sized for a 52 px header. On a phone held upright GameShell's header WRAPS (Home · title ·
// BODY, then the PRQ badge · graphics · full screen; 1v1 and 3v3 add Pause, which makes three rows), and the stage also
// has 12 px of padding above it. So the canvas ran 129 px past the bottom of the screen in 1v1 and 3v3 (half the move
// stick) and 20 px in Dunk and 3-Point.
//
// THE RULE: while the page layout is up (portrait; console view and full screen are untouched), the shell measures what
// really sits above and below the stage (its header's height and the stage's own padding) and puts it on the stage as
// `--fel-chrome-h`. The hosts' own box then reads that number instead of 3.25rem (STAGE_FIT_CSS). Until it is measured
// the fallback IS 3.25rem, so the first paint is today's exactly.
//
// Knob `ui.stageFitsHeader` (lib/feel-panel/knobs.ts): 1 = this; 0 = today's `calc(100dvh - 3.25rem)` exactly (the
// attribute is not set, so no rule below matches).
import { feel } from '@/lib/feel-panel/feel';

/** ui.stageFitsHeader: 1 sizes the stage from the header's real height; 0 restores `calc(100dvh - 3.25rem)`. */
export const STAGE_FITS_HEADER = 1;

export const stageFitsHeader = (): boolean => feel('ui.stageFitsHeader', STAGE_FITS_HEADER) >= 0.5;

/** The stage's attribute the rules key on. Set only while the page layout is up and the knob is on. */
export const STAGE_FIT_ATTR = 'data-fel-fit';
/** The measured height of everything above and below the stage, in px. */
export const STAGE_FIT_VAR = '--fel-chrome-h';

/**
 * What the stage must leave for the chrome: the header's height plus the stage's own top and bottom padding, rounded UP
 * to a whole pixel so a fractional header never leaves the last row of the game a hair off the screen. Anything that is
 * not a finite, non-negative number counts as 0; a header that is not there (0) leaves just the padding.
 */
export function chromeHeight(headerPx: number, padTopPx: number, padBottomPx: number): number {
  const ok = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
  return Math.ceil(ok(headerPx) + ok(padTopPx) + ok(padBottomPx));
}

/**
 * The rules, rendered once by the shell beside its stage. Selectors carry the attribute, so they outrank the hosts'
 * one-class Tailwind height without !important — and lose to app/game-surface.css's !important landscape and
 * full-screen rules, which therefore keep the sideways phone and full screen exactly as they are.
 *   1. The hoops hosts (`h-[calc(100dvh-3.25rem)]`): the screen less the measured chrome.
 *   2. A 16:10 host on a phone held upright, which game-surface.css stretches to `min-height: 84svh !important`: never
 *      taller than the screen less the chrome (the smaller of the two), so a two-row header cannot push its bottom off.
 */
export const STAGE_FIT_CSS = [
  `[${STAGE_FIT_ATTR}] [class*="100dvh-3.25rem"]{height:calc(100dvh - var(${STAGE_FIT_VAR}, 3.25rem))}`,
  `@media (max-width: 640px) and (orientation: portrait){[${STAGE_FIT_ATTR}] [class*="aspect-[16/10]"]{min-height:min(84svh, calc(100svh - var(${STAGE_FIT_VAR}, 0px)))!important}}`,
].join('\n');
