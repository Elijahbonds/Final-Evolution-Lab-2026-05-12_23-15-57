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
 */
export class InputQueue {
  private byTick = new Map<number, Intent>();
  private last: Intent | null = null;
  private highest = -1;

  push(tick: number, intent: Intent): void {
    if (tick <= this.highest - 120) return;   // far too old to matter
    this.byTick.set(tick, intent);
    if (tick > this.highest) this.highest = tick;
  }

  /** The input to simulate for `tick`, and whether it was really received. */
  take(tick: number): { intent: Intent | null; predicted: boolean } {
    const got = this.byTick.get(tick);
    if (got) { this.last = got; this.byTick.delete(tick); return { intent: got, predicted: false }; }
    return { intent: this.last, predicted: true };
  }

  /** Ticks buffered ahead of `tick` — the host's cushion against jitter. */
  depth(tick: number): number {
    let n = 0;
    for (const k of this.byTick.keys()) if (k > tick) n++;
    return n;
  }
}
