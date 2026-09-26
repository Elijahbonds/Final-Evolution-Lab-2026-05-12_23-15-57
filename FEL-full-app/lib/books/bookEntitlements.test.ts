import { describe, expect, it } from 'vitest';
import {
  claimBookEntitlements,
  hasBookAccess,
  mintReaderGrant,
  offerCovers,
  readReaderGrant,
} from './bookEntitlements';

describe('book entitlement check', () => {
  it('a bundle covers the ebook and the audiobook; a single format does not cover the other', () => {
    expect(offerCovers('bundle', 'ebook')).toBe(true);
    expect(offerCovers('bundle', 'audiobook')).toBe(true);
    expect(offerCovers('ebook', 'ebook')).toBe(true);
    expect(offerCovers('ebook', 'audiobook')).toBe(false);
    expect(offerCovers('audiobook', 'ebook')).toBe(false);
  });

  it('only an active row for that book grants access', () => {
    const rows = [
      { bookSlug: 'blueprint', format: 'ebook', status: 'ACTIVE' },
      { bookSlug: 'blueprint', format: 'audiobook', status: 'REVOKED' },
      { bookSlug: 'art-of-dunking', format: 'bundle', status: 'ACTIVE' },
    ];
    expect(hasBookAccess(rows, 'blueprint', 'ebook')).toBe(true);
    expect(hasBookAccess(rows, 'blueprint', 'audiobook')).toBe(false);
    expect(hasBookAccess(rows, 'art-of-dunking', 'audiobook')).toBe(true);
    expect(hasBookAccess(rows, 'art-of-dunking', 'ebook')).toBe(true);
    expect(hasBookAccess(rows, 'unfair-advantages', 'ebook')).toBe(false);
  });

  it('claims guest rows onto the account email, lowercased', async () => {
    const seen: Array<{ userId: string; email: string }> = [];
    const n = await claimBookEntitlements(
      { claimByEmail: async (userId, email) => { seen.push({ userId, email }); return 2; } },
      'user_1',
      '  Buyer@Example.com ',
    );
    expect(n).toBe(2);
    expect(seen).toEqual([{ userId: 'user_1', email: 'buyer@example.com' }]);
  });

  it('a reader grant names the email, and a tampered or expired grant does not', () => {
    const secret = 'test-secret';
    const token = mintReaderGrant(secret, 'Buyer@Example.com', 60, 1_700_000_000_000);
    expect(readReaderGrant(secret, token, 1_700_000_000_000)?.email).toBe('buyer@example.com');
    expect(readReaderGrant(secret, token, 1_700_000_000_000 + 61_000)).toBeNull();
    expect(readReaderGrant('other-secret', token, 1_700_000_000_000)).toBeNull();
    expect(readReaderGrant(secret, `${token}x`, 1_700_000_000_000)).toBeNull();
  });
});
