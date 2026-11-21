// FEL NETPLAY — the shared world's jitter buffer (lane/online-play, 2026-11-21). Pure: no Babylon, no sockets.
//
// The simulating page sends a WorldMsg every tick, stamped with ITS tick. A drawing page keeps the last second of them and
// draws a moment slightly in the past, interpolating between the two that straddle it, so a late packet is never a visible
// snap. Two things the old SnapshotBuffer did not do, and a shared game needs:
//
//   1. THE RENDER CLOCK RUNS ON LOCAL TIME. Drawing "newest − delay" holds the picture still until the next packet lands and
//      then jumps (a 30 Hz staircase on a 60 Hz screen). Here the sender's tick at local time t is estimated from the fastest
//      delivery seen (base = min(arrival − tick × TICK_MS)), so the drawn moment advances every frame.
//   2. THE SENDER CAN CHANGE. In 1v1 the page with the ball runs the game, so the world's author swaps every possession and
//      its ticks are on another clock: a new author empties the buffer.
import { TICK_MS, type PeerId, type WorldMsg } from './protocol';

interface Held { msg: WorldMsg; at: number }

export const WORLD_KEEP = 40;
/** Adaptive delay: two ticks plus 1.2 × the measured jitter, inside this band (ms). */
export const DELAY_MIN_MS = 66;
export const DELAY_MAX_MS = 250;

export function adaptiveDelayMs(jitterMs: number): number {
  return Math.round(Math.min(DELAY_MAX_MS, Math.max(DELAY_MIN_MS, TICK_MS * 2 + jitterMs * 1.2)));
}

export class WorldBuffer {
  private held: Held[] = [];
  private _from: PeerId | null = null;

  get from(): PeerId | null { return this._from; }
  get size(): number { return this.held.length; }
  get newest(): WorldMsg | null { return this.held.length ? this.held[this.held.length - 1].msg : null; }

  clear(): void { this.held = []; this._from = null; }

  push(msg: WorldMsg, atMs: number): void {
    if (msg.from !== this._from) { this.held = []; this._from = msg.from; }
    if (this.held.some((h) => h.msg.tick === msg.tick)) return;   // a duplicate
    const i = this.held.findIndex((h) => h.msg.tick > msg.tick);
    if (i < 0) this.held.push({ msg, at: atMs }); else this.held.splice(i, 0, { msg, at: atMs });
    while (this.held.length > WORLD_KEEP) this.held.shift();
  }

  /** arrival − tick × TICK_MS of the fastest delivery held: local ms at the sender's tick 0. */
  private base(): number {
    let b = Infinity;
    for (const h of this.held) b = Math.min(b, h.at - h.msg.tick * TICK_MS);
    return b;
  }

  /** Spread between the fastest and slowest delivery held (ms): what the adaptive delay absorbs. */
  get jitterMs(): number {
    if (this.held.length < 2) return 0;
    let lo = Infinity, hi = -Infinity;
    for (const h of this.held) { const d = h.at - h.msg.tick * TICK_MS; lo = Math.min(lo, d); hi = Math.max(hi, d); }
    return hi - lo;
  }

  /** How long ago the newest world arrived (Infinity before the first): a page says "Reconnecting…" when it grows. */
  ageMs(nowMs: number): number { return this.held.length ? nowMs - this.held[this.held.length - 1].at : Infinity; }

  /** The sender tick to draw at local time `nowMs`, `delayMs` in the past. */
  renderTick(nowMs: number, delayMs: number): number {
    const b = this.base();
    return Number.isFinite(b) ? (nowMs - b - delayMs) / TICK_MS : -1;
  }

  /**
   * The two worlds that straddle `tick` and how far between them (0..1). Past the newest: the newest, held (a frozen body reads
   * better than one that vanishes or runs on). Before the oldest: the oldest. Null with nothing held.
   */
  sample(tick: number): { a: WorldMsg; b: WorldMsg; k: number } | null {
    if (!this.held.length) return null;
    const first = this.held[0].msg, last = this.held[this.held.length - 1].msg;
    if (tick <= first.tick) return { a: first, b: first, k: 0 };
    if (tick >= last.tick) return { a: last, b: last, k: 0 };
    for (let i = 1; i < this.held.length; i++) {
      const b = this.held[i].msg;
      if (b.tick === tick) return { a: b, b, k: 0 };
      if (b.tick > tick) {
        const a = this.held[i - 1].msg;
        return { a, b, k: b.tick === a.tick ? 0 : (tick - a.tick) / (b.tick - a.tick) };
      }
    }
    return { a: last, b: last, k: 0 };
  }

  /** As sample(), over only the worlds that carry a pose (poses go at NET_POSE_HZ, roots at every tick). */
  samplePosed(tick: number): { a: WorldMsg; b: WorldMsg; k: number } | null {
    const posed = this.held.filter((h) => h.msg.bodies.some((b) => b.pose));
    if (!posed.length) return null;
    const first = posed[0].msg, last = posed[posed.length - 1].msg;
    if (tick <= first.tick) return { a: first, b: first, k: 0 };
    if (tick >= last.tick) return { a: last, b: last, k: 0 };
    for (let i = 1; i < posed.length; i++) {
      const b = posed[i].msg;
      if (b.tick >= tick) { const a = posed[i - 1].msg; return { a, b, k: b.tick === a.tick ? 0 : (tick - a.tick) / (b.tick - a.tick) }; }
    }
    return { a: last, b: last, k: 0 };
  }
}
