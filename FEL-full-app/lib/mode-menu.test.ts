import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { MODE_INFO } from './game-data';
import { MP_MODES, sessionModeFor } from './mp/match-core';
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

  it('has mode info for every challengeable session mode', () => {
    const missing = [...new Set(MP_MODES.map((mode) => sessionModeFor(mode.key)))]
      .filter((key) => !(key in MODE_INFO));
    expect(missing).toEqual([]);
  });

  it('keeps standalone multiplayer routes discoverable from the game-mode grid', () => {
    const visible = new Set(visibleModeEntries().map(([key]) => key));
    expect(visible.has('aeroAces')).toBe(true);
    expect(visible.has('velocityKart')).toBe(true);
  });

  it('links every visible mode tile to a real app route', () => {
    for (const [key, info] of visibleModeEntries()) {
      expect(info.href, `${key} href should be absolute`).toMatch(/^\//);

      const routePath = info.href === '/'
        ? join(process.cwd(), 'app', 'page.tsx')
        : join(process.cwd(), 'app', info.href.replace(/^\/+/, ''), 'page.tsx');

      expect(existsSync(routePath), `${key} links to a missing route: ${info.href}`).toBe(true);
    }
  });

  it('only hides keys that exist in MODE_INFO', () => {
    const unknownHiddenKeys = [...HIDDEN_FROM_MODE_MENU].filter((key) => !(key in MODE_INFO));
    expect(unknownHiddenKeys).toEqual([]);
  });
});
