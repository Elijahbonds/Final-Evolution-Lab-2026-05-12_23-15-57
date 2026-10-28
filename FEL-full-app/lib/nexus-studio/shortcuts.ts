// THE STUDIO'S KEYS, in one table (STUDIO-EASY, 2026-10-28). Before this the shortcuts lived only in the venue editor's key
// handler and in button tooltips: nothing listed them, and Undo / Redo / Save worked on the Venues track only (on Characters,
// Scripts and the AI builder Ctrl+Z did nothing and Ctrl+S opened the browser's own "Save page" box). Unity, Figma and Roblox
// Studio all answer "?" (or a Help menu) with the full list. This table is what the Studio's "?" sheet shows; shortcuts.test.ts
// holds it to the venue editor's handler and the shell's, so a key added there without a row here fails the test.

export type ShortcutScope = 'everywhere' | 'venue';

export interface Shortcut {
  /** As shown: "Ctrl Z". On a Mac, Ctrl reads as ⌘ (shortcutLabel). */
  keys: string;
  /** What it does, in plain words (≤ 6). */
  does: string;
  scope: ShortcutScope;
  /** The handler's own key name (KeyboardEvent.key, lower case) and its modifier — what the test reads from the source. */
  key: string;
  mod?: boolean;
  shift?: boolean;
}

export const SHORTCUTS: readonly Shortcut[] = [
  { keys: 'Ctrl Z', does: 'Undo', scope: 'everywhere', key: 'z', mod: true },
  { keys: 'Ctrl Shift Z', does: 'Redo', scope: 'everywhere', key: 'z', mod: true, shift: true },
  { keys: 'Ctrl Y', does: 'Redo', scope: 'everywhere', key: 'y', mod: true },
  { keys: 'Ctrl S', does: 'Save now', scope: 'everywhere', key: 's', mod: true },
  { keys: '?', does: 'Show these keys', scope: 'everywhere', key: '?' },
  { keys: 'Q', does: 'Select tool', scope: 'venue', key: 'q' },
  { keys: 'W', does: 'Move tool', scope: 'venue', key: 'w' },
  { keys: 'E', does: 'Rotate tool', scope: 'venue', key: 'e' },
  { keys: 'R', does: 'Scale tool', scope: 'venue', key: 'r' },
  { keys: '1', does: 'Orbit the camera', scope: 'venue', key: '1' },
  { keys: '2', does: 'Pan the camera', scope: 'venue', key: '2' },
  { keys: '3', does: 'Fly the camera (WASD)', scope: 'venue', key: '3' },
  { keys: 'F', does: 'Look at the selection', scope: 'venue', key: 'f' },
  { keys: 'G', does: 'Grid on or off', scope: 'venue', key: 'g' },
  { keys: 'N', does: 'Snap on or off', scope: 'venue', key: 'n' },
  { keys: 'Arrows', does: 'Nudge one step', scope: 'venue', key: 'arrowleft' },
  { keys: 'Delete', does: 'Delete', scope: 'venue', key: 'delete' },
  { keys: 'Ctrl D', does: 'Duplicate', scope: 'venue', key: 'd', mod: true },
  { keys: 'Ctrl C', does: 'Copy', scope: 'venue', key: 'c', mod: true },
  { keys: 'Ctrl V', does: 'Paste', scope: 'venue', key: 'v', mod: true },
  { keys: 'Ctrl A', does: 'Select all', scope: 'venue', key: 'a', mod: true },
  { keys: 'H', does: 'Hide or show', scope: 'venue', key: 'h' },
  { keys: 'L', does: 'Lock or unlock', scope: 'venue', key: 'l' },
  { keys: 'Esc', does: 'Deselect, stop a preview', scope: 'venue', key: 'escape' },
];

export const SCOPE_LABEL: Record<ShortcutScope, string> = { everywhere: 'Everywhere', venue: 'Building the court' };

/** "Ctrl Shift Z" on a Mac reads "⌘ ⇧ Z". */
export function shortcutLabel(keys: string, mac: boolean): string {
  return mac ? keys.replace(/\bCtrl\b/g, '⌘').replace(/\bShift\b/g, '⇧') : keys;
}

/** Pure: which studio-wide command a key event asks for (the shell's handler; the venue editor keeps its own copy of these). */
export function shellCommand(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean }): 'undo' | 'redo' | 'save' | 'keys' | null {
  const mod = !!(e.ctrlKey || e.metaKey);
  const k = e.key.toLowerCase();
  if (mod && k === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (mod && k === 'y') return 'redo';
  if (mod && k === 's') return 'save';
  if (!mod && !e.altKey && e.key === '?') return 'keys';
  return null;
}
