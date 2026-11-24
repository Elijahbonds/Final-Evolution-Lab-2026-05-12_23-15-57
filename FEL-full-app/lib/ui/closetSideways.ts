// Look pass C3 (lane/look-world, 2026-11-24): the Closet held sideways on a phone (components/closet/sideways.ts lays it out).
// The switch lives here, where the feel catalogue reads it.
import { feel } from '@/lib/feel-panel/feel';

/** ui.closetSideways: 1 = on a short sideways screen the walkthrough sits beside the stage; 0 = over it, as before. */
export const CLOSET_SIDEWAYS = 1;

/** Whether the sideways layout is on (the feel panel's value on this device). */
export function closetSidewaysOn(): boolean {
  try { return feel('ui.closetSideways', CLOSET_SIDEWAYS) >= 0.5; } catch { return CLOSET_SIDEWAYS >= 0.5; }
}
