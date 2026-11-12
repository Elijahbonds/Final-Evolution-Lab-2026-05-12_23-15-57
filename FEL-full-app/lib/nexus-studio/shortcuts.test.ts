// The Studio's key table (STUDIO-EASY) held to the handlers that answer the keys: the venue editor's (venue-editor.tsx) and the
// shell's (studio-app.tsx through shellCommand). A key added to a handler without a row in SHORTCUTS — so missing from the Help
// sheet — fails here, and so does a row for a key nothing answers.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHORTCUTS, shellCommand, shortcutLabel } from './shortcuts';

const ROOT = join(__dirname, '..', '..');
const venueSrc = readFileSync(join(ROOT, 'components/nexus-studio/venue-editor.tsx'), 'utf8');
const shellSrc = readFileSync(join(ROOT, 'components/nexus-studio/studio-app.tsx'), 'utf8');

/** The keys the venue editor's switch answers (`case 'w':`) and its modifier keys (`mod && k === 'd'`). */
function venueKeys(): { plain: Set<string>; mod: Set<string> } {
  const handler = venueSrc.slice(venueSrc.indexOf('const onKey = (e: KeyboardEvent)'), venueSrc.indexOf("window.addEventListener('keydown', onKey)"));
  const plain = new Set([...handler.matchAll(/case '([^']+)':/g)].map((m) => m[1]));
  const mod = new Set([...handler.matchAll(/mod && k === '([^']+)'/g)].map((m) => m[1]));
  return { plain, mod };
}

describe('every key has a row, and every row a key', () => {
  it('the venue editor', () => {
    const { plain, mod } = venueKeys();
    expect(plain.size).toBeGreaterThan(10);
    const rows = SHORTCUTS.filter((s) => s.scope === 'venue' || s.scope === 'everywhere');
    // each answered key is listed (the arrows and Backspace ride on their listed siblings: "Arrows", "Delete")
    const SIBLING: Record<string, string> = { arrowright: 'arrowleft', arrowup: 'arrowleft', arrowdown: 'arrowleft', backspace: 'delete' };
    for (const k of plain) expect(rows.some((s) => !s.mod && s.key === (SIBLING[k] ?? k)), `case '${k}'`).toBe(true);
    for (const k of mod) expect(rows.some((s) => s.mod && s.key === k), `mod+${k}`).toBe(true);
    // each venue row is answered
    for (const s of SHORTCUTS.filter((x) => x.scope === 'venue')) {
      expect(s.mod ? mod.has(s.key) : plain.has(s.key), s.keys).toBe(true);
    }
  });
  it('the shell answers the everywhere rows on every track', () => {
    expect(shellSrc).toContain('shellCommand(e)');
    for (const s of SHORTCUTS.filter((x) => x.scope === 'everywhere')) {
      const c = shellCommand({ key: s.key === '?' ? '?' : s.key.toUpperCase(), ctrlKey: !!s.mod, shiftKey: !!s.shift || s.key === '?' });
      expect(c, s.keys).not.toBeNull();
    }
  });
});

describe('shellCommand', () => {
  it('reads Ctrl and ⌘ alike, and leaves plain letters to the editor', () => {
    expect(shellCommand({ key: 'z', ctrlKey: true })).toBe('undo');
    expect(shellCommand({ key: 'Z', metaKey: true, shiftKey: true })).toBe('redo');
    expect(shellCommand({ key: 'y', ctrlKey: true })).toBe('redo');
    expect(shellCommand({ key: 's', metaKey: true })).toBe('save');
    expect(shellCommand({ key: '?', shiftKey: true })).toBe('keys');
    expect(shellCommand({ key: 'z' })).toBeNull();
    expect(shellCommand({ key: 'w' })).toBeNull();
    expect(shellCommand({ key: '?', altKey: true })).toBeNull();
  });
  it('labels read as the platform writes them', () => {
    expect(shortcutLabel('Ctrl Shift Z', true)).toBe('⌘ ⇧ Z');
    expect(shortcutLabel('Ctrl Shift Z', false)).toBe('Ctrl Shift Z');
  });
  it('every row says what it does in six words or fewer', () => {
    for (const s of SHORTCUTS) expect(s.does.split(/\s+/).length, s.keys).toBeLessThanOrEqual(6);
  });
});
