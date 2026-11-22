// STORE-HURT-OPTIN (P0): the coach store used to write the "Does anything hurt?" answer to Booking.painYes with no
// opt-in — at checkout (lib/coach-store/checkout.ts bookTime) and again on review submit (lib/coach-store/api.ts
// submitReview). No existing copy names an opt-in for it, so the answer is never stored: it stays in the page's
// memory for the session (components/coach-store/book-form.tsx, review-studio.tsx). With nothing stored, every
// delivered review opens with PAIN_LINE, so the store terms' "If you answer yes ... your review starts with" holds.
//
// startCheckout / submitReview / deliverReview run for real over an in-memory Prisma stand-in (the pattern of
// rebuy-checkout.test.ts) with Stripe mocked; the two client forms are checked from source and static render.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { STORE_TERMS_VERSION } from '@/lib/store-terms';
import { PAIN_LINE } from './constants';

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
import { BookForm } from '@/components/coach-store/book-form';

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
const ENV_KEYS = ['COACH_STORE_PAYMENTS_ENABLED', 'COACH_STORE_COACH_USER_IDS', 'STORE_HURT_OPTIN_ENABLED', 'NEXT_PUBLIC_STORE_HURT_OPTIN_ENABLED'] as const;
const SAVED: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) SAVED[k] = process.env[k];
  process.env.COACH_STORE_PAYMENTS_ENABLED = '1';
  process.env.COACH_STORE_COACH_USER_IDS = COACH;
  // This file is the flag-on path (the eight STORE-HURT-OPTIN assertions). The flag-off / main path is hurt-optin-flag.test.ts.
  process.env.STORE_HURT_OPTIN_ENABLED = '1';
  process.env.NEXT_PUBLIC_STORE_HURT_OPTIN_ENABLED = '1';
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

describe('STORE-HURT-OPTIN: the "Does anything hurt?" answer is not persisted without opt-in', () => {
  it('checkout: a "yes" answer in the body is not written to the booking', async () => {
    const res = await checkout({ painYes: true });
    expect(res.status).toBe(200);
    const [booking] = h.store.booking;
    expect(booking.painYes).toBeNull();
  });

  it('checkout: a "no" answer is not written either, and the rest of the booking still is', async () => {
    const res = await checkout({ painYes: false });
    expect(res.status).toBe(200);
    const [booking] = h.store.booking;
    expect(booking.painYes).toBeNull();
    expect(booking).toMatchObject({ kind: 'video_review', status: 'HELD', goal: 'Dunk', reviewNote: 'n', clientUserId: BUYER });
  });

  it('review submit: a "yes" answer is not written; clips, goal and note still are', async () => {
    const id = seedBooking();
    const res = await submitReview(BUYER, id, { clips: [CLIP], goal: 'Dunk', painYes: true, note: 'hi' });
    expect(res.status).toBe(200);
    const [booking] = h.store.booking;
    expect(booking.painYes).toBeNull();
    expect(booking).toMatchObject({ clipPaths: [CLIP], goal: 'Dunk', reviewNote: 'hi' });
    expect(booking.submittedAt).toBeInstanceOf(Date);
  });

  it('review submit: the answer is no longer required by the server (it never leaves the browser)', async () => {
    const id = seedBooking();
    const res = await submitReview(BUYER, id, { clips: [CLIP], goal: 'Dunk', note: '' });
    expect(res.status).toBe(200);
    expect(h.store.booking[0].painYes).toBeNull();
  });

  it('review submit: the existing goal and clip checks still answer 400', async () => {
    const id = seedBooking();
    expect((await submitReview(BUYER, id, { clips: [CLIP], goal: 'Nope' })).status).toBe(400);
    expect((await submitReview(BUYER, id, { clips: [], goal: 'Dunk' })).status).toBe(400);
  });

  it('deliver: with no stored answer the review still opens with PAIN_LINE (the store terms promise holds)', async () => {
    const id = seedBooking(null);
    const res = await deliverReview(COACH, id, { replyText: 'Bend the knee.', drills: ['d1'], replyObject: 'coach-reviews/replies/bk-1/r.webm' });
    expect(res.status).toBe(200);
    expect(h.store.booking[0].replyText).toBe(`${PAIN_LINE}\n\nBend the knee.`);
  });

  it('deliver: a legacy row that stored "yes" keeps a single PAIN_LINE', async () => {
    const id = seedBooking(true);
    await deliverReview(COACH, id, { replyText: 'Bend the knee.', drills: ['d1'], replyObject: 'coach-reviews/replies/bk-1/r.webm' });
    expect(h.store.booking[0].replyText.split(PAIN_LINE)).toHaveLength(2);
  });
});

describe('STORE-HURT-OPTIN: the forms keep the answer in memory and never send it', () => {
  const bookSrc = readFileSync('components/coach-store/book-form.tsx', 'utf8');
  const studioSrc = readFileSync('components/coach-store/review-studio.tsx', 'utf8');

  it('book-form sends no painYes to /api/coach-store/checkout', () => {
    expect(bookSrc).not.toMatch(/painYes\s*:/);
  });

  it('review-studio sends no painYes to the submit route, and still asks before Send', () => {
    expect(studioSrc).toContain('JSON.stringify({ clips, goal, note })');
    expect(studioSrc).not.toMatch(/painYes\s*:/);
    expect(studioSrc).toContain("if (pain === null) { setMessage('Check the goal and the pain question.'); return; }");
  });

  it('no opt-in was built: neither form adds a new checkbox label for the answer', () => {
    expect(bookSrc.match(/type="checkbox"/g) ?? []).toHaveLength(1); // the store-terms tick only
  });

  it('the video review form still asks "Does anything hurt?" with Yes / No', () => {
    const html = renderToStaticMarkup(createElement(BookForm as never, { slug: 'elijah', listingId: 'listing-review', kind: 'video_review' } as never));
    expect(html).toContain('Does anything hurt?');
    expect(html).toMatch(/name="pain"[^>]*\/?>\s*Yes/);
    expect(html).toMatch(/name="pain"[^>]*\/?>\s*No/);
    // PAIN_LINE shows only after a "yes" tap, never on first paint.
    expect(html).not.toContain(PAIN_LINE);
  });
});
