// CREATOR-PLAN phase 4d: every input mapped to the Studio's actions — keys, touch gestures, the pad.
import { describe, expect, it } from 'vitest';
import { cycle, dragKind, isFieldTarget, isTap, keyAction, padActions, padAxes, twoFinger, type PadRead } from './input';

const pad = (o: Partial<PadRead> = {}): PadRead => ({
  lx: 0, ly: 0, rx: 0, ry: 0, triggers: { L: 0, R: 0 },
  buttons: { A: false, B: false, X: false, Y: false, L1: false, R1: false, SELECT: false, START: false, LS: false, RS: false },
  dpad: { up: false, down: false, left: false, right: false }, ...o,
});

describe('keys', () => {
  it('Ctrl/Cmd+Z undoes, Shift+Z and Ctrl+Y redo — everywhere but a text box', () => {
    expect(keyAction({ key: 'z', ctrlKey: true }, false)).toBe('undo');
    expect(keyAction({ key: 'Z', metaKey: true, shiftKey: true }, false)).toBe('redo');
    expect(keyAction({ key: 'y', ctrlKey: true }, false)).toBe('redo');
    expect(keyAction({ key: 'z', ctrlKey: true }, true, false)).toBe('undo');   // a focused slider: still the history's
    expect(keyAction({ key: 'z', ctrlKey: true }, true, true)).toBeNull();      // a text box keeps its own undo
  });
  it('the Studio keys, never while a field has the focus', () => {
    expect(keyAction({ key: '1' }, false)).toEqual({ shot: 'full' });
    expect(keyAction({ key: '3' }, false)).toEqual({ shot: 'face' });
    expect(keyAction({ key: 'p' }, false)).toBe('photo');
    expect(keyAction({ key: 'b' }, false)).toBe('beforeAfter');
    expect(keyAction({ key: 'Escape' }, false)).toBe('back');
    expect(keyAction({ key: 'p' }, true)).toBeNull();
    expect(keyAction({ key: 'p', altKey: true }, false)).toBeNull();
    expect(keyAction({ key: 'q' }, false)).toBeNull();
  });
  it('what counts as a field', () => {
    expect(isFieldTarget({ tagName: 'INPUT', type: 'text' })).toEqual({ field: true, text: true });
    expect(isFieldTarget({ tagName: 'INPUT', type: 'range' })).toEqual({ field: true, text: false });
    expect(isFieldTarget({ tagName: 'TEXTAREA' })).toEqual({ field: true, text: true });
    expect(isFieldTarget({ tagName: 'DIV', isContentEditable: true }).text).toBe(true);
    expect(isFieldTarget({ tagName: 'CANVAS' })).toEqual({ field: false, text: false });
    expect(isFieldTarget(null)).toEqual({ field: false, text: false });
  });
});

describe('touch and mouse', () => {
  it('two fingers: pinch apart zooms in, the midpoint orbits', () => {
    const r = twoFinger([{ x: 100, y: 100 }, { x: 200, y: 100 }], [{ x: 90, y: 110 }, { x: 230, y: 110 }]);
    expect(r.pinch).toBeCloseTo(1.4, 6);
    expect(r.dx).toBeCloseTo(10, 6); expect(r.dy).toBeCloseTo(10, 6);
    expect(twoFinger([{ x: 0, y: 0 }, { x: 1, y: 0 }], [{ x: 0, y: 0 }, { x: 50, y: 0 }]).pinch).toBe(1);   // fingers on top of each other: no pinch
  });
  it('a press becomes: orbit (two fingers, right/middle button, shift), a part drag, a sticker drag, or a spin', () => {
    const p = { pointers: 1, button: 0, shift: false, onPart: false, onSticker: false };
    expect(dragKind(p)).toBe('spin');
    expect(dragKind({ ...p, pointers: 2, onPart: true })).toBe('orbit');
    expect(dragKind({ ...p, button: 2 })).toBe('orbit');
    expect(dragKind({ ...p, shift: true })).toBe('orbit');
    expect(dragKind({ ...p, onPart: true, onSticker: true })).toBe('dragPart');
    expect(dragKind({ ...p, onSticker: true })).toBe('dragSticker');
  });
  it('a tap is short, still and one finger', () => {
    expect(isTap(3, 120, 1)).toBe(true);
    expect(isTap(20, 120, 1)).toBe(false);
    expect(isTap(3, 900, 1)).toBe(false);
    expect(isTap(3, 120, 2)).toBe(false);
  });
});

describe('the pad', () => {
  it('sticks and triggers: spin, orbit, tilt, zoom — nothing inside the deadzone', () => {
    expect(padAxes(pad({ lx: 0.1, rx: 0.1, ry: -0.1 }))).toEqual({ spin: 0, orbit: 0, tilt: 0, zoom: 0 });
    const a = padAxes(pad({ lx: 1, rx: -1, ry: 0, triggers: { L: 0, R: 1 } }));
    expect(a.spin).toBeCloseTo(2.4, 6); expect(a.orbit).toBeCloseTo(-1.6, 6); expect(a.zoom).toBeCloseTo(1.2, 6);
    expect(padAxes(pad({ triggers: { L: 1, R: 0 } })).zoom).toBeCloseTo(-1.2, 6);
  });
  it('buttons act on the press edge only', () => {
    const down = pad({ buttons: { ...pad().buttons, A: true, X: true }, dpad: { ...pad().dpad, up: true } });
    expect(padActions(down, null)).toEqual(['select', 'undo', 'shotIn']);
    expect(padActions(down, down)).toEqual([]);
    const all = pad({ buttons: { A: true, B: true, X: true, Y: true, L1: true, R1: true, SELECT: true, START: true, LS: true, RS: true }, dpad: { up: true, down: true, left: true, right: true } });
    expect(padActions(all, pad())).toEqual(['select', 'back', 'undo', 'redo', 'prevTab', 'nextTab', 'photo', 'beforeAfter', 'turntable', 'mirror', 'shotIn', 'shotOut', 'prevItem', 'nextItem']);
  });
  it('tabs cycle and wrap', () => {
    const tabs = ['face', 'shape', 'parts'] as const;
    expect(cycle(tabs, 'parts', 1)).toBe('face');
    expect(cycle(tabs, 'face', -1)).toBe('parts');
    expect(cycle(tabs, 'shape' as never, 1)).toBe('parts');
  });
});
