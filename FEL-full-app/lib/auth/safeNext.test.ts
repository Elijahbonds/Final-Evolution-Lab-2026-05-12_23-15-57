// S-16: login ?next= is a same-origin path, or it is ignored.
import { describe, expect, it } from 'vitest';
import { loginDestination, safeLoginNext } from './safeNext';

describe('safeLoginNext', () => {
  it('?next=/play/mirror lands there', () => {
    expect(safeLoginNext('/play/mirror')).toBe('/play/mirror');
    expect(loginDestination('/play/mirror', '/play')).toBe('/play/mirror');
  });

  it('keeps a same-origin query and hash', () => {
    expect(safeLoginNext('/play/mirror?step=1')).toBe('/play/mirror?step=1');
    expect(safeLoginNext('/account#data')).toBe('/account#data');
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
    expect(safeLoginNext('/\\evil.example')).toBeNull();
    expect(safeLoginNext('/\t/evil.example')).toBeNull();
    expect(safeLoginNext('/%2F%2Fevil.example')).toBeNull();
    expect(safeLoginNext('javascript:alert(1)')).toBeNull();
    expect(safeLoginNext('javascript:alert(1)')).toBeNull();
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
      expect(src, file).toContain(`redirect(\`/login?next=\${encodeURIComponent('${p}')}\`)`);
    }
  });
});
