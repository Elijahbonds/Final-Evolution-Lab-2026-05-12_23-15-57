// THE WIRE — a fixed-size binary input frame (2026-09-13).
//
// Mission Phase B: "Wire format: fixed-size binary frame, ~60Hz, { slot, seq, axes, buttonBitfield }. No
// JSON per frame." and "Input frames carry a seq number. HOST drops out-of-order frames."
//
// What shipped before: `sendFast(JSON.stringify(msg))` on a channel that is deliberately UNORDERED and
// unreliable (ordered:false, maxRetransmits:0). Two problems, and the second is the serious one:
//
//   SIZE. A JSON control event is ~70–110 bytes of text that has to be parsed on arrival. At 60 Hz per pad
//   with four pads that is a needless ~25 KB/s of string work on the device that is also rendering the game.
//   This frame is 16 bytes, read with a DataView and no allocation.
//
//   ORDER. The channel can deliver out of order — that is what `ordered: false` MEANS, and it is the right
//   setting for input, because a late frame is worse than a lost one. But nothing carried a sequence number,
//   so a frame that arrived late overwrote a newer one that had already been applied: the stick would snap
//   back to where it was two frames ago. Unordered delivery without a seq is not "fast", it is wrong.
//
// THE LAYOUT (16 bytes, little-endian):
//   0      magic  0xF1   — a JSON frame or a stray text message can never be mistaken for input
//   1      slot   0–3, high nibble reserved for flags
//   2..3   seq    uint16, wraps
//   4..7   axes   4 × int8: lx, ly, rx, ry, quantised from −1..1
//   8..9   buttons uint16 bitfield
//   10     trigL  uint8 0..255
//   11     trigR  uint8 0..255
//   12..15 t      uint32, ms since the session epoch — the latency readout's clock
//
// Pure: no browser API. Encoding and decoding are the same in a test as on the wire.

/** Every frame is exactly this long. A short or long buffer is not a frame. */
export const PAD_FRAME_BYTES = 16;
/** First byte of every input frame. */
export const PAD_FRAME_MAGIC = 0xf1;
/** Seq is 16-bit and wraps; at 60 Hz that is a wrap every ~18 minutes. */
export const SEQ_MAX = 0x10000;

/**
 * The canonical buttons, in bit order.
 *
 * This IS the contract between the pad and the host — a bit index means the same button on both sides
 * forever, so entries may be appended but never reordered or removed. The names match lib/input/profiles.ts
 * so a physical controller attached to a PAD device forwards CANONICAL actions, which is the mission's rule:
 * "the PAD device forwards canonical actions, not raw button state."
 */
export const WIRE_BUTTONS = [
  'A', 'B', 'X', 'Y', 'L1', 'R1', 'SELECT', 'START', 'LS', 'RS',
  'UP', 'DOWN', 'LEFT', 'RIGHT',
] as const;
export type WireButton = (typeof WIRE_BUTTONS)[number];

export const BUTTON_BIT: Readonly<Record<WireButton, number>> = Object.freeze(
  WIRE_BUTTONS.reduce((m, b, i) => { m[b] = 1 << i; return m; }, {} as Record<WireButton, number>),
);

export interface PadFrame {
  slot: number;
  seq: number;
  lx: number; ly: number; rx: number; ry: number;
  buttons: number;
  trigL: number; trigR: number;
  /** Milliseconds since the session epoch, as the PAD saw it. */
  t: number;
}

const q8 = (v: number): number => {
  // clamp then quantise to int8. −1..1 in, −127..127 out: 1/127 ≈ 0.008, far finer than a thumb.
  const c = Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0));
  return Math.round(c * 127);
};
const u8 = (v: number): number => Math.max(0, Math.min(255, Math.round((Number.isFinite(v) ? v : 0) * 255)));

/** Build the 16 bytes. Allocates one buffer per call; callers on the hot path should reuse `into`. */
export function encodePadFrame(f: PadFrame, into?: Uint8Array): Uint8Array {
  const out = into && into.length >= PAD_FRAME_BYTES ? into : new Uint8Array(PAD_FRAME_BYTES);
  const dv = new DataView(out.buffer, out.byteOffset, PAD_FRAME_BYTES);
  dv.setUint8(0, PAD_FRAME_MAGIC);
  dv.setUint8(1, f.slot & 0x0f);
  dv.setUint16(2, f.seq & 0xffff, true);
  dv.setInt8(4, q8(f.lx));
  dv.setInt8(5, q8(f.ly));
  dv.setInt8(6, q8(f.rx));
  dv.setInt8(7, q8(f.ry));
  dv.setUint16(8, f.buttons & 0xffff, true);
  dv.setUint8(10, u8(f.trigL));
  dv.setUint8(11, u8(f.trigR));
  dv.setUint32(12, f.t >>> 0, true);
  return out;
}

/**
 * Read a frame, or null.
 *
 * Null for anything that is not exactly our 16 bytes with our magic — a malformed or foreign message must
 * never take a session down, and on a shared data channel we genuinely do receive other things.
 */
export function decodePadFrame(buf: ArrayBuffer | Uint8Array | null | undefined): PadFrame | null {
  if (!buf) return null;
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u.length !== PAD_FRAME_BYTES) return null;
  const dv = new DataView(u.buffer, u.byteOffset, PAD_FRAME_BYTES);
  if (dv.getUint8(0) !== PAD_FRAME_MAGIC) return null;
  return {
    slot: dv.getUint8(1) & 0x0f,
    seq: dv.getUint16(2, true),
    lx: dv.getInt8(4) / 127, ly: dv.getInt8(5) / 127,
    rx: dv.getInt8(6) / 127, ry: dv.getInt8(7) / 127,
    buttons: dv.getUint16(8, true),
    trigL: dv.getUint8(10) / 255, trigR: dv.getUint8(11) / 255,
    t: dv.getUint32(12, true),
  };
}

export function hasButton(frame: PadFrame, b: WireButton): boolean {
  return (frame.buttons & BUTTON_BIT[b]) !== 0;
}

/** Pack a set of pressed buttons into the bitfield. */
export function packButtons(pressed: Partial<Record<WireButton, boolean>>): number {
  let bits = 0;
  for (const b of WIRE_BUTTONS) if (pressed[b]) bits |= BUTTON_BIT[b];
  return bits;
}

// ── Ordering ───────────────────────────────────────────────────────────────
/**
 * Is `seq` newer than `last`, allowing for the 16-bit wrap?
 *
 * The naive `seq > last` breaks once every ~18 minutes at 60 Hz, when the counter rolls 65535 → 0 and every
 * subsequent frame looks older than the last one: input would stop dead until the session restarted. The
 * standard answer is to treat the difference as signed in the counter's own width — anything within half the
 * space ahead is newer.
 */
export function isNewer(seq: number, last: number): boolean {
  const d = (seq - last + SEQ_MAX) % SEQ_MAX;
  // d === 0 is the SAME frame, not a newer one. An unreliable channel can deliver a duplicate, and without
  // this it was re-applied — harmless for a held stick, wrong for anything edge-triggered.
  return d !== 0 && d < SEQ_MAX / 2;
}

/**
 * The host's gate: one sequence number per slot, and stale frames are dropped.
 *
 * Counts what it drops, because "how many frames are arriving out of order" is exactly the number you want
 * when a link feels bad and you are deciding whether the problem is the network or the game.
 */
export class SeqGate {
  private last = new Map<number, number>();
  accepted = 0;
  dropped = 0;

  /** True if this frame should be applied. */
  accept(frame: PadFrame): boolean {
    const prev = this.last.get(frame.slot);
    if (prev !== undefined && !isNewer(frame.seq, prev)) { this.dropped++; return false; }
    this.last.set(frame.slot, frame.seq);
    this.accepted++;
    return true;
  }

  /** A slot that has left: its next frame must not be judged against a stale counter. */
  reset(slot: number): void { this.last.delete(slot); }
  resetAll(): void { this.last.clear(); this.accepted = 0; this.dropped = 0; }

  /** Fraction of frames discarded as out-of-order, 0..1. */
  get dropRate(): number {
    const total = this.accepted + this.dropped;
    return total === 0 ? 0 : this.dropped / total;
  }
}

// ── Latency ────────────────────────────────────────────────────────────────
/**
 * A rolling one-way estimate from the frame's own timestamp.
 *
 * Deliberately NOT presented as a precise measurement: two devices' clocks are not synchronised, so the raw
 * difference carries their offset. What IS meaningful, and what the overlay shows, is the JITTER — how much
 * that difference moves — plus the transport RTT the control channel already measures with ping/pong. A
 * number labelled "latency" that is actually a clock offset is worse than no number.
 */
export class LatencyTracker {
  private samples: number[] = [];
  private cap: number;
  constructor(cap = 120) { this.cap = cap; }

  /** `now` and the frame's `t` are both ms since each side's session epoch. */
  push(frameT: number, now: number): void {
    this.samples.push(now - frameT);
    if (this.samples.length > this.cap) this.samples.shift();
  }

  /** Spread between the fastest and slowest recent frame — the part that is real. */
  jitterMs(): number {
    if (this.samples.length < 2) return 0;
    return Math.max(...this.samples) - Math.min(...this.samples);
  }

  /** Frames per second actually arriving, from the sample window and a wall-clock span. */
  static rate(frames: number, spanMs: number): number {
    return spanMs > 0 ? (frames * 1000) / spanMs : 0;
  }

  get count(): number { return this.samples.length; }
  clear(): void { this.samples.length = 0; }
}
