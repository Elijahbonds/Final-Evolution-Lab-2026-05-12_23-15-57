// RATE-LIMIT-WIRE (PR #289 QA rework): the limits never key on an address the client wrote. X-Forwarded-For entries are
// read from the RIGHT, as many places as TRUSTED_PROXY_HOPS says proxies we run behind appended; whatever the client puts
// in front of the list never reaches that slot.
import { describe, expect, it } from 'vitest';
import { trustedClientIp, trustedProxyHops } from './clientIp';

const xff = (v: string) => new Headers({ 'x-forwarded-for': v });

describe('trustedClientIp', () => {
  it('TRUSTED_PROXY_HOPS unset: no address at all, whatever X-Forwarded-For says', () => {
    expect(trustedClientIp(xff('203.0.113.9'), {})).toBeNull();
    expect(trustedClientIp(xff('198.51.100.1, 203.0.113.9'), {})).toBeNull();
  });

  it('one trusted hop: the last entry, the one the proxy appended', () => {
    expect(trustedClientIp(xff('203.0.113.9'), { TRUSTED_PROXY_HOPS: '1' })).toBe('203.0.113.9');
    expect(trustedClientIp(xff('10.0.0.1, 203.0.113.9'), { TRUSTED_PROXY_HOPS: '1' })).toBe('203.0.113.9');
  });

  it('SPOOFED X-Forwarded-For: a client-written prefix never becomes the address, however it is rotated', () => {
    const env = { TRUSTED_PROXY_HOPS: '1' };
    for (const fake of ['1.1.1.1', '8.8.8.8, 9.9.9.9', '127.0.0.1', '::1', 'garbage, 4.4.4.4']) {
      expect(trustedClientIp(xff(`${fake}, 203.0.113.9`), env)).toBe('203.0.113.9');
    }
    // two trusted hops (a CDN in front of the platform's front end): the client's address is second from the right
    expect(trustedClientIp(xff('1.1.1.1, 203.0.113.9, 35.191.0.7'), { TRUSTED_PROXY_HOPS: '2' })).toBe('203.0.113.9');
    expect(trustedClientIp(xff('8.8.8.8, 7.7.7.7, 203.0.113.9, 35.191.0.7'), { TRUSTED_PROXY_HOPS: '2' })).toBe('203.0.113.9');
  });

  it('a list shorter than the trusted chain did not come through it: no address', () => {
    expect(trustedClientIp(xff('203.0.113.9'), { TRUSTED_PROXY_HOPS: '2' })).toBeNull();
    expect(trustedClientIp(new Headers(), { TRUSTED_PROXY_HOPS: '1' })).toBeNull();
  });

  it('the slot must hold an address; anything else gives none', () => {
    expect(trustedClientIp(xff('1.1.1.1, not-an-ip'), { TRUSTED_PROXY_HOPS: '1' })).toBeNull();
    expect(trustedClientIp(xff('1.1.1.1, 203.0.113.9:443'), { TRUSTED_PROXY_HOPS: '1' })).toBeNull();
    expect(trustedClientIp(xff('2001:DB8::1'), { TRUSTED_PROXY_HOPS: '1' })).toBe('2001:db8::1');
  });

  it('X-Real-IP is the client\'s to write too, and is never read', () => {
    expect(trustedClientIp(new Headers({ 'x-real-ip': '203.0.113.9' }), { TRUSTED_PROXY_HOPS: '1' })).toBeNull();
  });

  it('the hop count is a whole number from 1 to 10, or nothing', () => {
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: '2' })).toBe(2);
    for (const bad of ['', '0', '11', '-1', '1.5', 'two', ' ']) expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: bad })).toBeNull();
  });
});
