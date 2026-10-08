import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import ModesPage from '@/app/modes/page';
import { MODE_INFO } from './game-data';
import {
  HIDDEN_FROM_MODE_MENU,
  MODE_MENU_META,
  SUPPORT_SURFACES,
  missingModeMenuMetaKeys,
  modeMenuMetaFor,
  visibleModeEntries,
} from './mode-menu';
import { FAMILIES } from './nav/families';

describe('mode menu contract', () => {
  it('has copy and styling metadata for every visible mode tile', () => {
    expect(missingModeMenuMetaKeys()).toEqual([]);
  });

  it('keeps non-session support surfaces out of the game-mode grid', () => {
    const visible = new Set(visibleModeEntries().map(([key]) => key));
    for (const key of SUPPORT_SURFACES) {
      expect(visible.has(key), `${key} should be reachable elsewhere, not listed as a game mode`).toBe(false);
      expect(HIDDEN_FROM_MODE_MENU.has(key)).toBe(true);
    }
  });

  it('does not hide any mode that appears on the Play shelf', () => {
    const visible = new Set(visibleModeEntries().map(([key]) => key));
    const hiddenShelfModes = FAMILIES
      .flatMap((family) => family.modes)
      .filter((key) => !visible.has(key));
    expect(hiddenShelfModes).toEqual([]);
  });

  it('does not fall back for any visible mode', () => {
    for (const [key, info] of visibleModeEntries()) {
      const meta = modeMenuMetaFor(key);
      expect(MODE_MENU_META[key], `${key} (${info.name}) is missing explicit menu metadata`).toBeTruthy();
      expect(meta.color, `${key} color`).toMatch(/^#[0-9A-F]{6}$/i);
      expect(meta.desc.trim().length, `${key} description`).toBeGreaterThan(24);
      expect(meta.icon, `${key} icon`).toBeTruthy();
    }
  });

  it('only hides keys that exist in MODE_INFO', () => {
    const unknownHiddenKeys = [...HIDDEN_FROM_MODE_MENU].filter((key) => !(key in MODE_INFO));
    expect(unknownHiddenKeys).toEqual([]);
  });

  it('links every visible mode tile to a real app route', () => {
    for (const [key, info] of visibleModeEntries()) {
      const routePath = info.href.split('?')[0]?.replace(/^\/+/, '');
      expect(routePath, `${key} has a concrete href`).toBeTruthy();
      expect(
        existsSync(join(process.cwd(), 'app', routePath!, 'page.tsx')),
        `${key} (${info.name}) points at missing route ${info.href}`
      ).toBe(true);
    }
  });

  it('/modes is a real all-modes index, not a redirect back to Play', () => {
    const html = renderToStaticMarkup(createElement(ModesPage));
    expect(html).toContain('All live modes');
    expect(html).toContain('Brain Brawl');
    expect(html).toContain('Tiebreak Blitz');
    // IRON-PARADISE-OUT (#150): training stays unlisted. The catalogue reads visibleModeEntries(),
    // which already drops parked modes, so Iron Paradise must not reappear on /modes.
    expect(html).not.toContain('Iron Paradise');
    expect(html).toContain('Neuro-Mechanic Mirror');
    expect(html).not.toContain('Marketplace');
    expect(html).not.toContain('FEL Kitchens');
  });
});
