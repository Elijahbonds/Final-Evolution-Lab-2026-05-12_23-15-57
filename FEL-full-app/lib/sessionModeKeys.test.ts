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

const staticAttr = (attrs: string, name: string): string | null => {
  const match = attrs.match(new RegExp(`\\b${name}="([^"]+)"`));
  return match?.[1] ?? null;
};

/**
 * Static in-game labels that deliberately differ from MODE_INFO. A route that wants
 * different shell copy has to name why, so accidental venue/card drift stays visible.
 * `route` scopes an exception to one shell when two routes save under the same key (/play/tiebreak and the Tennis
 * variant); without it the exception covers the mode's one /play shell. DERBY-KEY (2026-10-23): the derby's entry is gone —
 * /play/derby saves under 'derby' now, whose own catalogue row is MOONSHOT DERBY at Catalina Ballpark.
 */
const DOCUMENTED_SHELL_COPY: Record<string, { venue?: string; title?: string; route?: string; reason: string }> = {
  acting: { venue: 'Soundstage', reason: 'the mode plays on a stage while the catalogue groups the discipline as Acting Stage' },
  aeroAces: { venue: 'Gate Run', reason: 'the race instance names the current course; MODE_INFO names the broader Flyway venue' },
  bigAir: { venue: 'Alpine Ridge', reason: 'the run starts at the ridge inside the Mountain Slope venue family' },
  carnival: { venue: 'Venice Beach Carnival', reason: 'the shell names the event overlay; MODE_INFO keeps the shelf grouped at Venice Beach Court' },
  irl: { title: 'VERT', venue: 'Anywhere', reason: 'the camera tool labels the measured activity, not the Hang Time catalogue wrapper' },
  music: { title: 'FEL GROOVE ACADEMY', venue: 'The Academy', reason: 'the shell brands the lesson space inside the Studio catalogue venue' },
  tiebreak: { route: '/play/tennis', title: 'TIEBREAK', reason: 'the Tennis tiebreak variant (/play/tennis?variant=tiebreak) names the variant; the catalogue row keeps the Tiebreak Blitz name the shelf, venue card and challenges list' },
};

/** Every `<GameShell mode="…">` under app/, with the route it is mounted on: the keys sessions are saved under. */
function shells(): Array<{ mode: string; route: string; title: string | null; venue: string | null }> {
  const out: Array<{ mode: string; route: string; title: string | null; venue: string | null }> = [];
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
      for (const m of src.matchAll(/<GameShell\b([^>]*?)\/>/g)) {
        const mode = staticAttr(m[1], 'mode');
        if (mode) out.push({ mode, route, title: staticAttr(m[1], 'title'), venue: staticAttr(m[1], 'venue') });
      }
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
    // DERBY-KEY (2026-10-23): the two ballpark games save under two keys, each with its own catalogue row
    expect(byRoute.get('/play/baseball')).toBe('baseball');
    expect(byRoute.get('/play/derby')).toBe('derby');
    expect(MODE_INFO.derby?.href).toBe('/play/derby');
  });

  it('keeps static /play GameShell copy aligned with the catalogue, unless the alternate is documented', () => {
    const undocumented: string[] = [];
    const staleDocs: string[] = [];

    const playShells = all.filter((shell) => shell.route.startsWith('/play/'));

    for (const shell of playShells) {
      const info = MODE_INFO[shell.mode];
      if (!info) continue;
      const entry = DOCUMENTED_SHELL_COPY[shell.mode];
      const doc = entry && (!entry.route || entry.route === shell.route) ? entry : undefined;
      if (shell.title && shell.title.toLowerCase() !== info.name.toLowerCase() && shell.title !== doc?.title) {
        undocumented.push(`${shell.route} title '${shell.title}' (catalogue '${info.name}')`);
      }
      if (shell.venue && shell.venue !== info.venue && shell.venue !== doc?.venue) {
        undocumented.push(`${shell.route} venue '${shell.venue}' (catalogue '${info.venue}')`);
      }
    }

    for (const [mode, doc] of Object.entries(DOCUMENTED_SHELL_COPY)) {
      const shell = playShells.find((s) => s.mode === mode && (!doc.route || s.route === doc.route));
      if (!shell) {
        staleDocs.push(`${mode}: no shell`);
        continue;
      }
      if (doc.title && shell.title !== doc.title) staleDocs.push(`${mode}: documented title '${doc.title}' is stale`);
      if (doc.venue && shell.venue !== doc.venue) staleDocs.push(`${mode}: documented venue '${doc.venue}' is stale`);
      expect(doc.reason.length, `${mode} copy exception explains why`).toBeGreaterThan(40);
    }

    expect(staleDocs).toEqual([]);
    expect(undocumented).toEqual([]);
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
