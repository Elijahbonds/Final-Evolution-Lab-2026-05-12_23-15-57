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
    expect(html).toContain('aria-label="New project"');
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
  it('New project is one undoable command (the last project comes back with Undo) and opens the guide', () => {
    const src = readFileSync(join(ROOT, 'components/nexus-studio/studio-app.tsx'), 'utf8');
    expect(src).toMatch(/studio\.run\(\{ \.\.\.importProject\(starterProject\(\)\), label: 'New project' \}\)/);
    expect(src).toMatch(/Undo brings the last one back/);
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
