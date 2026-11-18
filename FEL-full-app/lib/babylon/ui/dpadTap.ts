// dpadTap — THE TOUCH DECK'S D-PAD AT A REAL TAP SIZE (lane/hoops-items, 2026-11-18).
//
// Measured (move-feel-2, scripts/probes/move-feel/phone-stick.mjs): the deck's d-pad arrows were 24 × 24 px (h-6 w-6 in a 72 px cross),
// drawn at 23.3 px on an upright phone (the left column's fit) and 20.4 px sideways (the compact deck's 0.85) — under the 44 px tap rule
// (every-screen's BUDGET.tapPx, the plan's number). The arrows are 44 px or more AS DRAWN now, in every deck layout, and the column the
// d-pad shares with the MOVE stick keeps its height, so the stick is drawn at the size it was:
//   upright ('portrait')  the column is the d-pad over the stick, inside a stage ~234 px tall (16:10 under the header): a 132 px cross
//                         over the stick would shrink the whole column, stick and all (fitDeck), to ~76 %. So upright the four arrows are
//                         ONE ROW (◀ ▲ ▼ ▶, 44 px each): 44 px tall where the cross was 72, the column shorter, nothing scaled down.
//   sideways ('compact')  the d-pad sits beside the stick and the whole side draws at COMPACT_SCALE 0.85, so a 44 px arm would draw at
//                         37: the arms are 52 px (drawn 44.2) in the usual cross.
//   'landscape'           (a tablet or a touch laptop) the usual cross of 44 px arms.
// Knob `touch.dpadTapOn`: 1 = these; 0 = the 24 px cross, as before. Pure: the numbers; TouchOverlay's DPad draws them.
import type { TouchDeckLayout } from '@/lib/ui/consoleView';

/** (new, lane/hoops-items) 1 = the d-pad's arrows at a 44 px tap target as drawn; 0 = the 24 px arrows in a 72 px cross (before). */
export const TOUCH_DPAD_TAP_ON = 1;
/** The tap rule (CSS px, as drawn): every-screen's BUDGET.tapPx. */
export const DPAD_TAP_PX = 44;
/** The compact deck's own scale (TouchOverlay COMPACT_SCALE). */
export const DPAD_COMPACT_SCALE = 0.85;
/** Before: each arrow 24 px (h-6 w-6) in a 72 px cross. */
export const DPAD_OLD_ARM_PX = 24, DPAD_OLD_BOX_PX = 72;

export type DPadShape = 'cross' | 'row';
/** How the d-pad is laid out, and each arrow's size before the deck's own scale, for a layout. */
export function dpadLayout(layout: TouchDeckLayout, on: boolean): { shape: DPadShape; arm: number; w: number; h: number } {
  if (!on) return { shape: 'cross', arm: DPAD_OLD_ARM_PX, w: DPAD_OLD_BOX_PX, h: DPAD_OLD_BOX_PX };
  if (layout === 'portrait') return { shape: 'row', arm: DPAD_TAP_PX, w: 4 * DPAD_TAP_PX, h: DPAD_TAP_PX };
  const arm = layout === 'compact' ? Math.ceil(DPAD_TAP_PX / DPAD_COMPACT_SCALE) : DPAD_TAP_PX;
  return { shape: 'cross', arm, w: 3 * arm, h: 3 * arm };
}
