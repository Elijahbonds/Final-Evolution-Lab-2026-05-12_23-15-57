// The input mapper (ADVENTURE PLAN "Default controls"): pad, keyboard (as the shared InputBus sends it) and touch in,
// one MoveInput per step out; every binding rebindable; a press lands on exactly one step.
import { describe, expect, it } from 'vitest';
import type { FelButton, FelInput } from '@/lib/babylon/core/InputBus';
import { KEY_SPACE_DOWN } from '@/lib/babylon/core/StartWake';
import { neutralInput, type MoveInput, type MovementState } from '../contracts';
import {
  BINDINGS_KEY, DEFAULT_BINDINGS, createInputMapper, loadBindings, sanitizeControls, storeBindings, type InputMapper,
} from './inputMap';

const fill = (m: InputMapper, state: MovementState = 'ground', camYaw = 0): MoveInput => m.fill(neutralInput(), { camYaw, state });
const press = (m: InputMapper, btn: FelButton, src?: 'key') =>
  m.onInput({ t: 'button', btn, pressed: true, ...(src ? { src } : {}) } as FelInput);
const release = (m: InputMapper, btn: FelButton, src?: 'key') =>
  m.onInput({ t: 'button', btn, pressed: false, ...(src ? { src } : {}) } as FelInput);

describe('the pad column', () => {
  it('A jump · B dash (held = sprint) · X / Y light / heavy · R1 lock · L1 guard · R2 cast · L2 slow-time', () => {
    const m = createInputMapper();
    press(m, 'A'); press(m, 'B'); press(m, 'X'); press(m, 'Y'); press(m, 'R1'); press(m, 'L1');
    m.onInput({ t: 'trigger', side: 'R', value: 1 });
    m.onInput({ t: 'trigger', side: 'L', value: 0.8 });
    const a = fill(m);
    expect([a.jump, a.jumpHeld, a.dash, a.dashHeld, a.attackLight, a.attackHeavy, a.lock, a.guardHeld, a.magic, a.magicHeld, a.focusHeld])
      .toEqual([true, true, true, true, true, true, true, true, true, true, true]);
    const b = fill(m);   // the next step: edges gone, levels held
    expect([b.jump, b.dash, b.attackLight, b.lock, b.magic]).toEqual([false, false, false, false, false]);
    expect([b.jumpHeld, b.dashHeld, b.guardHeld, b.magicHeld, b.focusHeld]).toEqual([true, true, true, true, true]);
  });

  it('the stick is MoveInput\'s intent space (up = away from the camera), the camera yaw rides beside it', () => {
    const m = createInputMapper();
    m.onInput({ t: 'stick', side: 'L', x: 0.5, y: -1 });
    m.onInput({ t: 'stick', side: 'R', x: 0.9, y: 0 });
    const a = fill(m, 'ground', 1.2);
    expect(a.move).toEqual({ x: 0.5, y: 1 });
    expect(a.look.x).toBe(0.9);
    expect(a.camYaw).toBe(1.2);
  });

  it('flight: A held climbs, L1 held descends (and is not a guard)', () => {
    const m = createInputMapper();
    press(m, 'A'); press(m, 'L1');
    const f = fill(m, 'flight');
    expect([f.ascendHeld, f.descendHeld, f.guardHeld]).toEqual([true, true, false]);
    const g = fill(m, 'ground');
    expect([g.ascendHeld, g.descendHeld, g.guardHeld]).toEqual([false, false, true]);
  });

  it('D-pad up is the partner command, down fuse / mount, left / right step the spell slot', () => {
    const m = createInputMapper();
    m.onInput({ t: 'dpad', dir: 'up', pressed: true });
    m.onInput({ t: 'dpad', dir: 'down', pressed: true });
    const a = fill(m);
    expect([a.partner, a.fuse]).toEqual([true, true]);
    m.onInput({ t: 'dpad', dir: 'right', pressed: true }); m.onInput({ t: 'dpad', dir: 'right', pressed: false });
    expect(fill(m).magicSlot).toBe(1);
    m.onInput({ t: 'dpad', dir: 'left', pressed: true });
    expect(fill(m).magicSlot).toBe(0);
    m.onInput({ t: 'dpad', dir: 'left', pressed: false });
    m.onInput({ t: 'dpad', dir: 'left', pressed: true });
    expect(fill(m).magicSlot).toBe(3);   // wraps
    expect(fill(m).magicSlot).toBeNull(); // a pick lands once
  });

  it('R2 held + a direction picks that slot and does nothing else', () => {
    const m = createInputMapper();
    m.onInput({ t: 'trigger', side: 'R', value: 1 });
    fill(m);
    m.onInput({ t: 'dpad', dir: 'down', pressed: true });
    const a = fill(m);
    expect(a.magicSlot).toBe(2);
    expect(a.fuse).toBe(false);
    m.onInput({ t: 'dpad', dir: 'down', pressed: false });
    expect(m.slot()).toBe(2);
  });
});

describe('the keyboard, as the shared bus sends it', () => {
  it('SPACE jumps on the down marker (not on the release A the bus adds), SHIFT dashes, F casts, R is slow-time', () => {
    const m = createInputMapper();
    m.onInput({ t: 'trigger', side: 'R', value: KEY_SPACE_DOWN });
    m.onInput({ t: 'trigger', side: 'R', value: 0.4 });   // the held depth while SPACE is down: not a cast
    const a = fill(m);
    expect([a.jump, a.jumpHeld, a.magic, a.magicHeld]).toEqual([true, true, false, false]);
    m.onInput({ t: 'trigger', side: 'R', value: 0 });
    m.onInput({ t: 'button', btn: 'A', pressed: true, src: 'space' });
    const b = fill(m);
    expect([b.jump, b.jumpHeld]).toEqual([false, false]);
    press(m, 'R1', 'key'); press(m, 'L1', 'key'); press(m, 'RS');
    const c = fill(m);
    expect([c.dash, c.lock, c.magic, c.guardHeld, c.focusHeld]).toEqual([true, false, true, false, true]);
    release(m, 'R1', 'key');
    press(m, 'R1');   // E: an untagged R1, the lock
    expect(fill(m).lock).toBe(true);
  });

  it('the arrows\' d-pad copies are ignored (the arrows are the stick); a real d-pad press is not', () => {
    const m = createInputMapper();
    m.onInput({ t: 'dpad', dir: 'down', pressed: true, src: 'key' });
    expect(fill(m).fuse).toBe(false);
    m.onInput({ t: 'dpad', dir: 'down', pressed: true });
    expect(fill(m).fuse).toBe(true);
  });
});

describe('rebinding', () => {
  it('any action takes any controls; the old ones stop', () => {
    const m = createInputMapper();
    m.rebind('jump', [{ kind: 'button', btn: 'B' }]);
    m.rebind('dash', [{ kind: 'button', btn: 'A' }]);
    press(m, 'B');
    const a = fill(m);
    expect([a.jump, a.dash]).toEqual([true, false]);
    release(m, 'B'); press(m, 'A');
    const b = fill(m);
    expect([b.jump, b.dash]).toEqual([false, true]);
  });

  it('stored rebinds round-trip; junk is dropped, START is never bindable', () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
    expect(storeBindings({ jump: [{ kind: 'button', btn: 'Y' }] }, store)).toBe(true);
    expect(loadBindings(store)).toEqual({ jump: [{ kind: 'button', btn: 'Y' }] });
    mem.set(BINDINGS_KEY, '{"jump":[{"kind":"button","btn":"START"},{"kind":"laser"}],"dash":"x"}');
    expect(loadBindings(store)).toBeNull();
    mem.set(BINDINGS_KEY, 'not json');
    expect(loadBindings(store)).toBeNull();
    expect(sanitizeControls([{ kind: 'trigger', side: 'Q' }, { kind: 'dpad', dir: 'up' }])).toEqual([{ kind: 'dpad', dir: 'up' }]);
    const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(loadBindings(throwing)).toBeNull();
    expect(storeBindings({}, throwing)).toBe(false);
  });

  it('every action has a default control, and a reset lets go of everything', () => {
    for (const [a, c] of Object.entries(DEFAULT_BINDINGS)) expect(c.length, a).toBeGreaterThan(0);
    const m = createInputMapper();
    press(m, 'B'); m.onInput({ t: 'stick', side: 'L', x: 1, y: 0 });
    m.reset();
    const a = fill(m);
    expect([a.dash, a.dashHeld, a.move.x]).toEqual([false, false, 0]);
  });
});
