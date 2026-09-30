// AGE-SCREEN: the block cookie is a constant. Two people, a day apart, get the same bytes. No Expires, no year, no id.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ prisma: null as any, cookie: null as string | null }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : h.prisma[p]) }) }));
vi.mock('next/headers', () => ({
  cookies: () => ({ get: (name: string) => (h.cookie && name === 'fel_age_gate' ? { name, value: h.cookie } : undefined) }),
}));
vi.mock('bcryptjs', () => ({ default: { hash: async () => 'hashed' } }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ ok: true, retryAfterSec: 0 }), clientKeyFromHeaders: () => '203.0.113.9' }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: async () => {} }));
vi.mock('@/lib/marketing/email', () => ({ sendWelcomeEmail: () => {} }));
vi.mock('@/lib/marketing/referral', () => ({ convertReferralOnSignup: async () => {} }));
vi.mock('@/lib/wallet/wallet-service', () => ({ applyLc: async () => ({ balanceAfter: 500 }) }));

import { POST } from '@/app/api/signup/route';
import { AGE_BLOCK_STORAGE_KEY, AGE_BLOCK_VALUE, ageBlockCookieHeader } from './ageScreen';
import { writeAgeBlockFlag } from '@/components/age-step';
import { newSpyDb, spyPrisma } from '@/tests/helpers/writeSpyDb';

const THIS_YEAR = new Date().getFullYear();

async function blocked(email: string) {
  const req = new Request('http://fel.test/api/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify({ email, password: 'secret1', name: 'A', birthYear: THIS_YEAR - 12 }),
  });
  const res = await POST(req);
  return { status: res.status, cookie: res.headers.get('set-cookie') };
}

describe('age block cookie', () => {
  beforeEach(() => {
    h.cookie = null;
    h.prisma = spyPrisma(newSpyDb());
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('takes no arguments and returns the constant header, plus Secure in production', () => {
    expect(ageBlockCookieHeader.length).toBe(0);
    expect(ageBlockCookieHeader()).toBe('fel_age_gate=1; Max-Age=31536000; Path=/; SameSite=Lax');
    vi.stubEnv('NODE_ENV', 'production');
    expect(ageBlockCookieHeader()).toBe('fel_age_gate=1; Max-Age=31536000; Path=/; SameSite=Lax; Secure');
  });

  it('Set-Cookie headers for different people a day apart are byte-identical and carry no Expires, year, id or email', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
    const a = await blocked('one@fel.test');
    vi.setSystemTime(new Date('2026-09-02T12:00:00Z'));
    const b = await blocked('two@fel.test');
    expect(a.status).toBe(403);
    expect(b.status).toBe(403);
    expect(a.cookie).toBe(b.cookie);
    expect(a.cookie).toBe('fel_age_gate=1; Max-Age=31536000; Path=/; SameSite=Lax');
    const raw = String(a.cookie);
    expect(raw).not.toMatch(/Expires/i);
    expect(raw).not.toContain('one@fel.test');
    expect(raw).not.toContain('two@fel.test');
    expect(raw).not.toContain(String(THIS_YEAR - 12));
    expect(raw).not.toContain('2026');
  });

  it('writes localStorage exactly "1"', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      setItem: (key: string, value: string) => { store.set(key, value); },
      getItem: (key: string) => store.get(key) ?? null,
    });
    vi.stubGlobal('document', { cookie: '' });
    writeAgeBlockFlag();
    expect(AGE_BLOCK_VALUE).toBe('1');
    expect(store.get(AGE_BLOCK_STORAGE_KEY)).toBe('1');
  });
});
