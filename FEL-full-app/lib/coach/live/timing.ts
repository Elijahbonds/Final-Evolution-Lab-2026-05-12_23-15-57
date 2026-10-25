// lib/coach/live/timing.ts — COACH-LIVE (2026-10-25): how often pose frames go out, how fast they arrive, and the two
// pages' clocks lined up so the coach's side can say how old a frame is.
//
//   PoseThinner  the camera gives ~30 frames a second (PoseService's MIN_DETECT_GAP_MS); the wire takes POSE_SEND_HZ.
//                A frame goes when it is due; the next is due 1/POSE_SEND_HZ after the last DUE time (not the last sent
//                one), so a 30 fps camera averages 20 Hz instead of rounding down to every other frame (15 Hz).
//   RateMeter    frames and bytes over the last RATE_WINDOW_MS: the live Hz and bit rate the coach's panel shows.
//   ClockSync    NTP's arithmetic over the control channel's ping/pong: the coach sends its time a, the client answers
//                with a and its own time b, the coach notes when the answer came. offset = b − (a + rtt/2); the sample
//                with the smallest round trip of the last CLOCK_SAMPLES wins (the least queueing, the truest offset).
//
// Pure: times are passed in.

/** Pose frames a second on the wire. (new) The brief's 15–20 Hz, at its top: the coach's overlay is what this feeds. */
export const POSE_SEND_HZ = 20;
/** In relay mode (no direct path) frames go through our server in batches: this rate, every RELAY_BATCH_MS. (new) */
export const RELAY_POSE_HZ = 8;
export const RELAY_BATCH_MS = 500;
export const RATE_WINDOW_MS = 2000;
export const CLOCK_SAMPLES = 8;
export const PING_EVERY_MS = 2000;

export class PoseThinner {
  private due: number | null = null;
  constructor(private readonly hz: number = POSE_SEND_HZ) {}
  /** Is the frame at time t due? (true → send it). */
  take(t: number): boolean {
    const gap = 1000 / this.hz;
    if (this.due === null || t - this.due > gap) { this.due = t + gap; return true; }   // first, or after a gap
    if (t + 0.5 < this.due) return false;
    this.due += gap;
    return true;
  }
  reset(): void { this.due = null; }
}

export class RateMeter {
  private times: number[] = [];
  private bytes: number[] = [];
  add(now: number, n: number): void {
    this.times.push(now); this.bytes.push(n);
    this.trim(now);
  }
  private trim(now: number): void {
    while (this.times.length && now - this.times[0] > RATE_WINDOW_MS) { this.times.shift(); this.bytes.shift(); }
  }
  /** Messages a second over the window. */
  hz(now: number): number { this.trim(now); return (this.times.length * 1000) / RATE_WINDOW_MS; }
  /** Bits a second of payload over the window. */
  bps(now: number): number { this.trim(now); return (this.bytes.reduce((a, b) => a + b, 0) * 8 * 1000) / RATE_WINDOW_MS; }
}

export class ClockSync {
  private samples: { rtt: number; offset: number }[] = [];
  /** A pong: a = our send time, b = their time, now = ours on arrival. */
  pong(a: number, b: number, now: number): void {
    const rtt = now - a;
    if (!(rtt >= 0) || rtt > 60_000) return;
    this.samples.push({ rtt, offset: b - (a + rtt / 2) });
    if (this.samples.length > CLOCK_SAMPLES) this.samples.shift();
  }
  get ready(): boolean { return this.samples.length > 0; }
  /** Their clock minus ours (ms), from the tightest round trip; 0 before any sample. */
  get offset(): number {
    if (!this.samples.length) return 0;
    return this.samples.reduce((b, s) => (s.rtt < b.rtt ? s : b)).offset;
  }
  get rtt(): number | null {
    return this.samples.length ? Math.min(...this.samples.map((s) => s.rtt)) : null;
  }
  /** Their time → ours. Their pose clock wraps at 2^32 ms on the wire; ours is near it. */
  toLocal(theirs: number, now: number): number {
    let t = theirs - this.offset;
    const WRAP = 2 ** 32;
    while (t - now > WRAP / 2) t -= WRAP;
    while (now - t > WRAP / 2) t += WRAP;
    return t;
  }
}

/** Median and 95th percentile of a list (ms), for the panel and the rig. */
export function percentiles(xs: readonly number[]): { p50: number | null; p95: number | null; n: number } {
  if (!xs.length) return { p50: null, p95: null, n: 0 };
  const s = [...xs].sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
  return { p50: at(0.5), p95: at(0.95), n: s.length };
}
