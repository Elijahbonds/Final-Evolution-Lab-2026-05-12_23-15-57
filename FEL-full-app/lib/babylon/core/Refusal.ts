// Refusal — a press that cannot act is still ANSWERED (MECHANICS PASS, 2026-09-15).
//
// The owner's felt symptom was "unclear cause → effect", and the mechanics probe put numbers on it: in Brain Brawl 64 % of
// deliberate presses got no perceivable answer, 3PT 43 %, Who Scene It 35 %, the duel's guard 6 of 7. Almost all of them were
// presses made at the WRONG TIME — between questions, with no ball in hand, a verb that belongs to another phase — and the
// game simply ignored them, which reads as a dead button. Arcade games never do that: "TOO EARLY", "NO BALL", "WAIT".
//
// One small callout line in the JuiceKit overlay (no host needs to render a new HUD field) and a low tick. Throttled per message so a
// held or mashed button says it once, not every frame.

import type { ModeContext } from './ModeHarness';
import { SoundKit } from '../audio/SoundKit';

const REFUSAL_COLOR = '#94a3b8';
export const REFUSAL_THROTTLE_MS = 450;   // long enough to swallow a held / mashed button, short enough that two deliberate taps are each answered
const lastSaid = new WeakMap<ModeContext, Map<string, number>>();

/** Answer a press that cannot act right now. Returns false when the same line was said within the throttle. */
export function refuse(ctx: ModeContext, text: string, now = performance.now()): boolean {
  let said = lastSaid.get(ctx);
  if (!said) { said = new Map(); lastSaid.set(ctx, said); }
  const at = said.get(text) ?? -Infinity;
  if (now - at < REFUSAL_THROTTLE_MS) return false;
  said.set(text, now);
  ctx.juice.callout(text, REFUSAL_COLOR, 700);
  SoundKit.play('uiTick', { pitch: 0.6, volume: 0.45 });
  return true;
}
