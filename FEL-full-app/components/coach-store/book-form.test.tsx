// STORE-PRICE-ON-CARD: the Continue button repeats what the card shows — price, length, billing — built by the
// book page from the listing row (continueLabel in lib/coach-store/priceLabel.ts). The label used to be a plain
// "Continue" that hid the price until Stripe. No jsdom/testing-library — renderToStaticMarkup, the pattern
// already used by components/coach-store/bundle-missing-parts.test.tsx.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BookForm } from './book-form';
import { continueLabel } from '@/lib/coach-store/priceLabel';
import { STORE_PRICES, storePriceByKey } from '@/lib/coach-store/storePrices';
import type { CoachManifest } from '@/lib/coach-store/manifest';

function render(props: Record<string, unknown>) {
  return renderToStaticMarkup(createElement(BookForm as never, { slug: 'elijah', listingId: 'listing-1', ...props } as never));
}

describe('BookForm Continue label', () => {
  it('a live 1:1 repeats "Book 30 min · $65.00" from the listing row', () => {
    const row = storePriceByKey('live-1on1-30')!;
    const html = render({ kind: 'live_1on1', durationMin: 30, continueLabel: continueLabel(row.priceCents, row.manifest as CoachManifest) });
    expect(html).toMatch(/<button[^>]*>Book 30 min · \$65\.00<\/button>/);
    expect(html).not.toContain('>Continue</button>');
  });

  it('a membership repeats "Join · $X/month"', () => {
    const row = storePriceByKey('membership')!;
    const html = render({ kind: 'membership', audience: 'adult', continueLabel: continueLabel(row.priceCents, row.manifest as CoachManifest) });
    expect(html).toMatch(/<button[^>]*>Join · \$29\.99\/month<\/button>/);
  });

  it('every sellable row\'s Continue label renders on the button', () => {
    for (const row of STORE_PRICES) {
      const manifest = row.manifest as CoachManifest;
      const html = render({
        kind: manifest.kind,
        continueLabel: continueLabel(row.priceCents, manifest),
      });
      expect(html, row.key).toContain(continueLabel(row.priceCents, manifest).replace(/&/g, '&amp;'));
    }
  });

  it('without the prop the button stays the plain "Continue" (unchanged default for any other caller)', () => {
    const html = render({ kind: 'video_review' });
    expect(html).toMatch(/<button[^>]*>Continue<\/button>/);
  });
});
