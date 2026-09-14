// CONTROLLER-UNIVERSAL-MULTI (2026-09-14): four local pads on one InputBus, headless.
//
// The bus reads `navigator.getGamepads()` once per animation frame. Here the browser is three stubs — a window
// that takes listeners, a navigator whose pad list the test writes, and a requestAnimationFrame that runs nothing —
// and `tick()` is one frame. What is proven: two different controllers each take a player slot through their OWN
// profile, the merged hero stream does not let a resting pad cancel a pushed one, the slot stream keeps the players
// apart, a pad that leaves releases what it held, and the connect-chip roster names each pad.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { InputBus, type FelInput, type PadInfo } from './InputBus';
import { mergePads, IDLE_PAD } from '@/lib/input/padMerge';

type FakePad = { id: string; index: number; mapping: string; connected: boolean; axes: number[]; buttons: { pressed: boolean; value: number }[] };
const pads: (FakePad | null)[] = [null, null, null, null];

function fake(id: string, index: number, mapping = 'standard'): FakePad {
  return { id, index, mapping, connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
}
function press(p: FakePad, i: number, down = true): void { p.buttons[i] = { pressed: down, value: down ? 1 : 0 }; }

const g = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};

beforeEach(() => {
  for (const k of ['window', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame']) saved[k] = g[k];
  pads.fill(null);
  g.window = { addEventListener: () => {}, removeEventListener: () => {} };
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
  const merged: FelInput[] = [];
  const slotted: { slot: number; e: FelInput }[] = [];
  let roster: PadInfo[] = [];
  bus.on((e) => merged.push(e));
  bus.onSlot((e, slot) => slotted.push({ slot, e }));
  bus.onPads((r) => { roster = r; });
  bus.start();
  const tick = () => (bus as unknown as { pollPads: () => void }).pollPads();
  return { bus, merged, slotted, roster: () => roster, tick };
}

describe('padMerge — every pad drives the one hero without a tug of war', () => {
  it('one pad is returned as itself', () => {
    const a = { ...IDLE_PAD, lx: 0.4 };
    expect(mergePads([a])).toBe(a);
  });
  it('a resting pad never cancels a push, the deepest trigger wins, any held button is held', () => {
    const pushed = { ...IDLE_PAD, lx: 0.9, ly: -0.1, triggers: { L: 0, R: 0.3 }, buttons: { ...IDLE_PAD.buttons, A: true } };
    const resting = { ...IDLE_PAD, triggers: { L: 0.7, R: 0 }, dpad: { ...IDLE_PAD.dpad, up: true } };
    const m = mergePads([resting, pushed]);
    expect([m.lx, m.ly]).toEqual([0.9, -0.1]);
    expect(m.triggers).toEqual({ L: 0.7, R: 0.3 });
    expect(m.buttons.A).toBe(true);
    expect(m.dpad.up).toBe(true);
  });
});

describe('InputBus — up to four local pads', () => {
  it('seats a DualSense as P1 and a Switch Pro as P2, each through its own profile', () => {
    const r = rig();
    pads[0] = fake('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', 0);
    pads[1] = fake('Pro Controller (Vendor: 057e Product: 2009)', 1, '');
    r.tick();
    expect(r.roster().map((p) => `P${p.slot + 1} ${p.name}`)).toEqual(['P1 DualSense', 'P2 Switch Pro Controller']);
    expect(r.bus.gamepadActive).toBe(true);
    // the Switch Pro's BOTTOM face button is physical index 1 — it must arrive as A on P2's own stream
    press(pads[1]!, 1);
    r.tick();
    expect(r.slotted).toContainEqual({ slot: 1, e: { t: 'button', btn: 'A', pressed: true } });
    expect(r.slotted.some((x) => x.slot === 0 && x.e.t === 'button')).toBe(false);
    expect(r.merged).toContainEqual({ t: 'button', btn: 'A', pressed: true });
  });

  it('both pads move the hero on the merged stream, and a centred P1 never cancels P2', () => {
    const r = rig();
    pads[0] = fake('Xbox Wireless Controller', 0);
    pads[1] = fake('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', 1);
    r.tick();
    r.merged.length = 0;
    pads[1]!.axes = [0.9, 0, 0, 0];               // P2 pushes right, P1 rests
    r.tick(); r.tick();
    const sticks = r.merged.filter((e): e is Extract<FelInput, { t: 'stick' }> => e.t === 'stick' && e.side === 'L');
    expect(sticks.length).toBe(1);                 // on change only — the resting pad re-emits nothing
    expect(sticks[0].x).toBeGreaterThan(0.8);
    pads[1]!.axes = [0, 0, 0, 0];
    pads[0]!.axes = [0, -0.9, 0, 0];               // now P1 pushes up
    r.tick();
    const last = r.merged.filter((e) => e.t === 'stick' && e.side === 'L').pop() as Extract<FelInput, { t: 'stick' }>;
    expect(last.y).toBeLessThan(-0.8);
  });

  it('a held button is not released while the other pad still holds it', () => {
    const r = rig();
    pads[0] = fake('Xbox Wireless Controller', 0);
    pads[1] = fake('Xbox Wireless Controller', 1);
    press(pads[0]!, 0); press(pads[1]!, 0);
    r.tick();
    press(pads[0]!, 0, false);
    r.tick();
    expect(r.merged.filter((e) => e.t === 'button' && e.btn === 'A' && !e.pressed)).toHaveLength(0);
    expect(r.slotted).toContainEqual({ slot: 0, e: { t: 'button', btn: 'A', pressed: false } });
    press(pads[1]!, 0, false);
    r.tick();
    expect(r.merged.filter((e) => e.t === 'button' && e.btn === 'A' && !e.pressed)).toHaveLength(1);
  });

  it('slots are not compacted: P2 stays P2 when P1 leaves, and a new pad takes the free P1 seat', () => {
    const r = rig();
    pads[0] = fake('DualSense', 0);
    pads[1] = fake('Pro Controller', 1, '');
    r.tick();
    pads[0] = null;
    r.tick();
    expect(r.roster().map((p) => p.slot)).toEqual([1]);
    pads[2] = fake('Xbox Wireless Controller', 2);
    r.tick();
    expect(r.roster().map((p) => `P${p.slot + 1} ${p.name}`)).toEqual(['P1 Xbox Wireless Controller', 'P2 Switch Pro Controller']);
  });

  it('a pad that leaves mid-press releases its button, stick and trigger on both streams', () => {
    const r = rig();
    pads[0] = fake('Xbox Wireless Controller', 0);
    r.tick();
    press(pads[0]!, 0); pads[0]!.axes = [0.9, 0, 0, 0]; pads[0]!.buttons[7] = { pressed: true, value: 0.8 };
    r.tick();
    r.merged.length = 0; r.slotted.length = 0;
    pads[0] = null;
    r.tick();
    expect(r.merged).toContainEqual({ t: 'button', btn: 'A', pressed: false });
    expect(r.merged).toContainEqual({ t: 'stick', side: 'L', x: 0, y: 0 });
    expect(r.merged).toContainEqual({ t: 'trigger', side: 'R', value: 0 });
    expect(r.slotted).toContainEqual({ slot: 0, e: { t: 'button', btn: 'A', pressed: false } });
    expect(r.slotted).toContainEqual({ slot: 0, e: { t: 'trigger', side: 'R', value: 0 } });
    expect(r.bus.gamepadActive).toBe(false);
    r.merged.length = 0;
    r.tick();
    expect(r.merged).toHaveLength(0);              // and then the pad path is silent — the keyboard owns the stick again
  });

  it('seats four and ignores a fifth', () => {
    const r = rig();
    const five = [0, 1, 2, 3, 4].map((i) => fake('Xbox Wireless Controller', i));
    (globalThis.navigator as unknown as { getGamepads: () => unknown }).getGamepads = () => five;
    r.tick();
    expect(r.roster().map((p) => p.index)).toEqual([0, 1, 2, 3]);
  });

  it('surfaces the Switch 2 Pro iOS limitation on its chip', () => {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', maxTouchPoints: 5, getGamepads: () => pads } });
    const r = rig();
    pads[0] = fake('Nintendo Switch 2 Pro Controller', 0, '');
    r.tick();
    expect(r.roster()[0].unsupported).toMatch(/does not connect reliably/);
  });

  it('padState reads each seated pad live, with nobody on the slot stream (CONTROLLER-STICK-LIVE)', () => {
    const bus = new InputBus();
    bus.start();                                   // no on / onSlot / onPads — exactly what a QA eye polling it sees
    const tick = () => (bus as unknown as { pollPads: () => void }).pollPads();
    expect(bus.padState()).toEqual([]);
    pads[0] = fake('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', 0);
    pads[1] = fake('Pro Controller (Vendor: 057e Product: 2009)', 1, '');
    tick();
    expect(bus.padState().map((p) => [p.slot, p.name, p.lx, p.ly])).toEqual([[0, 'DualSense', 0, 0], [1, 'Switch Pro Controller', 0, 0]]);
    pads[1]!.axes = [0, -1, 0.6, 0]; press(pads[1]!, 1); press(pads[1]!, 12);
    tick();
    const p2 = bus.padState()[1];
    expect(p2.ly).toBeLessThan(-0.9);
    expect(p2.rx).toBeGreaterThan(0.4);
    expect(p2.held).toEqual(['A', 'dpad_up']);   // the Switch Pro's bottom button, through its own profile
    expect(bus.padState()[0].ly).toBe(0);
    pads[1] = null;
    tick();
    expect(bus.padState().map((p) => p.slot)).toEqual([0]);
  });
});

describe('the couch wiring stays mounted (source scan)', () => {
  const read = (f: string) => readFileSync(path.resolve(__dirname, '../../..', f), 'utf8');
  it('/try dunk mounts the phone link (lazy, above the boot splash) and the pad chips', () => {
    const dunk = read('components/games/dunk-babylon.tsx');
    expect(dunk).toMatch(/<HostLobby[^>]*onPadInput=\{onPhonePad\}[^>]*lazy/);
    expect(dunk).toMatch(/<PadChips bus=\{bus\}/);
    expect(read('components/controller-link/host-lobby.tsx')).toMatch(/z-\[45\]/);   // the splash is z-40: READY is when a phone pairs
  });
  it('production publishes the input seam on __FEL_DEV__ (the full dev handle stays development-only)', () => {
    const h = read('lib/babylon/core/ModeHarness.ts');
    expect(h).toMatch(/const probeHandle = process\.env\.NODE_ENV === 'development' \? devHandle : \{ modeId: def\.modeId, input \};/);
    expect(h).toMatch(/\n  devWindow\.__FEL_DEV__ = probeHandle;/);
    expect(h).toMatch(/if \(devWindow\.__FEL_DEV__ === probeHandle\) delete devWindow\.__FEL_DEV__;/);
  });
  it('TV MODE is on the host lobby and the dunk reads it at takeoff through one window helper', () => {
    expect(read('components/controller-link/host-lobby.tsx')).toMatch(/data-testid="tv-mode-toggle"/);
    const mode = read('lib/babylon/modes/DunkMode.ts');
    expect(mode.match(/CFG\.qteWindowSec/g)).toHaveLength(1);   // only inside slamWindowBase()
    expect(mode).toMatch(/function slamWindowBase\(\): number \{ return CFG\.qteWindowSec \* tvFactor; \}/);
    expect(mode).toMatch(/setPhase\('cinematic'\); setWin\('takeoff'\);\n\s*\{ const f = readDisplaySetting\(\)\.factor;/);
  });
});
