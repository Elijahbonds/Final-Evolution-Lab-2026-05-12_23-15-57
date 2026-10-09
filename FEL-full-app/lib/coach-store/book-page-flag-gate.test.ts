// BUNDLE-MISSING-PARTS-UI (coach-store flag stays off by default): the book page at
// app/coach/[slug]/book/[listingId]/page.tsx is a server component that notFound()s when COACH_STORE_ENABLED is
// off, before it ever touches the DB or renders BookForm/BundleMissingParts. vitest does not collect app/**, so
// it is pinned from here (the lib/coach-store/unlock-gate.test.tsx pattern). @/lib/db is mocked so importing the
// real prisma client (and its DATABASE_URL) is never required.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    marketplaceListing: { findUnique: async () => { throw new Error('book page must not read the DB while the flag is off'); } },
  },
}));

import BookPage from '@/app/coach/[slug]/book/[listingId]/page';

const ORIGINAL = process.env.COACH_STORE_ENABLED;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.COACH_STORE_ENABLED;
  else process.env.COACH_STORE_ENABLED = ORIGINAL;
});

async function digest(fn: () => Promise<unknown>): Promise<string> {
  try { await fn(); return 'rendered'; } catch (e) { return String((e as { digest?: string }).digest); }
}

describe('/coach/[slug]/book/[listingId] page: coach store flag gate', () => {
  it.each([undefined, '', '0', 'false', 'off'])('flag %j is off: notFound() (a 404), no DB read, nothing new is reachable', async (v) => {
    if (v === undefined) delete process.env.COACH_STORE_ENABLED;
    else process.env.COACH_STORE_ENABLED = v;
    const result = await digest(() => BookPage({ params: { slug: 'elijah', listingId: 'listing-1' } }));
    expect(result).toMatch(/^(NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK;404)$/);
  });
});
