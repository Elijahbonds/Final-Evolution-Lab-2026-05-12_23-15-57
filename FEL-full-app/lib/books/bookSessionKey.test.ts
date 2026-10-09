import { describe, expect, it, vi } from 'vitest';

// verify-checkout is imported for its pure key function only; nothing it would reach is opened.
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/stripe', () => ({ getStripe: () => { throw new Error('not in this test'); } }));

import { verifyIdempotencyKey } from '@/lib/stripe/verify-checkout';
import { bookSessionKey } from './bookFulfill';

describe('book fulfilment shares the release fulfilment key (SEC-F4 follow-up 1, #200)', () => {
  it('bookSessionKey === verifyIdempotencyKey for the same Checkout Session', () => {
    for (const id of ['cs_test_a1', 'cs_live_b2']) expect(bookSessionKey(id)).toBe(verifyIdempotencyKey(id));
  });
});
