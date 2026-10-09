// localPads — one stick, one seat (MODES-SHARED-10).
//
// InputBus.onSlot already tags each pad 0..3. Party modes were still reading
// the merged stream, so P2's answer was P1's d-pad. This is the seating rule
// those modes share. Keyboard arrows stay a P2 fallback only when fewer than
// two pads are connected; the mode checks `pads` before calling this.

/** Which seated player a pad slot drives. -1 = this slot has no seat. */
export function playerForSlot(slot: number, playerCount: number): number {
  if (playerCount <= 0) return -1;
  if (playerCount === 1) return slot === 0 ? 0 : -1;
  if (slot >= 0 && slot < playerCount) return slot;
  return -1;
}

export type LocalPress = 'face' | 'dpad' | 'key-dpad';

/**
 * Who owns this press.
 * Two or more pads: slot 0's faces are P1, slot 1's d-pad is P2. P1's d-pad
 * does not answer for P2. Extra slots past the player count answer for nobody.
 * Fewer than two pads: faces are P1 and a d-pad (including keyboard arrows)
 * is P2 when a second player is seated.
 */
export function answerOwner(opts: {
  pads: number;
  slot: number;
  playerCount: number;
  from: LocalPress;
}): number | null {
  if (opts.playerCount <= 1) return opts.from === 'face' && (opts.pads < 2 || opts.slot === 0) ? 0 : null;
  if (opts.pads >= 2) {
    if (opts.from === 'key-dpad') return null;
    const who = playerForSlot(opts.slot, opts.playerCount);
    if (opts.from === 'face' && who === 0) return 0;
    if (opts.from === 'dpad' && who === 1) return 1;
    return null;
  }
  if (opts.from === 'face') return 0;
  if (opts.from === 'dpad' || opts.from === 'key-dpad') return 1;
  return null;
}
