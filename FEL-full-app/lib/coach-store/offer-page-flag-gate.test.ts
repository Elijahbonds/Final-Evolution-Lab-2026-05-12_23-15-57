// STORE-OFFER-1: app/coach/offers/[offer]/page.tsx 404s with the coach store flag off, before any session or DB read
// (vitest does not collect app/**, so it is pinned from here — the book-page-flag-gate.test.ts pattern).
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: () => { throw new Error('offer page must not read the DB while the flag is off'); } }) }));
vi.mock('next-auth', () => ({ getServerSession: async () => { throw new Error('offer page must not read the session while the flag is off'); } }));

import OfferPage from '@/app/coach/offers/[offer]/page';

const ORIGINAL = process.env.COACH_STORE_ENABLED;
afterEach(() => { if (ORIGINAL === undefined) delete process.env.COACH_STORE_ENABLED; else process.env.COACH_STORE_ENABLED = ORIGINAL; });
async function digest(fn: () => Promise<unknown>): Promise<string> {
  try { await fn(); return 'rendered'; } catch (e) { return String((e as { digest?: string }).digest ?? (e as Error).message); }
}

describe('/coach/offers/[offer]: coach store flag gate', () => {
  it.each([undefined, '', '0', 'false', 'off'])('flag %j is off: notFound(), no session or DB read', async (v) => {
    if (v === undefined) delete process.env.COACH_STORE_ENABLED; else process.env.COACH_STORE_ENABLED = v;
    for (const offer of ['dunk-jump-review', 'founders-coaching']) expect(await digest(() => OfferPage({ params: { offer } }))).toMatch(/^(NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK;404)$/);
  });
  it('flag on, an unknown offer: notFound() before the session', async () => {
    process.env.COACH_STORE_ENABLED = '1';
    expect(await digest(() => OfferPage({ params: { offer: 'nope' } }))).toMatch(/^(NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK;404)$/);
  });
});
