// MUSIC-SUITE P4 (2026-09-25): the Academy's desktop keys (ui/keys.ts) — the map, and the collisions it must never have:
// the Flip pad keys (Flip.ts:22 PAD_KEYS, FLIP tab), PERFORM's Space / J (P2, performSet isPerformTapKey), and text fields.
import { describe, expect, it } from 'vitest';
import { KEY_HELP, cancelsKeyUp, keyTargetOf, studioKeyAction, type KeyContext, type KeyLike } from './keys';
import { PAD_KEYS } from '../Flip';
import { isPerformTapKey } from '../performSet';

const studio: KeyContext = { view: 'studio', mode: 'build', target: 'other' };
const act = (key: string, o: Partial<KeyLike> = {}, ctx: Partial<KeyContext> = {}) => studioKeyAction({ key, ...o }, { ...studio, ...ctx });

describe('the STUDIO key map (BUILD)', () => {
  const grid = { target: 'grid' as const };
  it('Space plays / stops; on the GRID Enter toggles the cursor step and the arrows move the cursor (⇧ a beat)', () => {
    expect(act(' ')).toEqual({ kind: 'playStop' });
    expect(act(' ', {}, grid)).toEqual({ kind: 'playStop' });
    expect(act('Enter', {}, grid)).toEqual({ kind: 'toggle' });
    expect(act('ArrowRight', {}, grid)).toEqual({ kind: 'cursor', dRow: 0, dStep: 1 });
    expect(act('ArrowLeft', {}, grid)).toEqual({ kind: 'cursor', dRow: 0, dStep: -1 });
    expect(act('ArrowUp', {}, grid)).toEqual({ kind: 'cursor', dRow: -1, dStep: 0 });
    expect(act('ArrowDown', {}, grid)).toEqual({ kind: 'cursor', dRow: 1, dStep: 0 });
    expect(act('ArrowRight', { shiftKey: true }, grid)).toEqual({ kind: 'cursor', dRow: 0, dStep: 4 });
    expect(act('ArrowLeft', { shiftKey: true }, grid)).toEqual({ kind: 'cursor', dRow: 0, dStep: -4 });
  });

  it('P4 FIX PASS: off the grid the arrows and Enter are the page\'s — a keyboard scroll never drops a cursor or lights a step', () => {
    for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter']) {
      expect(act(k)).toBeNull();                                         // the page (body focused): the browser scrolls
      expect(act(k, {}, { target: 'range' })).toBeNull();               // a slider: its own arrows; Enter lights nothing
    }
    expect(act('ArrowUp', { altKey: true })).toBeNull();
  });

  it('⌥ ↑ / ↓ move the cursor step’s note by a scale degree (the grid focused)', () => {
    expect(act('ArrowUp', { altKey: true }, grid)).toEqual({ kind: 'note', degrees: 1 });
    expect(act('ArrowDown', { altKey: true }, grid)).toEqual({ kind: 'note', degrees: -1 });
    expect(act('ArrowLeft', { altKey: true }, grid)).toBeNull();
  });

  it('B is the booth (P4 FIX PASS: ⇧R was the pad letter R); r / ⇧R / ⇧B are nothing', () => {
    expect(act('b')).toEqual({ kind: 'record' });
    expect(act('B')).toEqual({ kind: 'record' });                        // Caps Lock
    expect(act('B', { shiftKey: true })).toBeNull();
    expect(act('R', { shiftKey: true })).toBeNull();
    expect(act('r')).toBeNull();
  });

  it('undo / redo are the modifier chords only: ⌘Z, Ctrl+Z, ⇧⌘Z, Ctrl+Shift+Z, Ctrl+Y — a bare Z (a pad letter) is nothing', () => {
    expect(act('z')).toBeNull();
    expect(act('Z', { shiftKey: true })).toBeNull();
    expect(act('z', { metaKey: true })).toEqual({ kind: 'undo' });
    expect(act('z', { ctrlKey: true })).toEqual({ kind: 'undo' });
    expect(act('z', { metaKey: true, shiftKey: true })).toEqual({ kind: 'redo' });
    expect(act('Z', { ctrlKey: true, shiftKey: true })).toEqual({ kind: 'redo' });
    expect(act('y', { ctrlKey: true })).toEqual({ kind: 'redo' });
    expect(act('y', { metaKey: true })).toBeNull();   // ⌘Y is the browser's (history on some)
  });

  it('every other ⌘ / Ctrl chord is left to the browser (copy, paste, reload, find)', () => {
    for (const k of ['c', 'v', 'r', 'f', 'a', 'b', ' ', 'Enter', 'ArrowLeft']) {
      expect(act(k, { metaKey: true })).toBeNull();
      expect(act(k, { ctrlKey: true })).toBeNull();
    }
  });

  it('a held key repeats only the cursor; a held Space is swallowed (P4 FIX PASS: its repeats scrolled the page)', () => {
    expect(act('ArrowRight', { repeat: true }, grid)).toEqual({ kind: 'cursor', dRow: 0, dStep: 1 });
    expect(act(' ', { repeat: true })).toEqual({ kind: 'hold' });
    expect(act(' ', { repeat: true }, grid)).toEqual({ kind: 'hold' });
    expect(cancelsKeyUp({ key: ' ', repeat: true }, { kind: 'hold' })).toBe(true);
    for (const k of ['Enter', 'b']) expect(act(k, { repeat: true }, grid)).toBeNull();
  });

  it('? opens the key map and Esc closes things, on every tab', () => {
    for (const view of ['studio', 'flip', 'library', 'listen'] as const) {
      expect(act('?', {}, { view })).toEqual({ kind: 'help' });
      expect(act('Escape', {}, { view })).toEqual({ kind: 'escape' });
    }
  });
});

describe('collisions the map must never have', () => {
  it('THE FLIP PADS: on the FLIP tab no pad key (Flip.ts PAD_KEYS) is taken, with or without ⇧', () => {
    expect(PAD_KEYS).toHaveLength(16);
    for (const k of PAD_KEYS) {
      for (const shiftKey of [false, true]) {
        expect(act(k, { shiftKey }, { view: 'flip' })).toBeNull();
        expect(act(k.toUpperCase(), { shiftKey }, { view: 'flip' })).toBeNull();
      }
    }
    // …and nothing else is taken there either but '?' / Esc (neither is a pad key)
    for (const k of [' ', 'Enter', 'ArrowLeft', 'j', 'b']) expect(act(k, {}, { view: 'flip' })).toBeNull();
    expect(PAD_KEYS).not.toContain('?');
  });

  it('P4 FIX PASS — NO PAD LETTER MEANS ANYTHING ON THE STUDIO TAB EITHER (the plan: "no clash with the Flip keys")', () => {
    for (const k of PAD_KEYS) {
      for (const shiftKey of [false, true]) {
        for (const target of ['other', 'grid', 'button'] as const) {
          expect(act(k, { shiftKey }, { target })).toBeNull();
          expect(act(k.toUpperCase(), { shiftKey }, { target })).toBeNull();
        }
      }
    }
    expect(PAD_KEYS).not.toContain('b');
  });

  it('PERFORM: Space and J are never this map’s (P2’s TAP), nor the grid keys; ⌘Z and ? still are', () => {
    const perform = { mode: 'perform' as const };
    for (const k of [' ', 'j', 'J', 'Enter', 'ArrowRight', 'z', 'b']) expect(act(k, {}, perform)).toBeNull();
    for (const k of [' ', 'Enter', 'ArrowRight']) expect(act(k, {}, { ...perform, target: 'grid' })).toBeNull();
    expect(isPerformTapKey({ key: ' ' }) && isPerformTapKey({ key: 'j' })).toBe(true);
    expect(act('z', { metaKey: true }, perform)).toEqual({ kind: 'undo' });
    expect(act('?', {}, perform)).toEqual({ kind: 'help' });
  });

  it('TYPING: nothing at all in a text field, a textarea, a select or a contenteditable', () => {
    for (const target of ['text', 'select'] as const) {
      for (const k of [' ', 'Enter', 'z', 'b', 'ArrowLeft', '?', 'Escape']) expect(act(k, {}, { target })).toBeNull();
      expect(act('z', { metaKey: true }, { target })).toBeNull();
    }
  });

  it('a slider keeps its arrows; P4 FIX PASS: a focused BUTTON keeps its Enter AND its Space (its keyup is not cancelled)', () => {
    expect(act('ArrowRight', {}, { target: 'range' })).toBeNull();
    expect(act(' ', {}, { target: 'range' })).toEqual({ kind: 'playStop' });
    expect(act('Enter', {}, { target: 'button' })).toBeNull();
    expect(act(' ', {}, { target: 'button' })).toBeNull();                  // CLEAR's yes, REMOVE, BUY, START: pressed by Space
    expect(act(' ', { repeat: true }, { target: 'button' })).toBeNull();
    expect(cancelsKeyUp({ key: ' ' }, act(' ', {}, { target: 'button' }))).toBe(false);
    expect(cancelsKeyUp({ key: ' ' }, { kind: 'playStop' })).toBe(true);
    expect(cancelsKeyUp({ key: 'Enter' }, { kind: 'toggle' })).toBe(false);
    expect(cancelsKeyUp({ key: ' ' }, null)).toBe(false);
  });
});

describe('the timing check', () => {
  const checking = { checking: true };
  it('Space, J and Enter are its TAP (a held key taps once)', () => {
    expect(act(' ', {}, checking)).toEqual({ kind: 'tap' });
    expect(act('j', {}, checking)).toEqual({ kind: 'tap' });
    expect(act('J', {}, checking)).toEqual({ kind: 'tap' });
    expect(act('Enter', {}, checking)).toEqual({ kind: 'tap' });
    expect(act(' ', { repeat: true }, checking)).toEqual({ kind: 'hold' });     // swallowed: one tap, and no scroll
    expect(act('j', { repeat: true }, checking)).toBeNull();
    expect(act(' ', {}, { ...checking, target: 'button' })).toEqual({ kind: 'tap' });   // the focused TAP button: one tap
    expect(act('Enter', {}, { ...checking, target: 'button' })).toBeNull();   // the focused CANCEL keeps its Enter
    expect(act('Escape', {}, checking)).toEqual({ kind: 'escape' });
  });
});

describe('keyTargetOf', () => {
  const el = (tagName: string, o: Record<string, unknown> = {}) => ({ tagName, ...o });
  it('reads a focused element', () => {
    expect(keyTargetOf(null)).toBe('other');
    expect(keyTargetOf(el('BODY'))).toBe('other');
    expect(keyTargetOf(el('DIV'))).toBe('other');
    expect(keyTargetOf(el('INPUT'))).toBe('text');
    expect(keyTargetOf(el('INPUT', { type: 'text' }))).toBe('text');
    expect(keyTargetOf(el('INPUT', { type: 'search' }))).toBe('text');
    expect(keyTargetOf(el('INPUT', { type: 'number' }))).toBe('text');
    expect(keyTargetOf(el('INPUT', { type: 'range' }))).toBe('range');
    expect(keyTargetOf(el('INPUT', { type: 'checkbox' }))).toBe('button');
    expect(keyTargetOf(el('TEXTAREA'))).toBe('text');
    expect(keyTargetOf(el('SELECT'))).toBe('select');
    expect(keyTargetOf(el('BUTTON'))).toBe('button');
    expect(keyTargetOf(el('A'))).toBe('button');
    expect(keyTargetOf(el('DIV', { isContentEditable: true }))).toBe('text');
    expect(keyTargetOf(el('DIV', { getAttribute: (n: string) => (n === 'role' ? 'button' : null) }))).toBe('button');
    expect(keyTargetOf(el('DIV', { getAttribute: (n: string) => (n === 'role' ? 'grid' : null) }))).toBe('grid');   // the step grid
  });
});

describe('KEY_HELP (what the ? panel shows)', () => {
  it('names every key the map takes, and the pads as FLIP-only', () => {
    const all = KEY_HELP.map((h) => h.keys).join(' | ');
    for (const k of ['Space', '← → ↑ ↓', 'Enter', '⌥ ↑ ↓', 'B', '⌘Z · ⇧⌘Z', '?']) expect(all).toContain(k);
    expect(all).not.toMatch(/⇧ R|Z · ⇧ Z/);
    expect(KEY_HELP.find((h) => h.where === 'FLIP')?.does).toMatch(/FLIP tab only/);
  });
});
