// RENDER ON DEMAND (CREATOR-PLAN phase 4d, 2026-10-06): the Studio draws a frame only when something on it changed or
// moves — an edit, the camera easing to a shot, the turntable turning, a pose playing, paint still compositing over
// frames, a bendable part settling, a drag. Otherwise the last frame stays on the canvas and the phone's GPU rests.
// (perf-guard's idle behaviour lives on another branch; the Studio does this by itself and imports nothing of it.)
//
// Two kinds of reason keep it drawing:
//   HOLDS   — continuous, named (turntable, pose, camera, paint, drag): drawing while any is on.
//   KICKS   — a deadline: an edit draws for a short while after it (the material rebuilds, a swing settles).
// The idle loop alone is not a reason: after IDLE_GRACE of nothing, the body holds its pose on the last frame.

export type HoldReason = 'turntable' | 'pose' | 'camera' | 'paint' | 'drag' | 'pad' | 'photo' | 'spin';

/** How long an edit keeps the Studio drawing (ms): long enough for a part rebuild, the next paint tiles and a bendable
 *  part's first second of swing. TUNED (phase 4d). */
export const KICK_MS = 1200;
/** How long the body's idle breathing keeps drawing after the last interaction (ms) before the frame holds. TUNED. */
export const IDLE_GRACE = 6000;

export class RenderGate {
  private holds = new Set<HoldReason>();
  private until = 0;
  frames = 0;
  skipped = 0;
  constructor(private now: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
    this.until = this.now() + IDLE_GRACE;
  }

  /** Draw for `ms` from now (an edit, a tap, a resize). */
  kick(ms = KICK_MS): void { this.until = Math.max(this.until, this.now() + ms); }
  /** An interaction: draw through the idle grace (the body breathes for a few seconds, then holds). */
  touch(): void { this.kick(IDLE_GRACE); }
  hold(r: HoldReason, on = true): void {
    if (on) this.holds.add(r);
    else if (this.holds.delete(r)) this.kick();
  }
  holding(r: HoldReason): boolean { return this.holds.has(r); }
  /** Should this frame be drawn? Counts drawn and skipped frames for the perf readout. */
  due(): boolean {
    const d = this.holds.size > 0 || this.now() < this.until;
    if (d) this.frames++; else this.skipped++;
    return d;
  }
  /** What is keeping it drawing (probes, the ?perf readout). */
  reasons(): string[] { return [...this.holds, ...(this.now() < this.until ? ['kick'] : [])]; }
}
