// The wire — Phase B's frame, and the ordering rule that makes an unordered channel safe (2026-09-13).
//
// The two tests that matter most are the wrap ones. A 16-bit sequence rolls over every ~18 minutes at 60 Hz,
// and both the naive `seq > last` comparison and a gate that forgets a departed slot fail in ways that only
// show up in a long session — which is the worst possible time to find them.

import { describe, it, expect } from 'vitest';
import {
  PAD_FRAME_BYTES, PAD_FRAME_MAGIC, SEQ_MAX, WIRE_BUTTONS, BUTTON_BIT,
  encodePadFrame, decodePadFrame, hasButton, packButtons, isNewer, SeqGate, LatencyTracker,
  type PadFrame,
} from './wire';

const frame = (over: Partial<PadFrame> = {}): PadFrame => ({
  slot: 0, seq: 1, lx: 0, ly: 0, rx: 0, ry: 0, buttons: 0, trigL: 0, trigR: 0, t: 0, ...over,
});

describe('a frame is sixteen bytes and nothing else', () => {
  it('encodes to exactly PAD_FRAME_BYTES', () => {
    expect(encodePadFrame(frame())).toHaveLength(PAD_FRAME_BYTES);
    expect(PAD_FRAME_BYTES).toBe(16);
  });

  it('NO JSON ON THE HOT PATH — the frame is bytes, not text', () => {
    const bytes = encodePadFrame(frame({ buttons: packButtons({ A: true }) }));
    const asText = new TextDecoder().decode(bytes);
    expect(() => JSON.parse(asText)).toThrow();
    // and it is an order of magnitude smaller than the JSON it replaces
    const json = JSON.stringify({ type: 'input', ev: { a: 'shoot', p: { power: 0.5 }, t: Date.now() } });
    expect(bytes.length).toBeLessThan(json.length / 3);
  });

  it('round-trips every field', () => {
    const f = frame({ slot: 3, seq: 40000, lx: 1, ly: -1, rx: 0.5, ry: -0.25, buttons: 0xabcd, trigL: 1, trigR: 0.5, t: 123456 });
    const out = decodePadFrame(encodePadFrame(f))!;
    expect(out.slot).toBe(3);
    expect(out.seq).toBe(40000);
    expect(out.lx).toBeCloseTo(1, 2);
    expect(out.ly).toBeCloseTo(-1, 2);
    expect(out.rx).toBeCloseTo(0.5, 2);
    expect(out.ry).toBeCloseTo(-0.25, 2);
    expect(out.buttons).toBe(0xabcd);
    expect(out.trigL).toBeCloseTo(1, 2);
    expect(out.trigR).toBeCloseTo(0.5, 2);
    expect(out.t).toBe(123456);
  });

  it('quantisation is finer than a thumb', () => {
    const out = decodePadFrame(encodePadFrame(frame({ lx: 0.314 })))!;
    expect(Math.abs(out.lx - 0.314)).toBeLessThan(0.01);
  });

  it('out-of-range and NaN axes clamp rather than corrupting the frame', () => {
    const out = decodePadFrame(encodePadFrame(frame({ lx: 99, ly: -99, rx: Number.NaN, trigL: 9 })))!;
    expect(out.lx).toBeCloseTo(1, 2);
    expect(out.ly).toBeCloseTo(-1, 2);
    expect(out.rx).toBe(0);
    expect(out.trigL).toBeCloseTo(1, 2);
  });

  it('can write into a reused buffer, so the hot path allocates nothing', () => {
    const buf = new Uint8Array(PAD_FRAME_BYTES);
    const out = encodePadFrame(frame({ seq: 7 }), buf);
    expect(out).toBe(buf);
    expect(decodePadFrame(buf)!.seq).toBe(7);
  });
});

describe('anything that is not a frame is not a frame', () => {
  it('rejects the wrong length, the wrong magic, and nothing at all', () => {
    expect(decodePadFrame(new Uint8Array(15))).toBeNull();
    expect(decodePadFrame(new Uint8Array(17))).toBeNull();
    const bad = encodePadFrame(frame()); bad[0] = 0x7b;            // '{' — a JSON message
    expect(decodePadFrame(bad)).toBeNull();
    expect(decodePadFrame(null)).toBeNull();
    expect(decodePadFrame(undefined)).toBeNull();
  });

  it('A JSON CONTROL MESSAGE CAN NEVER BE READ AS INPUT', () => {
    // both live on data channels; the magic byte is what keeps them apart
    const text = new TextEncoder().encode(JSON.stringify({ type: 'ping', t: 1 }));
    expect(decodePadFrame(text)).toBeNull();
    expect(PAD_FRAME_MAGIC).not.toBe(0x7b);
  });

  it('reads from a plain ArrayBuffer too — that is what a data channel delivers', () => {
    const u = encodePadFrame(frame({ seq: 99 }));
    const ab = u.buffer.slice(u.byteOffset, u.byteOffset + u.length);
    expect(decodePadFrame(ab)!.seq).toBe(99);
  });
});

describe('buttons are a bitfield, and the bit order is a contract', () => {
  it('packs and reads back', () => {
    const f = frame({ buttons: packButtons({ A: true, R1: true, LEFT: true }) });
    expect(hasButton(f, 'A')).toBe(true);
    expect(hasButton(f, 'R1')).toBe(true);
    expect(hasButton(f, 'LEFT')).toBe(true);
    expect(hasButton(f, 'B')).toBe(false);
  });

  it('every button has a distinct bit and they all fit in 16', () => {
    const bits = WIRE_BUTTONS.map((b) => BUTTON_BIT[b]);
    expect(new Set(bits).size).toBe(WIRE_BUTTONS.length);
    expect(Math.max(...bits)).toBeLessThan(0x10000);
  });

  it('the order is the one the host will decode forever — append only', () => {
    // a reorder silently remaps every player's controls against an older client
    expect(WIRE_BUTTONS.slice(0, 10)).toEqual(['A', 'B', 'X', 'Y', 'L1', 'R1', 'SELECT', 'START', 'LS', 'RS']);
    expect(BUTTON_BIT.A).toBe(1);
  });

  it('all sixteen buttons survive a round trip at once', () => {
    const all = packButtons(Object.fromEntries(WIRE_BUTTONS.map((b) => [b, true])));
    const out = decodePadFrame(encodePadFrame(frame({ buttons: all })))!;
    for (const b of WIRE_BUTTONS) expect(hasButton(out, b), b).toBe(true);
  });
});

describe('THE HOST DROPS OUT-OF-ORDER FRAMES', () => {
  it('newer is accepted, stale is dropped', () => {
    const gate = new SeqGate();
    expect(gate.accept(frame({ seq: 10 }))).toBe(true);
    expect(gate.accept(frame({ seq: 11 }))).toBe(true);
    expect(gate.accept(frame({ seq: 9 }))).toBe(false);     // arrived late
    expect(gate.accept(frame({ seq: 11 }))).toBe(false);    // duplicate
    expect(gate.accepted).toBe(2);
    expect(gate.dropped).toBe(2);
    expect(gate.dropRate).toBe(0.5);
  });

  it('SEQUENCE WRAP DOES NOT STOP INPUT DEAD', () => {
    // the naive `seq > last` breaks here, ~18 minutes into a session at 60 Hz, and every frame after the
    // rollover looks older than the last one
    expect(isNewer(0, 65535)).toBe(true);
    expect(isNewer(5, 65530)).toBe(true);
    expect(isNewer(65535, 0)).toBe(false);
    const gate = new SeqGate();
    gate.accept(frame({ seq: 65534 }));
    expect(gate.accept(frame({ seq: 65535 }))).toBe(true);
    expect(gate.accept(frame({ seq: 0 }))).toBe(true);
    expect(gate.accept(frame({ seq: 1 }))).toBe(true);
  });

  it('slots are gated independently — one player’s lag never blocks another', () => {
    const gate = new SeqGate();
    expect(gate.accept(frame({ slot: 0, seq: 100 }))).toBe(true);
    expect(gate.accept(frame({ slot: 1, seq: 2 }))).toBe(true);    // far behind slot 0, and fine
    expect(gate.accept(frame({ slot: 1, seq: 3 }))).toBe(true);
    expect(gate.accept(frame({ slot: 0, seq: 99 }))).toBe(false);
  });

  it('a slot that leaves and rejoins is not judged against its old counter', () => {
    const gate = new SeqGate();
    gate.accept(frame({ slot: 2, seq: 5000 }));
    gate.reset(2);
    expect(gate.accept(frame({ slot: 2, seq: 1 }))).toBe(true);    // a fresh client starts at 1 again
  });

  it('the first frame from a slot is always accepted', () => {
    const gate = new SeqGate();
    expect(gate.accept(frame({ slot: 3, seq: 40000 }))).toBe(true);
  });

  it('a quiet gate reports no drops rather than dividing by zero', () => {
    expect(new SeqGate().dropRate).toBe(0);
  });
});

describe('the latency readout is honest about what it can measure', () => {
  it('reports JITTER, which is real, rather than a clock difference, which is not', () => {
    const l = new LatencyTracker();
    // two devices whose clocks are 5000 ms apart, with 12 ms of genuine variation
    l.push(0, 5000); l.push(16, 5028); l.push(32, 5032);
    expect(l.jitterMs()).toBeLessThan(50);        // the offset cancels out
    expect(l.count).toBe(3);
  });

  it('needs two samples before it claims anything', () => {
    const l = new LatencyTracker();
    expect(l.jitterMs()).toBe(0);
    l.push(0, 100);
    expect(l.jitterMs()).toBe(0);
  });

  it('keeps a bounded window, so a long session does not grow without limit', () => {
    const l = new LatencyTracker(10);
    for (let i = 0; i < 100; i++) l.push(i, i + 20);
    expect(l.count).toBe(10);
  });

  it('frame rate is frames over a span', () => {
    expect(LatencyTracker.rate(60, 1000)).toBeCloseTo(60, 6);
    expect(LatencyTracker.rate(60, 0)).toBe(0);
  });
});

describe('the frame budget holds at 60 Hz with four pads', () => {
  it('four pads at 60 Hz is under 4 KB/s', () => {
    const bytesPerSecond = PAD_FRAME_BYTES * 60 * 4;
    expect(bytesPerSecond).toBeLessThan(4096);
  });

  it('a wrap-length session of frames encodes and decodes without drift', () => {
    const gate = new SeqGate();
    let accepted = 0;
    for (let i = 0; i < SEQ_MAX + 100; i++) {
      const f = decodePadFrame(encodePadFrame(frame({ seq: i % SEQ_MAX, lx: 0.5 })))!;
      if (gate.accept(f)) accepted++;
    }
    expect(accepted).toBe(SEQ_MAX + 100);        // nothing was wrongly dropped across the rollover
  });
});
