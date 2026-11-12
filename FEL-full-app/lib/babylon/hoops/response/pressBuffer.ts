// hoops-p01 (1v1 / 3v3 ten-phase pass, phase 1 "controls that answer"): THE SHOT PRESS THAT WAITS FOR THE MOVE.
//
// Measured (the hoops-gap rig, 1v1, release): Square tapped 0.1 s into a spin NEVER shot. Both modes buffered a squeeze made during a
// spin / dunk / shot in gameFeel's InputBuffer for a flat 400 ms from the press — and a spin locks the shot gate for ~550 ms after a press
// 0.1 s in, so the buffer died first and the tap vanished (a silent press). The right stick's buffer already has the rule the owner asked
// for (2026-10-20, C2: "a shot / move pressed during a move fires ≤ 220 ms after it clears"): live while the lock is on (up to
// BUSY_BUFFER_MAX_MS from the press), then BUFFER_AFTER_CLEAR_MS after it clears (core/StickHandle bufferLive). This is that rule for
// the shot press, one object per mode:
//
//   const shotPress = new PressBuffer();
//   shotPress.tick(locked, nowMs);        // every frame, before the gate reads it
//   if (locked && squeezed) shotPress.press(nowMs);
//   if (!locked && (squeezed || shotPress.consume())) startTheShot();
//
// Pure (no Babylon), so it is unit-tested on its own.
import { bufferLive, BUFFER_AFTER_CLEAR_MS, BUSY_BUFFER_MAX_MS } from '../../core/StickHandle';

export { BUFFER_AFTER_CLEAR_MS, BUSY_BUFFER_MAX_MS };

export class PressBuffer {
  private live = false;
  private at = -Infinity;
  private clearedAt: number | null = null;
  /** A press the gate cannot take now (the body is committed). Re-pressing re-arms it from now. */
  press(nowMs: number): void { this.live = true; this.at = nowMs; this.clearedAt = null; }
  /** Every frame: is the gate locked? The buffer does not age while it is (up to BUSY_BUFFER_MAX_MS); the 220 ms count from the clear. */
  tick(locked: boolean, nowMs: number): void {
    if (locked) this.clearedAt = null; else if (this.clearedAt === null) this.clearedAt = nowMs;
    if (this.live && !bufferLive(this.at, this.clearedAt, nowMs)) this.live = false;
  }
  /** Take the buffered press (once). */
  consume(): boolean { if (!this.live) return false; this.live = false; return true; }
  get pending(): boolean { return this.live; }
  clear(): void { this.live = false; this.clearedAt = null; }
}
