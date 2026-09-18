/**
 * lib/feel/fixed-step-loop.ts
 * ===========================
 * M9 — fixed-timestep accumulator loop, decoupled from render.
 *
 * TypeScript port of the proven engineering-line FixedStepLoop
 * (FEEL_REFERENCE_SPEC §1). Simulation runs at exactly 1/hz regardless of
 * render rate; render(alpha) interpolates between steps. Spiral-of-death
 * clamp. hitStop(ms) freezes the SIM while render holds the frame
 * (wall-clock timers outside the loop keep running — documented choice).
 *
 * Contract (feel DoD): same input ⇒ same simulation at 30/60/144 fps.
 * The tick path allocates nothing.
 */

export interface FixedStepLoopOpts {
  hz?: number;
  maxAccumulatedMs?: number;
  update: (dt: number) => void;
  render?: ((alpha: number) => void) | null;
}

export class FixedStepLoop {
  readonly stepMs: number;
  readonly stepSeconds: number;
  maxAccumulatedMs: number;
  update: (dt: number) => void;
  render: ((alpha: number) => void) | null;
  accumulatedMs = 0;
  running = false;
  stepCount = 0;
  alpha = 0;
  hitStopRemainingMs = 0;

  constructor({ hz = 60, maxAccumulatedMs = 250, update, render }: FixedStepLoopOpts) {
    this.stepMs = 1000 / hz;
    this.stepSeconds = 1 / hz;
    this.maxAccumulatedMs = maxAccumulatedMs;
    this.update = update;
    this.render = render ?? null;
  }

  /**
   * Presentation hit-stop: freezes the SIMULATION for `ms` of real time
   * while render keeps presenting the frozen state. Multiple requests take
   * the max (longest freeze wins), matching the reference.
   */
  hitStop(ms: number): void {
    this.hitStopRemainingMs = Math.max(this.hitStopRemainingMs, ms);
  }

  start(): void {
    this.running = true;
    this.accumulatedMs = 0;
  }

  stop(): void {
    this.running = false;
    this.accumulatedMs = 0;
  }

  /** Advance simulation by real elapsed milliseconds. */
  tick(dtMs: number): void {
    if (!this.running) return;
    if (this.hitStopRemainingMs > 0) {
      this.hitStopRemainingMs -= dtMs;
      if (this.render) this.render(this.alpha); // hold the frozen frame
      return;
    }
    // Clamp to avoid the spiral of death after tab-sleep or long frames.
    this.accumulatedMs += Math.min(dtMs, this.maxAccumulatedMs);
    while (this.accumulatedMs >= this.stepMs) {
      this.update(this.stepSeconds);
      this.accumulatedMs -= this.stepMs;
      this.stepCount++;
    }
    this.alpha = this.accumulatedMs / this.stepMs;
    if (this.render) this.render(this.alpha);
  }
}

export default FixedStepLoop;
