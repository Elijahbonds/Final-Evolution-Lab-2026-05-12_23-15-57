// The host's side of the wire, and the pad's (2026-09-13).
//
// The acceptance criterion this file mostly exists for: "3PT Shootout fully playable: touch-only, keyboard,
// local gamepad, and remote PAD relay. All four paths." That is only true if a remote pad is INDISTINGUISH-
// ABLE from a local one to a mode — so these assert the FelInput that comes out, not the bytes that went in.

import { describe, it, expect } from 'vitest';
import type { FelInput } from '@/lib/babylon/core/InputBus';
import { HostInput } from './hostInput';
import { encodePadFrame, packButtons, type PadFrame } from './wire';
import { sampleFrame, shouldSend, frameChanged, PadSender, PadClock, KEEPALIVE_MS, type TouchState } from './padSampler';
import type { PadLike } from '@/lib/input/profiles';

const frame = (over: Partial<PadFrame> = {}): PadFrame => ({
  slot: 0, seq: 1, lx: 0, ly: 0, rx: 0, ry: 0, buttons: 0, trigL: 0, trigR: 0, t: 0, ...over,
});

/** Collect what a mode would see. */
function collector() {
  const events: { slot: number; e: FelInput }[] = [];
  const host = new HostInput({ emit: (slot, e) => events.push({ slot, e }) });
  return { host, events, buttons: () => events.filter((x) => x.e.t === 'button').map((x) => `${x.slot}:${(x.e as { btn: string }).btn}:${(x.e as { pressed: boolean }).pressed}`) };
}

function padFixture(id: string, down: number[] = [], axes = [0, 0, 0, 0]): PadLike {
  return { id, mapping: 'standard', axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 })) };
}

describe('a frame becomes the FelInput every mode already speaks', () => {
  it('a pressed button arrives as a button press', () => {
    const c = collector();
    c.host.onFrame(frame({ seq: 1, buttons: packButtons({ A: true }) }));
    expect(c.buttons()).toContain('0:A:true');
  });

  it('EDGES, NOT LEVELS — a held button is announced once', () => {
    const c = collector();
    const held = packButtons({ A: true });
    c.host.onFrame(frame({ seq: 1, buttons: held }));
    c.host.onFrame(frame({ seq: 2, buttons: held }));
    c.host.onFrame(frame({ seq: 3, buttons: held }));
    expect(c.buttons().filter((b) => b === '0:A:true')).toHaveLength(1);
  });

  it('and the release is announced too', () => {
    const c = collector();
    c.host.onFrame(frame({ seq: 1, buttons: packButtons({ A: true }) }));
    c.host.onFrame(frame({ seq: 2, buttons: 0 }));
    expect(c.buttons()).toEqual(['0:A:true', '0:A:false']);
  });

  it('the four directions arrive as a D-PAD, not as buttons', () => {
    const c = collector();
    c.host.onFrame(frame({ seq: 1, buttons: packButtons({ LEFT: true }) }));
    const dpad = c.events.filter((x) => x.e.t === 'dpad');
    expect(dpad).toHaveLength(1);
    expect((dpad[0].e as { dir: string }).dir).toBe('left');
  });

  it('sticks and triggers arrive as sticks and triggers', () => {
    const c = collector();
    c.host.onFrame(frame({ seq: 1, lx: 0.5, ly: -0.5, trigR: 0.8 }));
    const stick = c.events.find((x) => x.e.t === 'stick' && (x.e as { side: string }).side === 'L');
    expect((stick!.e as { x: number }).x).toBeCloseTo(0.5, 2);
    const trig = c.events.find((x) => x.e.t === 'trigger' && (x.e as { side: string }).side === 'R');
    expect((trig!.e as { value: number }).value).toBeCloseTo(0.8, 2);
  });

  it('a stick that has not moved is not re-emitted — it would overwrite another source', () => {
    const c = collector();
    c.host.onFrame(frame({ seq: 1, lx: 0.5 }));
    const before = c.events.length;
    c.host.onFrame(frame({ seq: 2, lx: 0.5 }));
    expect(c.events.length).toBe(before);
  });
});

describe('THE HOST DROPS OUT-OF-ORDER FRAMES, AND THE MODE NEVER SEES THEM', () => {
  it('a late frame does not rewind the stick', () => {
    const c = collector();
    c.host.onFrame(frame({ seq: 1, lx: 0 }));
    c.host.onFrame(frame({ seq: 2, lx: 1 }));
    const afterNew = c.events.length;
    c.host.onFrame(frame({ seq: 1, lx: 0 }));      // the old frame, arriving late
    expect(c.events.length).toBe(afterNew);        // nothing emitted: the stick stays where it is
    expect(c.host.stats().dropped).toBe(1);
  });

  it('a duplicate is dropped', () => {
    const c = collector();
    c.host.onFrame(frame({ seq: 5, buttons: packButtons({ A: true }) }));
    c.host.onFrame(frame({ seq: 5, buttons: packButtons({ A: true }) }));
    expect(c.buttons().filter((b) => b === '0:A:true')).toHaveLength(1);
  });

  it('four slots are independent — one player’s bad link never blocks another', () => {
    const c = collector();
    c.host.onFrame(frame({ slot: 0, seq: 900 }));
    c.host.onFrame(frame({ slot: 1, seq: 1, buttons: packButtons({ B: true }) }));
    c.host.onFrame(frame({ slot: 2, seq: 1, buttons: packButtons({ X: true }) }));
    c.host.onFrame(frame({ slot: 3, seq: 1, buttons: packButtons({ Y: true }) }));
    expect(c.buttons()).toEqual(['1:B:true', '2:X:true', '3:Y:true']);
    expect(c.host.stats().activeSlots).toEqual([0, 1, 2, 3]);
  });

  it('a slot beyond the roster is ignored rather than crashing', () => {
    const c = collector();
    expect(c.host.onFrame(frame({ slot: 9, seq: 1 }))).toBe(false);
    expect(c.events).toHaveLength(0);
  });
});

describe('a message that is not a frame is not packet loss', () => {
  it('the control channel’s JSON passes through without polluting the stats', () => {
    const c = collector();
    expect(c.host.onMessage(JSON.stringify({ type: 'ping', t: 1 }))).toBe(false);
    expect(c.host.onMessage(null)).toBe(false);
    expect(c.host.onMessage(new Uint8Array(4))).toBe(false);
    expect(c.host.stats().dropped).toBe(0);     // none of that is a dropped input frame
    expect(c.host.stats().accepted).toBe(0);
  });

  it('real bytes off a data channel are accepted', () => {
    const c = collector();
    const bytes = encodePadFrame(frame({ seq: 1, buttons: packButtons({ START: true }) }));
    expect(c.host.onMessage(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length))).toBe(true);
    expect(c.buttons()).toContain('0:START:true');
  });
});

describe('A PHONE THAT DIES MID-PRESS DOES NOT LEAVE THE BUTTON HELD', () => {
  it('release() lets go of everything that slot was holding', () => {
    const c = collector();
    c.host.onFrame(frame({ seq: 1, buttons: packButtons({ A: true, R1: true }), lx: 1, trigR: 1 }));
    c.host.release(0);
    expect(c.buttons()).toContain('0:A:false');
    expect(c.buttons()).toContain('0:R1:false');
    const lastStick = [...c.events].reverse().find((x) => x.e.t === 'stick' && (x.e as { side: string }).side === 'L');
    expect((lastStick!.e as { x: number }).x).toBe(0);
    const lastTrig = [...c.events].reverse().find((x) => x.e.t === 'trigger' && (x.e as { side: string }).side === 'R');
    expect((lastTrig!.e as { value: number }).value).toBe(0);
  });

  it('and a rejoining client starting from seq 1 is accepted', () => {
    const c = collector();
    c.host.onFrame(frame({ seq: 6000 }));
    c.host.release(0);
    expect(c.host.onFrame(frame({ seq: 1, buttons: packButtons({ A: true }) }))).toBe(true);
  });

  it('releasing a slot that never sent anything is harmless', () => {
    const c = collector();
    c.host.release(2);
    expect(c.events).toHaveLength(0);
  });
});

describe('THE PAD FORWARDS CANONICAL ACTIONS, NOT RAW BUTTON STATE', () => {
  it('a Switch Pro’s bottom button leaves the phone as canonical A', () => {
    // the mapping happens on the PHONE, which is the device the controller is paired to and the only one
    // that can see gamepad.id. The host never learns what hardware is in the room.
    const sw = padFixture('Pro Controller (Vendor: 057e Product: 2009)', [1]);
    const f = sampleFrame(1, { slot: 0, pad: sw, t: 0 });
    const c = collector();
    c.host.onFrame(f);
    expect(c.buttons()).toContain('0:A:true');
  });

  it('an Xbox pad’s bottom button produces the IDENTICAL frame', () => {
    const sw = sampleFrame(1, { slot: 0, pad: padFixture('Pro Controller (Vendor: 057e Product: 2009)', [1]), t: 0 });
    const xb = sampleFrame(1, { slot: 0, pad: padFixture('Xbox Wireless Controller (Vendor: 045e Product: 0b13)', [0]), t: 0 });
    expect(sw.buttons).toBe(xb.buttons);
    expect(encodePadFrame(sw)).toEqual(encodePadFrame(xb));
  });

  it('a phone with NO controller sends the same shape from its touch layout', () => {
    const touch: TouchState = { lx: 0.5, buttons: { A: true } };
    const f = sampleFrame(1, { slot: 1, touch, t: 10 });
    const c = collector();
    c.host.onFrame(f);
    expect(c.buttons()).toContain('1:A:true');
    // and the host has no way to tell which it was — one wire format, one code path
    expect(Object.keys(f).sort()).toEqual(Object.keys(sampleFrame(1, { slot: 1, pad: padFixture('x'), t: 10 })).sort());
  });

  it('a controller in hand wins over a thumb resting on the screen', () => {
    const f = sampleFrame(1, {
      slot: 0, t: 0,
      pad: padFixture('Xbox Wireless Controller', [], [1, 0, 0, 0]),
      touch: { lx: 0.1 },
    });
    expect(f.lx).toBeCloseTo(1, 1);
  });

  it('but a touch button held alongside a controller still counts', () => {
    const f = sampleFrame(1, { slot: 0, t: 0, pad: padFixture('Xbox Wireless Controller', [0]), touch: { buttons: { START: true } } });
    const c = collector();
    c.host.onFrame(f);
    expect(c.buttons()).toContain('0:A:true');
    expect(c.buttons()).toContain('0:START:true');
  });
});

describe('a resting pad does not shout, and a dead pad does not whisper', () => {
  it('an unchanged frame is skipped', () => {
    const a = frame({ seq: 1 });
    expect(frameChanged(a, frame({ seq: 2 }))).toBe(false);
    expect(shouldSend(a, frame({ seq: 2 }), 10)).toBe(false);
  });

  it('but it still keepalives, so idle is distinguishable from gone', () => {
    const a = frame({ seq: 1 });
    expect(shouldSend(a, frame({ seq: 2 }), KEEPALIVE_MS)).toBe(true);
  });

  it('a real change always goes', () => {
    const a = frame({ seq: 1 });
    expect(frameChanged(a, frame({ seq: 2, buttons: packButtons({ A: true }) }))).toBe(true);
    expect(frameChanged(a, frame({ seq: 2, lx: 0.5 }))).toBe(true);
    // …and noise below one quantisation step does not
    expect(frameChanged(a, frame({ seq: 2, lx: 0.004 }))).toBe(false);
  });

  it('the sender numbers frames in order and only increments when it sends', () => {
    const sent: number[] = [];
    const s = new PadSender((b) => sent.push(b.length));
    const opts = { slot: 0, touch: {} as TouchState, t: 0 };
    expect(s.tick({ ...opts, t: 0 }, 0)!.seq).toBe(1);      // first frame always goes
    expect(s.tick({ ...opts, t: 10 }, 10)).toBeNull();      // unchanged, inside the keepalive
    expect(s.tick({ ...opts, touch: { buttons: { A: true } }, t: 20 }, 20)!.seq).toBe(2);
    expect(sent.every((n) => n === 16)).toBe(true);
    expect(s.sent).toBe(2);
    expect(s.skipped).toBe(1);
  });

  it('the pad clock starts at its own session, not at the unix epoch', () => {
    const clock = new PadClock(1_700_000_000_000);
    expect(clock.ms(1_700_000_001_500)).toBe(1500);
    expect(clock.ms(1_699_999_999_000)).toBe(0);           // a clock that steps backwards does not go negative
  });
});

describe('the stats are what a debug overlay needs', () => {
  it('reports accepted, dropped, drop rate and active slots', () => {
    const c = collector();
    c.host.onFrame(frame({ seq: 2 }), 1000);
    c.host.onFrame(frame({ seq: 1 }), 1010);      // stale
    const s = c.host.stats(2000);
    expect(s.accepted).toBe(1);
    expect(s.dropped).toBe(1);
    expect(s.dropRate).toBeCloseTo(0.5, 6);
    expect(s.activeSlots).toEqual([0]);
    expect(s.fps).toBeGreaterThanOrEqual(0);
  });

  it('a fresh host reports zeroes rather than NaN', () => {
    const s = new HostInput({ emit: () => {} }).stats();
    expect(s.fps).toBe(0);
    expect(s.dropRate).toBe(0);
    expect(s.jitterMs).toBe(0);
  });
});
