// MOVEMENT PLAY P3 (2026-09-24): the bus learns a body channel, and nothing a pad, a key, a touch or a phone does
// changes because of it.
//
// Headless, like InputBus.multi: a window that keeps its listeners, a navigator whose pad list the test writes, a
// requestAnimationFrame that runs nothing (`tick()` is one frame) and a performance clock the test owns (the Space
// charge ramps on it). What is pinned:
//   Z1  with no body published, a scripted pad + keyboard + Space + touch + relay stream is byte-for-byte the stream
//       the PRE-change bus produced (__fixtures__/bus-golden.json, recorded from InputBus.ts at a37a90c — the lane tip
//       before any P3 edit, hotfix 5 included: a Space release is R 0 + an A tagged `src: 'space'`, and one R a frame
//       under a held Space with a pad seated), haptic buzzes included;
//   the trigger fold (bug 3): a seated pad's per-frame trigger carries the body's RT instead of clobbering it;
//   Z6  haptics only for real presses; Z7 a blur never releases the body, stop() clears it;
//   the packet channel itself: latest / final / live buses / lag stats.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { InputBus, liveInputBuses, publishBodyToLive, type BodyPacket, type FelInput } from './InputBus';
import { isWakeInput } from './StartWake';
import { HAPTIC } from '../premium/Haptics';
import type { BodyEvent, BodyRead } from '@/lib/pose/BodyReader';
import type { BodyChannels } from '@/lib/pose/bodyChannels';

type FakePad = { id: string; index: number; mapping: string; connected: boolean; axes: number[]; buttons: { pressed: boolean; value: number }[] };
const pads: (FakePad | null)[] = [null, null, null, null];
const DUALSENSE = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
const SWITCH_PRO = 'Pro Controller (Vendor: 057e Product: 2009)';

function fake(id: string, index: number, mapping = 'standard'): FakePad {
  return { id, index, mapping, connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
}
function press(p: FakePad, i: number, down = true): void { p.buttons[i] = { pressed: down, value: down ? 1 : 0 }; }
function pull(p: FakePad, i: number, v: number): void { p.buttons[i] = { pressed: v > 0.1, value: v }; }

const g = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};
let handlers: Record<string, (ev: unknown) => void> = {};
let clock = 0;

beforeEach(() => {
  for (const k of ['window', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame']) saved[k] = g[k];
  pads.fill(null);
  handlers = {};
  clock = 1000;
  g.window = {
    addEventListener: (type: string, fn: (ev: unknown) => void) => { handlers[type] = fn; },
    removeEventListener: (type: string, fn: (ev: unknown) => void) => { if (handlers[type] === fn) delete handlers[type]; },
  };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Mozilla/5.0 (Macintosh)', maxTouchPoints: 0, getGamepads: () => pads } });
  g.requestAnimationFrame = () => 0;
  g.cancelAnimationFrame = () => {};
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  liveInputBuses().forEach((b) => b.stop());
  vi.restoreAllMocks();
  for (const k of ['window', 'requestAnimationFrame', 'cancelAnimationFrame']) g[k] = saved[k];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: saved.navigator });
});

function rig() {
  const bus = new InputBus();
  const log: unknown[] = [];
  bus.on((e) => log.push(['on', e]));
  bus.onSlot((e, slot) => log.push(['slot', slot, e]));
  vi.spyOn(HAPTIC, 'tap').mockImplementation(() => { log.push(['haptic']); });
  const tick = (): void => { clock += 16; (bus as unknown as { pollPads: () => void }).pollPads(); };
  const key = (k: string, down = true): void => {
    handlers[down ? 'keydown' : 'keyup']?.({ key: k, type: down ? 'keydown' : 'keyup', preventDefault() {} });
  };
  const mark = (s: string): void => { log.push(['--', s]); };
  return { bus, log, tick, key, mark };
}
type Rig = ReturnType<typeof rig>;

/** Every input path the bus has, in one scripted session. Changing it means re-recording against the PRE-change bus. */
function script({ bus, tick, key, mark }: Rig): void {
  mark('a pad seated before start');
  pads[0] = fake(DUALSENSE, 0);
  bus.start();
  mark('pad at rest: the triggers go out every frame');
  tick(); tick(); tick();
  mark('pad push');
  pads[0]!.axes = [0.6, -0.8, 0, 0]; tick();
  pads[0]!.axes = [0.6, -0.8, 0.5, 0.3]; tick();
  pull(pads[0]!, 7, 0.2); tick();
  pull(pads[0]!, 7, 0.55); tick();
  pull(pads[0]!, 7, 1); pull(pads[0]!, 6, 0.4); tick();
  press(pads[0]!, 0); tick();
  press(pads[0]!, 0, false); press(pads[0]!, 12); tick();
  press(pads[0]!, 12, false); tick();
  pull(pads[0]!, 7, 0); pull(pads[0]!, 6, 0); pads[0]!.axes = [0, 0, 0, 0]; tick();
  mark('keyboard with a pad seated');
  key('w'); tick(); key('d'); key('w', false); key('d', false);
  key('ArrowUp'); tick(); key('ArrowUp', false);
  key('j'); key('j', false); key('Shift'); key('Shift', false); key('f'); key('f', false);
  key('Escape'); key('Escape', false); key('v'); key('v', false);
  key('k'); key('k'); key('k', false);
  mark('space held with a pad seated');
  key(' '); tick(); tick(); tick(); tick(); key(' ', false); tick();
  mark('touch overlay');
  bus.emit({ t: 'button', btn: 'B', pressed: true }); bus.emit({ t: 'button', btn: 'B', pressed: false });
  bus.emit({ t: 'stick', side: 'L', x: 0.3, y: -0.9 }); bus.emit({ t: 'stick', side: 'L', x: 0, y: 0 });
  bus.emit({ t: 'trigger', side: 'R', value: 0.7 }); tick(); bus.emit({ t: 'trigger', side: 'R', value: 0 });
  bus.emit({ t: 'dpad', dir: 'left', pressed: true }); bus.emit({ t: 'dpad', dir: 'left', pressed: false });
  mark('controller link relay');
  bus.emitSlot(2, { t: 'button', btn: 'A', pressed: true }); bus.emitSlot(2, { t: 'stick', side: 'L', x: -1, y: 0 });
  mark('a second pad');
  pads[1] = fake(SWITCH_PRO, 1, ''); tick();
  pads[1]!.axes = [-0.7, 0.2, 0, 0]; pull(pads[1]!, 7, 0.65); tick();
  press(pads[0]!, 0); pull(pads[0]!, 7, 0.8); tick();
  mark('P1 leaves mid-press');
  pads[0] = null; tick();
  mark('the last pad leaves: one more frame, then silence');
  pads[1] = null; tick(); tick();
  mark('keyboard alone');
  key('a'); key(' '); tick(); tick(); tick();
  mark('blur');
  handlers.blur?.({}); tick();
  mark('stop');
  key('l'); bus.stop();
}

/** JSON with the two things plain JSON hides: an `undefined` key (a new `src: undefined` is a shape change) and −0. */
const encode = (v: unknown): unknown =>
  JSON.parse(JSON.stringify(v, (_k, x) => (x === undefined ? '<undefined>' : Object.is(x, -0) ? '-0' : x)));
const GOLDEN = path.join(__dirname, '__fixtures__', 'bus-golden.json');
/** One event per line, so a diff of the fixture reads like the stream. */
const goldenText = (log: unknown[]): string =>
  `{\n "recordedFrom": "lib/babylon/core/InputBus.ts at a37a90c (the lane tip, hotfix 5 included), before any P3 edit",\n "log": [\n${log.map((x) => `  ${JSON.stringify(x)}`).join(',\n')}\n ]\n}\n`;

describe('Z1: with no body, the bus is the bus it was', () => {
  it('the scripted pad + keyboard + Space + touch + relay stream equals the pre-change golden, buzzes included', () => {
    const r = rig();
    script(r);
    const got = encode(r.log);
    if (process.env.FEL_RECORD_BUS_GOLDEN === '1') {
      writeFileSync(GOLDEN, goldenText(got as unknown[]));
      return;
    }
    const want = (JSON.parse(readFileSync(GOLDEN, 'utf8')) as { log: unknown[] }).log;
    expect(got).toStrictEqual(want);
    expect(JSON.stringify(got)).toBe(JSON.stringify(want));   // key order too: byte-identical
  });
});

// ── body helpers ──
const NO_CHANNELS: BodyChannels = { inJump: false, stride: null, handsUpMs: 0, handsDownMs: 0 };
const absentRead = (t: number): BodyRead => ({
  t, present: false, conf: null, calibrated: true, tracking: false, rulers: null, hip: null, feet: null, airborne: null,
  knee: null, wrist: null, elbowDeg: null, lean: null, squat: null, yaw: null,
});
const packet = (arrivedAt: number, events: BodyEvent[] = [], final = false): BodyPacket =>
  ({ read: absentRead(arrivedAt - 40), events, channels: NO_CHANNELS, arrivedAt, ...(final ? { final: true as const } : {}) });
const takeoff = (t: number): BodyEvent => ({ kind: 'takeoff', t, seen: t + 60, feet: 'two', foot: 'both', v0: 2.2, predictedHeightM: 0.25 });
const stepEv = (t: number): BodyEvent => ({ kind: 'step', t, seen: t + 50, foot: 'L', cadenceHz: null });
type Entry = unknown[];
const on = (log: unknown[]): FelInput[] => (log as Entry[]).filter((x) => x[0] === 'on').map((x) => x[1] as FelInput);
const trig = (log: unknown[], side: 'L' | 'R'): number[] =>
  on(log).filter((e): e is Extract<FelInput, { t: 'trigger' }> => e.t === 'trigger' && e.side === side).map((e) => e.value);
const buzzes = (log: unknown[]): number => (log as Entry[]).filter((x) => x[0] === 'haptic').length;
const withPad = (): Rig => { const r = rig(); pads[0] = fake(DUALSENSE, 0); r.bus.start(); r.tick(); r.log.length = 0; return r; };

describe('the trigger fold (P3 bug 3): a seated pad carries the body instead of clobbering it', () => {
  it('a seated pad at rest plus a body RT of 0.6 gives 0.6 every frame; the body change itself rides the next pad frame', () => {
    const r = withPad();
    r.bus.emitBody({ t: 'trigger', side: 'R', value: 0.6, src: 'body' });
    expect(r.log).toEqual([]);
    r.tick(); r.tick(); r.tick();
    expect(trig(r.log, 'R')).toEqual([0.6, 0.6, 0.6]);
    expect(trig(r.log, 'L')).toEqual([0, 0, 0]);       // the side the body does not pull is the pad's own
  });
  it('the L trigger folds the same way: a seated pad at rest plus a body LT of 0.6 gives 0.6 every frame', () => {
    const r = withPad();
    r.bus.emitBody({ t: 'trigger', side: 'L', value: 0.6, src: 'body' });
    r.tick(); r.tick(); r.tick();
    expect(trig(r.log, 'L')).toEqual([0.6, 0.6, 0.6]);
    expect(trig(r.log, 'R')).toEqual([0, 0, 0]);
  });
  it('whose event: a folded frame carrying the body\'s pull is the body\'s (it never wakes a game); one the pad out-pulls is the pad\'s', () => {
    // review 2026-09-24: this frame went out UNTAGGED, so isWakeInput took a crouch under a resting pad for a pull
    const r = withPad();
    r.bus.emitBody({ t: 'trigger', side: 'R', value: 0.7, src: 'body' });
    r.tick();
    const folded = on(r.log).filter((e) => e.t === 'trigger' && e.side === 'R');
    expect(folded).toStrictEqual([{ t: 'trigger', side: 'R', value: 0.7, src: 'body' }]);
    expect(isWakeInput(folded[0])).toBe(false);
    r.log.length = 0;
    pull(pads[0]!, 7, 0.9); r.tick();
    const pad = on(r.log).filter((e) => e.t === 'trigger' && e.side === 'R');
    expect(pad).toStrictEqual([{ t: 'trigger', side: 'R', value: 0.9 }]);
    expect(isWakeInput(pad[0])).toBe(true);             // a real pull past the body is the hand's, and wakes
  });
  it('a pad pulled past the body wins; a body at 0 gives the pad its exact values back, untagged', () => {
    const r = withPad();
    r.bus.emitBody({ t: 'trigger', side: 'R', value: 0.6, src: 'body' });
    pull(pads[0]!, 7, 1); r.tick();
    pull(pads[0]!, 7, 0.3); r.tick();
    expect(trig(r.log, 'R')).toEqual([1, 0.6]);
    r.bus.emitBody({ t: 'trigger', side: 'R', value: 0, src: 'body' });
    r.log.length = 0;
    pull(pads[0]!, 7, 0.37); r.tick();
    expect(on(r.log).filter((e) => e.t === 'trigger' && e.side === 'R')).toStrictEqual([{ t: 'trigger', side: 'R', value: 0.37 }]);
  });
  it('the frame after the last pad leaves still emits, folded; then a body release goes out on its own', () => {
    const r = withPad();
    r.bus.emitBody({ t: 'trigger', side: 'R', value: 0.6, src: 'body' });
    pads[0] = null; r.tick();
    expect(trig(r.log, 'R')).toEqual([0.6]);             // not the departed pad's 0
    r.log.length = 0;
    r.tick();
    expect(r.log).toEqual([]);                            // and then the pad path is silent
    r.bus.emitBody({ t: 'trigger', side: 'R', value: 0, src: 'body' });
    expect(on(r.log)).toStrictEqual([{ t: 'trigger', side: 'R', value: 0, src: 'body' }]);
  });
  it('no pad: a body pull goes out on change, tagged, and a Space charge under it reads the deeper of the two', () => {
    const r = rig();
    r.bus.start();
    r.bus.emitBody({ t: 'trigger', side: 'R', value: 0.5, src: 'body' });
    r.bus.emitBody({ t: 'trigger', side: 'R', value: 0.5, src: 'body' });
    expect(on(r.log)).toStrictEqual([{ t: 'trigger', side: 'R', value: 0.5, src: 'body' }]);
    r.log.length = 0;
    r.key(' '); r.tick();
    // the value delivered is the body's pull, so the event is the body's (arbiter.ts, WHOSE EVENT IT IS)
    expect(on(r.log)).toStrictEqual([{ t: 'trigger', side: 'R', value: 0.5, src: 'body' }, { t: 'trigger', side: 'R', value: 0.5, src: 'body' }]);
    r.log.length = 0;
    r.bus.emitBody({ t: 'trigger', side: 'R', value: 0, src: 'body' });   // the charge is still held: it shows again
    expect(trig(r.log, 'R')).toEqual([16 / 1100]);
  });
  it('pad seated: a crouch\'s peak and the POP in one camera step reach the mode in the floor\'s order — the peak, then the A', () => {
    // review 2026-09-24: measured [A, RT 0] — the A overtook the peak, and the drop after it wiped the peak before the
    // pad frame that would have carried it (SkateRun reads the RT held at the A)
    const r = withPad();
    r.bus.emitBody({ t: 'trigger', side: 'R', value: 0.8, src: 'body' });
    r.bus.emitBody({ t: 'button', btn: 'A', pressed: true, src: 'body' });
    r.bus.emitBody({ t: 'trigger', side: 'R', value: 0, src: 'body' });
    expect(on(r.log)).toStrictEqual([
      { t: 'trigger', side: 'R', value: 0.8, src: 'body' },
      { t: 'button', btn: 'A', pressed: true, src: 'body' },
    ]);
    r.log.length = 0;
    r.tick();
    expect(on(r.log).filter((e) => e.t === 'trigger' && e.side === 'R')).toStrictEqual([{ t: 'trigger', side: 'R', value: 0 }]);
  });
});

describe('Z6: haptics are for real presses only', () => {
  it('a body press never buzzes; a touch press and a key press still do', () => {
    const r = rig();
    r.bus.start();
    r.bus.emitBody({ t: 'button', btn: 'A', pressed: true, src: 'body' });
    r.bus.emitBody({ t: 'button', btn: 'A', pressed: false, src: 'body' });
    expect(buzzes(r.log)).toBe(0);
    expect(on(r.log)).toStrictEqual([
      { t: 'button', btn: 'A', pressed: true, src: 'body' },
      { t: 'button', btn: 'A', pressed: false, src: 'body' },
    ]);
    r.bus.emit({ t: 'button', btn: 'B', pressed: true });
    r.key('j');
    expect(buzzes(r.log)).toBe(2);
  });
});

describe('the body next to a hand, through the bus', () => {
  it('a pad pushing y and a body leaning x compose; a thumb past AXIS_OWN takes the axis back', () => {
    const r = withPad();
    pads[0]!.axes = [0, -1, 0, 0]; r.tick();
    r.log.length = 0;
    r.bus.emitBody({ t: 'stick', side: 'L', x: 0.6, y: 0, src: 'body' });
    expect(on(r.log)).toStrictEqual([{ t: 'stick', side: 'L', x: 0.6, y: -1, src: 'body' }]);
    r.log.length = 0;
    pads[0]!.axes = [-1, -1, 0, 0]; r.tick();
    const l = on(r.log).filter((e) => e.t === 'stick' && e.side === 'L') as Extract<FelInput, { t: 'stick' }>[];
    expect(l).toHaveLength(1);
    expect(l[0].x).toBeLessThan(-0.2);                   // the thumb's x, not the lean's
    expect(l[0].src).toBeUndefined();                    // and it keeps its own (untagged) source
  });
  it('a body pulse is skipped while a pad holds that button, and a key pressed mid-pulse keeps its release', () => {
    const r = withPad();
    press(pads[0]!, 0); r.tick();
    r.log.length = 0;
    r.bus.emitBody({ t: 'button', btn: 'A', pressed: true, src: 'body' });
    r.bus.emitBody({ t: 'button', btn: 'A', pressed: false, src: 'body' });
    expect(on(r.log).filter((e) => e.t === 'button')).toEqual([]);
    press(pads[0]!, 0, false); r.tick();
    r.log.length = 0;
    r.bus.emitBody({ t: 'button', btn: 'A', pressed: true, src: 'body' });
    r.key('j');                                          // J is A: a hold that began during the pulse
    r.bus.emitBody({ t: 'button', btn: 'A', pressed: false, src: 'body' });
    expect(on(r.log).filter((e) => e.t === 'button')).toStrictEqual([
      { t: 'button', btn: 'A', pressed: true, src: 'body' },
      { t: 'button', btn: 'A', pressed: true },
    ]);
    r.key('j', false);
    expect(on(r.log).filter((e) => e.t === 'button').pop()).toStrictEqual({ t: 'button', btn: 'A', pressed: false });
  });
  it('a body d-pad pulse is skipped while a pad\'s d-pad or a keyboard arrow holds that direction (Sprint / Big Air steps)', () => {
    const r = withPad();
    press(pads[0]!, 14); r.tick();                       // the pad holds ◀ (Big Air's spin direction)
    r.log.length = 0;
    r.bus.emitBody({ t: 'dpad', dir: 'left', pressed: true, src: 'body' });   // the left foot's step
    r.bus.emitBody({ t: 'dpad', dir: 'left', pressed: false, src: 'body' });
    expect(on(r.log).filter((e) => e.t === 'dpad')).toEqual([]);             // no release of ◀ mid-hold
    press(pads[0]!, 14, false); r.tick();
    r.log.length = 0;
    r.key('ArrowRight');                                  // the keyboard holds ▶
    r.bus.emitBody({ t: 'dpad', dir: 'right', pressed: true, src: 'body' });
    r.bus.emitBody({ t: 'dpad', dir: 'right', pressed: false, src: 'body' });
    expect(on(r.log)).toStrictEqual([                     // only the key's own events
      { t: 'stick', side: 'L', x: 1, y: 0 },
      { t: 'dpad', dir: 'right', pressed: true, src: 'key' },
    ]);
  });
  it('whose event: a thumb back at rest under a lean delivers the lean as the body\'s event — it never wakes a game', () => {
    // review 2026-09-24: the pad's rest event went out as an UNTAGGED (0.6, 0), and isWakeInput took it for a push
    const r = withPad();
    pads[0]!.axes = [0.9, 0, 0, 0]; r.tick();
    r.bus.emitBody({ t: 'stick', side: 'L', x: 0.6, y: 0, src: 'body' });
    r.log.length = 0;
    pads[0]!.axes = [0, 0, 0, 0]; r.tick();
    const l = on(r.log).filter((e) => e.t === 'stick' && e.side === 'L');
    expect(l).toStrictEqual([{ t: 'stick', side: 'L', x: 0.6, y: 0, src: 'body' }]);
    expect(isWakeInput(l[0])).toBe(false);
  });
});

describe('body events never pass through external(): a body that lets go is let go of', () => {
  it('no pad: a lean and a crouch that go back to 0 reach the mode as 0', () => {
    // review 2026-09-24: routed through external(), the lean was recorded as a hand's value and owned its axis (past
    // AXIS_OWN): the board would steer forever. Nothing but emit()'s body shortcut stops that.
    const r = rig();
    r.bus.start();
    r.bus.emitBody({ t: 'stick', side: 'L', x: 0.6, y: 0, src: 'body' });
    r.bus.emitBody({ t: 'stick', side: 'L', x: 0, y: 0, src: 'body' });
    r.bus.emitBody({ t: 'trigger', side: 'R', value: 0.6, src: 'body' });
    r.bus.emitBody({ t: 'trigger', side: 'R', value: 0, src: 'body' });
    expect(on(r.log)).toStrictEqual([
      { t: 'stick', side: 'L', x: 0.6, y: 0, src: 'body' },
      { t: 'stick', side: 'L', x: 0, y: 0, src: 'body' },
      { t: 'trigger', side: 'R', value: 0.6, src: 'body' },
      { t: 'trigger', side: 'R', value: 0, src: 'body' },
    ]);
    const push: FelInput = { t: 'stick', side: 'L', x: 0.1, y: 0 };
    r.bus.emit(push);
    expect(on(r.log).pop()).toBe(push);                  // and a hand's next push is its own again, untouched
  });
  it('pad seated: after a lean goes back to 0, the pad\'s next stick passes through untouched', () => {
    const r = withPad();
    r.bus.emitBody({ t: 'stick', side: 'L', x: 0.6, y: 0, src: 'body' });
    r.bus.emitBody({ t: 'stick', side: 'L', x: 0, y: 0, src: 'body' });
    r.log.length = 0;
    pads[0]!.axes = [0, -0.4, 0, 0]; r.tick();
    const l = on(r.log).filter((e) => e.t === 'stick' && e.side === 'L') as Extract<FelInput, { t: 'stick' }>[];
    expect(l).toHaveLength(1);
    expect(l[0].x).toBe(0);
    expect(l[0].src).toBeUndefined();
  });
});

describe('Z7: a blur never releases the body; stop() clears it', () => {
  it('a blur lets go of the keys and leaves the body as it was: its lean shows through the released stick', () => {
    const r = rig();
    r.bus.start();
    const p = packet(2000);
    r.bus.publishBody(p);
    r.bus.emitBody({ t: 'stick', side: 'L', x: 0.5, y: 0, src: 'body' });
    r.key('w');
    expect(on(r.log).pop()).toStrictEqual({ t: 'stick', side: 'L', x: 0.5, y: -1 });
    handlers.blur!({});
    // the released keys own no axis now: what goes out is the lean, and the lean is the body's
    expect(on(r.log).pop()).toStrictEqual({ t: 'stick', side: 'L', x: 0.5, y: 0, src: 'body' });
    expect(r.bus.body()).toBe(p);
    expect(r.bus.lastBodyAt()).toBe(2000);
  });
  it('stop() clears the read, the stats and the arbiter — and its own releases go out exactly as before', () => {
    const r = rig();
    r.bus.start();
    r.bus.publishBody(packet(2000, [takeoff(1900)]));
    r.bus.emitBody({ t: 'stick', side: 'L', x: 0.5, y: 0, src: 'body' });
    r.key('w');
    r.bus.stop();
    expect(on(r.log).pop()).toStrictEqual({ t: 'stick', side: 'L', x: 0, y: 0 });   // not the lean: that game is over
    expect(r.bus.body()).toBeNull();
    expect(r.bus.lastBodyAt()).toBe(-Infinity);
    expect(r.bus.bodyStats()).toEqual({});
    r.bus.start();
    const push: FelInput = { t: 'stick', side: 'L', x: 0.1, y: 0 };
    r.log.length = 0;
    r.bus.emit(push);
    expect(on(r.log)[0]).toBe(push);                     // a neutral arbiter again: the very event, untouched
  });
});

describe('the body channel', () => {
  it('body() is null until a source publishes after start(); then the latest packet, fanned out to onBody', () => {
    const bus = new InputBus();
    bus.start();
    expect(bus.body()).toBeNull();
    expect(bus.lastBodyAt()).toBe(-Infinity);
    const got: BodyPacket[] = [];
    const off = bus.onBody((p) => got.push(p));
    const a = packet(2000), b = packet(2033);
    bus.publishBody(a); bus.publishBody(b);
    expect(got).toEqual([a, b]);
    expect(bus.body()).toBe(b);
    expect(bus.lastBodyAt()).toBe(2033);
    off();
    bus.publishBody(packet(2066));
    expect(got).toHaveLength(2);
    bus.start();                                         // a restart is a new game: no source yet
    expect(bus.body()).toBeNull();
  });
  it('a final packet clears body() and is still handed to the listeners (they release on it)', () => {
    const bus = new InputBus();
    bus.start();
    const got: BodyPacket[] = [];
    bus.onBody((p) => got.push(p));
    bus.publishBody(packet(2000));
    const fin = packet(2033, [], true);
    bus.publishBody(fin);
    expect(bus.body()).toBeNull();
    expect(got.pop()).toBe(fin);
    expect(bus.lastBodyAt()).toBe(2033);
  });
  it('publishBodyToLive reaches only the buses that are running', () => {
    const live = new InputBus(), never = new InputBus(), gone = new InputBus();
    live.start(); gone.start(); gone.stop();
    const heard: string[] = [];
    live.onBody(() => heard.push('live')); never.onBody(() => heard.push('never')); gone.onBody(() => heard.push('gone'));
    const p = packet(2000);
    publishBodyToLive(p);
    expect(heard).toEqual(['live']);
    expect(live.body()).toBe(p);
    expect(never.body()).toBeNull();
    expect(gone.body()).toBeNull();
  });
  it('bodyStats: how late the page had each event kind (arrivedAt − ev.t), median and 90th percentile', () => {
    const bus = new InputBus();
    bus.start();
    for (const [t, at] of [[1000, 1100], [2000, 2150], [3000, 3120], [4000, 4300]]) bus.publishBody(packet(at, [takeoff(t)]));
    bus.publishBody(packet(5080, [stepEv(5000)]));
    expect(bus.bodyStats()).toEqual({ takeoff: { n: 4, medMs: 120, p90Ms: 300 }, step: { n: 1, medMs: 80, p90Ms: 80 } });
  });
  it('resync re-emits the composed sticks and triggers, past every on-change filter', () => {
    const r = rig();
    r.bus.start();
    r.bus.emitBody({ t: 'stick', side: 'L', x: 0.4, y: 0, src: 'body' });
    r.bus.emit({ t: 'trigger', side: 'L', value: 0.2 });
    r.log.length = 0;
    r.bus.resync(); r.bus.resync();
    const once = [
      { t: 'stick', side: 'L', x: 0.4, y: 0, src: 'body' },
      { t: 'stick', side: 'R', x: 0, y: 0 },
      { t: 'trigger', side: 'L', value: 0.2 },
      { t: 'trigger', side: 'R', value: 0 },
    ];
    expect(on(r.log)).toStrictEqual([...once, ...once]);
    expect(buzzes(r.log)).toBe(0);
  });
});
