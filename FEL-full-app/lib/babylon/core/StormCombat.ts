// StormCombat — the arena-fighter layer the three fight modes share (owner, 2026-09-17: "Fighting — Endless, vs, mixed
// combat. Add more dynamic movement, dashes with X, all button presses lead to different combos — look at how Naruto
// Storm is played").
//
// What Storm does that these modes did not: X is the DASH (a tap), a double tap is the CHAKRA DASH that homes on the
// target, guard is the HOLD of the same button (and a trigger), the dash has i-frames and cancels a string's recovery,
// a launcher puts the body in the AIR and the next presses are air links ended by a spike. The strings themselves live
// in HordeDynamics (the book); this file is the X button and the numbers.
export const DASH = {
  tapSec: 0.18,        // released inside this = a tap (the dash); held past it = the guard
  doubleSec: 0.32,     // a second tap inside this = the chakra dash
  speed: 9.5, sec: 0.22, iframes: 0.16,
  homingSpeed: 12.5, homingMaxSec: 0.6, homingStopM: 1.5,
} as const;
/** How long a launched body stays in the air for the air string, and its height curve (0..1 of the window). */
export const LAUNCH_AIR_SEC = 0.9;
export function launchHeight(t01: number): number { const u = Math.min(1, Math.max(0, t01)); return Math.sin(u * Math.PI) * 0.55; }

export type XGesture = 'tap' | 'double' | 'held' | null;
/** The X button read: press / release → tap, double tap or a hold that was the guard. Pure; `now` in seconds. */
export class XButtonReader {
  private downAt = -1; private lastTapAt = -1e9;
  press(now: number): void { this.downAt = now; }
  /** True while the button has been down past the tap window: the guard is up. */
  guardHeld(now: number): boolean { return this.downAt >= 0 && now - this.downAt >= DASH.tapSec; }
  release(now: number): XGesture {
    if (this.downAt < 0) return null;
    const held = now - this.downAt; this.downAt = -1;
    if (held >= DASH.tapSec) return 'held';
    const dbl = now - this.lastTapAt <= DASH.doubleSec; this.lastTapAt = dbl ? -1e9 : now;
    return dbl ? 'double' : 'tap';
  }
  reset(): void { this.downAt = -1; this.lastTapAt = -1e9; }
}
