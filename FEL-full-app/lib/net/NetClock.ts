// FEL NETPLAY — clock and jitter handling (2026-09-12).

import { TICK_MS, RENDER_DELAY_MS, type BodyState, type SnapshotMsg, type Intent } from './protocol';

/**
 * Estimates the offset between this peer's clock and the host's.
 *
 * Two browsers do not agree on `Date.now()`, and a snapshot stamped in the host's clock is
 * meaningless here until that difference is known. This is the standard one-way estimate: the
 * MINIMUM observed (received - sent) across a window, because the fastest delivery is the one
 * least polluted by queueing, so it is the closest thing to the true offset we can see without a
 * round trip.
 */
export class ClockSync {
  private samples: number[] = [];
  constructor(private windowSize = 40) {}

  /** Feed every inbound message: when the peer says it sent, and when we saw it. */
  sample(sentAt: number, receivedAt: number): void {
    this.samples.push(receivedAt - sentAt);
    if (this.samples.length > this.windowSize) this.samples.shift();
  }

  /** Best estimate of (ourClock - theirClock), in ms. 0 until we have anything. */
  get offsetMs(): number {
    if (!this.samples.length) return 0;
    return Math.min(...this.samples);
  }

  /** Spread between best and worst delivery — a usable jitter figure for tuning render delay. */
  get jitterMs(): number {
    if (this.samples.length < 2) return 0;
    return Math.max(...this.samples) - Math.min(...this.samples);
  }

  get ready(): boolean { return this.samples.length >= 3; }
}

/**
 * Holds snapshots and answers "where was body X at render time".
 *
 * Clients render remote bodies RENDER_DELAY_MS behind the newest snapshot, and interpolate between
 * the two that straddle that moment. Rendering the newest snapshot directly means every packet
 * arriving late is a visible snap; deliberately living slightly in the past is what buys smoothness.
 */
export class SnapshotBuffer {
  private snaps: SnapshotMsg[] = [];
  constructor(private keep = 32) {}

  push(s: SnapshotMsg): void {
    // out-of-order arrival is normal; keep the buffer sorted by tick
    const at = this.snaps.findIndex((x) => x.tick > s.tick);
    if (this.snaps.some((x) => x.tick === s.tick)) return;   // duplicate
    if (at === -1) this.snaps.push(s); else this.snaps.splice(at, 0, s);
    while (this.snaps.length > this.keep) this.snaps.shift();
  }

  get newestTick(): number { return this.snaps.length ? this.snaps[this.snaps.length - 1].tick : -1; }
  get size(): number { return this.snaps.length; }

  /**
   * Interpolated body states at `renderTick` (fractional ticks allowed).
   * Returns the newest known state when asked for a moment past the buffer, rather than nothing:
   * a frozen body reads better than a disappearing one.
   */
  sample(renderTick: number): BodyState[] {
    if (!this.snaps.length) return [];
    let a = this.snaps[0], b = this.snaps[0];
    for (let i = 0; i < this.snaps.length; i++) {
      if (this.snaps[i].tick <= renderTick) a = this.snaps[i];
      if (this.snaps[i].tick >= renderTick) { b = this.snaps[i]; break; }
    }
    if (a.tick === b.tick) return a.bodies.map((x) => ({ ...x }));
    const t = (renderTick - a.tick) / (b.tick - a.tick);
    const out: BodyState[] = [];
    for (const from of a.bodies) {
      const to = b.bodies.find((x) => x.id === from.id);
      if (!to) { out.push({ ...from }); continue; }
      out.push({
        id: from.id,
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
        z: from.z + (to.z - from.z) * t,
        yaw: from.yaw + shortestAngle(from.yaw, to.yaw) * t,
        speed: from.speed + (to.speed - from.speed) * t,
        // a clip is a discrete choice: switch at the midpoint rather than blending a name
        clip: t < 0.5 ? from.clip : to.clip,
      });
    }
    return out;
  }

  /** The tick a client should be rendering, given the newest snapshot and the render delay. */
  renderTickFor(newestTick: number): number {
    return newestTick - RENDER_DELAY_MS / TICK_MS;
  }
}

/** Interpolating yaw linearly through the +/-PI seam spins a body the long way round. */
export function shortestAngle(a: number, b: number): number {
  const TAU = Math.PI * 2;
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/**
 * Holds a remote peer's inputs until the host's simulation reaches their tick.
 *
 * Loss is normal. When a tick never arrives the host REPEATS the last input rather than treating
 * it as neutral: releasing a held sprint or a charging shot meter because one packet dropped is a
 * far worse artefact than one extra tick of a button the player was already holding.
 *
 * TWO CLOCKS (lane/online-play, 2026-11-21). The sender stamps its OWN tick (ticks since its page's session started)
 * and the host asks for ITS tick: two pages that did not open in the same 33 ms never share a tick number. Measured
 * against a real netd (scripts/probes/online-play/match-room.mts): a guest whose page opened 1.2 s after the host's
 * reached the host on 0 of 183 frames, so every `?net=` rival stood still. The queue now learns the offset from the
 * first input (host tick at arrival − sender tick), re-learns it when the lead
 * drifts out of a band (a long stall, a backgrounded tab), and plays the sender's ticks in order. Ticks the host steps
 * over in one take are not lost: their button presses (every boolean of the Intent) are OR-ed into what it returns, so a
 * tap that lived for one sender tick still reaches the simulation.
 */
/** Ticks of cushion the host reads behind the newest input. 0: the newest the moment it lands (lowest latency); a late or
 *  bunched packet loses nothing either way, because a take plays every tick up to its read with their buttons merged. */
export const INPUT_CUSHION_TICKS = 0;
/** The lead (sender ticks buffered past the host's read) above which the queue re-learns its offset: ~330 ms of input piled up. */
export const INPUT_MAX_LEAD_TICKS = 10;

export class InputQueue {
  private byTick = new Map<number, Intent>();
  private last: Intent | null = null;
  private highest = -1;
  /** host tick − sender tick; null until the first input arrives. */
  private offset: number | null = null;
  /** The newest sender tick already handed to the simulation. */
  private consumed = -Infinity;

  /** `hostTick`: the host's tick when this input arrived (omit for a test that keys both sides alike). */
  push(tick: number, intent: Intent, hostTick?: number): void {
    if (tick <= this.highest - 120) return;   // far too old to matter
    if (tick <= this.consumed) return;        // the simulation is already past it
    if (this.offset === null) this.offset = hostTick !== undefined ? hostTick - tick + INPUT_CUSHION_TICKS : 0;
    this.byTick.set(tick, intent);
    if (tick > this.highest) this.highest = tick;
    // a burst after a stall: re-learn so the host is not reading a third of a second in the past for the rest of the game
    if (hostTick !== undefined && this.highest - (hostTick - this.offset) > INPUT_MAX_LEAD_TICKS) this.offset = hostTick - this.highest + INPUT_CUSHION_TICKS;
  }

  /** The sender tick the host's `tick` reads (for tests and the HUD). */
  senderTickFor(tick: number): number { return tick - (this.offset ?? 0); }

  /** The input to simulate for `tick`, and whether it was really received. */
  take(tick: number): { intent: Intent | null; predicted: boolean } {
    const target = this.senderTickFor(tick);
    let merged: Intent | null = null;
    for (const k of [...this.byTick.keys()].sort((a, b) => a - b)) {
      if (k > target) break;
      const i = this.byTick.get(k)!;
      this.byTick.delete(k);
      this.consumed = Math.max(this.consumed, k);
      merged = merged ? orButtons(i, merged) : i;   // the newest axes, every button any of them pressed
    }
    if (merged) { this.last = merged; return { intent: merged, predicted: false }; }
    return { intent: this.last, predicted: true };
  }

  /** Ticks buffered ahead of `tick` — the host's cushion against jitter. */
  depth(tick: number): number {
    const target = this.senderTickFor(tick);
    let n = 0;
    for (const k of this.byTick.keys()) if (k > target) n++;
    return n;
  }
}

/** `latest` with every button that was down in `also` held down too (axes and the meter come from `latest`). */
export function orButtons(latest: Intent, also: Intent): Intent {
  const out: Intent = { ...latest };
  const rec = out as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(also)) if (v === true) rec[k] = true;
  return out;
}
