// S-16: login ?next= is a same-origin path, or it is ignored.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loginDestination, loginPath, safeLoginNext } from './safeNext';

const root = join(__dirname, '../..');

function appEntries(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'api') continue;
      out.push(...appEntries(full));
    } else if (entry === 'page.tsx' || entry === 'layout.tsx') {
      out.push(full);
    }
  }
  return out;
}

describe('safeLoginNext', () => {
  it('?next=/play/mirror lands there', () => {
    expect(safeLoginNext('/play/mirror')).toBe('/play/mirror');
    expect(loginDestination('/play/mirror', '/play')).toBe('/play/mirror');
  });

  it('keeps a same-origin query and hash', () => {
    expect(safeLoginNext('/play/mirror?step=1')).toBe('/play/mirror?step=1');
    expect(safeLoginNext('/account#data')).toBe('/account#data');
    expect(safeLoginNext('/play/calibrate?return=%2Fplay%2Fdance')).toBe('/play/calibrate?return=%2Fplay%2Fdance');
    expect(safeLoginNext('/c/abc%20123')).toBe('/c/abc%20123');
    expect(loginPath('/account#data')).toBe('/login?next=%2Faccount%23data');
    expect(loginPath('/play/mirror?step=1')).toBe('/login?next=%2Fplay%2Fmirror%3Fstep%3D1');
    expect(loginPath('/play/karate')).toBe('/login?next=%2Fplay%2Fkarate');
  });

  it('?next=https://evil.example and //evil.example are ignored', () => {
    expect(safeLoginNext('https://evil.example')).toBeNull();
    expect(safeLoginNext('https://evil.example/play/mirror')).toBeNull();
    expect(safeLoginNext('http://evil.example')).toBeNull();
    expect(safeLoginNext('//evil.example')).toBeNull();
    expect(safeLoginNext('//evil.example/phish')).toBeNull();
    expect(loginDestination('https://evil.example', '/play')).toBe('/play');
    expect(loginDestination('//evil.example', '/play')).toBe('/play');
  });

  it('refuses protocol-relative tricks: backslash, tab, encoded slashes, a scheme', () => {
    const refused = [
      '/\\evil.example',
      '/\t/evil.example',
      '/\n/evil.example',
      '/%2F%2Fevil.example',
      '/%2f%2fevil.example',
      '/%252F%252Fevil.example',
      '/%252f%252fevil.example',
      '/%2Fevil.example',
      '/%5C%5Cevil.example',
      '/%5c/evil.example',
      '/%09/evil.example',
      '/%00/evil.example',
      '/play/../%2F%2Fevil.example',
      '///evil.example',
      'javascript:alert(1)',
      'data:text/html,hi',
      'https:evil.example',
      '\\evil.example',
      '/play\\evil',
    ];
    for (const raw of refused) {
      expect(safeLoginNext(raw), raw).toBeNull();
      expect(loginPath(raw), raw).toBe('/login');
    }
  });

  it('refuses a path that is not absolute-on-this-origin, and non-strings', () => {
    expect(safeLoginNext('play/mirror')).toBeNull();
    expect(safeLoginNext('')).toBeNull();
    expect(safeLoginNext('  //evil.example')).toBeNull();
    expect(safeLoginNext(undefined)).toBeNull();
    expect(safeLoginNext(null)).toBeNull();
    expect(safeLoginNext(42)).toBeNull();
    expect(safeLoginNext(['/play/mirror'])).toBeNull();
    expect(safeLoginNext('/' + 'a'.repeat(600))).toBeNull();
    expect(loginDestination(undefined, '/play/dunk')).toBe('/play/dunk');
    expect(loginPath('https://evil.example')).toBe('/login');
    expect(loginDestination('/%252F%252Fevil.example', '/play')).toBe('/play');
  });
});

// AGE-RESET-LOGIN-NEXT (audit 2.10, 2026-10-03): the court-session login walls send ?next= so signing in at a court
// returns you where you were. These pin both halves: the pages pass it, and the sanitizer honours exactly those paths.
describe('the login walls that send ?next= (audit 2.10)', () => {
  const ROUTES: [string, string][] = [
    ['app/play/dunkduel/page.tsx', '/play/dunkduel'],
    ['app/play/irl/page.tsx', '/play/irl'],
    ['app/play/dunk/page.tsx', '/play/dunk'],
    ['app/play/mirror/page.tsx', '/play/mirror'],
    ['app/coach/page.tsx', '/coach'],
  ];

  it('each route\'s next path is a safe same-origin path (no "//", no scheme)', () => {
    for (const [, p] of ROUTES) expect(safeLoginNext(p), p).toBe(p);
  });

  it('each page redirects to /login with its own path in ?next=', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    for (const [file, p] of ROUTES) {
      const src = readFileSync(join(__dirname, '../../', file), 'utf8');
      expect(src, file).toContain(`redirect(loginPath('${p}'))`);
    }
  });
});

describe('every protected page returns through loginPath', () => {
  it('no page or layout sends a signed-out visitor to a bare /login', () => {
    const bare: string[] = [];
    const loginWalls: string[] = [];
    for (const file of appEntries(join(root, 'app'))) {
      const rel = relative(root, file);
      const src = readFileSync(file, 'utf8');
      if (/redirect\(\s*['"`]\/login['"`]\s*\)/.test(src)) bare.push(rel);
      if (/redirect\(\s*(?:['"`]\/login|loginPath\()/.test(src)) {
        loginWalls.push(rel);
        expect(src, rel).toContain('loginPath(');
      }
    }
    expect(bare).toEqual([]);
    expect(loginWalls.length).toBeGreaterThan(20);
    expect(loginWalls).toEqual(expect.arrayContaining([
      'app/play/brain-brawl/page.tsx',
      'app/play/dunk/page.tsx',
      'app/coach/page.tsx',
      'app/workout/page.tsx',
      'app/age/page.tsx',
      'app/studio/layout.tsx',
    ]));
  });
});
