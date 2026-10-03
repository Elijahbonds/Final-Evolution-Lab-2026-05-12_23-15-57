// S-16: login ?next= is a same-origin path, or it is ignored.
import { describe, expect, it } from 'vitest';
import { loginDestination, loginRedirect, safeLoginNext } from './safeNext';

describe('safeLoginNext', () => {
  it('?next=/play/mirror lands there', () => {
    expect(safeLoginNext('/play/mirror')).toBe('/play/mirror');
    expect(loginDestination('/play/mirror', '/play')).toBe('/play/mirror');
  });

  it('keeps a same-origin query and hash', () => {
    expect(safeLoginNext('/play/mirror?step=1')).toBe('/play/mirror?step=1');
    expect(safeLoginNext('/account#data')).toBe('/account#data');
  });

  it('builds a login redirect that keeps play-page query state', () => {
    expect(loginRedirect('/play/dunk', { c: 'challenge-1', arena: 'venice' })).toBe(
      '/login?next=%2Fplay%2Fdunk%3Fc%3Dchallenge-1%26arena%3Dvenice',
    );
    expect(loginRedirect('/play/tennis', { c: ['one', 'two'], empty: undefined })).toBe(
      '/login?next=%2Fplay%2Ftennis%3Fc%3Done%26c%3Dtwo',
    );
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
