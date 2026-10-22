// CO-2 (HOOPS-CONTROLS-OPT 2026-10-20, K1): Space must not pass in hoops.
//
// InputBus turns a Space release into an A tagged `src: 'space'` (the dunk's run key) and never sends the A's release.
// The hoops slot read any A as the pass, so a keyboard player who held Space to run passed on letting go, and the
// unreleased press latched `passDownAt`, so `passFake` read true 180 ms later until the next real A release. These
// tests drive the real bus (keydown / keyup) into LocalInputSource on a clock the test owns.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InputBus, type FelInput } from './InputBus';
import { LocalInputSource, PASS_FAKE_HOLD_MS } from './PlayerSlot';

const g = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};
let keyHandler: ((ev: { key: string; type: string; preventDefault: () => void }) => void) | null = null;
let clock = 1000;

beforeEach(() => {
  for (const k of ['window', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame']) saved[k] = g[k];
  keyHandler = null;
  clock = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  g.window = {
    addEventListener: (type: string, fn: unknown) => { if (type === 'keydown') keyHandler = fn as typeof keyHandler; },
    removeEventListener: () => {},
  };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Mozilla/5.0 (Macintosh)', maxTouchPoints: 0, getGamepads: () => [null, null, null, null] } });
  g.requestAnimationFrame = () => 0;
  g.cancelAnimationFrame = () => {};
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of ['window', 'requestAnimationFrame', 'cancelAnimationFrame']) g[k] = saved[k];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: saved.navigator });
});

function rig() {
  const bus = new InputBus();
  const src = new LocalInputSource();
  const seen: FelInput[] = [];
  bus.on((e) => { seen.push(e); src.feed(e); });
  bus.start();
  const key = (k: string, down = true) => keyHandler!({ key: k, type: down ? 'keydown' : 'keyup', preventDefault: () => {} });
  const tick = () => (bus as unknown as { pollPads: () => void }).pollPads();
  const passDownAt = () => (src as unknown as { passDownAt: number }).passDownAt;
  return { src, seen, key, tick, passDownAt };
}

describe('CO-2: Space is not a pass in the hoops slot', () => {
  it('Space down → 600 ms → up: no pass, no pass fake, no latched passDownAt', () => {
    const { src, seen, key, tick, passDownAt } = rig();
    key(' ');
    expect(src.poll().pass).toBe(false);
    for (let t = 0; t < 600; t += 16) { clock += 16; tick(); expect(src.poll().pass).toBe(false); }
    key(' ', false);
    // the bus still sends the Space's A (the dunk modes read it): the slot is where it stops
    expect(seen.some((e) => e.t === 'button' && e.btn === 'A' && e.src === 'space')).toBe(true);
    const i = src.poll();
    expect(i.pass).toBe(false);
    expect(i.passFake).toBe(false);
    expect(passDownAt()).toBe(-1);
    // and nothing latches afterwards: well past the fake's hold, still no fake
    clock += PASS_FAKE_HOLD_MS * 3;
    expect(src.poll().passFake).toBe(false);
    expect(passDownAt()).toBe(-1);
  });

  it('J still passes on a tap, and its hold is still a pass fake at exactly 180 ms', () => {
    expect(PASS_FAKE_HOLD_MS).toBe(180);
    const { src, key } = rig();
    key('j');
    let i = src.poll();
    expect(i.pass).toBe(true);
    expect(i.passFake).toBe(false);
    clock += PASS_FAKE_HOLD_MS - 1;
    expect(src.poll().passFake).toBe(false);
    clock += 1;
    i = src.poll();
    expect(i.pass).toBe(false);          // the edge was spent on the first poll
    expect(i.passFake).toBe(true);
    key('j', false);
    expect(src.poll().passFake).toBe(false);
  });

  it('a Space release between J down and J up does not reset or re-fire the real pass', () => {
    const { src, key, passDownAt } = rig();
    key('j');
    expect(src.poll().pass).toBe(true);
    const down = passDownAt();
    key(' '); clock += 50; key(' ', false);
    expect(src.poll().pass).toBe(false);
    expect(passDownAt()).toBe(down);
    clock += PASS_FAKE_HOLD_MS;
    expect(src.poll().passFake).toBe(true);
  });

  it('a pad A (untagged) still passes; only the space-tagged A is dropped', () => {
    const src = new LocalInputSource();
    src.feed({ t: 'button', btn: 'A', pressed: true, src: 'space' });
    expect(src.poll().pass).toBe(false);
    src.feed({ t: 'button', btn: 'A', pressed: true });
    expect(src.poll().pass).toBe(true);
  });
});
