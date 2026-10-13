import { describe, expect, it, vi } from 'vitest';

// The real client is never opened: the adapter only needs an object that has (or lacks) the two delegates.
vi.mock('@/lib/db', () => ({ prisma: {} }));

import { BookTablesNotReady, bookTablesReady, prismaBookStore } from './bookStore';

describe('book store before the pending tables exist (prisma/pending/2026-10-09-book-shop.sql)', () => {
  it('is not ready on a client without the book delegates (the release client today)', () => {
    expect(bookTablesReady({ user: {} })).toBe(false);
    expect(bookTablesReady({ bookEntitlement: {} })).toBe(false);
    expect(bookTablesReady(null)).toBe(false);
  });

  it('fails closed: every read and write throws BookTablesNotReady, nothing is granted', async () => {
    const store = prismaBookStore({ user: { findUnique: async () => null } } as never);
    await expect(store.hasEvent('evt_1')).rejects.toBeInstanceOf(BookTablesNotReady);
    await expect(store.listActive({ email: 'a@b.co' })).rejects.toBeInstanceOf(BookTablesNotReady);
    await expect(store.claimByEmail('u1', 'a@b.co')).rejects.toBeInstanceOf(BookTablesNotReady);
    await expect(store.upsertEntitlement({} as never)).rejects.toBeInstanceOf(BookTablesNotReady);
  });

  it('uses the delegates once the client carries them', async () => {
    const findMany = vi.fn(async () => [{ bookSlug: 'blueprint', format: 'bundle', offerId: 'blueprint-bundle', email: 'a@b.co' }]);
    const db = { bookFulfillmentEvent: {}, bookEntitlement: { findMany }, user: {} };
    expect(bookTablesReady(db)).toBe(true);
    const rows = await prismaBookStore(db as never).listActive({ email: 'a@b.co' });
    expect(rows).toEqual([{ bookSlug: 'blueprint', format: 'bundle', status: 'ACTIVE' }]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'ACTIVE', OR: [{ email: 'a@b.co' }] } }));
  });
});
