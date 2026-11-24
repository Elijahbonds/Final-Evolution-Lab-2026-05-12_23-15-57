// touchTargets — nothing under a thumb button, every tap at least 44 px (improve-screens, phase 6 of
// docs/IMPROVE-10-PHASE-AUDIT.md; owner 2026-11-22: "Do a 10 phase pass improving the areas that need it most").
//
// WHAT WAS MEASURED (scripts/probes/improve-audit/walk.mts and scripts/probes/improve-screens/touch.mts, 390 x 844 upright):
//   - /play/venice: the first-visit hint (`bottom-[9.5rem]`, z-10) ran under the touch deck's DASH and JUMP (z-30), and its
//     "Got it" sat under DASH, so a thumb on "Got it" dashed instead;
//   - /play/dunk: the MIX / MC / CC chips in the host's right-hand stack (`MicToggle flow`) drew 44-49 x 22 px;
//   - /play/adventure: the dialogue's SKIP was 68 x 20 px (and a choice button about 32 px tall);
//   - /workout: the two tick boxes were the browser's 13 x 13 px box.
// Each fix keeps the words and the look; only the place (the hint) or the tap box (the rest) changes.
//
// Knob `ui.touchTargets44` (lib/feel-panel/knobs.ts): 1 = the fixes; 0 = each screen exactly as before.
import { feel } from '@/lib/feel-panel/feel';

/** ui.touchTargets44: 1 = the phase 6 touch fixes; 0 restores every screen it touches exactly. */
export const TOUCH_TARGETS_44 = 1;

export const touchTargets44 = (): boolean => feel('ui.touchTargets44', TOUCH_TARGETS_44) >= 0.5;

/**
 * Where the Venice first-visit hint sits. On a touch screen it takes the walk-up card's own slot under the mini-map
 * (`top-[9.25rem]`; the card and the hint are never up together), well above the touch deck, which owns the bottom 44 % of
 * an upright phone. Without touch there is no deck, and it stays where it was.
 */
export function veniceHintPlace(touch: boolean, on: boolean = touchTargets44()): string {
  return on && touch ? 'top-[9.25rem]' : 'bottom-[9.5rem]';
}
