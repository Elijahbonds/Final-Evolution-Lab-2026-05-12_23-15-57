// SECURITY-REVIEW S-01: the in-memory limiter's client key cannot be chosen by the client once the deploy names its
// trusted proxies. clientKeyFromHeaders (lib/rate-limit.ts) keyed signup, the invite / group code lookups, mp create and
// join, the book routes and the card route on the FIRST X-Forwarded-For entry — the client's own claim — so a new
// made-up address per request skipped every one of those limits.
import { afterEach, describe, expect, it } from 'vitest';
import { clientKeyFromHeaders, rateLimit, resetRateLimitMemory } from '@/lib/rate-limit';

const h = (xff?: string, real?: string) => new Headers({ ...(xff ? { 'x-forwarded-for': xff } : {}), ...(real ? { 'x-real-ip': real } : {}) });

describe('clientKeyFromHeaders (S-01)', () => {
  afterEach(() => { delete process.env.TRUSTED_PROXY_HOPS; resetRateLimitMemory(); });

  it('with TRUSTED_PROXY_HOPS=1 the key is the address the proxy appended, not the client-written first entry', () => {
    process.env.TRUSTED_PROXY_HOPS = '1';
    expect(clientKeyFromHeaders(h('6.6.6.6, 203.0.113.7'))).toBe('203.0.113.7');
    expect(clientKeyFromHeaders(h('1.1.1.1, 2.2.2.2, 203.0.113.7'))).toBe('203.0.113.7');
  });

  it('with TRUSTED_PROXY_HOPS=2 the key is the second address from the right', () => {
    process.env.TRUSTED_PROXY_HOPS = '2';
    expect(clientKeyFromHeaders(h('6.6.6.6, 198.51.100.4, 10.0.0.1'))).toBe('198.51.100.4');
  });

  it('a spoofer rotating the first entry stays in ONE bucket and is refused at the limit', () => {
    process.env.TRUSTED_PROXY_HOPS = '1';
    const results = Array.from({ length: 7 }, (_, i) => rateLimit(`signup:${clientKeyFromHeaders(h(`9.9.9.${i}, 203.0.113.7`))}`, 5, 60_000).ok);
    expect(results).toEqual([true, true, true, true, true, false, false]);
  });

  it('trusted proxies named but no usable address: one shared "unknown" bucket, never the client claim', () => {
    process.env.TRUSTED_PROXY_HOPS = '2';
    expect(clientKeyFromHeaders(h('6.6.6.6'))).toBe('unknown');
    expect(clientKeyFromHeaders(h('not-an-ip, also-not'))).toBe('unknown');
  });

  it('unset (today’s deploy): unchanged — the first entry, else x-real-ip, else "unknown"', () => {
    expect(clientKeyFromHeaders(h('6.6.6.6, 203.0.113.7'))).toBe('6.6.6.6');
    expect(clientKeyFromHeaders(h(undefined, '198.51.100.9'))).toBe('198.51.100.9');
    expect(clientKeyFromHeaders(h())).toBe('unknown');
  });
});
