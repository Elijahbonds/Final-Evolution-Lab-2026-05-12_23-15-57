// SELLER-18-1 (Cyber BOOK-SIGNOFF S-2): every seller entry point, driven through the real routes and the real gate
// (lib/seller/server.ts → lib/seller/canSell.ts → lib/coach-store/adult.ts), with a fake database, session and Stripe.
// Each surface: a teen (birth year now − 15) and an unknown-age account are refused (403 adults_only, or the surface's
// own 404/409); a Camp-certified teen is refused; an adult seller gets past the gate. A teen seller is taken down.
// v2: all of this is with SELLER_ADULT_GATE_ENABLED on (tests/seller/seller-v2-*.test.ts cover it off), and the teen
// seller here holds seller rows (a Connect account; a coach page), which is what lets the takedown run (Cyber F1).
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const YEAR = new Date().getFullYear();

const h = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  users: {} as Record<string, number | null>,
  camp: [] as string[],
  connect: {} as Record<string, string>,
  coachPages: [] as string[],
  instructorUpdates: [] as Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>,
  listingUpdates: [] as Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>,
  stripeUpdates: [] as Array<{ id: string; params: Record<string, unknown> }>,
}));

vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ ok: true, retryAfterSec: 0 }), clientKeyFromHeaders: () => 'k' }));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({ accounts: { update: async (id: string, params: Record<string, unknown>) => { h.stripeUpdates.push({ id, params }); return {}; } } }),
  STRIPE_PRODUCTS: {},
  PLATFORM_TAKE_RATE: 0.15,
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id in h.users ? { dobYear: h.users[where.id] } : null),
    },
    facilitatorProfile: {
      findUnique: async ({ where }: { where: { userId: string } }) => (h.camp.includes(where.userId) ? { certificationStatus: 'certified' } : null),
    },
    instructor: {
      findUnique: async () => null,
      count: async ({ where }: { where: { userId: string } }) => (h.coachPages.includes(where.userId) ? 1 : 0),
      updateMany: async (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => { h.instructorUpdates.push(a); return { count: 1 }; },
    },
    marketplaceListing: {
      findUnique: async () => null,
      update: async () => ({}),
      updateMany: async (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => { h.listingUpdates.push(a); return { count: 2 }; },
    },
    cellApiKey: { count: async () => 1 },
    subscription: { findFirst: async () => null, findMany: async () => [] },
    // Raw SQL: the Connect account lookup answers from h.connect; every table probe answers "not there yet".
    $queryRawUnsafe: async (sql: string, ...args: unknown[]) => {
      if (sql.includes('FROM "CoachConnectAccount" WHERE "userId"')) {
        const id = String(args[0]);
        return h.connect[id] ? [{ userId: id, stripeAccountId: h.connect[id], livemode: false, chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true }] : [];
      }
      return [];
    },
    $executeRawUnsafe: async () => 0,
  },
}));

import { POST as storeSettings } from '@/app/api/coach-store/settings/route';
import { GET as connectGet } from '@/app/api/coach/business/connect/route';
import { POST as connectDashboard } from '@/app/api/coach/business/connect/dashboard/route';
import { PATCH as packagePatch } from '@/app/api/coach/business/packages/[id]/route';
import { POST as saleChange } from '@/app/api/coach/business/sales/[id]/change/route';
import { POST as teamFee } from '@/app/api/coach/business/team-fee/route';
import { PATCH as applicationPatch } from '@/app/api/coach/business/applications/[id]/route';
import { POST as highlightPost } from '@/app/api/coach/business/highlights/route';
import { POST as cartridgePost } from '@/app/api/studio/cartridges/route';
import { isStoreCoach } from '@/lib/coach-store/gate';
import { resetBusinessProbe } from '@/lib/coach-business/store';
import { SELLER_AGE_MESSAGES } from '@/lib/seller/canSell';

const TEEN = 'seller-teen';
const UNKNOWN = 'seller-unknown';
const ADULT = 'seller-adult';
const CAMP_TEEN = 'seller-camp-teen';

const json = (body: unknown = {}) => new Request('https://fel.test/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const as = (id: string) => { h.session = { user: { id } }; };

const ENV_KEYS = ['COACH_STORE_ENABLED', 'COACH_STORE_COACH_USER_IDS', 'COACH_CONNECT_PAYMENTS_ENABLED', 'STRIPE_SECRET_KEY', 'NEXTAUTH_URL', 'STUDIO_CREATOR_ENABLED', 'SELLER_ADULT_GATE_ENABLED'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) { if (!(k in saved)) saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, {
    COACH_STORE_ENABLED: '1',
    COACH_STORE_COACH_USER_IDS: [TEEN, UNKNOWN, ADULT].join(','),   // the env list: the role, never the age
    COACH_CONNECT_PAYMENTS_ENABLED: '1', STRIPE_SECRET_KEY: 'sk_test_seller', NEXTAUTH_URL: 'https://fel.test',
    STUDIO_CREATOR_ENABLED: '1',
    SELLER_ADULT_GATE_ENABLED: '1',
  });
  h.users = { [TEEN]: YEAR - 15, [UNKNOWN]: null, [ADULT]: 1990, [CAMP_TEEN]: YEAR - 15 };
  h.camp = [CAMP_TEEN];
  h.connect = { [TEEN]: 'acct_teen' };
  h.coachPages = [TEEN];
  h.instructorUpdates = []; h.listingUpdates = []; h.stripeUpdates = [];
  h.session = null;
  resetBusinessProbe();
  return () => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } };
});

async function body(r: Response): Promise<Record<string, unknown>> { return (await r.json()) as Record<string, unknown>; }

async function expectAgeRefusal(r: Response, reason: 'under_18' | 'age_unknown') {
  expect(r.status).toBe(403);
  expect(await body(r)).toEqual({ error: 'adults_only', reason, message: SELLER_AGE_MESSAGES[reason] });
}

describe('the coach store: one gate behind every isStoreCoach caller', () => {
  // isStoreCoach is the gate the store checkout (lib/coach-store/checkout.ts), the settings and price routes, the review
  // studio's coach side (lib/coach-store/api.ts uploadUrl/deliverReview) and the dashboard pages all call.
  it('isStoreCoach: teen no, unknown age no, Camp-certified teen no, adult yes', async () => {
    expect(await isStoreCoach(TEEN)).toBe(false);
    expect(await isStoreCoach(UNKNOWN)).toBe(false);
    expect(await isStoreCoach(CAMP_TEEN)).toBe(false);
    expect(await isStoreCoach(ADULT)).toBe(true);
  });

  it('settings and prices (POST /api/coach-store/settings): teen, unknown age and Camp-certified teen get 404, nothing written', async () => {
    for (const id of [TEEN, UNKNOWN, CAMP_TEEN]) {
      as(id);
      const save = await storeSettings(json({ businessMailingAddress: 'PO Box 42, Springfield' }) as never);
      expect(save.status, id).toBe(404);
      const price = await storeSettings(json({ listingId: 'l-1', priceCents: 4900 }) as never);
      expect(price.status, id).toBe(404);
    }
    expect(h.instructorUpdates.filter((u) => !('published' in u.data))).toEqual([]);   // no settings write
  });

  it('settings: an adult seller with the role saves', async () => {
    as(ADULT);
    const r = await storeSettings(json({ businessMailingAddress: 'PO Box 42, Springfield' }) as never);
    expect(r.status).toBe(200);
    expect(h.instructorUpdates).toEqual([{ where: { userId: ADULT }, data: { businessMailingAddress: 'PO Box 42, Springfield' } }]);
    expect(h.stripeUpdates).toEqual([]);
  });
});

describe('the coach business: every seller route asks the gate', () => {
  const routes: [string, () => Promise<Response>][] = [
    ['connect status GET (payouts)', () => connectGet()],
    ['Express dashboard POST (payouts)', () => connectDashboard()],
    ['package PATCH (publish / price)', () => packagePatch(json({}), { params: { id: 'pkg-1' } })],
    ['sale change POST', () => saleChange(json({ packageId: 'pkg-2' }), { params: { id: 'sale-1' } })],
    ['team fee POST', () => teamFee(json({ packageId: 'pkg-1', scope: 'roster' }))],
    ['application PATCH', () => applicationPatch(json({ status: 'ACCEPTED' }), { params: { id: 'app-1' } })],
    ['highlight POST', () => highlightPost(json({ clientId: 'c-1', text: 'Added four inches in eight weeks' }))],
  ];
  for (const [name, call] of routes) {
    it(`${name}: teen → 403 under_18, unknown age → 403 age_unknown, Camp-certified teen → 403, adult → past the gate`, async () => {
      as(TEEN); await expectAgeRefusal(await call(), 'under_18');
      as(UNKNOWN); await expectAgeRefusal(await call(), 'age_unknown');
      as(CAMP_TEEN); await expectAgeRefusal(await call(), 'under_18');
      as(ADULT);
      const r = await call().catch(() => null);   // past the gate the route reads tables this fake does not have
      if (r) expect((await body(r)).error).not.toBe('adults_only');
    });
  }
});

describe('Studio: publishing a priced cartridge is selling', () => {
  it('teen and unknown age are refused before anything is written; an adult reaches the form checks', async () => {
    as(TEEN); await expectAgeRefusal(await cartridgePost(json({}) as never), 'under_18');
    as(UNKNOWN); await expectAgeRefusal(await cartridgePost(json({}) as never), 'age_unknown');
    as(ADULT);
    const r = await cartridgePost(json({}) as never);
    expect(r.status).toBe(400);   // past the gate: the empty body fails its own validation
  });
});

describe('a seller found to be under 18: listings come down, payouts freeze', () => {
  it('the first refused seller action unpublishes the coach page, takes listings down and sets payouts to manual', async () => {
    as(TEEN);
    await storeSettings(json({ businessMailingAddress: 'PO Box 42, Springfield' }) as never);
    expect(h.instructorUpdates).toContainEqual({ where: { userId: TEEN, published: true }, data: { published: false } });
    expect(h.listingUpdates).toContainEqual({ where: { creatorId: TEEN, active: true }, data: { active: false } });
    expect(h.stripeUpdates).toContainEqual({
      id: 'acct_teen',
      params: { settings: { payouts: { schedule: { interval: 'manual' } } }, metadata: { fel_payout_hold: 'seller_age_review' } },
    });
  });

  it('unknown age is refused but nothing is taken down (a missing year is not proof of a minor)', async () => {
    as(UNKNOWN);
    await storeSettings(json({ businessMailingAddress: 'PO Box 42, Springfield' }) as never);
    expect(h.instructorUpdates).toEqual([]);
    expect(h.listingUpdates).toEqual([]);
    expect(h.stripeUpdates).toEqual([]);
  });

  it('a teen with no Stripe account: listings still come down, and Stripe is not called', async () => {
    h.connect = {};
    expect(await isStoreCoach(TEEN)).toBe(false);
    expect(h.listingUpdates).toContainEqual({ where: { creatorId: TEEN, active: true }, data: { active: false } });
    expect(h.stripeUpdates).toEqual([]);
  });
});

describe('the audit: every seller entry point names the gate in its source', () => {
  // SELLER-18-1 audit list. A new seller route must join this list with its gate.
  const ENTRY_POINTS: [string, RegExp][] = [
    ['lib/coach-store/gate.ts', /canSell\(userId, 'coach_store'\)/],
    ['lib/coach-store/checkout.ts', /isStoreCoach\(instructor\.userId\)/],
    ['lib/coach-store/api.ts', /isStoreCoach\(userId\)/],
    ['app/coach/dashboard/page.tsx', /isStoreCoach\(userId\)/],
    ['app/coach/dashboard/settings/page.tsx', /isStoreCoach\(userId\)/],
    ['app/coach/review/[bookingId]/page.tsx', /isStoreCoach\(userId\)/],
    ['lib/coach-business/server.ts', /canSell\(coachId, 'coach_business'\)/],
    ['lib/coach-business/service.ts', /deps\.sellerOk/],
    ['app/api/coach/business/route.ts', /isVerifiedAdultUser\(userId\)/],
    ['app/api/coach/business/connect/route.ts', /sellerGate\(userId, 'coach_business'\)/],
    ['app/api/coach/business/connect/dashboard/route.ts', /sellerGate\(userId, 'coach_business'\)/],
    ['app/api/coach/business/packages/route.ts', /isVerifiedAdultUser\(userId\)/],
    ['app/api/coach/business/packages/[id]/route.ts', /sellerGate\(userId, 'coach_business'\)/],
    ['app/api/coach/business/sales/[id]/change/route.ts', /sellerGate\(userId, 'coach_business'\)/],
    ['app/api/coach/business/team-fee/route.ts', /sellerGate\(userId, 'coach_business'\)/],
    ['app/api/coach/business/applications/[id]/route.ts', /sellerGate\(userId, 'coach_business'\)/],
    ['app/api/coach/business/highlights/route.ts', /sellerGate\(userId, 'coach_business'\)/],
    ['app/api/studio/cartridges/route.ts', /sellerGate\(userId, 'studio'\)/],
    // v2: group booking (the owner and trainers take money); the age refusal only, the board keeps its own answers.
    ['app/api/group-booking/coach/route.ts', /sellerAgeGate\(userId, 'group_booking'\)/],
  ];
  for (const [file, gate] of ENTRY_POINTS) {
    it(`${file} is gated`, () => {
      expect(readFileSync(file, 'utf8')).toMatch(gate);
    });
  }
});
