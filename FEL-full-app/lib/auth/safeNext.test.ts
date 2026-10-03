// S-16: login ?next= is a same-origin path, or it is ignored.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loginDestination, loginPath, safeLoginNext } from './safeNext';

const root = join(__dirname, '../..');

function pageFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...pageFiles(full));
    } else if (entry === 'page.tsx') {
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
    expect(loginPath('/account#data')).toBe('/login?next=%2Faccount%23data');
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
    expect(loginPath('https://evil.example')).toBe('/login');
  });

  it('game routes owned by the play shell keep their deep link through login', () => {
    const offenders = pageFiles(join(root, 'app/play'))
      .map((file) => relative(root, file))
      .filter((file) => file !== 'app/play/calibrate/page.tsx' && !file.startsWith('app/play/mirror/'))
      .filter((file) => /redirect\((['"])\/login\1\)/.test(readFileSync(join(root, file), 'utf8')));

    expect(offenders).toEqual([]);
  });
});
