// SELLER-18-1 v2 — Cyber F1 and F6 through the real routes and the real live wiring (lib/seller/server.ts), over a fake
// database that keeps state (coach pages, listings, Connect/market-profile/package rows, AnalyticsEvent rows) and a
// fake Stripe that counts writes. SELLER_ADULT_GATE_ENABLED is on here.
//   F1: only an account with seller rows is taken down; the age refusal is for everyone; it runs once.
//   F6: the takedown leaves a durable review record (an AnalyticsEvent row), not a log line.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const YEAR = new Date().getFullYear();

type Listing = { id: string; creatorId: string; active: boolean; listingType: string };
type Where = Record<string, unknown>;

const h = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  users: {} as Record<string, number | null>,
  camp: [] as string[],
  connect: {} as Record<string, string>,
  marketProfiles: [] as string[],
  packages: [] as string[],
  instructors: [] as Array<{ userId: string; published: boolean }>,
  listings: [] as Listing[],
  events: [] as Array<{ name: string; userId: string | null; props: Record<string, unknown>; createdAt: Date }>,
  eventWriteFails: false,
  stripeUpdates: [] as Array<{ id: string; params: Record<string, unknown> }>,
  stripeFails: false,
  writes: [] as string[],
}));

const listingMatch = (l: Listing, w: Where) =>
  (w.creatorId === undefined || l.creatorId === w.creatorId)
  && (w.active === undefined || l.active === w.active)
  && (w.listingType === undefined || (typeof w.listingType === 'string' ? l.listingType === w.listingType : l.listingType !== (w.listingType as { not: string }).not));
const instructorMatch = (i: { userId: string; published: boolean }, w: Where) =>
  i.userId === w.userId && (w.published === undefined || i.published === w.published);

vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ ok: true, retryAfterSec: 0 }), clientKeyFromHeaders: () => 'k' }));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    accounts: {
      update: async (id: string, params: Record<string, unknown>) => {
        if (h.stripeFails) throw new Error('stripe down');
        h.stripeUpdates.push({ id, params });
        return {};
      },
    },
  }),
  STRIPE_PRODUCTS: {},
  PLATFORM_TAKE_RATE: 0.15,
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: async ({ where }: { where: { id: string } }) => (where.id in h.users ? { dobYear: h.users[where.id], email: `${where.id}@x.test` } : null) },
    facilitatorProfile: { findUnique: async ({ where }: { where: { userId: string } }) => (h.camp.includes(where.userId) ? { certificationStatus: 'certified' } : null) },
    instructor: {
      findUnique: async () => null,
      count: async ({ where }: { where: Where }) => h.instructors.filter((i) => instructorMatch(i, where)).length,
      updateMany: async ({ where, data }: { where: Where; data: { published: boolean } }) => {
        const hit = h.instructors.filter((i) => instructorMatch(i, where));
        for (const i of hit) i.published = data.published;
        if (hit.length) h.writes.push(`instructor:${String(where.userId)}`);
        return { count: hit.length };
      },
    },
    marketplaceListing: {
      findUnique: async () => null,
      update: async () => ({}),
      count: async ({ where }: { where: Where }) => h.listings.filter((l) => listingMatch(l, where)).length,
      updateMany: async ({ where, data }: { where: Where; data: { active: boolean } }) => {
        const hit = h.listings.filter((l) => listingMatch(l, where));
        for (const l of hit) l.active = data.active;
        if (hit.length) h.writes.push(`listings:${String(where.creatorId)}`);
        return { count: hit.length };
      },
    },
    analyticsEvent: {
      findFirst: async ({ where }: { where: { name: string; userId: string } }) => {
        const rows = h.events.filter((e) => e.name === where.name && e.userId === where.userId);
        return rows.length ? { props: rows[rows.length - 1].props } : null;
      },
      create: async ({ data }: { data: { name: string; userId: string; props: Record<string, unknown> } }) => {
        if (h.eventWriteFails) throw new Error('db down');
        h.events.push({ name: data.name, userId: data.userId, props: data.props, createdAt: new Date() });
        return {};
      },
    },
    cellApiKey: { count: async () => 1 },
    subscription: { findFirst: async () => null, findMany: async () => [] },
    $queryRawUnsafe: async (sql: string, ...args: unknown[]) => {
      const id = String(args[0]);
      if (sql.includes('FROM "CoachConnectAccount" WHERE "userId"')) {
        return h.connect[id] ? [{ ok: 1, userId: id, stripeAccountId: h.connect[id], livemode: false, chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true }] : [];
      }
      if (sql.includes('FROM "CoachMarketProfile" WHERE "userId"')) return h.marketProfiles.includes(id) ? [{ ok: 1 }] : [];
      if (sql.includes('FROM "CoachPackage" WHERE "coachId"')) return h.packages.includes(id) ? [{ ok: 1 }] : [];
      return [];
    },
    $executeRawUnsafe: async () => 0,
  },
}));

import { GET as connectGet } from '@/app/api/coach/business/connect/route';
import { POST as cartridgePost } from '@/app/api/studio/cartridges/route';
import { POST as storeSettings } from '@/app/api/coach-store/settings/route';
import { liveDeps } from '@/lib/coach-business/server';
import { resetBusinessProbe } from '@/lib/coach-business/store';
import { SELLER_REVIEW_EVENT, sellerRowsFor } from '@/lib/seller/server';
import { reviewRef } from '@/lib/seller/takedown';

const TEEN = 'v2-teen';
const STUDIO_TEEN = 'v2-studio-teen';
const UNKNOWN = 'v2-unknown';
const CAMP_TEEN = 'v2-camp-teen';
const ADULT = 'v2-adult';

const as = (id: string) => { h.session = { user: { id } }; };
const json = (body: unknown = {}) => new Request('https://fel.test/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const reviews = (id: string) => h.events.filter((e) => e.name === SELLER_REVIEW_EVENT && e.userId === id);

const ENV_KEYS = ['COACH_STORE_ENABLED', 'COACH_STORE_COACH_USER_IDS', 'COACH_CONNECT_PAYMENTS_ENABLED', 'STRIPE_SECRET_KEY', 'NEXTAUTH_URL', 'STUDIO_CREATOR_ENABLED', 'SELLER_ADULT_GATE_ENABLED'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) { if (!(k in saved)) saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, {
    COACH_STORE_ENABLED: '1', COACH_STORE_COACH_USER_IDS: [TEEN, UNKNOWN].join(','),
    COACH_CONNECT_PAYMENTS_ENABLED: '1', STRIPE_SECRET_KEY: 'sk_test_v2', NEXTAUTH_URL: 'https://fel.test',
    STUDIO_CREATOR_ENABLED: '1', SELLER_ADULT_GATE_ENABLED: '1',
  });
  h.users = { [TEEN]: YEAR - 15, [STUDIO_TEEN]: YEAR - 14, [UNKNOWN]: null, [CAMP_TEEN]: YEAR - 15, [ADULT]: 1990 };
  h.camp = [CAMP_TEEN];
  h.connect = {}; h.marketProfiles = []; h.packages = [];
  h.instructors = []; h.listings = []; h.events = []; h.stripeUpdates = []; h.writes = [];
  h.eventWriteFails = false; h.stripeFails = false;
  h.session = null;
  resetBusinessProbe();
  return () => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } };
});

async function body(r: Response) { return (await r.json()) as Record<string, unknown>; }

describe('F1: a teen with no seller rows is refused and nothing of theirs is touched', () => {
  it('a teen with only Studio cartridges opens /coach/business (the connect GET): 403 under_18, cartridges stay up, no Stripe, no record', async () => {
    h.listings = [{ id: 'c1', creatorId: STUDIO_TEEN, active: true, listingType: 'CARTRIDGE' }, { id: 'c2', creatorId: STUDIO_TEEN, active: true, listingType: 'CARTRIDGE' }];
    as(STUDIO_TEEN);
    const r = await connectGet();
    expect(r.status).toBe(403);
    expect(await body(r)).toMatchObject({ error: 'adults_only', reason: 'under_18' });
    expect(h.listings.every((l) => l.active)).toBe(true);
    expect(h.writes).toEqual([]);
    expect(h.stripeUpdates).toEqual([]);
    expect(h.events).toEqual([]);
  });

  it('a Camp-certified teen with the store role but no coach page, Connect account or listing: refused, nothing written', async () => {
    process.env.COACH_STORE_COACH_USER_IDS = '';
    as(CAMP_TEEN);
    const r = await storeSettings(json({ businessMailingAddress: 'PO Box 1' }) as never);
    expect(r.status).toBe(404);
    expect(h.writes).toEqual([]);
    expect(h.stripeUpdates).toEqual([]);
    expect(h.events).toEqual([]);
  });

  it('unknown age with seller rows: refused (age_unknown), and still nothing is taken down', async () => {
    h.connect = { [UNKNOWN]: 'acct_unknown' }; h.packages = [UNKNOWN];
    h.instructors = [{ userId: UNKNOWN, published: true }];
    as(UNKNOWN);
    expect(await body(await connectGet())).toMatchObject({ error: 'adults_only', reason: 'age_unknown' });
    expect(h.writes).toEqual([]);
    expect(h.stripeUpdates).toEqual([]);
    expect(h.events).toEqual([]);
  });

  it('the seller rows per surface (sellerRowsFor): coach business = Connect / market profile / package; Studio = an active cartridge', async () => {
    h.listings = [{ id: 'c1', creatorId: STUDIO_TEEN, active: true, listingType: 'CARTRIDGE' }, { id: 'c0', creatorId: 'old', active: false, listingType: 'CARTRIDGE' }];
    h.marketProfiles = ['mp']; h.packages = ['pk']; h.connect = { cn: 'acct_cn' };
    for (const id of ['mp', 'pk', 'cn']) expect(await sellerRowsFor('coach_business')(id), id).toBe(true);
    expect(await sellerRowsFor('coach_business')(STUDIO_TEEN)).toBe(false);   // cartridges are not coach-business rows
    expect(await sellerRowsFor('studio')(STUDIO_TEEN)).toBe(true);
    expect(await sellerRowsFor('studio')('old')).toBe(false);                 // an inactive cartridge is not selling
    expect(await sellerRowsFor('studio')('mp')).toBe(false);
    h.instructors = [{ userId: 'page', published: false }];
    expect(await sellerRowsFor('coach_store')('page')).toBe(true);
    expect(await sellerRowsFor('coach_store')('cn')).toBe(true);
    expect(await sellerRowsFor('coach_store')(STUDIO_TEEN)).toBe(false);      // a cartridge is not a store listing
    expect(await sellerRowsFor('group_booking')('cn')).toBe(true);
    expect(await sellerRowsFor('group_booking')('pk')).toBe(false);
  });
});

describe('F1: a teen who really sells is taken down once', () => {
  beforeEach(() => {
    h.connect = { [TEEN]: 'acct_teen' }; h.packages = [TEEN];
    h.instructors = [{ userId: TEEN, published: true }];
    h.listings = [{ id: 's1', creatorId: TEEN, active: true, listingType: 'COACH_STORE' }];
  });

  it('the first refusal takes everything down, freezes payouts (one Stripe write) and stores one review record', async () => {
    as(TEEN);
    expect((await connectGet()).status).toBe(403);
    expect(h.instructors[0].published).toBe(false);
    expect(h.listings[0].active).toBe(false);
    expect(h.stripeUpdates).toEqual([{ id: 'acct_teen', params: { settings: { payouts: { schedule: { interval: 'manual' } } }, metadata: { fel_payout_hold: 'seller_age_review' } } }]);
    expect(reviews(TEEN)).toHaveLength(1);
  });

  it('a second refusal, and buyers starting checkouts against this coach, write nothing and call Stripe no more', async () => {
    as(TEEN);
    await connectGet();
    const writesAfterFirst = h.writes.length;
    expect((await connectGet()).status).toBe(403);
    expect((await storeSettings(json({ businessMailingAddress: 'PO Box 1' }) as never)).status).toBe(404);
    const d = liveDeps();
    for (let i = 0; i < 3; i++) expect(await d.sellerOk(TEEN)).toBe(false);   // the package checkout's seller check, buyer-driven
    expect(h.writes.length).toBe(writesAfterFirst);
    expect(h.stripeUpdates).toHaveLength(1);
    expect(reviews(TEEN)).toHaveLength(1);
  });

  it('re-published after the hold: it comes down again on the next refusal, with no second Stripe write', async () => {
    as(TEEN);
    await connectGet();
    h.instructors[0].published = true;
    await connectGet();
    expect(h.instructors[0].published).toBe(false);
    expect(h.stripeUpdates).toHaveLength(1);
    expect(reviews(TEEN)).toHaveLength(2);
    expect(reviews(TEEN)[1].props).toMatchObject({ coachPages: 1, listings: 0, payouts: 'frozen' });
  });

  it('the Stripe freeze failed the first time: the next refusal tries Stripe again', async () => {
    as(TEEN);
    h.stripeFails = true;
    await connectGet();
    expect(reviews(TEEN)[0].props).toMatchObject({ payouts: 'failed' });
    h.stripeFails = false;
    await connectGet();
    expect(h.stripeUpdates).toHaveLength(1);
    expect(reviews(TEEN)[1].props).toMatchObject({ payouts: 'frozen' });
  });

  it('a teen whose only selling is Studio cartridges is taken down from the Studio publish route', async () => {
    h.listings = [{ id: 'c1', creatorId: STUDIO_TEEN, active: true, listingType: 'CARTRIDGE' }];
    as(STUDIO_TEEN);
    expect((await cartridgePost(json({}) as never)).status).toBe(403);
    expect(h.listings[0].active).toBe(false);
    expect(h.stripeUpdates).toEqual([]);
    expect(reviews(STUDIO_TEEN)).toHaveLength(1);
    expect(reviews(STUDIO_TEEN)[0].props).toMatchObject({ listings: 1, payouts: 'no_account' });
    expect((await cartridgePost(json({}) as never)).status).toBe(403);   // and once only
    expect(reviews(STUDIO_TEEN)).toHaveLength(1);
  });
});

describe('F6: the durable review record', () => {
  beforeEach(() => {
    h.connect = { [TEEN]: 'acct_teen' };
    h.instructors = [{ userId: TEEN, published: true }];
  });

  it('one AnalyticsEvent row named seller_age_review: the account, an open status, the counts and the payout state — no email, no birth year', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    as(TEEN);
    await connectGet();
    expect(reviews(TEEN)).toHaveLength(1);
    const props = reviews(TEEN)[0].props;
    expect(props).toEqual({ status: 'open', ref: reviewRef(TEEN), coachPages: 1, listings: 0, payouts: 'frozen' });
    expect(JSON.stringify(props)).not.toMatch(/@x\.test|dobYear|email/);
    expect(JSON.stringify(props)).not.toContain(String(YEAR - 15));
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('[seller-gate]'))).toEqual([]);   // no log line when stored
    warn.mockRestore();
  });

  it('the record cannot be written: the gate still refuses, the takedown still happens, and the log line is the fallback', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    h.eventWriteFails = true;
    as(TEEN);
    expect((await connectGet()).status).toBe(403);
    expect(h.instructors[0].published).toBe(false);
    const lines = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('[seller-gate]'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(`ref=${reviewRef(TEEN)}`);
    expect(lines[0]).not.toContain(TEEN);
    warn.mockRestore();
  });

  it('an adult seller never gets a record', async () => {
    h.connect = { [ADULT]: 'acct_adult' };
    as(ADULT);
    await connectGet().catch(() => null);
    expect(h.events).toEqual([]);
    expect(h.stripeUpdates).toEqual([]);
  });
});
