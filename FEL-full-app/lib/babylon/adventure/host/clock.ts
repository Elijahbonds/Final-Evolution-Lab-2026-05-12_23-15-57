/**
 * The host's clock (ADVENTURE PLAN A4, 2026-10-06: "only the host owns the clock"). Pure: no Babylon, no DOM, no
 * `Date.now()`; the caller hands it real seconds per rendered frame.
 *
 *   FIXED STEP. Real time accumulates and the sim steps at SIM_HZ (60). A phone at 30 fps runs two steps a frame, a
 *   desktop at 60 runs one; a hitch is capped at MAX_STEPS_PER_FRAME so a long stall never becomes a spiral of
 *   catch-up steps (the time beyond the cap is dropped, which is the right answer for a game: the world pauses
 *   rather than fast-forwards).
 *   TIME SCALES. A `time:scale` request (contracts v2 semantics): one live request per `byId`, for `sec` of UNSCALED sim
 *   time; every actor runs at the request's `world`, `byId` itself at `self`; several at once, the slowest wins; a
 *   cancel is `sec: 0, world: 1, self: 1` from the same `byId`.
 *   HIT-STOP. `world: 0, self: 0` (or `hitStop(sec)`) freezes the whole sim for `sec` of REAL time: no steps run, the
 *   views keep drawing the frozen pose. The fighting-game beat that sells a heavy connect.
 *
 * Allocation: the request table is a fixed array of records reused by `byId`; nothing is allocated per frame.
 */

import { SIM_HZ, type ActorId, type AdventureEvents } from '../contracts';

/** At most this many fixed steps per rendered frame (a 15 fps stall still steps 4; beyond it, time is dropped). [TUNE] */
export const MAX_STEPS_PER_FRAME = 4;
/** The longest hit-stop one request may hold, seconds (a bug's 10 s freeze must not lock the game). [TUNE] */
export const MAX_HIT_STOP_SEC = 0.25;
/** At most this many live time-scale requests (slow-time and perfect dodges: a handful per scene). */
export const MAX_SCALE_REQUESTS = 8;

interface ScaleReq { byId: ActorId; world: number; self: number; leftSec: number; live: boolean }

export class HostClock {
  readonly stepSec = 1 / SIM_HZ;
  /** Unscaled sim time, seconds (advances one fixed step per step). */
  tSec = 0;
  /** Fixed steps run since the start. */
  steps = 0;
  /** Real seconds of hit-stop left. */
  hitStopSec = 0;
  private acc = 0;
  private readonly reqs: ScaleReq[] = Array.from({ length: MAX_SCALE_REQUESTS }, () => ({ byId: '', world: 1, self: 1, leftSec: 0, live: false }));

  /**
   * How many fixed steps this frame runs, given `realDt` seconds since the last frame. Consumes hit-stop first (a frozen
   * sim banks no time), then accumulates. Call `advance()` once per step the caller actually runs.
   */
  stepsFor(realDt: number): number {
    let dt = Number.isFinite(realDt) && realDt > 0 ? realDt : 0;
    if (this.hitStopSec > 0) {
      const used = Math.min(this.hitStopSec, dt);
      this.hitStopSec -= used;
      dt -= used;
    }
    this.acc += dt;
    let n = Math.floor(this.acc / this.stepSec + 1e-9);
    if (n > MAX_STEPS_PER_FRAME) { n = MAX_STEPS_PER_FRAME; this.acc = 0; }
    else this.acc -= n * this.stepSec;
    if (this.acc < 0) this.acc = 0;
    return n;
  }

  /** Fraction of a step banked toward the next one (0..1): a view may interpolate with it. */
  get alpha(): number { return Math.min(1, this.acc / this.stepSec); }

  /** One fixed step happened: the sim clock moves and every request's time runs down. */
  advance(): void {
    this.tSec += this.stepSec;
    this.steps++;
    for (const r of this.reqs) {
      if (!r.live) continue;
      r.leftSec -= this.stepSec;
      if (r.leftSec <= 1e-9) r.live = false;
    }
  }

  /** A `time:scale` request from the bus (contracts v2 semantics). */
  request(e: AdventureEvents['time:scale']): void {
    const world = clamp01(e.world), self = clamp01(e.self);
    if (world <= 0 && self <= 0) { this.hitStop(e.sec); return; }
    const cancel = !(e.sec > 0) || (world >= 1 && self >= 1);
    let slot: ScaleReq | null = null;
    for (const r of this.reqs) if (r.live && r.byId === e.byId) { slot = r; break; }
    if (cancel) { if (slot) slot.live = false; return; }
    if (!slot) {
      for (const r of this.reqs) if (!r.live) { slot = r; break; }
      if (!slot) {
        // full: replace the request with the least time left
        slot = this.reqs[0];
        for (const r of this.reqs) if (r.leftSec < slot.leftSec) slot = r;
      }
    }
    slot.byId = e.byId; slot.world = world; slot.self = self; slot.leftSec = e.sec; slot.live = true;
  }

  /** Freeze the sim for `sec` of real time (the longer of this and any hit-stop already running, capped). */
  hitStop(sec: number): void {
    if (!(sec > 0)) return;
    this.hitStopSec = Math.max(this.hitStopSec, Math.min(MAX_HIT_STOP_SEC, sec));
  }

  /** The scale `id` runs at this step: the slowest any live request gives it, 1 with none. */
  scaleOf(id: ActorId): number {
    let s = 1;
    for (const r of this.reqs) {
      if (!r.live) continue;
      const v = r.byId === id ? r.self : r.world;
      if (v < s) s = v;
    }
    return s;
  }

  /** Is any slow-down live (the view's tint, the HUD)? */
  slowed(): boolean {
    for (const r of this.reqs) if (r.live && r.world < 1) return true;
    return false;
  }

  reset(): void {
    this.tSec = 0; this.steps = 0; this.acc = 0; this.hitStopSec = 0;
    for (const r of this.reqs) r.live = false;
  }
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
}

/**
 * The host's per-tick time budget (A4). The plan's phone budget is a 30 fps frame (33 ms) on a phone 3–4 years old,
 * cooperating with PerfGovernor; at 60 Hz that frame runs TWO sim steps. A phone's JavaScript runs roughly 4–6× slower
 * than the desktop CPU the headless tests measure on, so 1 ms per step here is about 5 ms per step on the phone — two
 * steps ≈ 10 ms, under a third of the frame, leaving the rest to rendering. [TUNE]
 *
 * The test measures the mean (the steady cost) and the 95th percentile (a fight's busy steps), never the single worst
 * step: one garbage collection in a shared CI box is not the sim's cost. Measured at A4 (2026-10-06, the 60 s yard run,
 * 12 bodies): mean ≈ 0.1 ms, p95 ≈ 0.25 ms.
 */
export const HOST_TICK_BUDGET_MS = Object.freeze({ mean: 1, p95: 2.5 });
