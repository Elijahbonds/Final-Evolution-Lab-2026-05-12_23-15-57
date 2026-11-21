// STORE-HURT-OPTIN flag: STORE_HURT_OPTIN_ENABLED / NEXT_PUBLIC_STORE_HURT_OPTIN_ENABLED (env twin), off by default.
// Flag off = main's behaviour (the answer is stored; submit requires it; deliver opens with PAIN_LINE only for a stored yes).
// Flag on = the never-store path covered in hurt-optin.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { STORE_TERMS_VERSION } from '@/lib/store-terms';
import { PAIN_LINE } from './constants';
import { isStoreHurtOptinServerEnabled, isStoreHurtOptinUiEnabled } from './hurtOptinFlag';

const h = vi.hoisted(() => ({ db: null as any, store: {} as Record<string, any[]> }));

vi.mock('@/lib/db', () => ({ get prisma() { return h.db; } }));
vi.mock('./adult', () => ({ isVerifiedAdult: async () => true }));
vi.mock('./stripeMode', async (orig) => ({ ...(await orig<typeof import('./stripeMode')>()), stripeTestGate: () => ({ ok: true, key: 'sk_test_fake' }) }));
vi.mock('./gate', async (orig) => ({ ...(await orig<typeof import('./gate')>()), reviewsCanBeSold: () => true }));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    customers: { create: async () => ({ id: 'cus_1' }) },
    checkout: { sessions: { create: async () => ({ id: 'cs_1', url: 'https://stripe.test/cs_1' }) } },
  }),
}));

import { startCheckout } from './checkout';
import { deliverReview, submitReview } from './api';

type Row = Record<string, any>;
function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, cond]) => {
    const v = row[k];
    if (cond === null) return v == null;
    if (cond instanceof Date || typeof cond !== 'object' || Array.isArray(cond)) return v === cond;
    const c = cond as Row;
    if (!Object.keys(c).some((op) => ['not', 'in', 'lt'].includes(op))) return matches(row, c);
    if ('not' in c && (c.not === null ? v == null : v === c.not)) return false;
    if ('in' in c && !(c.in as unknown[]).includes(v)) return false;
    if ('lt' in c && !(v != null && v < c.lt)) return false;
    return true;
  });
}
function clientFor(store: Record<string, Row[]>): any {
  return new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      const rows = () => (store[String(prop)] ??= []);
      return {
        findUnique: async (a: Row = {}) => rows().find((r) => matches(r, a.where)) ?? null,
        findFirst: async (a: Row = {}) => rows().find((r) => matches(r, a.where)) ?? null,
        findMany: async (a: Row = {}) => rows().filter((r) => matches(r, a.where)),
        create: async (a: Row) => { const r = { id: `${String(prop)}-${rows().length + 1}`, ...a.data }; rows().push(r); return r; },
        update: async (a: Row) => { const r = rows().find((x) => matches(x, a.where)); if (!r) throw Object.assign(new Error('P2025'), { code: 'P2025' }); Object.assign(r, a.data); return r; },
        updateMany: async (a: Row) => { const hit = rows().filter((x) => matches(x, a.where)); for (const r of hit) Object.assign(r, a.data); return { count: hit.length }; },
      };
    },
  });
}

const COACH = 'coach-elijah';
const BUYER = 'buyer-1';
const FLAG = 'STORE_HURT_OPTIN_ENABLED';
const FLAG_PUBLIC = 'NEXT_PUBLIC_STORE_HURT_OPTIN_ENABLED';
const ENV_KEYS = ['COACH_STORE_PAYMENTS_ENABLED', 'COACH_STORE_COACH_USER_IDS', FLAG, FLAG_PUBLIC] as const;
const SAVED: Record<string, string | undefined> = {};

function setFlag(value: string | undefined, which: 'server' | 'public' | 'both' = 'both') {
  const apply = (key: string) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  if (which === 'server' || which === 'both') apply(FLAG);
  if (which === 'public' || which === 'both') apply(FLAG_PUBLIC);
}

beforeEach(() => {
  for (const k of ENV_KEYS) SAVED[k] = process.env[k];
  process.env.COACH_STORE_PAYMENTS_ENABLED = '1';
  process.env.COACH_STORE_COACH_USER_IDS = COACH;
  setFlag(undefined);
  h.store = {};
  h.db = clientFor(h.store);
  h.store.marketplaceListing = [{
    id: 'listing-review', creatorId: COACH, title: 'Video review', priceUsd: 4900, active: true, listingType: 'COACH_STORE',
    manifest: JSON.stringify({ kind: 'video_review', maxClips: 3, maxClipSeconds: 60 }),
  }];
  h.store.instructor = [{
    id: 'instructor-1', userId: COACH, slug: 'elijah', published: true, reviewSlaHours: 48,
    weeklyHours: '[]', blackoutDates: '[]', bufferMinutes: 15, minNoticeHours: 12, maxDaysAhead: 28,
  }];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
});

const checkout = (extra: Row) =>
  startCheckout(BUYER, { listingId: 'listing-review', termsAccepted: true, termsVersion: STORE_TERMS_VERSION, goal: 'Dunk', note: 'n', ...extra }, 'https://fel.test');

function seedBooking(painYes: boolean | null = null): string {
  (h.store.booking ??= []).push({ id: 'bk-1', kind: 'video_review', instructorId: 'instructor-1', coachUserId: COACH, clientUserId: BUYER, status: 'PAID', painYes });
  return 'bk-1';
}
const CLIP = 'coach-reviews/originals/bk-1/a.mp4';

describe('STORE_HURT_OPTIN_ENABLED is off by default (env twin)', () => {
  it('unset, empty, and off words are off; the server helper follows only STORE_HURT_OPTIN_ENABLED', () => {
    setFlag(undefined);
    expect(isStoreHurtOptinServerEnabled()).toBe(false);
    expect(isStoreHurtOptinUiEnabled()).toBe(false);
    for (const v of ['', '0', 'false', 'no', 'off']) {
      setFlag(v);
      expect(isStoreHurtOptinServerEnabled(), v).toBe(false);
      expect(isStoreHurtOptinUiEnabled(), v).toBe(false);
    }
    for (const v of ['1', 'true', 'TRUE', ' on ', 'yes']) {
      setFlag(undefined);
      setFlag(v, 'server');
      expect(isStoreHurtOptinServerEnabled(), `server ${v}`).toBe(true);
      expect(isStoreHurtOptinUiEnabled(), `server does not turn on UI ${v}`).toBe(false);
      setFlag(undefined);
      setFlag(v, 'public');
      expect(isStoreHurtOptinServerEnabled(), `public does not turn on server ${v}`).toBe(false);
      expect(isStoreHurtOptinUiEnabled(), `public ${v}`).toBe(true);
    }
  });

  it('the public twin alone does not turn on the server no-store path', async () => {
    setFlag(undefined);
    setFlag('1', 'public');
    expect(isStoreHurtOptinServerEnabled()).toBe(false);
    expect(isStoreHurtOptinUiEnabled()).toBe(true);
    expect((await checkout({ painYes: true })).status).toBe(200);
    expect(h.store.booking[0].painYes).toBe(true);
    const id = seedBooking(null);
    const missing = await submitReview(BUYER, id, { clips: [CLIP], goal: 'Dunk', note: 'hi' });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: 'pain_required' });
  });

  it('.env.example lists both twins empty', () => {
    const example = readFileSync('.env.example', 'utf8');
    expect(example).toMatch(/^STORE_HURT_OPTIN_ENABLED=""$/m);
    expect(example).toMatch(/^NEXT_PUBLIC_STORE_HURT_OPTIN_ENABLED=""$/m);
  });
});

describe('flag off: behaviour equals main', () => {
  beforeEach(() => setFlag(undefined));

  it('checkout writes a "yes" and a "no" to the booking, and leaves a missing answer null', async () => {
    expect((await checkout({ painYes: true })).status).toBe(200);
    expect(h.store.booking[0].painYes).toBe(true);
    h.store.booking = [];
    expect((await checkout({ painYes: false })).status).toBe(200);
    expect(h.store.booking[0].painYes).toBe(false);
    expect(h.store.booking[0]).toMatchObject({ kind: 'video_review', status: 'HELD', goal: 'Dunk', reviewNote: 'n', clientUserId: BUYER });
    h.store.booking = [];
    expect((await checkout({})).status).toBe(200);
    expect(h.store.booking[0].painYes).toBeNull();
  });

  it('review submit requires painYes and writes it', async () => {
    const id = seedBooking();
    const missing = await submitReview(BUYER, id, { clips: [CLIP], goal: 'Dunk', note: 'hi' });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: 'pain_required' });
    expect(h.store.booking[0].painYes).toBeNull();
    const ok = await submitReview(BUYER, id, { clips: [CLIP], goal: 'Dunk', painYes: true, note: 'hi' });
    expect(ok.status).toBe(200);
    expect(h.store.booking[0].painYes).toBe(true);
    expect(h.store.booking[0]).toMatchObject({ clipPaths: [CLIP], goal: 'Dunk', reviewNote: 'hi' });
  });

  it('deliver: a stored yes opens with PAIN_LINE; a missing or no answer does not', async () => {
    const yes = seedBooking(true);
    expect((await deliverReview(COACH, yes, { replyText: 'Bend the knee.', drills: ['d1'], replyObject: 'coach-reviews/replies/bk-1/r.webm' })).status).toBe(200);
    expect(h.store.booking[0].replyText).toBe(`${PAIN_LINE}\n\nBend the knee.`);
    h.store.booking = [];
    const none = seedBooking(null);
    expect((await deliverReview(COACH, none, { replyText: 'Bend the knee.', drills: ['d1'], replyObject: 'coach-reviews/replies/bk-1/r.webm' })).status).toBe(200);
    expect(h.store.booking[0].replyText).toBe('Bend the knee.');
    h.store.booking = [];
    const no = seedBooking(false);
    expect((await deliverReview(COACH, no, { replyText: 'Bend the knee.', drills: ['d1'], replyObject: 'coach-reviews/replies/bk-1/r.webm' })).status).toBe(200);
    expect(h.store.booking[0].replyText).toBe('Bend the knee.');
  });

  it('the forms still send painYes when the flag is off, without a painYes: literal (flag-on source scans stay intact)', () => {
    const bookSrc = readFileSync('components/coach-store/book-form.tsx', 'utf8');
    const studioSrc = readFileSync('components/coach-store/review-studio.tsx', 'utf8');
    expect(bookSrc).toContain("['painYes']");
    expect(studioSrc).toContain("['painYes']");
    expect(studioSrc).toContain('JSON.stringify({ clips, goal, note })');
    expect(bookSrc).not.toMatch(/painYes\s*:/);
    expect(studioSrc).not.toMatch(/painYes\s*:/);
    expect(studioSrc).toContain("if (pain === null) { setMessage('Check the goal and the pain question.'); return; }");
  });
});

describe('flag on: the never-store path', () => {
  beforeEach(() => setFlag('1'));

  it('checkout drops a "yes" in the body', async () => {
    const res = await checkout({ painYes: true });
    expect(res.status).toBe(200);
    expect(h.store.booking[0].painYes).toBeNull();
  });

  it('review submit does not require painYes and does not write it', async () => {
    const id = seedBooking();
    const res = await submitReview(BUYER, id, { clips: [CLIP], goal: 'Dunk', note: 'hi' });
    expect(res.status).toBe(200);
    expect(h.store.booking[0].painYes).toBeNull();
  });

  it('flag on: submit writes painYes null so an old stored answer is cleared', async () => {
    const id = seedBooking(true);
    expect(h.store.booking[0].painYes).toBe(true);
    const res = await submitReview(BUYER, id, { clips: [CLIP], goal: 'Dunk', note: 'hi' });
    expect(res.status).toBe(200);
    expect(h.store.booking[0].painYes).toBeNull();
  });

  it('deliver: with no stored answer the review still opens with PAIN_LINE', async () => {
    const id = seedBooking(null);
    const res = await deliverReview(COACH, id, { replyText: 'Bend the knee.', drills: ['d1'], replyObject: 'coach-reviews/replies/bk-1/r.webm' });
    expect(res.status).toBe(200);
    expect(h.store.booking[0].replyText).toBe(`${PAIN_LINE}\n\nBend the knee.`);
  });
});
