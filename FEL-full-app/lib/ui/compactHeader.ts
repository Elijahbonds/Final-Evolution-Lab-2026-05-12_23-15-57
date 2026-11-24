// compactHeader — on a phone held upright the game's header is one row, and its tools live in the stage's "⋯" menu
// (look-screens, phase A1 of docs/LOOK-PASS-AUDIT.md; owner 2026-11-24: "Let's do a pass where we improve how things look.").
//
// WHAT WAS MEASURED (scripts/probes/look-audit/look-walk.mts, 390 x 844 upright, before this file): GameShell's header wraps
// to three rows — Home · title; pause · BODY · PRQ "— · NOT MEASURED"; the graphics drop-down · full screen — 165 of 844 px
// (a fifth of the screen) before the stage's own padding, in every game. Sideways, full screen and the stream view already
// hide it.
//
// THE RULE: while the knob is on, the header carries `data-fel-compact-header`. On a phone held upright (the media query
// below, the same one stageFit uses for the upright phone) the header's tools — BODY, the PRQ badge, the graphics choice
// and full screen — are not drawn there (CSS, on the header's own shape, so the very first paint is already one row: no
// layout shift when the script arrives, and the header's markup is today's), the row does not wrap, and it is 8 px top and
// bottom: back · title · pause, 44 + 16 + 1 = 61 px. The same tools are drawn in the "⋯" menu instead (GameCaptureHud's
// `gameTools`, their own instances of the same components), and the PRQ line there never reads as a badge:
// nothing measured says "Not measured yet". Pause stays on the row, one tap away (gameplay-clean: a pause a thumb can
// reach). Desktop, a tablet and a sideways phone match nothing below, so their header is today's exactly.
//
// Knob `ui.compactGameHeader` (lib/feel-panel/knobs.ts): 1 = this; 0 = today's wrapping header exactly (the attribute is
// not set, so no rule below matches, and the menu gets no tools).
import { feel } from '@/lib/feel-panel/feel';
import type { PrqDisplay } from '@/lib/prq-display';

/** ui.compactGameHeader: 1 folds the upright phone's header tools into the "⋯" menu; 0 restores the wrapping header. */
export const COMPACT_GAME_HEADER = 1;

export const compactGameHeader = (): boolean => feel('ui.compactGameHeader', COMPACT_GAME_HEADER) >= 0.5;

/** The header's attribute the rules key on. Set only while the knob is on. */
export const COMPACT_HEADER_ATTR = 'data-fel-compact-header';
/** The phone held upright: the same query as stageFit's upright rule (lib/ui/stageFit.ts STAGE_FIT_CSS). */
export const UPRIGHT_PHONE_QUERY = '(max-width: 640px) and (orientation: portrait)';

/** The rules, rendered once by the shell. They match nothing while the attribute is absent or the phone is not upright. */
export const COMPACT_HEADER_CSS = [
  `@media ${UPRIGHT_PHONE_QUERY}{`,
  // BODY (and its card and error line): everything in the pushed-right group but the pause and its held slot
  `[${COMPACT_HEADER_ATTR}] > div > .ml-auto > :not([data-fel-pause-slot]):not([data-fel-pause]){display:none!important}`,
  // the PRQ badge, the graphics choice and full screen: everything on the row after that group
  `[${COMPACT_HEADER_ATTR}] > div > .ml-auto ~ *{display:none!important}`,
  `[${COMPACT_HEADER_ATTR}] > div{flex-wrap:nowrap;padding-top:8px;padding-bottom:8px}`,
  `[${COMPACT_HEADER_ATTR}] > div > .min-w-0{flex:1 1 auto}`,
  `[${COMPACT_HEADER_ATTR}] > div > .min-w-0 > *{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
  `}`,
].join('');

/**
 * The PRQ line the menu prints. Never a badge that reads as an error: nothing measured says "Not measured yet"; a measured
 * read keeps the badge's own words ("PRQ 58 · READY · 2/8").
 */
export function menuPrqLine(d: Pick<PrqDisplay, 'score' | 'badge'> | null | undefined): string {
  if (!d) return 'PRQ · loading';
  return d.score === null ? 'PRQ · Not measured yet' : d.badge;
}
