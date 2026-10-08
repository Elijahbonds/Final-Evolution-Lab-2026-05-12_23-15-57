// STORE-PRICE-ON-CARD: the labels every listing card and Continue button show before Stripe. Prices come from
// the listing rows (priceCents → display dollars via formatCents) — the expected strings below are assertions on
// that formatting, not a source the UI reads. The sellable rows are STORE_PRICES (storePrices.ts): the six of
// them the pages render as cards (the two non-dunking programs exist only in a coach's own listing rows).
import { describe, expect, it } from 'vitest';
import { billingPeriodLabel, continueLabel, listingLengthLabel, listingPriceLabel } from './priceLabel';
import { STORE_PRICES, storePriceByKey } from './storePrices';
import { formatCents } from './money';
import type { CoachManifest } from './manifest';

const SELLABLE_KEYS = [
  'dunking-plyometrics-8wk',
  'signature-dunk-course',
  'blueprint-series',
  'bundle-all-three',
  'membership',
  'teen-membership',
  'async-review',
  'live-1on1-30',
  'live-1on1-60',
] as const;

describe('listingPriceLabel: price + length + billing from the row', () => {
  it.each(SELLABLE_KEYS)('%s shows the price from its row', (key) => {
    const row = storePriceByKey(key)!;
    expect(listingPriceLabel(row.priceCents, row.manifest as CoachManifest)).toContain(formatCents(row.priceCents));
  });

  it('memberships say /month', () => {
    expect(listingPriceLabel(2999, { kind: 'membership', audience: 'adult', interval: 'month' })).toBe('$29.99/month');
    expect(listingPriceLabel(1499, { kind: 'membership', audience: 'teen', interval: 'month' })).toBe('$14.99/month');
  });

  it('one-time kinds never say /month', () => {
    for (const key of SELLABLE_KEYS) {
      const row = storePriceByKey(key)!;
      if (row.manifest?.kind === 'membership') continue;
      expect(listingPriceLabel(row.priceCents, row.manifest as CoachManifest), key).not.toContain('/month');
    }
  });

  it('names the length: live sessions in min, programs in weeks', () => {
    expect(listingPriceLabel(6500, { kind: 'live_1on1', durationMin: 30 })).toBe('$65.00 · 30 min');
    expect(listingPriceLabel(12000, { kind: 'live_1on1', durationMin: 60 })).toBe('$120.00 · 60 min');
    expect(listingPriceLabel(7900, { kind: 'program', lane: 'dunking', billing: 'one_time', weeks: 8 })).toBe('$79.00 · 8 weeks');
  });

  it('a program manifest without weeks still reads 8 weeks (the one program length)', () => {
    expect(listingLengthLabel({ kind: 'program', lane: 'dunking', billing: 'one_time' })).toBe('8 weeks');
  });

  it('kinds with no length of their own show price only', () => {
    expect(listingLengthLabel({ kind: 'video_review', maxClips: 3, maxClipSeconds: 60 })).toBeNull();
    expect(listingPriceLabel(4500, { kind: 'video_review', maxClips: 3, maxClipSeconds: 60 })).toBe('$45.00');
    expect(listingPriceLabel(3900, { kind: 'course', product: 'signature-dunk-course', billing: 'one_time' })).toBe('$39.00');
  });
});

describe('continueLabel: the Continue button repeats the card', () => {
  it('live 1:1 reads "Book 30 min · $65.00"', () => {
    expect(continueLabel(6500, { kind: 'live_1on1', durationMin: 30 })).toBe('Book 30 min · $65.00');
    expect(continueLabel(12000, { kind: 'live_1on1', durationMin: 60 })).toBe('Book 60 min · $120.00');
  });

  it('memberships read "Join · $X/month"', () => {
    expect(continueLabel(2999, { kind: 'membership', audience: 'adult', interval: 'month' })).toBe('Join · $29.99/month');
    expect(continueLabel(1499, { kind: 'membership', audience: 'teen', interval: 'month' })).toBe('Join · $14.99/month');
  });

  it('programs repeat the weeks, one-time access kinds repeat the price', () => {
    expect(continueLabel(7900, { kind: 'program', lane: 'dunking', billing: 'one_time', weeks: 8 })).toBe('Buy 8 weeks · $79.00');
    expect(continueLabel(4500, { kind: 'video_review', maxClips: 3, maxClipSeconds: 60 })).toBe('Buy · $45.00');
    expect(continueLabel(11900, {
      kind: 'bundle', product: 'bundle-all-three', billing: 'one_time',
      members: ['dunking-plyometrics-8wk', 'signature-dunk-course', 'blueprint-series'],
    })).toBe('Buy · $119.00');
  });

  it.each(SELLABLE_KEYS)('%s repeats the row price, never a hard-coded amount', (key) => {
    const row = storePriceByKey(key)!;
    const manifest = row.manifest as CoachManifest;
    expect(continueLabel(row.priceCents, manifest)).toContain(formatCents(row.priceCents));
  });
});

describe('billingPeriodLabel', () => {
  it('memberships are /month, everything else has no period suffix', () => {
    expect(billingPeriodLabel({ kind: 'membership', audience: 'adult', interval: 'month' })).toBe('/month');
    expect(billingPeriodLabel({ kind: 'live_1on1', durationMin: 30 })).toBeNull();
    expect(billingPeriodLabel({ kind: 'program', lane: 'dunking', billing: 'one_time', weeks: 8 })).toBeNull();
  });

  it('every sellable row is covered by the STORE_PRICES test data', () => {
    expect(SELLABLE_KEYS.length).toBe(STORE_PRICES.length);
    for (const row of STORE_PRICES) expect(SELLABLE_KEYS).toContain(row.key);
  });
});
