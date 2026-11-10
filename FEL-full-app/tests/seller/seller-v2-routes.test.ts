// SELLER-18-1 v2 — Cyber F5 route tests, the SELLER_ADULT_GATE_ENABLED setting both ways, the birth-year prompt, and
// group booking (PM 2026-11-09). Real routes, pages and gate; fake session, database and Stripe (every Stripe touch is
// recorded, so "refused before Stripe" is checked, not assumed).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactNode } from 'react';

const YEAR = new Date().getFullYear();

const h = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  users: {} as Record<string, number | null>,
  camp: [] as string[],
  connect: {} as Record<string, string>,
  stripeTouched: [] as string[],
  bookingUpdates: [] as unknown[],
  instructorUpdates: [] as unknown[],
  listingUpdates: [] as unknown[],
  priceUpdates: [] as unknown[],
  userReads: [] as string[],
}));

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); },
}));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ ok: true, retryAfterSec: 0 }), clientKeyFromHeaders: () => 'k' }));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => new Proxy({}, { get: (_t, p) => { if (p !== 'then') h.stripeTouched.push(String(p)); return new Proxy({}, { get: (_u, q) => async () => { h.stripeTouched.push(`${String(p)}.${String(q)}`); return { id: 'acct_new', livemode: false, url: 'https://connect.test' }; } }); } }),
  STRIPE_PRODUCTS: {},
  PLATFORM_TAKE_RATE: 0.15,
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => { h.userReads.push(where.id); return where.id in h.users ? { dobYear: h.users[where.id], email: null } : null; },
    },
    facilitatorProfile: { findUnique: async ({ where }: { where: { userId: string } }) => (h.camp.includes(where.userId) ? { certificationStatus: 'certified' } : null) },
    instructor: {
      findUnique: async () => null,
      count: async () => 0,
      updateMany: async (a: unknown) => { h.instructorUpdates.push(a); return { count: 0 }; },
    },
    marketplaceListing: {
      findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, creatorId: h.session?.user.id, listingType: 'COACH_STORE', manifest: JSON.stringify({ kind: 'live_1on1', durationMin: 30 }), active: true }),
      update: async (a: unknown) => { h.priceUpdates.push(a); return {}; },
      count: async () => 0,
      updateMany: async (a: unknown) => { h.listingUpdates.push(a); return { count: 0 }; },
    },
    booking: {
      findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, kind: 'video_review', status: 'PAID', coachUserId: h.session?.user.id, clientUserId: 'buyer-1', clipPaths: [], painYes: false }),
      findMany: async () => [],
      update: async (a: unknown) => { h.bookingUpdates.push(a); return {}; },
    },
    analyticsEvent: { findFirst: async () => null, create: async () => ({}) },
    $queryRawUnsafe: async (sql: string, ...args: unknown[]) => {
      if (sql.includes('FROM "CoachConnectAccount" WHERE "userId"')) {
        const id = String(args[0]);
        return h.connect[id] ? [{ ok: 1, userId: id, stripeAccountId: h.connect[id], livemode: false, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false }] : [];
      }
      return [];   // every pending-table probe answers "not there yet"
    },
    $executeRawUnsafe: async () => 0,
  },
}));

import { POST as connectPost } from '@/app/api/coach/business/connect/route';
import { POST as uploadUrlPost } from '@/app/api/coach-store/reviews/[id]/upload-url/route';
import { POST as deliverPost } from '@/app/api/coach-store/reviews/[id]/deliver/route';
import { POST as storeSettings } from '@/app/api/coach-store/settings/route';
import { GET as groupCoachGet, POST as groupCoachPost } from '@/app/api/group-booking/coach/route';
import DashboardPage from '@/app/coach/dashboard/page';
import SettingsPage from '@/app/coach/dashboard/settings/page';
import CoachBusinessPage from '@/app/coach/business/page';
import { SellerBirthYearPrompt, sellerBirthYearHref } from '@/components/seller/birth-year-prompt';
import { resetBusinessProbe } from '@/lib/coach-business/store';
import { sellerAgeGate, sellerNeedsBirthYear } from '@/lib/seller/server';
import { SELLER_AGE_MESSAGES } from '@/lib/seller/canSell';

const TEEN = 'r2-teen';
const UNKNOWN = 'r2-unknown';
const CAMP_TEEN = 'r2-camp-teen';
const ADULT = 'r2-adult';

const as = (id: string) => { h.session = { user: { id } }; };
const req = (body: unknown = {}) => new Request('https://fel.test/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const nreq = (body: unknown = {}, url = 'https://fel.test/x') => {
  const r = req(body) as Request & { nextUrl: URL };
  Object.defineProperty(r, 'nextUrl', { value: new URL(url) });
  return r as never;
};
async function body(r: Response) { return (await r.json()) as Record<string, unknown>; }
const gateOn = (on: boolean) => { if (on) process.env.SELLER_ADULT_GATE_ENABLED = '1'; else delete process.env.SELLER_ADULT_GATE_ENABLED; };

/** Does a rendered server-component tree contain an element of this type? */
function contains(node: ReactNode, type: unknown): boolean {
  if (Array.isArray(node)) return node.some((n) => contains(n, type));
  if (!isValidElement(node)) return false;
  if (node.type === type) return true;
  return contains((node.props as { children?: ReactNode }).children, type);
}

const ENV_KEYS = ['COACH_STORE_ENABLED', 'COACH_STORE_COACH_USER_IDS', 'COACH_CONNECT_PAYMENTS_ENABLED', 'STRIPE_SECRET_KEY', 'NEXTAUTH_URL',
  'SELLER_ADULT_GATE_ENABLED', 'COACH_REVIEW_UPLOADS_ENABLED', 'COACH_REVIEWS_BUCKET', 'GROUP_BOOKING_OWNER_ID', 'GROUP_BOOKING_ENABLED'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) { if (!(k in saved)) saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, {
    COACH_STORE_ENABLED: '1',
    COACH_STORE_COACH_USER_IDS: [TEEN, UNKNOWN, ADULT].join(','),
    COACH_CONNECT_PAYMENTS_ENABLED: '1', STRIPE_SECRET_KEY: 'sk_test_r2', NEXTAUTH_URL: 'https://fel.test',
    COACH_REVIEW_UPLOADS_ENABLED: '1', COACH_REVIEWS_BUCKET: 'fel-test-bucket',
    SELLER_ADULT_GATE_ENABLED: '1',
  });
  h.users = { [TEEN]: YEAR - 15, [UNKNOWN]: null, [CAMP_TEEN]: YEAR - 15, [ADULT]: 1990 };
  h.camp = [CAMP_TEEN];
  h.connect = {};
  h.stripeTouched = []; h.bookingUpdates = []; h.instructorUpdates = []; h.listingUpdates = []; h.priceUpdates = []; h.userReads = [];
  h.session = null;
  resetBusinessProbe();
  return () => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } };
});

describe('F5: Connect POST (onboarding start and resume) refuses a teen, an unknown age and a Camp-certified teen before Stripe', () => {
  for (const on of [true, false]) {
    for (const resume of [false, true]) {
      it(`${resume ? 'resume (a Connect row exists)' : 'start (no Connect row)'}, setting ${on ? 'on' : 'off'}: 403 adults_only, Stripe never touched`, async () => {
        gateOn(on);
        for (const id of [TEEN, UNKNOWN, CAMP_TEEN]) {
          if (resume) h.connect[id] = `acct_${id}`;
          as(id);
          const r = await connectPost(req({ termsAccepted: true }));
          expect(r.status, id).toBe(403);
          expect(await body(r), id).toEqual({ error: 'adults_only' });
        }
        expect(h.stripeTouched).toEqual([]);
      });
    }
  }

  it('an adult gets past the age line (here: the coach-business tables are not there yet, so 503 — still no Stripe)', async () => {
    as(ADULT);
    const r = await connectPost(req({ termsAccepted: true }));
    expect(r.status).not.toBe(403);
    expect((await body(r)).error).not.toBe('adults_only');
  });
});

describe('F5: the coach-store review upload, deliver and price-setter routes (lib/coach-store/api.ts uploadUrl, deliverReview, setListingPrice)', () => {
  const calls: [string, () => Promise<Response>][] = [
    ['upload-url (the coach reply)', () => uploadUrlPost(nreq({ role: 'reply' }), { params: { id: 'bk-1' } })],
    ['deliver', () => deliverPost(nreq({ replyText: 'Good rep', drills: ['d1'], replyObject: 'coach-reviews/replies/bk-1/x.mp4' }), { params: { id: 'bk-1' } })],
    ['price-setter (settings listingId + priceCents)', () => storeSettings(nreq({ listingId: 'l-1', priceCents: 4900 }))],
  ];
  for (const [name, call] of calls) {
    it(`${name}, setting on: teen, unknown age and Camp-certified teen → 404, nothing written; an adult coach gets past the gate`, async () => {
      for (const id of [TEEN, UNKNOWN, CAMP_TEEN]) {
        as(id);
        const r = await call();
        expect(r.status, id).toBe(404);
        expect(await body(r), id).toEqual({ error: 'not_found' });
      }
      expect(h.bookingUpdates).toEqual([]);
      expect(h.priceUpdates).toEqual([]);
      as(ADULT);
      const r = await call();
      expect(r.status).not.toBe(404);
    });

    it(`${name}, setting off: the role decides, as before — a teen or Camp-certified teen with the role is not stopped here by age; no role is still 404`, async () => {
      gateOn(false);
      for (const id of [TEEN, CAMP_TEEN]) {   // the env list, and a Camp certification: both are the store role today
        as(id);
        expect((await call()).status, id).not.toBe(404);
      }
      h.users.stranger = 1990;
      as('stranger');
      expect((await call()).status).toBe(404);
    });
  }

  it('deliver: an adult coach delivers (the write happens only past the gate)', async () => {
    as(ADULT);
    const r = await deliverPost(nreq({ replyText: 'Good rep', drills: ['d1'], replyObject: 'coach-reviews/replies/bk-1/x.mp4' }), { params: { id: 'bk-1' } });
    expect(r.status).toBe(200);
    expect(h.bookingUpdates).toHaveLength(1);
  });

  it('price-setter: an adult coach sets the price (priceUsd only)', async () => {
    as(ADULT);
    const r = await storeSettings(nreq({ listingId: 'l-1', priceCents: 4900 }));
    expect(r.status).toBe(200);
    expect(h.priceUpdates).toEqual([{ where: { id: 'l-1' }, data: { priceUsd: 4900 } }]);
  });
});

describe('F5: the coach dashboard and settings pages, rendered', () => {
  it('setting on: a teen and a Camp-certified teen get the 404 on both pages', async () => {
    for (const id of [TEEN, CAMP_TEEN]) {
      as(id);
      await expect(DashboardPage(), id).rejects.toThrow('NEXT_NOT_FOUND');
      await expect(SettingsPage(), id).rejects.toThrow('NEXT_NOT_FOUND');
    }
  });

  it('setting on: an unknown-age coach sees the birth-year prompt on the dashboard (not a 404); settings stays 404', async () => {
    as(UNKNOWN);
    const page = await DashboardPage();
    expect(contains(page, SellerBirthYearPrompt)).toBe(true);
    await expect(SettingsPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('an adult coach gets the dashboard, with no prompt', async () => {
    as(ADULT);
    const page = await DashboardPage();
    expect(isValidElement(page)).toBe(true);
    expect(contains(page, SellerBirthYearPrompt)).toBe(false);
  });

  it('not a store coach at all: 404, whatever the age', async () => {
    as('stranger');
    h.users.stranger = null;
    await expect(DashboardPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('setting off: a teen coach keeps today\'s dashboard; an unknown-age coach gets the dashboard WITH the prompt line', async () => {
    gateOn(false);
    as(TEEN);
    expect(contains(await DashboardPage(), SellerBirthYearPrompt)).toBe(false);
    as(UNKNOWN);
    expect(contains(await DashboardPage(), SellerBirthYearPrompt)).toBe(true);
  });

  it('the business page asks an unknown-age coach for a birth year, and nobody else', async () => {
    // v3 (Cyber C2): a coach-business seller is an account with seller rows; here, a Connect account for each.
    h.connect = { [UNKNOWN]: 'acct_u', [ADULT]: 'acct_a', [TEEN]: 'acct_t' };
    as(UNKNOWN);
    expect(contains(await CoachBusinessPage(), SellerBirthYearPrompt)).toBe(true);
    as(ADULT);
    expect(contains(await CoachBusinessPage(), SellerBirthYearPrompt)).toBe(false);
    as(TEEN);
    expect(contains(await CoachBusinessPage(), SellerBirthYearPrompt)).toBe(false);
  });

  it('the prompt: the existing account step, coming back to the page; the plain refusal copy', () => {
    expect(sellerBirthYearHref('/coach/dashboard')).toBe('/age?next=%2Fcoach%2Fdashboard');
    const el = SellerBirthYearPrompt({ next: '/coach/business' });
    const kids = (el.props as { children: unknown[] }).children;
    expect(kids[0]).toBe(SELLER_AGE_MESSAGES.age_unknown);
    const link = kids.find((k) => isValidElement(k) && (k.props as { href?: string }).href) as { props: { href: string; children: string } };
    expect(link.props.href).toBe('/age?next=%2Fcoach%2Fbusiness');
    expect(link.props.children).toBe('Add your birth year');
  });

  it('sellerNeedsBirthYear: role and no year → yes; a year, no role, no row or no id → no', async () => {
    expect(await sellerNeedsBirthYear(UNKNOWN, 'coach_store')).toBe(true);
    expect(await sellerNeedsBirthYear(ADULT, 'coach_store')).toBe(false);
    expect(await sellerNeedsBirthYear(TEEN, 'coach_store')).toBe(false);
    h.users.norole = null;
    expect(await sellerNeedsBirthYear('norole', 'coach_store')).toBe(false);
    expect(await sellerNeedsBirthYear('no-row', 'coach_business')).toBe(false);
    expect(await sellerNeedsBirthYear(null, 'coach_business')).toBe(false);
  });
});

describe('group booking: the owner and trainers take money', () => {
  beforeEach(() => { process.env.GROUP_BOOKING_OWNER_ID = TEEN; });

  it('setting on: a teen group owner gets 403 under_18 on the coach board (GET) and coach actions (POST)', async () => {
    as(TEEN);
    for (const r of [await groupCoachGet(nreq()), await groupCoachPost(nreq({ action: 'cancel' }))]) {
      expect(r.status).toBe(403);
      expect(await body(r)).toEqual({ error: 'adults_only', reason: 'under_18', message: SELLER_AGE_MESSAGES.under_18 });
    }
  });

  it('setting on: an unknown-age owner gets 403 age_unknown', async () => {
    process.env.GROUP_BOOKING_OWNER_ID = UNKNOWN;
    as(UNKNOWN);
    expect(await body(await groupCoachGet(nreq()))).toMatchObject({ error: 'adults_only', reason: 'age_unknown' });
  });

  it('setting on: someone who is not a group coach keeps the board\'s own answer (no age refusal)', async () => {
    as(CAMP_TEEN);
    const r = await groupCoachGet(nreq());
    expect((await body(r)).error).not.toBe('adults_only');
  });

  it('setting off: the teen owner reaches the board as before, and no birth year is read', async () => {
    gateOn(false);
    as(TEEN);
    const r = await groupCoachGet(nreq());
    expect((await body(r)).error).not.toBe('adults_only');
    expect(h.userReads).toEqual([]);
    expect(await sellerAgeGate(TEEN, 'group_booking')).toBeNull();
  });
});
