// NEX-05: no venue-editor command is keyboard-only. The editor's own key handler is read, and every key it answers has a row in
// TOUCH_PATHS whose button really exists (on the phone bar, the viewport toolbar or the header).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PhoneBar, TOUCH_PATHS } from './phone-bar';

const editor = readFileSync(join(__dirname, 'venue-editor.tsx'), 'utf8');
const app = readFileSync(join(__dirname, 'studio-app.tsx'), 'utf8');
const noop = () => undefined;
const bar = (count: number) => renderToStaticMarkup(createElement(PhoneBar, {
  count, multi: false, onMulti: noop, onSelectAll: noop, onDeselect: noop, onDelete: noop, onDuplicate: noop, onCopy: noop, onHide: noop, onLock: noop, onNudge: noop, onTurn: noop,
}));

/** The keys the editor's keydown handler acts on, as TOUCH_PATHS spells them. */
function editorKeys(): string[] {
  const body = editor.slice(editor.indexOf('const onKey = (e: KeyboardEvent) => {'), editor.indexOf("window.addEventListener('keydown', onKey)"));
  const keys = new Set<string>();
  for (const m of body.matchAll(/if \(mod && k === '(\w)'\)/g)) keys.add(`mod+${m[1]}`);
  if (body.includes('if (e.shiftKey) studio.redo()')) keys.add('mod+shift+z');
  for (const m of body.matchAll(/case '([\w]+)':/g)) keys.add(m[1]);
  return [...keys].sort();
}

describe('every keyboard command has a touch path', () => {
  it('the editor’s keys are exactly the table’s (a new shortcut needs a touch row)', () => {
    const keys = editorKeys();
    expect(keys.length).toBeGreaterThan(20);
    expect(TOUCH_PATHS.map((r) => r.key).filter((k) => !k.startsWith('click')).sort()).toEqual(keys);
  });
  it('each touch path is a real button', () => {
    const html = bar(2);
    for (const r of TOUCH_PATHS) {
      const [where, name] = r.touch.split(': ');
      if (where === 'bar') expect(html, r.key).toContain(`data-testid="${name}"`);
      else if (where === 'toolbar') expect(editor, r.key).toMatch(new RegExp(`<ToolButton title=(?:"${name}|\\{[^\\n]*'${name}[^\\n]*'\\})`));
      else if (where === 'header') expect(app, r.key).toMatch(new RegExp(`["']${name}["']`));
      else expect.fail(`unknown place ${where}`);
    }
  });
  it('the bar is for narrow screens, scrolls sideways inside itself, has 44 px targets, and greys out what needs a selection', () => {
    const none = bar(0);
    expect(none).toContain('md:hidden');
    expect(none).toContain('overflow-x-auto');
    expect(none.match(/h-11 min-w-11/g)!.length).toBe(14);
    expect(none).toMatch(/data-testid="phone-delete"[^>]*disabled=""/);
    expect(none).not.toMatch(/data-testid="phone-select-all"[^>]*disabled=""/);
    expect(bar(1)).not.toMatch(/data-testid="phone-delete"[^>]*disabled=""/);
  });
  it('the editor mounts the bar and wires multi-select into the viewport pick', () => {
    expect(editor).toContain('<PhoneBar count={selection.length}');
    expect(editor).toContain("mods.toggle || (multi && id !== null) ? 'toggle' : 'replace'");
  });
});

describe('the layouts give way on a phone', () => {
  const read = (f: string) => readFileSync(join(__dirname, f), 'utf8');
  it('no fixed multi-column grid applies below md', () => {
    for (const f of ['studio-app.tsx', 'venue-editor.tsx', 'script-editor.tsx']) {
      for (const m of read(f).matchAll(/className=[{"`][^"`]*?(?<![:\w-])grid-cols-\[[^\]]+\]/g)) expect.fail(`${f}: an unprefixed fixed grid: ${m[0].slice(-60)}`);
    }
  });
  it('the AI builder is the phone’s first track', () => {
    expect(read('studio-app.tsx')).toContain("window.matchMedia('(max-width: 767px)').matches) setTrack('ai')");
    expect(read('studio-app.tsx')).toContain("t.id === 'ai' ? 'max-md:order-first' : ''");
  });
});
