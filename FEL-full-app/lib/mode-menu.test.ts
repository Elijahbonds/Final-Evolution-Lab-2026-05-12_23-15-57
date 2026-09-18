import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { MODE_INFO } from './game-data';
import {
  HIDDEN_FROM_MODE_MENU,
  MODE_MENU_META,
  SUPPORT_SURFACES,
  missingModeMenuMetaKeys,
  modeMenuMetaFor,
  visibleModeEntries,
} from './mode-menu';

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
});
