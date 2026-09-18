// The keyboard's two shoulder keys (suite pass, 2026-09-16). SHIFT and F are the keyboard's R2 / L2 for the hoops
// slot, but they must reach every other mode as the plain R1 / L1 they always were — and NEVER as a trigger, because
// fifteen mode files read the raw R trigger for their own verb (the dunk's run-up, the shootout's wind-up, a board's
// crouch, a throw's power). Space is the one key that pulls the R trigger, and only at its wake-up depth.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InputBus, type FelInput } from './InputBus';
import { KEY_SPACE_DOWN } from './StartWake';

const g = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};
let keyHandler: ((ev: { key: string; type: string; preventDefault: () => void }) => void) | null = null;

beforeEach(() => {
  for (const k of ['window', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame']) saved[k] = g[k];
  keyHandler = null;
  g.window = {
    addEventListener: (type: string, fn: unknown) => { if (type === 'keydown') keyHandler = fn as typeof keyHandler; },
    removeEventListener: () => {},
  };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Mozilla/5.0 (Macintosh)', maxTouchPoints: 0, getGamepads: () => [] } });
  g.requestAnimationFrame = () => 0;
  g.cancelAnimationFrame = () => {};
});
afterEach(() => {
  for (const k of ['window', 'requestAnimationFrame', 'cancelAnimationFrame']) g[k] = saved[k];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: saved.navigator });
});

function rig() {
  const bus = new InputBus();
  const seen: FelInput[] = [];
  bus.on((e) => seen.push(e));
  bus.start();
  const key = (k: string, down = true) => keyHandler!({ key: k, type: down ? 'keydown' : 'keyup', preventDefault: () => {} });
  return { bus, seen, key };
}

describe('InputBus keyboard shoulders', () => {
  it('SHIFT is R1 tagged src:key — and no trigger', () => {
    const { seen, key } = rig();
    key('Shift'); key('Shift', false);
    expect(seen).toEqual([
      { t: 'button', btn: 'R1', pressed: true, src: 'key' },
      { t: 'button', btn: 'R1', pressed: false, src: 'key' },
    ]);
    expect(seen.some((e) => e.t === 'trigger')).toBe(false);
  });
  it('F is L1 tagged src:key — and no trigger', () => {
    const { seen, key } = rig();
    key('f'); key('f', false);
    expect(seen).toEqual([
      { t: 'button', btn: 'L1', pressed: true, src: 'key' },
      { t: 'button', btn: 'L1', pressed: false, src: 'key' },
    ]);
  });
  it('E and Q are the untagged pad shoulders', () => {
    const { seen, key } = rig();
    key('e'); key('q');
    expect(seen).toEqual([
      { t: 'button', btn: 'R1', pressed: true },
      { t: 'button', btn: 'L1', pressed: true },
    ]);
  });
  it('Space alone pulls the R trigger (the wake-up depth), then releases as A', () => {
    const { seen, key } = rig();
    key(' '); key(' ', false);
    expect(seen[0]).toEqual({ t: 'trigger', side: 'R', value: KEY_SPACE_DOWN });
    expect(seen[1]).toEqual({ t: 'trigger', side: 'R', value: 0 });
    expect(seen[2]).toEqual({ t: 'button', btn: 'A', pressed: true });
  });
});
