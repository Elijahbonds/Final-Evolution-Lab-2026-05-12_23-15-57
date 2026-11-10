// SELLER-18-1 v3 (Cyber re-review N1 / C1): a client can never write the seller takedown's review record through
// POST /api/analytics, so a signed-in seller can't forge the "already held" marker ('frozen') that would make the
// takedown skip the Stripe payout freeze. Real route, real analytics writer (lib/analytics-server.ts), real gate and
// takedown, over one fake database; plus a source scan that no other client-writable path can name that event.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const YEAR = new Date().getFullYear();

const h = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  events: [] as Array<{ name: string; userId: string | null; guestId: string | null; props: unknown }>,
  writeCalls: 0,
  stripeUpdates: [] as string[],
  instructors: [] as Array<{ userId: string; published: boolean }>,
}));

vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }));
vi.mock('@/lib/stripe', () => ({ getStripe: () => ({ accounts: { update: async (id: string) => { h.stripeUpdates.push(id); return {}; } } }), STRIPE_PRODUCTS: {}, PLATFORM_TAKE_RATE: 0.15 }));
vi.mock('@/lib/db', () => ({
  prisma: {
    analyticsEvent: {
      createMany: async ({ data }: { data: Array<{ name: string; userId: string | null; guestId: string | null; props: unknown }> }) => {
        h.writeCalls++;
        for (const r of data) h.events.push({ name: r.name, userId: r.userId, guestId: r.guestId, props: r.props });
        return { count: data.length };
      },
      create: async ({ data }: { data: { name: string; userId: string; props: unknown } }) => { h.events.push({ name: data.name, userId: data.userId, guestId: null, props: data.props }); return {}; },
      findFirst: async ({ where }: { where: { name: string; userId: string } }) => {
        const rows = h.events.filter((e) => e.name === where.name && e.userId === where.userId);
        return rows.length ? { props: rows[rows.length - 1].props } : null;
      },
    },
    user: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === 'teen' ? { dobYear: YEAR - 15 } : null) },
    facilitatorProfile: { findUnique: async () => null },
    instructor: {
      findUnique: async () => null,
      count: async ({ where }: { where: { userId: string; published?: boolean } }) => h.instructors.filter((i) => i.userId === where.userId && (where.published === undefined || i.published === where.published)).length,
      updateMany: async ({ where }: { where: { userId: string } }) => { let n = 0; for (const i of h.instructors) if (i.userId === where.userId && i.published) { i.published = false; n++; } return { count: n }; },
    },
    marketplaceListing: { count: async () => 0, updateMany: async () => ({ count: 0 }) },
    $queryRawUnsafe: async (sql: string, ...args: unknown[]) => (sql.includes('"CoachConnectAccount"') && args[0] === 'teen'
      ? [{ ok: 1, userId: 'teen', stripeAccountId: 'acct_teen', livemode: false, chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true }]
      : []),
  },
}));

import { POST as analyticsPost } from '@/app/api/analytics/route';
import { isServerOnlyEventName, SELLER_REVIEW_EVENT as RESERVED, SERVER_ONLY_EVENT_NAMES } from '@/lib/analyticsReserved';
import { canSell, SELLER_REVIEW_EVENT } from '@/lib/seller/server';

const post = (events: unknown[]) => analyticsPost(new Request('https://fel.test/api/analytics', { method: 'POST', body: JSON.stringify({ events }) }));
const FORGED = { payouts: 'frozen', status: 'open', coachPages: 0, listings: 0 };

const saved = process.env.SELLER_ADULT_GATE_ENABLED;
beforeEach(() => {
  h.session = { user: { id: 'teen' } };
  h.events = []; h.writeCalls = 0; h.stripeUpdates = [];
  h.instructors = [{ userId: 'teen', published: true }];
  process.env.SELLER_ADULT_GATE_ENABLED = '1';
  return () => { if (saved === undefined) delete process.env.SELLER_ADULT_GATE_ENABLED; else process.env.SELLER_ADULT_GATE_ENABLED = saved; };
});

describe('POST /api/analytics drops the server-only review record', () => {
  it('the reserved name is the seller gate\'s own record name', () => {
    expect(SELLER_REVIEW_EVENT).toBe('seller_age_review');
    expect(RESERVED).toBe(SELLER_REVIEW_EVENT);
    expect(SERVER_ONLY_EVENT_NAMES.has(SELLER_REVIEW_EVENT)).toBe(true);
  });

  it('a signed-in user\'s forged seller_age_review row is dropped (any casing/spacing); the rest of the batch is kept', async () => {
    const r = await post([
      { name: 'seller_age_review', props: FORGED },
      { name: ' Seller_Age_Review ', props: FORGED },
      { name: 'SELLER_AGE_REVIEW', props: FORGED },
      { name: 'session_start', props: { mode: 'dunk' } },
    ]);
    expect(r.status).toBe(204);
    expect(h.events.map((e) => e.name)).toEqual(['session_start']);
  });

  it('a batch of only reserved names writes nothing at all; a guest is dropped the same way', async () => {
    await post([{ name: 'seller_age_review', props: FORGED }]);
    h.session = null;
    await post([{ name: 'seller_age_review', props: FORGED }]);
    expect(h.writeCalls).toBe(0);
    expect(h.events).toEqual([]);
  });

  it('isServerOnlyEventName: the reserved name only, never a near miss or a non-string', () => {
    for (const n of ['seller_age_review', 'SELLER_AGE_REVIEW', '  seller_age_review\t']) expect(isServerOnlyEventName(n), n).toBe(true);
    for (const n of ['seller_age_reviews', 'seller-age-review', 'session_start', '', null, undefined, 42]) expect(isServerOnlyEventName(n), String(n)).toBe(false);
  });
});

describe('the forgery no longer skips the payout freeze', () => {
  it('a teen seller posts a forged "frozen" record, then is refused: the takedown still freezes payouts at Stripe', async () => {
    await post([{ name: SELLER_REVIEW_EVENT, props: FORGED }]);
    expect(await canSell('teen', 'coach_business')).toBe('under_18');
    expect(h.stripeUpdates).toEqual(['acct_teen']);
    expect(h.instructors[0].published).toBe(false);
    const records = h.events.filter((e) => e.name === SELLER_REVIEW_EVENT);
    expect(records).toHaveLength(1);   // only the server's own record
    expect(records[0].props).toMatchObject({ payouts: 'frozen', coachPages: 1 });
  });

  it('after the server\'s real record, a forged later row can\'t take its place as the newest marker', async () => {
    await canSell('teen', 'coach_business');
    await post([{ name: SELLER_REVIEW_EVENT, props: { ...FORGED, payouts: 'no_account' } }]);
    expect(h.events.filter((e) => e.name === SELLER_REVIEW_EVENT)).toHaveLength(1);
  });
});

describe('no other client-writable path can create the record', () => {
  const ROOT = process.cwd();
  function files(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
      if (e.startsWith('.') || e === 'node_modules' || e === 'generated') continue;
      const p = join(dir, e);
      if (statSync(p).isDirectory()) files(p, out);
      else if (/\.(tsx?|mts|mjs|jsx?)$/.test(p) && !/\.(test|spec)\./.test(p) && !/\.d\.ts$/.test(p)) out.push(p.slice(ROOT.length + 1));
    }
    return out;
  }
  const SRC = ['app', 'lib', 'components', 'server'].flatMap((d) => { try { return files(join(ROOT, d)); } catch { return []; } });
  const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');

  it('as an event name the string is spelled out only in lib/analyticsReserved.ts (the other code use is the Stripe hold note)', () => {
    const uses: string[] = [];
    for (const f of SRC) {
      read(f).split('\n').forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;   // comments (the SQL to read the queue) are not code
        if (/['"`]seller_age_review['"`]/.test(line)) uses.push(`${f}: ${line.trim()}`);
      });
    }
    expect(uses).toEqual([
      "lib/analyticsReserved.ts: export const SELLER_REVIEW_EVENT = 'seller_age_review';",
      "lib/seller/takedown.ts: export const PAYOUT_HOLD_META = { fel_payout_hold: 'seller_age_review' } as const;",
    ]);
  });

  it('the batch writer (recordServerEvents, the only one taking client names) is called only by /api/analytics, which filters', () => {
    const callers = SRC.filter((f) => f !== 'lib/analytics-server.ts' && /recordServerEvents\s*\(/.test(read(f)));
    expect(callers).toEqual(['app/api/analytics/route.ts']);
    expect(read('app/api/analytics/route.ts')).toMatch(/filter\(\(e\) => !isServerOnlyEventName\(e\.name\)\)/);
  });

  it('every other analytics write names its event with a fixed string literal (no request-supplied name)', () => {
    const bad: string[] = [];
    for (const f of SRC) {
      const src = read(f);
      for (const m of src.matchAll(/(recordServerEvent\s*\(\s*\{|analyticsEvent\.create\s*\(\s*\{\s*data:\s*\{)([\s\S]{0,200})/g)) {
        if (f === 'lib/analytics-server.ts' || f === 'lib/seller/server.ts') continue;
        if (!/^\s*name:\s*'[a-z0-9_]+'/.test(m[2])) bad.push(`${f}: ${m[2].slice(0, 60)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
