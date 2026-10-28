// STUDIO-EASY (2026-10-28): the shell's new ways in and out, the first-court guide, Help, and the empty states — as server renders
// (no DOM in this runner), plus the source pins that keep the fixes in place.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const ai = vi.hoisted(() => ({ state: 'coming_soon' as 'loading' | 'available' | 'coming_soon' }));
vi.mock('@/lib/abacus/useAiStatus', () => ({ useAiStatus: () => [ai.state, () => {}] }));

import { NexusStudioApp } from './studio-app';
import { FirstCourt } from './first-court';
import { HelpSheet } from './help-sheet';
import { AiVenuePanel } from './ai-venue-panel';
import { CharactersTrack } from './characters';
import { ScriptsTrack } from './script-editor';
import { starterProject, type StudioApi } from './use-studio';
import { FIRST_COURT_TITLE, GUIDE_LIGHTS, GUIDE_STEPS } from '@/lib/nexus-studio/firstCourt';
import { SHORTCUTS } from '@/lib/nexus-studio/shortcuts';
import { chromeHiddenFor } from '@/components/shell/tab-bar';
import { gridMove } from './asset-browser';
import { SKIP_TARGETS } from './studio-app';
import { NO_LOOKS } from './characters';

const ROOT = join(__dirname, '..', '..');
const noop = () => {};
const clean = (h: string) => h.replace(/<!-- -->/g, '');
const studio = (): StudioApi => {
  const doc = starterProject();
  return { doc, venue: doc.venues[0], run: noop, seal: noop, undo: noop, redo: noop, save: () => true, setSelected: noop, setSelection: noop } as unknown as StudioApi;
};

describe('the shell', () => {
  const html = clean(renderToStaticMarkup(createElement(NexusStudioApp)));
  it('has a way back to FEL, a heading, New project and Help', () => {
    const back = /<a [^>]*aria-label="Leave the Studio"[^>]*>/.exec(html)?.[0] ?? '';
    expect(back).toContain('href="/play"');
    expect(html).toMatch(/<h1[^>]*>Nexus Studio<\/h1>/);
    expect(html).toContain('aria-label="Projects: new, open"');
    expect(html).toContain('aria-label="Help and keys"');
  });
  it('fills the screen on its own: the app bar and the phone tab bar stand aside on /studio', () => {
    expect(chromeHiddenFor('/studio')).toBe(true);
  });
  it('answers Undo, Redo, Save and "?" on every track, not only on Venues', () => {
    const src = readFileSync(join(ROOT, 'components/nexus-studio/studio-app.tsx'), 'utf8');
    expect(src).toMatch(/if \(trackRef\.current === 'venue'\) return;/);
    expect(src).toMatch(/c === 'undo'\) studio\.undo\(\); else if \(c === 'redo'\) studio\.redo\(\); else studio\.save\(\)/);
  });
  it('New project and Open move the open project to the list (never replace it), and a new one opens the guide', () => {
    const src = readFileSync(join(ROOT, 'components/nexus-studio/studio-app.tsx'), 'utf8');
    expect(src).toContain('const r = swapIn(kv, doc, nextId);');
    expect(src).toMatch(/if \(!r\.ok\) \{ setProjErr\(r\.error\); return; \}/);
    expect(src).toContain('if (!nextId) setGuide(true);');
  });
  it('Play-test in a production build uses the shipped share hand-off on the game’s own page (practice), not the dev route', () => {
    const src = readFileSync(join(ROOT, 'components/nexus-studio/studio-app.tsx'), 'utf8');
    const prod = src.slice(src.indexOf('if (!studioLoadAllowed()) {'), src.indexOf('const exp = exportVenue('));
    expect(prod).toContain('modeRoute(t.key, key)');
    expect(prod).toContain('handOff(store, key,');
    expect(prod).not.toContain('/dev/');
  });
});

describe('keyboard', () => {
  it('skip links come first: the 3D view, settings, things to add', () => {
    const html = clean(renderToStaticMarkup(createElement(NexusStudioApp)));
    const first = html.indexOf('Skip to the 3D view');
    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(html.indexOf('<header'));
    expect(SKIP_TARGETS.map((t) => t.label)).toEqual(['Skip to the 3D view', 'Skip to settings', 'Skip to things to add']);
    const editor = readFileSync(join(ROOT, 'components/nexus-studio/venue-editor.tsx'), 'utf8');
    expect(editor).toContain('id="studio-inspector" tabIndex={-1}');
  });
  it('the asset grid is one Tab stop; arrows, Home and End walk it, clamped at the ends', () => {
    expect(gridMove('ArrowRight', 0, 10)).toBe(1);
    expect(gridMove('ArrowDown', 0, 10)).toBe(2);
    expect(gridMove('ArrowUp', 1, 10)).toBe(0);
    expect(gridMove('ArrowLeft', 0, 10)).toBe(0);
    expect(gridMove('End', 3, 10)).toBe(9);
    expect(gridMove('Home', 7, 10)).toBe(0);
    expect(gridMove('ArrowDown', 9, 10)).toBe(9);
    expect(gridMove('a', 3, 10)).toBeNull();
    expect(gridMove('ArrowRight', 0, 0)).toBeNull();
    const src = readFileSync(join(ROOT, 'components/nexus-studio/asset-browser.tsx'), 'utf8');
    expect(src).toContain("tabIndex={flat[cur]?.id === c.id ? 0 : -1}");
  });
});

describe('make your first court', () => {
  const v = starterProject().venues[0];
  const html = clean(renderToStaticMarkup(createElement(FirstCourt, { venue: v, run: noop, onWatch: () => true, onFinish: noop, onSkip: noop })));
  it('opens on step 1: the title, a three-part progress, three lights and a way out', () => {
    expect(html).toContain(FIRST_COURT_TITLE);
    expect(html).toContain(`1. ${GUIDE_STEPS[0].title}`);
    expect(html).toContain('aria-label="Step 1 of 3"');
    for (const l of GUIDE_LIGHTS) expect(html).toContain(`data-testid="guide-light-${l.mood}"`);
    expect(html).toContain('Make it for me');   // one tap to a playable court
    expect(html).toContain('aria-label="Close the guide"');
  });
  it('no wall of text: fewer than 40 words on the card', () => {
    const text = html.replace(/<[^>]+>/g, ' ');
    expect(text.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length).toBeLessThan(40);
  });
  it('every target is at least 44 px tall (min-h-11 / h-11)', () => {
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(3);
    for (const b of buttons) expect(b, b).toMatch(/min-h-11|h-11/);
  });
});

describe('help', () => {
  const html = clean(renderToStaticMarkup(createElement(HelpSheet, { onClose: noop, onGuide: noop })));
  it('is a labelled dialog listing every key, with the guide one tap away', () => {
    expect(html).toMatch(/role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="studio-help-title"/);
    for (const s of SHORTCUTS) expect(html).toContain(s.does);
    expect(html).toContain('make your first court');
  });
});

describe('empty states say what to do', () => {
  it('the AI builder, switched off, offers the two ways on', () => {
    ai.state = 'coming_soon';
    const h = clean(renderToStaticMarkup(createElement(AiVenuePanel, { studio: studio(), onBuildByHand: noop, onGuide: noop })));
    expect(h).toContain('Build by hand');
    expect(h).toContain('Make your first court');
    expect(h).not.toContain('a sunny clay court with palms');   // no greyed-out example chips while it is off
  });
  it('no saved Closet look: the message says what to do, and the Closet is a tap away', () => {
    expect(NO_LOOKS).toMatch(/Open the Closet, make a look and tap Save/);
    expect(readFileSync(join(ROOT, 'components/nexus-studio/characters.tsx'), 'utf8')).toContain('error === NO_LOOKS && (');
  });
  it('characters: none yet, and where they come from', () => {
    const h = clean(renderToStaticMarkup(createElement(CharactersTrack, { studio: studio() })));
    expect(h).toContain('data-testid="characters-empty"');
    expect(h).toContain('No characters yet');
  });
  it('scripts: none yet, what one is for, and a one-tap start', () => {
    const h = clean(renderToStaticMarkup(createElement(ScriptsTrack, { studio: studio() })));
    expect(h).toContain('data-testid="scripts-empty"');
    expect(h).toContain('Start with: point won → cheer');
  });
});

describe('plain words and sizes (source pins)', () => {
  const files = ['studio-app', 'venue-editor', 'asset-browser', 'scene-tree', 'inspector', 'viewport-panel', 'characters', 'script-editor', 'ai-venue-panel', 'stamp-shelf', 'budget-meter', 'ui'];
  it('no text under 12 px in the Studio (the type scale’s label size)', () => {
    for (const f of files) expect(readFileSync(join(ROOT, `components/nexus-studio/${f}.tsx`), 'utf8'), f).not.toMatch(/text-\[(9|10|11)px\]/);
  });
  it('the engine’s words stay out of the creator’s way', () => {
    const vp = readFileSync(join(ROOT, 'components/nexus-studio/viewport-panel.tsx'), 'utf8');
    expect(vp).not.toContain('engine path…');
    expect(vp).toContain('Loading the court…');
    const app = readFileSync(join(ROOT, 'components/nexus-studio/studio-app.tsx'), 'utf8');
    expect(app).not.toContain('?venue= load path is dev-only');
  });
  it('script nodes take focus and move with the arrows', () => {
    const src = readFileSync(join(ROOT, 'components/nexus-studio/script-editor.tsx'), 'utf8');
    expect(src).toMatch(/tabIndex=\{0\} role="button" aria-label=/);
    expect(src).toContain('function NextField');
  });
});
