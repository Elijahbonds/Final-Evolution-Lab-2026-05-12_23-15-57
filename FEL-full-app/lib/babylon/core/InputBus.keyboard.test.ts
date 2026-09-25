// The keyboard's two shoulder keys (suite pass, 2026-09-16). SHIFT and F are the keyboard's R2 / L2 for the hoops
// slot, but they must reach every other mode as the plain R1 / L1 they always were — and NEVER as a trigger, because
// fifteen mode files read the raw R trigger for their own verb (the dunk's run-up, the shootout's wind-up, a board's
// crouch, a throw's power). Space is the one key that pulls the R trigger, and only at its wake-up depth.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InputBus, type FelInput } from './InputBus';
import { KEY_SPACE_DOWN } from './StartWake';

const g = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};
let keyHandler: ((ev: { key: string; type: string; preventDefault: () => void }) => void) | null = null;
/** The Gamepad API's list (empty unless a test plugs a pad in). */
type FakePad = { id: string; index: number; mapping: string; connected: boolean; axes: number[]; buttons: { pressed: boolean; value: number }[] };
const pads: (FakePad | null)[] = [null, null, null, null];

beforeEach(() => {
  for (const k of ['window', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame']) saved[k] = g[k];
  keyHandler = null;
  pads.fill(null);
  g.window = {
    addEventListener: (type: string, fn: unknown) => { if (type === 'keydown') keyHandler = fn as typeof keyHandler; },
    removeEventListener: () => {},
  };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Mozilla/5.0 (Macintosh)', maxTouchPoints: 0, getGamepads: () => pads } });
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
  const tick = () => (bus as unknown as { pollPads: () => void }).pollPads();
  return { bus, seen, key, tick };
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
  it('Space alone pulls the R trigger (the wake-up depth), then releases as A — tagged as the Space\'s (HOTFIX 2026-09-24)', () => {
    const { seen, key } = rig();
    key(' '); key(' ', false);
    expect(seen[0]).toEqual({ t: 'trigger', side: 'R', value: KEY_SPACE_DOWN });
    expect(seen[1]).toEqual({ t: 'trigger', side: 'R', value: 0 });
    // the run key's release, not J: the dunk modes drop it as the take-off's own (core/slamPress)
    expect(seen[2]).toEqual({ t: 'button', btn: 'A', pressed: true, src: 'space' });
  });
  it('J is a plain, untagged A', () => {
    const { seen, key } = rig();
    key('j');
    expect(seen).toEqual([{ t: 'button', btn: 'A', pressed: true }]);
  });
});

// HOTFIX (2026-09-24): the merged pad re-sends its R trigger every frame, so an idle pad plugged in wrote R 0 between every
// Space depth — a held Space read as RUN pressed and let go every frame, and the dunk launched ~3 frames after Space went down.
describe('a held Space with a pad plugged in', () => {
  const pad = (): FakePad => {
    const p: FakePad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', index: 0, mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    pads[0] = p;
    return p;
  };
  const rs = (seen: FelInput[]) => seen.filter((e): e is Extract<FelInput, { t: 'trigger' }> => e.t === 'trigger' && e.side === 'R').map((e) => e.value);

  it('an idle pad never cuts it: one R a frame, none of them 0, until Space comes up', () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const r = rig();
    pad();
    r.tick(); r.tick();
    expect(rs(r.seen)).toEqual([0, 0]);                  // Space up: the pad's own R, every frame, as before
    r.seen.length = 0;
    r.key(' ');
    for (let i = 0; i < 20; i++) { now += 16; r.tick(); }
    const held = rs(r.seen);
    expect(held).toHaveLength(21);                       // the keydown's marker, then exactly one per frame
    expect(held[0]).toBe(KEY_SPACE_DOWN);
    expect(held.every((v) => v > 0)).toBe(true);
    r.seen.length = 0;
    r.key(' ', false);
    expect(r.seen).toEqual([{ t: 'trigger', side: 'R', value: 0 }, { t: 'button', btn: 'A', pressed: true, src: 'space' }]);
    r.tick();
    expect(rs(r.seen)).toEqual([0, 0]);                  // …and the pad has R to itself again
    vi.restoreAllMocks();
  });

  it('a pad pulled deeper than the Space still reads as the pad (the deeper of the two)', () => {
    const r = rig();
    const p = pad();
    r.key(' ');
    p.buttons[7] = { pressed: true, value: 1 };          // R2 on a standard pad
    r.seen.length = 0;
    r.tick();
    expect(rs(r.seen)).toEqual([1]);
  });
});
