// ONB-04 end to end: a visit with ?utm_source=x&ref=CODE is kept on the browser, posted with the sign-up through the REAL
// signup route, lands on the server's own signup_complete event, and shows up attached to that sign-up (and its first
// purchase) in the funnel's count. Over the in-memory Prisma slice the referral tests use (tests/helpers/challengeDb.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { challengeDb, type ChallengeDb } from '@/tests/helpers/challengeDb';

const h = vi.hoisted(() => ({
  db: null as unknown as ChallengeDb,
  cookies: {} as Record<string, string>,
  events: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : (h.db as any)[p as string]) }) }));
vi.mock('next-auth', () => ({ getServerSession: async () => null }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (name in h.cookies ? { name, value: h.cookies[name] } : undefined),
    set: (name: string, value: string) => { h.cookies[name] = value; },
  }),
}));
vi.mock('@/lib/analytics-server', () => ({
  recordServerEvent: async (e: Record<string, unknown>) => { h.events.push(e); },
  recordServerEvents: async () => 0,
}));
vi.mock('@/lib/ledger', () => ({ postLc: async () => ({ creditLedgerId: 'cl', transactionId: 'tx' }) }));
vi.mock('@/lib/marketing/email', () => ({ sendWelcomeEmail: () => {}, sendReferralRewardEmail: () => {} }));
vi.mock('bcryptjs', () => ({ default: { hash: async () => 'hashed' } }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ ok: true, retryAfterSec: 0 }), clientKeyFromHeaders: () => '203.0.113.9' }));

import { POST as signupPOST } from '@/app/api/signup/route';
import { attributionReport, captureFirstTouch, readFirstTouch, signupAttribution } from '@/lib/marketing/utm';
import { readAttribution } from '@/lib/marketing/attributionRead';

const ADULT = new Date().getFullYear() - 30;
const post = (body: unknown) => new Request('http://fel.test/api/signup', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' }, body: JSON.stringify(body) });

beforeEach(() => {
  h.db = challengeDb();
  h.cookies = {}; h.events = [];
  vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-onb-04');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('ONB-04: ?utm_source=x&ref=CODE reaches the funnel, attached to the sign-up', () => {
  it('first page view → kept → posted with the sign-up → on signup_complete → counted, with the first purchase', async () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
    captureFirstTouch('?utm_source=x&ref=CODE', store);
    captureFirstTouch('/signup', store); // the next page carries nothing; the first touch stays
    const utm = signupAttribution(readFirstTouch(store));
    const res = await signupPOST(post({ email: 'new@fel.test', password: 'secret12', name: 'New', birthYear: ADULT, utm }));
    expect(res.status).toBe(200);
    const user = h.db.tables.user.find((u) => u.email === 'new@fel.test')!;
    const ev = h.events.find((e) => e.name === 'signup_complete')!;
    expect(ev.userId).toBe(user.id);
    expect(ev.props).toMatchObject({ utmSource: 'x', utmRef: 'CODE' });

    // the funnel: the page's reads over the same rows, and the report it draws
    const fakeDb = {
      analyticsEvent: { findMany: async (a: { where: { name: string } }) => h.events.filter((e) => e.name === a.where.name).map((e) => ({ userId: e.userId as string, props: e.props })) },
      order: { findMany: async () => [{ userId: user.id, amount: 1299, createdAt: new Date() }] },
    };
    const reads = await readAttribution(fakeDb);
    const [line] = attributionReport(reads.signups, reads.orders);
    expect(line).toMatchObject({ source: 'x', ref: 'CODE', signups: 1, purchasers: 1, firstPurchaseCents: 1299 });
  });

  it('a sign-up with no tags, or junk in place of them, still signs up and carries nothing', async () => {
    expect((await signupPOST(post({ email: 'a@fel.test', password: 'secret12', name: 'A', birthYear: ADULT }))).status).toBe(200);
    expect((await signupPOST(post({ email: 'b@fel.test', password: 'secret12', name: 'B', birthYear: ADULT, utm: { source: 'me@x.com', ref: 'way-too-long-ref-code-here' } }))).status).toBe(200);
    expect((await signupPOST(post({ email: 'c@fel.test', password: 'secret12', name: 'C', birthYear: ADULT, utm: 'nonsense' }))).status).toBe(200);
    for (const e of h.events.filter((x) => x.name === 'signup_complete')) {
      expect(Object.keys(e.props as object).filter((k) => k.startsWith('utm'))).toEqual([]);
    }
  });

  it('the funnel read fails soft: a broken table is an empty count, not a 500', async () => {
    const broken = { analyticsEvent: { findMany: async () => { throw new Error('down'); } }, order: { findMany: async () => { throw new Error('down'); } } };
    expect(await readAttribution(broken)).toEqual({ signups: [], orders: [], firstWins: [] });
  });
});

// ── no ad pixels: nothing this lane added loads a third-party script or names a tracker ────────────────────────────
const ROOT = join(__dirname, '..', '..');
function files(dir: string): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return [dir];
  return readdirSync(abs).flatMap((n) => files(join(dir, n))).filter((f) => /\.(t|j)sx?$/.test(f));
}
const SCANNED = [
  'app/layout.tsx', 'app/page.tsx', 'app/welcome', 'app/admin/funnel/page.tsx', 'app/api/signup/route.ts',
  'app/press/page.tsx', 'app/media-kit/page.tsx', 'app/team/page.tsx', 'app/work-with-us/page.tsx',
  'components/onboarding', 'components/social-proof', 'components/public-copy', 'components/auth-form.tsx',
  'lib/onboarding', 'lib/marketing/utm.ts', 'lib/marketing/attributionRead.ts', 'lib/analytics.ts',
].flatMap(files).filter((f) => !/\.test\.tsx?$/.test(f));
const TRACKERS = /googletagmanager|google-analytics|gtag\(|fbq\(|connect\.facebook\.net|facebook\.com\/tr|tiktok|snap\.licdn|ads\.linkedin|doubleclick|hotjar|segment\.(com|io)|mixpanel|amplitude\.com|clarity\.ms|plausible\.io|posthog/i;

describe('ONB-04: no ad pixels, no third-party script', () => {
  it('scans every file of the first run', () => {
    expect(SCANNED.length).toBeGreaterThan(15);
    for (const f of SCANNED) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      expect(src, f).not.toMatch(TRACKERS);
      expect(src, f).not.toMatch(/from ['"]next\/script['"]|<script\b/);
      expect(src, f).not.toMatch(/https?:\/\/(?!localhost)[a-z0-9.-]+\.[a-z]{2,}\/[^'"`\s]*\.js\b/i);
    }
  });

  it('the capture writes first-party storage only: no cookie, no request', () => {
    const src = readFileSync(join(ROOT, 'components/onboarding/attribution-capture.tsx'), 'utf8');
    expect(src).not.toMatch(/document\.cookie|fetch\(|sendBeacon|XMLHttpRequest|new Image\(/);
  });
});
