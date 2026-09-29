// The free-game target (SCREEN-FIX S-1, Cyber 3) and the two build-time switches (SCREEN-SHIP gate 6, A3-5).
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  DEFAULT_FREE_GAME_ROUTE, SIGNED_IN_ONLY_ROUTES, freeGameRoute, isSignedInOnly, programSignupEnabled, screenNextTarget,
} from './config';

const APP = join(__dirname, '../../app');

describe('the free game is /try, the guest dunk contest', () => {
  it('/try renders the guest shell for a signed-out visitor; Brain Brawl sends one to /login', () => {
    expect(DEFAULT_FREE_GAME_ROUTE).toBe('/try');
    const tryPage = readFileSync(join(APP, 'try/page.tsx'), 'utf8');
    expect(tryPage).toMatch(/return <GuestDunkShell/);
    expect(tryPage).not.toMatch(/redirect\(\s*['"`]\/login/);
    expect(readFileSync(join(APP, 'play/brain-brawl/page.tsx'), 'utf8')).toMatch(/if \(!session\) redirect\('\/login'\)/);
  });

  it('13 and older, signed out: /try, or the env route when it is valid and open to a guest', () => {
    for (const age of ['13-17', '18+'] as const) {
      expect(screenNextTarget(age, undefined), age).toBe('/try');
      expect(screenNextTarget(age, ''), age).toBe('/try');
      expect(screenNextTarget(age, '/try?c=abc'), age).toBe('/try?c=abc');
      expect(screenNextTarget(age, '/modes'), age).toBe('/modes');
    }
  });

  it('under 13, "rather not say" and no answer: no target at all', () => {
    for (const age of ['under-13', 'unknown', null, undefined] as const) {
      expect(screenNextTarget(age, undefined), String(age)).toBeNull();
      expect(screenNextTarget(age, '/try'), String(age)).toBeNull();
    }
  });

  it('a signed-in-only env route is rejected → /try', () => {
    for (const bad of [
      '/play/brain-brawl', '/play/brain-brawl?src=screen', '/login', '/login?next=%2Fplay', '/signup', '/account', '/account/settings',
      '/play', '/play/dunk', '/profile', '/api/guest', '/dev/brainbrawl', '/PLAY/brain-brawl', '/try/../play/brain-brawl',
      '/pl%61y/brain-brawl', '/wallet/', '/studio/x',
    ]) {
      expect(isSignedInOnly(bad), bad).toBe(true);
      expect(freeGameRoute(bad), bad).toBe('/try');
      expect(screenNextTarget('18+', bad), bad).toBe('/try');
    }
    for (const ok of ['/try', '/modes', '/screen/privacy', '/trainer', '/players']) expect(isSignedInOnly(ok), ok).toBe(false);
  });

  it('anything that could leave the site falls back to /try', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'play/brain-brawl', 'http:/x', '/a b', 'mailto:x@y']) {
      expect(freeGameRoute(bad), bad).toBe('/try');
    }
  });

  it('every page or layout under app/ that sends a signed-out visitor to /login is on the list', () => {
    const walled: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) { if (f !== 'api') walk(p); continue; }
        if (!/^(page|layout)\.tsx?$/.test(f)) continue;
        const src = readFileSync(p, 'utf8');
        if (!/redirect\(\s*['"`]\/login/.test(src)) continue;
        // the route: route groups dropped; a dynamic segment ends it (everything under the prefix is walled)
        const segs = relative(APP, dir).split('/').filter((x) => x && !/^\(.*\)$/.test(x));
        const cut = segs.findIndex((x) => x.startsWith('['));
        const route = `/${(cut < 0 ? segs : segs.slice(0, cut)).join('/')}`;
        if (route === '/login' || route === '/signup') continue;                 // they send a SIGNED-IN visitor away
        walled.push(route);
      }
    };
    walk(APP);
    expect(walled.length).toBeGreaterThan(20);
    expect(walled).toContain('/play/brain-brawl');
    for (const r of walled) expect(isSignedInOnly(r), `${r} sends a guest to /login: add it to SIGNED_IN_ONLY_ROUTES`).toBe(true);
    expect(SIGNED_IN_ONLY_ROUTES).toEqual(expect.arrayContaining(['/login', '/signup', '/account', '/play']));
  });
});

describe('NEXT_PUBLIC_PROGRAM_SIGNUP_ENABLED', () => {
  it('off unless exactly "true"', () => {
    for (const v of [undefined, '', 'false', '1', 'TRUE', 'yes']) expect(programSignupEnabled(v), String(v)).toBe(false);
    expect(programSignupEnabled('true')).toBe(true);
  });
  it('its read site carries the A3-5 and A4-7 notes', () => {
    const src = readFileSync(join(__dirname, 'config.ts'), 'utf8');
    expect(src).toMatch(/only enabled after Cyber hardening[\s*]+steps 1–2 land/);
    expect(src).toMatch(/only the PARENT's email is collected/);
  });
});
