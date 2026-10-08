// BUNDLE-MISSING-PARTS-UI: renders the already_owned bundle 409's parts — each missing part with its title,
// formatted price and a Buy button whose accessible name names both; owned parts as plain-text "Owned" with no
// button. No fetch here (the component is presentational; book-form.tsx owns the network calls) and no
// jsdom/testing-library — renderToStaticMarkup, the pattern already used by lib/coach-store/unlock-gate.test.tsx.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BundleMissingParts } from './bundle-missing-parts';
import type { BundlePartWithListing } from '@/lib/coach-store/bundleParts';
import type { OwnedBundlePart } from '@/lib/coach-store/entitlement';

const OWNED_COURSE: OwnedBundlePart = { key: 'signature-dunk-course', title: 'Signature Dunk Course' };
const DUNKING_BUYABLE: BundlePartWithListing = {
  key: 'dunking-plyometrics-8wk', title: 'Dunking & Plyometrics 8-week', priceCents: 7900,
  listingId: 'listing-dunk', listingPriceCents: 7900,
};
const BLUEPRINT_UNAVAILABLE: BundlePartWithListing = {
  key: 'blueprint-series', title: 'Blueprint series', priceCents: 2900, listingId: null, listingPriceCents: null,
};

function render(ui: Parameters<typeof createElement>[0], props: Record<string, unknown>) {
  return renderToStaticMarkup(createElement(ui as never, props as never));
}

describe('BundleMissingParts', () => {
  it('shows a missing part\'s title, formatted price and a Buy button whose aria-label has both', () => {
    const html = render(BundleMissingParts, { owned: [], missing: [DUNKING_BUYABLE], onBuy: () => {} });
    expect(html).toContain('Dunking &amp; Plyometrics 8-week');
    expect(html).toContain('$79.00');
    expect(html).toMatch(/aria-label="Buy Dunking &amp; Plyometrics 8-week, \$79\.00"/);
    expect(html).toContain('<button');
  });

  it('a part with no matched listing (listingId null) shows no Buy button', () => {
    const html = render(BundleMissingParts, { owned: [], missing: [BLUEPRINT_UNAVAILABLE], onBuy: () => {} });
    expect(html).toContain('Blueprint series');
    expect(html).not.toContain('<button');
    expect(html).toContain('Not available');
  });

  it('owned parts render as "Owned" text, not a button', () => {
    const html = render(BundleMissingParts, { owned: [OWNED_COURSE], missing: [], onBuy: () => {} });
    expect(html).toContain('Signature Dunk Course');
    expect(html).toContain('Owned');
    expect(html).not.toContain('<button');
  });

  it('all owned (missing empty): "every part" heading, no "buy the parts" sentence, no Buy buttons', () => {
    const html = render(BundleMissingParts, { owned: [OWNED_COURSE], missing: [], onBuy: () => {} });
    expect(html).toContain('You already own every part of this bundle');
    expect(html).not.toContain("Buy the parts you don&#x27;t have yet");
    expect(html).not.toContain('<button');
  });

  it('some missing: "part of" heading and the "buy the parts" sentence appear', () => {
    const html = render(BundleMissingParts, { owned: [OWNED_COURSE], missing: [DUNKING_BUYABLE], onBuy: () => {} });
    expect(html).toContain('You already own part of this bundle');
    expect(html).toContain("Buy the parts you don&#x27;t have yet");
  });

  it('busyKey marks the matching button aria-busy and disabled', () => {
    const html = render(BundleMissingParts, { owned: [], missing: [DUNKING_BUYABLE], onBuy: () => {}, busyKey: 'dunking-plyometrics-8wk' });
    expect(html).toMatch(/aria-busy="true"/);
    expect(html).toMatch(/disabled=""/);
  });

  it('a per-part error renders with role="alert" next to that part', () => {
    const html = render(BundleMissingParts, {
      owned: [], missing: [DUNKING_BUYABLE], onBuy: () => {}, errors: { 'dunking-plyometrics-8wk': 'Could not start checkout' },
    });
    expect(html).toMatch(/role="alert"[^>]*>Could not start checkout/);
  });

  it('the section has an accessible name via aria-labelledby pointing at the heading', () => {
    const html = render(BundleMissingParts, { owned: [], missing: [DUNKING_BUYABLE], onBuy: () => {} });
    expect(html).toMatch(/<section aria-labelledby="bundle-missing-parts-heading"/);
    expect(html).toContain('id="bundle-missing-parts-heading"');
  });
});
