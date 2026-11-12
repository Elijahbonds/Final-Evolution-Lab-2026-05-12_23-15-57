// TIP-GUEST-TOKEN-HASH (2026-10-19): the guest token's hash, its format check, its strength and its cookie name/flags.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GUEST_COOKIE_HOST,
  GUEST_COOKIE_LEGACY,
  GUEST_COOKIE_MAX_AGE,
  guestCookieName,
  guestCookieOptions,
  hashGuestToken,
  isGuestTokenFormat,
  mintGuestToken,
} from './guest';

afterEach(() => { vi.unstubAllEnvs(); });

describe('hashGuestToken', () => {
  it('is SHA-256 as lowercase hex (FIPS 180-2 vectors)', () => {
    expect(hashGuestToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hashGuestToken('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
  it('is 64 hex chars, the same for the same token, different for another', () => {
    const t = mintGuestToken();
    expect(hashGuestToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashGuestToken(t)).toBe(hashGuestToken(t));
    expect(hashGuestToken(t)).not.toBe(hashGuestToken(mintGuestToken()));
    expect(hashGuestToken(t)).not.toContain(t);
  });
});

describe('isGuestTokenFormat', () => {
  it('accepts exactly 32 base64url characters', () => {
    expect(isGuestTokenFormat('A'.repeat(32))).toBe(true);
    expect(isGuestTokenFormat('abcdefghijklmnopqrstuvwxyz0123_-')).toBe(true);
  });
  it.each([
    ['empty', ''],
    ['31 chars', 'A'.repeat(31)],
    ['33 chars', 'A'.repeat(33)],
    ['a +', `${'A'.repeat(31)}+`],
    ['a /', `${'A'.repeat(31)}/`],
    ['an =', `${'A'.repeat(31)}=`],
    ['a space', `${'A'.repeat(31)} `],
    ['a 64-char hash', 'a'.repeat(64)],
  ])('rejects %s', (_label, t) => {
    expect(isGuestTokenFormat(t)).toBe(false);
  });
  it('rejects non-strings', () => {
    for (const v of [undefined, null, 32, {}, ['A'.repeat(32)]]) expect(isGuestTokenFormat(v)).toBe(false);
  });
});

describe('mintGuestToken', () => {
  it('is 24 random bytes (192 bits) in the accepted format', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const t = mintGuestToken();
      expect(isGuestTokenFormat(t)).toBe(true);
      expect(Buffer.from(t, 'base64url')).toHaveLength(24);
      seen.add(t);
    }
    expect(seen.size).toBe(200);
  });
});

describe('the guest cookie', () => {
  it('is __Host-fel_guest in production and fel_guest elsewhere', () => {
    expect(guestCookieName('production')).toBe(GUEST_COOKIE_HOST);
    expect(GUEST_COOKIE_HOST).toBe('__Host-fel_guest');
    expect(guestCookieName('development')).toBe(GUEST_COOKIE_LEGACY);
    expect(guestCookieName('test')).toBe('fel_guest');
    expect(guestCookieName(undefined)).toBe('fel_guest');
  });
  it('is httpOnly, always Secure, SameSite=Lax, Path=/, 30 days, and has no Domain', () => {
    for (const env of ['production', 'development', 'test']) {
      vi.stubEnv('NODE_ENV', env);
      const o = guestCookieOptions() as Record<string, unknown>;
      expect(o).toEqual({ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 2592000 });
      expect('domain' in o).toBe(false);
    }
    expect(GUEST_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 30);
  });
});
