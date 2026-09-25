// ONE KEY PER MODE: THE ONE ITS SESSIONS ARE SAVED UNDER (HOTFIX 2026-09-24).
//
// GameShell posts its `mode` prop to /api/sessions, and that is the key every GameSession row carries. A ghost duel
// draws its rival from rows WHERE mode = match.mode (api/arena/submit-score), and the counsellor reads sessions by the
// same key (lib/guidance/evidence.ts). Three catalogue keys had drifted from their shells. The Academy mounts
// GameShell mode="music" while the Arena, the catalogue and the counsellor said 'musicAcademy', so a music duel never
// saw one music session. The kart and the plane post 'velocityKart' / 'aeroAces' while the catalogue, the shelf and the
// counsellor said 'velocitykart' / 'aeroaces', so a race was never evidence of anything. The catalogue now uses the
// session key, and the old spellings are aliased for rows and picks stored before the rename.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { ARENA_MODES, arenaModeKey } from './arena';
import { ARENA_SCORE_BASELINES, drawRivalScore } from './arena-rivals';
import { LEGACY_MODE_KEYS, MODE_INFO, canonicalModeKey } from './game-data';
import { MODE_DISCIPLINE, disciplineForMode } from './guidance/evidence';
import { FAMILIES } from './nav/families';
import { MODE_MENU_META } from './mode-menu';
import { MP_MODES, sessionModeFor } from './mp/match-core';

const APP = join(process.cwd(), 'app');

/** Every `<GameShell mode="…">` under app/, with the route it is mounted on: the keys sessions are saved under. */
function shells(): Array<{ mode: string; route: string }> {
  const out: Array<{ mode: string; route: string }> = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!p.endsWith('.tsx')) continue;
      const src = readFileSync(p, 'utf8');
      // the route is the path down to the first private folder (_components) or the file itself
      const parts = relative(APP, p).split(sep);
      const cut = parts.findIndex((s) => s.startsWith('_') || s.endsWith('.tsx'));
      const route = '/' + parts.slice(0, cut).join('/');
      for (const m of src.matchAll(/<GameShell\b[^>]*?\bmode="([^"]+)"/g)) out.push({ mode: m[1], route });
    }
  };
  walk(APP);
  return out;
}

describe('mode keys are session keys', () => {
  const all = shells();
  const saved = new Set(all.map((s) => s.mode));

  it('found the shells (the scan is not silently empty)', () => {
    expect(saved.size).toBeGreaterThan(20);
    for (const k of ['music', 'velocityKart', 'aeroAces']) expect(saved.has(k), k).toBe(true);
  });

  it('every catalogue entry for a GameShell route is keyed by what that shell saves', () => {
    // The invariant the three drifted keys broke: MODE_INFO's key for a route IS the session key of the route's shell.
    const byRoute = new Map(all.map((s) => [s.route, s.mode]));
    const wrong = Object.entries(MODE_INFO)
      .filter(([, info]) => byRoute.has(info.href))
      .filter(([key, info]) => byRoute.get(info.href) !== key)
      .map(([key, info]) => `${key} -> ${info.href} saves '${byRoute.get(info.href)}'`);
    expect(wrong).toEqual([]);
    expect(byRoute.get('/play/music')).toBe('music');
    expect(byRoute.get('/play/velocity-kart')).toBe('velocityKart');
    expect(byRoute.get('/play/aero-aces')).toBe('aeroAces');
  });

  it('every Arena mode is a key some GameShell saves its sessions under', () => {
    const orphans = ARENA_MODES.filter((m) => !saved.has(m));
    expect(orphans, 'arena keys no session is ever saved under — the ghost draw finds no history').toEqual([]);
  });

  it('every mode the counsellor reads is a key some GameShell saves its sessions under', () => {
    const orphans = Object.keys(MODE_DISCIPLINE).filter((m) => !saved.has(m));
    expect(orphans, 'counsellor keys no session is ever saved under — evidence of nothing').toEqual([]);
  });

  it('every challengeable session mode has a catalogue row (ported from 6977f18)', () => {
    const missing = [...new Set(MP_MODES.map((m) => sessionModeFor(m.key)))].filter((k) => !(k in MODE_INFO));
    expect(missing).toEqual([]);
  });

  it('the Academy and the racers are keyed by their session keys end to end', () => {
    expect(ARENA_MODES).toContain('music');
    expect(MODE_INFO.music?.href).toBe('/play/music');
    expect(ARENA_SCORE_BASELINES.music).toBeGreaterThan(0);
    expect(disciplineForMode('music')).toBe('music');
    for (const k of ['velocityKart', 'aeroAces']) {
      expect(MODE_INFO[k]?.href, k).toMatch(/^\/play\//);
      expect(MODE_MENU_META[k], k).toBeTruthy();
      expect(FAMILIES.find((f) => f.id === 'racing')?.modes, k).toContain(k);
      expect(disciplineForMode(k), k).toBe('sport');
    }
  });
});

describe('the old spellings are aliases, never second entries', () => {
  it('maps each old key to its current key and leaves every other key alone', () => {
    expect(canonicalModeKey('musicAcademy')).toBe('music');
    expect(canonicalModeKey('velocitykart')).toBe('velocityKart');
    expect(canonicalModeKey('aeroaces')).toBe('aeroAces');
    for (const k of ['music', 'velocityKart', 'dunkContest', 'nope', '']) expect(canonicalModeKey(k)).toBe(k);
    expect(canonicalModeKey(null)).toBe('');
    expect(canonicalModeKey(undefined)).toBe('');
    expect(canonicalModeKey('constructor')).toBe('constructor');   // own keys only, never the prototype
  });

  it('points every alias at a real catalogue key, and no old key is still a catalogue row (the shelf would show it twice)', () => {
    for (const [oldKey, current] of Object.entries(LEGACY_MODE_KEYS)) {
      expect(MODE_INFO[current], `${oldKey} -> ${current}`).toBeTruthy();
      expect(oldKey in MODE_INFO, `${oldKey} is still a MODE_INFO row`).toBe(false);
      expect(oldKey in MODE_MENU_META, `${oldKey} is still a menu row`).toBe(false);
      expect(oldKey in MODE_DISCIPLINE, `${oldKey} is still a counsellor row`).toBe(false);
      expect(FAMILIES.some((f) => f.modes.includes(oldKey)), `${oldKey} is still on the shelf`).toBe(false);
    }
  });

  it('reads a duel stored as "musicAcademy" as a music duel', () => {
    expect(arenaModeKey('musicAcademy')).toBe('music');
    expect(arenaModeKey('threePoint')).toBe('threePoint');
  });

  it('draws a cold-start rival for an old music duel off the MUSIC baseline, not the default 100', () => {
    const old = drawRivalScore({ seed: 'legacy-seed', mode: 'musicAcademy', playerHistory: [], populationMedian: null });
    const now = drawRivalScore({ seed: 'legacy-seed', mode: 'music', playerHistory: [], populationMedian: null });
    expect(old.source).toBe('baseline');
    expect(old.center).toBe(ARENA_SCORE_BASELINES.music);
    expect(old.center).toBeGreaterThan(1000);   // the default was 100 on a 5000-point scale: an almost free win
    expect(old).toEqual(now);
  });
});
