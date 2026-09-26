// lib/babylon/music/ui/keys.ts — THE ACADEMY'S DESKTOP KEYS, as one pure table. No DOM, no React: the room turns a
// keydown into one of these actions and does it (StudioMode), and this file is what the tests read.
//
// MUSIC-SUITE P4 (2026-09-25), "Pocket studio + melody". What was there: P3 gave the STUDIO tab ⌘Z / Ctrl+Z undo and
// ⇧⌘Z / Ctrl+Y redo (StudioMode.tsx ~:687-699 then) and P2 gave PERFORM Space / J (performSet isPerformTapKey,
// StudioMode.tsx ~:749-764 then). Nothing else on a keyboard did anything: no play/stop, no way to move around the grid,
// no way to light a step without the mouse, no key map (P1, outbox musicsuite/understand-wf_3a55346f-032.json).
//
// The map (KEY_HELP is what the '?' panel shows — the same table the tests check):
//   Space            play / stop (STUDIO, BUILD; a focused button keeps its own Space — P4 FIX PASS) — P2's PERFORM keeps
//                    Space for its TAP, so in PERFORM this map never takes it; during the timing check Space / J / Enter
//                    are the TAP
//   ← → ↑ ↓          move the step cursor (⇧ ← → jumps a beat, 4 steps) while the GRID has the focus; the cursor's page
//                    follows on a phone grid
//   Enter            light / clear the step under the cursor (the grid focused)
//   ⌥ ↑ ↓            the cursor step's note one scale degree up / down (pitched rows), lighting it (the grid focused)
//   B                the recording booth: ARM the mic, then RECORD, then STOP the take (P4 FIX PASS: was ⇧R, a pad letter)
//   ⌘Z / Ctrl+Z      undo; ⇧⌘Z / Ctrl+Shift+Z / Ctrl+Y redo (P4 FIX PASS: the bare Z / ⇧Z went — Z is a pad letter)
//   ?                this key map;  Esc  closes it / calls off the timing check
//
// COLLISIONS, BY CONSTRUCTION (tested):
//   * The Flip's pad keys (Flip.ts:22 PAD_KEYS — 1-4, Q-R, A-F, Z-V) are the FLIP tab's: FlipPad listens only while it is
//     mounted, and FlipPad is mounted only on the FLIP tab (studioWiring pins it). This map answers NOTHING on the FLIP
//     tab except '?' / Esc (neither is a pad key).
//   * PERFORM (P2): in the PERFORM stage this map takes only ⌘Z / Ctrl+Z / Ctrl+Y and '?' / Esc — never Space or J, and not
//     the grid keys either (a scored set is played, not edited, from the keyboard).
//   * Text: nothing at all while the focus is in a text field, a textarea, a select or anything contenteditable (a title,
//     a section's new name, the streaming link). A range slider keeps its arrows (they move it); a focused button keeps
//     its Enter (it presses it) — Space is still play/stop there, and the room cancels the button's own Space (P2's rule).
//
// MUSIC-SUITE P4 FIX PASS (2026-09-25) — the review drove this map in headless Chromium and found it took too much:
//   * THE ARROWS AND ENTER ARE THE GRID'S. Every arrow was 'cursor' for any non-text, non-range target: a keyboard scroll
//     anywhere on the STUDIO tab (the booth, PUBLISH) focused the grid, dropped a cursor and scrollIntoView'd the page back
//     up (scrollY 782 → 263), and Enter on a focused BPM slider lit a kick step. Now the arrows, ⌥↑↓ and Enter act only
//     while the GRID has the focus (target 'grid': Tab into it, or press a cell); anywhere else the browser scrolls.
//   * A FOCUSED BUTTON KEEPS ITS SPACE. Space on any focused button toggled the transport and the room cancelled the
//     button's own activation — a keyboard player could not press CLEAR's yes, a take's REMOVE, BUY or START (on the boot
//     splash it started the beat BEHIND the splash). In BUILD a button's Space is the button's again (Enter too); on the
//     page itself (or the grid, or a slider) Space is play / stop.
//   * A HELD SPACE DOES NOT SCROLL. Its repeats were null, so the room never cancelled them: one page scrolled per repeat
//     (scrollY 0 → 782 in 6 repeats). A repeat of a Space the room took is 'hold' now: nothing happens and the page stays.
//   * NO FLIP PAD LETTER AT ALL. The plan asks for desktop keys "with no clash with the Flip keys"; bare Z / ⇧Z (undo /
//     redo) and ⇧R (the booth) were pad letters, told apart only by the tab. Undo / redo are the modifier chords only
//     (⌘Z / Ctrl+Z, ⇧⌘Z / Ctrl+Shift+Z / Ctrl+Y — P3's), and the booth is B (not a pad key), so no key means one thing on
//     STUDIO and another on FLIP.

/** What a keydown means to the room. */
export type StudioKeyAction =
  | { kind: 'playStop' }
  | { kind: 'tap' }
  | { kind: 'cursor'; dRow: number; dStep: number }
  | { kind: 'toggle' }
  | { kind: 'note'; degrees: 1 | -1 }
  | { kind: 'record' }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'help' }
  | { kind: 'escape' }
  /** MUSIC-SUITE P4 FIX PASS: a repeat of a key the room took (a held Space): nothing — and no page scroll. */
  | { kind: 'hold' };

/** The fields of a KeyboardEvent the map reads (so a test can hand it a plain object). */
export interface KeyLike {
  key: string;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
}

/**
 * Where the focus is, as the map cares: typing, a slider, a select, a button, THE GRID (MUSIC-SUITE P4 FIX PASS: its own
 * target — the arrows and Enter are only its), or anywhere else (the page).
 */
export type KeyTarget = 'text' | 'select' | 'range' | 'button' | 'grid' | 'other';

export interface KeyContext {
  view: 'studio' | 'flip' | 'library' | 'creator' | 'listen';
  /** BUILD (the tool) or PERFORM (the scored set, P2's keys). */
  mode: 'build' | 'perform';
  target: KeyTarget;
  /** The 8-tap timing check is listening for taps. */
  checking?: boolean;
}

/** An <input> type that is typed into (anything but these few is text: a new type is never taken over by mistake). */
const NOT_TEXT_INPUTS = new Set(['range', 'button', 'checkbox', 'radio', 'submit', 'reset', 'color', 'file', 'image']);

/**
 * The target kind of a focused element, from what a DOM element exposes (tagName, type, contentEditable, role). Pure: the
 * room passes `e.target`; the tests pass plain objects.
 */
export function keyTargetOf(el: { tagName?: string; type?: string; isContentEditable?: boolean; getAttribute?: (n: string) => string | null } | null | undefined): KeyTarget {
  if (!el || !el.tagName) return 'other';
  const tag = el.tagName.toUpperCase();
  if (el.isContentEditable || tag === 'TEXTAREA') return 'text';
  if (tag === 'SELECT') return 'select';
  if (tag === 'INPUT') {
    const type = (el.type ?? 'text').toLowerCase();
    if (type === 'range') return 'range';
    if (!NOT_TEXT_INPUTS.has(type)) return 'text';
    return 'button';
  }
  if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') return 'button';
  const role = el.getAttribute?.('role');
  if (role === 'button' || role === 'link' || role === 'checkbox' || role === 'switch' || role === 'tab') return 'button';
  if (role === 'grid') return 'grid';   // the step grid's focusable root (ui/StepGrid)
  return 'other';
}

const isArrow = (k: string): boolean => k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown';
const isSpace = (k: string): boolean => k === ' ' || k === 'Spacebar';

/** A beat, in steps: ⇧ + ← / → jumps this far. */
export const BEAT_STEPS = 4;

/**
 * THE MAP. The action a keydown asks for in this context, or null (the key is someone else's: the browser's, a field's,
 * a button's, the Flip pads', PERFORM's). A held key's repeats move the cursor and nothing else (a held Space is 'hold':
 * swallowed, so the page does not scroll under it).
 */
export function studioKeyAction(e: KeyLike, ctx: KeyContext): StudioKeyAction | null {
  if (ctx.target === 'text' || ctx.target === 'select') return null;
  const mod = !!(e.metaKey || e.ctrlKey);
  const k = e.key;

  // '?' and Esc: every tab (neither is a Flip pad key), both stages
  if (k === '?' && !mod && !e.altKey) return e.repeat ? null : { kind: 'help' };
  if (k === 'Escape') return { kind: 'escape' };

  if (ctx.view !== 'studio') return null;   // the FLIP tab's keys are its pads (Flip.ts PAD_KEYS); the other tabs have none

  // undo / redo with a modifier: P3's keys, STUDIO tab, both stages
  if (mod && !e.altKey) {
    const lower = k.toLowerCase();
    if (lower === 'z') return e.shiftKey ? { kind: 'redo' } : { kind: 'undo' };
    if (lower === 'y' && e.ctrlKey && !e.metaKey) return { kind: 'redo' };
    return null;   // every other ⌘ / Ctrl chord is the browser's (copy, reload, find …)
  }

  // THE TIMING CHECK listens for taps (both stages: it runs from the transport, which BUILD shows)
  if (ctx.checking && !e.altKey) {
    if (isSpace(k) || k.toLowerCase() === 'j' || (k === 'Enter' && ctx.target !== 'button')) return e.repeat ? (isSpace(k) ? { kind: 'hold' } : null) : { kind: 'tap' };
  }

  if (ctx.mode === 'perform') return null;   // Space / J are PERFORM's TAP (P2), and a set is not edited from the keys

  const onGrid = ctx.target === 'grid';
  if (isArrow(k)) {
    if (!onGrid) return null;   // a slider moves with its arrows; the page scrolls with them (P4 FIX PASS)
    if (e.altKey) {
      if (k === 'ArrowUp') return { kind: 'note', degrees: 1 };
      if (k === 'ArrowDown') return { kind: 'note', degrees: -1 };
      return null;
    }
    const jump = e.shiftKey ? BEAT_STEPS : 1;
    if (k === 'ArrowLeft') return { kind: 'cursor', dRow: 0, dStep: -jump };
    if (k === 'ArrowRight') return { kind: 'cursor', dRow: 0, dStep: jump };
    if (k === 'ArrowUp') return { kind: 'cursor', dRow: -1, dStep: 0 };
    return { kind: 'cursor', dRow: 1, dStep: 0 };
  }
  if (isSpace(k) && !e.altKey) {
    if (ctx.target === 'button') return null;             // the button's own Space presses it (P4 FIX PASS)
    return e.repeat ? { kind: 'hold' } : { kind: 'playStop' };
  }
  if (e.repeat || e.altKey) return null;
  if (k === 'Enter') return onGrid ? { kind: 'toggle' } : null;
  if ((k === 'b' || k === 'B') && !e.shiftKey) return { kind: 'record' };
  return null;
}

/**
 * The room also cancels the browser's own handling of a key it took — a page scroll on Space / the arrows, a focused
 * button's Space activation (it clicks on keyUP, so the room cancels the keyup too: P2's PERFORM rule).
 */
export function cancelsKeyUp(e: KeyLike, action: StudioKeyAction | null): boolean {
  return !!action && isSpace(e.key);
}

/** The key map the '?' panel shows. `keys` are what the player presses; `does` what happens. */
export const KEY_HELP: readonly { keys: string; does: string; where: 'STUDIO' | 'FLIP' | 'PERFORM' | 'ANY' }[] = [
  { keys: 'Space', does: 'play / stop (a focused button takes its own Space)', where: 'STUDIO' },
  { keys: '← → ↑ ↓', does: 'move the step cursor (⇧ ← → a beat) — click the grid or Tab into it first', where: 'STUDIO' },
  { keys: 'Enter', does: 'light / clear the step under the cursor', where: 'STUDIO' },
  { keys: '⌥ ↑ ↓', does: 'the cursor step’s note up / down the scale (bass, lead, Flip rows)', where: 'STUDIO' },
  { keys: 'B', does: 'recording booth: arm the mic → record → stop the take', where: 'STUDIO' },
  { keys: '⌘Z · ⇧⌘Z', does: 'undo · redo (Ctrl+Z · Ctrl+Y on Windows)', where: 'STUDIO' },
  { keys: 'Space · J', does: 'TAP (the timing check, and a PERFORM set)', where: 'PERFORM' },
  { keys: '1-4 · Q-R · A-F · Z-V', does: 'the 16 pads — on the FLIP tab only', where: 'FLIP' },
  { keys: '?', does: 'this key map · Esc closes it', where: 'ANY' },
];
