// rideStance — the READY screen's stance line for the board games (movement play P8, 2026-09-26).
//
// After the space check's "All set", a board game that steers with the carve asks for the rider's stance: side-on with the
// lead shoulder to the screen, knees soft, held still (the ring fills). The stance is MEASURED, never chosen: the shoulder
// nearer the camera leads — regular (left foot forward) or goofy (right foot forward). A player who stays facing the screen
// for 3 s gets the square fallback, and the line says side-on works better. Nothing about it is remembered on the device.
// Pure: the words and which one shows (body-play.tsx draws them; rideStance.test pins them).
import type { StanceView } from '@/lib/babylon/core/sessionStore';

export const STANCE_ASK = 'Now your stance: side-on, lead shoulder to the screen, knees soft — hold still';
export const STANCE_REGULAR = 'REGULAR (left foot forward) — raise both hands to start';
export const STANCE_GOOFY = 'GOOFY (right foot forward) — raise both hands to start';
export const STANCE_SQUARE = 'Side-on works best — raise both hands to start';

export type StanceId = 'ask' | 'regular' | 'goofy' | 'square';
export interface StanceLine { id: StanceId; text: string; ring: number | null }

/** The line for a stance view; null for a game that has none (not a carve-steered board game). */
export function stanceLine(v: StanceView | undefined | null): StanceLine | null {
  if (!v) return null;
  if (v.kind === 'side') return v.lead === 'R' ? { id: 'goofy', text: STANCE_GOOFY, ring: null } : { id: 'regular', text: STANCE_REGULAR, ring: null };
  if (v.kind === 'square') return { id: 'square', text: STANCE_SQUARE, ring: null };
  return { id: 'ask', text: STANCE_ASK, ring: v.hold01 };
}
