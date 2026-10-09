// kid — what an under-18 athlete sees at the end of the Quick Screen (SCREEN-FIX-2, 2026-09-29; Research 11:01 AM PT).
//
//   · ONLY THEIR OWN NUMBER: the jump (the screen's one measured number, in inches), and how it changed since their
//     last screen in THIS PAGE'S MEMORY. No band, colour, grade, priority, cue, rank, norm or "personal best to beat".
//   · NOTHING IS KEPT FOR THEM. The last number lives in the page (assess-app.tsx holds it in a ref): a reload or a new
//     tab starts fresh, and nothing is written to any storage or sent anywhere (lib/screen/store.ts).
//
// Pure.
import { KID_SAME_AS_LAST } from './copy';

export type JumpChange = { kind: 'up' | 'down' | 'same'; inches: number };

/** One decimal, as the jump itself is shown (lib/assess/why.ts inches). */
const oneDecimal = (x: number): number => Math.round(x * 10) / 10;

/** Now against the last screen on this page; null when either number is missing. */
export function jumpChange(now: number | null, before: number | null): JumpChange | null {
  if (now === null || before === null || !Number.isFinite(now) || !Number.isFinite(before)) return null;
  const d = oneDecimal(now - before);
  if (d === 0) return { kind: 'same', inches: 0 };
  return { kind: d > 0 ? 'up' : 'down', inches: Math.abs(d) };
}

/** "+1.5 in since last time", "−2 in since last time" (a minus sign, not a hyphen), or "Same as last time". */
export function jumpChangeLine(c: JumpChange): string {
  if (c.kind === 'same') return KID_SAME_AS_LAST;
  return `${c.kind === 'up' ? '+' : '−'}${c.inches} in since last time`;
}
