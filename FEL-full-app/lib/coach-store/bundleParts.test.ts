// BUNDLE-MISSING-PARTS-UI: pure helpers (no DB, no network) joining the bundle 409's `missing` parts to a
// matched single-product listing, parsing the 409 body into a UI view model, and building a part's own
// checkout POST body.
import { describe, expect, it } from 'vitest';
import {
  attachListingMatches,
  parseAlreadyOwned,
  partCheckoutBody,
  partIsBuyable,
  partPriceCents,
  type PartListingMatch,
} from './bundleParts';
import type { BundlePart } from './entitlement';

const DUNKING: BundlePart = { key: 'dunking-plyometrics-8wk', title: 'Dunking & Plyometrics 8-week', priceCents: 7900 };
const BLUEPRINT: BundlePart = { key: 'blueprint-series', title: 'Blueprint series', priceCents: 2900 };

describe('attachListingMatches', () => {
  it('a matched key gets listingId/listingPriceCents from the map; an unmatched key gets null for both', () => {
    const map = new Map<string, PartListingMatch>([['dunking-plyometrics-8wk', { listingId: 'listing-dunk', priceCents: 7900 }]]);
    expect(attachListingMatches([DUNKING, BLUEPRINT], map)).toEqual([
      { ...DUNKING, listingId: 'listing-dunk', listingPriceCents: 7900 },
      { ...BLUEPRINT, listingId: null, listingPriceCents: null },
    ]);
  });

  it('existing BundlePart fields are untouched — only the two new fields are added', () => {
    const [out] = attachListingMatches([DUNKING], new Map());
    expect(out.key).toBe(DUNKING.key);
    expect(out.title).toBe(DUNKING.title);
    expect(out.priceCents).toBe(DUNKING.priceCents);
  });

  it('empty missing → empty result, no map lookups needed', () => {
    expect(attachListingMatches([], new Map())).toEqual([]);
  });
});

describe('partPriceCents / partIsBuyable', () => {
  it('prefers listingPriceCents over the bundle-member priceCents', () => {
    const part = { ...DUNKING, listingId: 'l1', listingPriceCents: 8000 };
    expect(partPriceCents(part)).toBe(8000);
    expect(partIsBuyable(part)).toBe(true);
  });

  it('falls back to priceCents when there is no listingPriceCents', () => {
    const part = { ...DUNKING, listingId: 'l1', listingPriceCents: null };
    expect(partPriceCents(part)).toBe(7900);
    expect(partIsBuyable(part)).toBe(true);
  });

  it('no listingId → not buyable regardless of price', () => {
    const part = { ...DUNKING, listingId: null, listingPriceCents: null };
    expect(partIsBuyable(part)).toBe(false);
  });

  it('listingId present but neither price known → not buyable, no price shown', () => {
    const part = { key: 'x', title: 'X', priceCents: null, listingId: 'l1', listingPriceCents: null };
    expect(partPriceCents(part)).toBeNull();
    expect(partIsBuyable(part)).toBe(false);
  });
});

describe('parseAlreadyOwned', () => {
  it('a bundle already_owned 409 with missing → the full view model', () => {
    const json = {
      error: 'already_owned',
      owned: ['signature-dunk-course'],
      missing: [
        { key: 'dunking-plyometrics-8wk', title: 'Dunking & Plyometrics 8-week', priceCents: 7900, listingId: 'listing-dunk', listingPriceCents: 7900 },
        { key: 'blueprint-series', title: 'Blueprint series', priceCents: 2900, listingId: null, listingPriceCents: null },
      ],
      ownedParts: [{ key: 'signature-dunk-course', title: 'Signature Dunk Course' }],
    };
    expect(parseAlreadyOwned(json)).toEqual({
      owned: ['signature-dunk-course'],
      ownedParts: [{ key: 'signature-dunk-course', title: 'Signature Dunk Course' }],
      missing: json.missing,
    });
  });

  it('the plain single-product/listing already_owned 409 (no missing) → null, so the UI shows the existing plain error text', () => {
    expect(parseAlreadyOwned({ error: 'already_owned' })).toBeNull();
  });

  it('a different error (e.g. adults_only) → null', () => {
    expect(parseAlreadyOwned({ error: 'adults_only' })).toBeNull();
  });

  it('missing not an array → null', () => {
    expect(parseAlreadyOwned({ error: 'already_owned', missing: 'nope' })).toBeNull();
  });

  it('missing present but ownedParts absent → ownedParts defaults to []', () => {
    const json = { error: 'already_owned', owned: [], missing: [DUNKING] };
    expect(parseAlreadyOwned(json)?.ownedParts).toEqual([]);
  });

  it('all members owned → missing is [] and owned lists every member (an all-owned 409, still a valid view model)', () => {
    const json = { error: 'already_owned', owned: ['a', 'b'], missing: [], ownedParts: [{ key: 'a', title: 'A' }, { key: 'b', title: 'B' }] };
    expect(parseAlreadyOwned(json)).toEqual({ owned: ['a', 'b'], ownedParts: [{ key: 'a', title: 'A' }, { key: 'b', title: 'B' }], missing: [] });
  });

  it('non-object / null input → null', () => {
    expect(parseAlreadyOwned(null)).toBeNull();
    expect(parseAlreadyOwned(undefined)).toBeNull();
    expect(parseAlreadyOwned('already_owned')).toBeNull();
  });
});

describe('partCheckoutBody', () => {
  it('builds { listingId, beneficiary } from the part\'s own listingId, not the bundle\'s', () => {
    const part = { ...DUNKING, listingId: 'listing-dunk-only', listingPriceCents: 7900 };
    expect(partCheckoutBody(part, 'self')).toEqual({ listingId: 'listing-dunk-only', beneficiary: 'self' });
    expect(partCheckoutBody(part, 'teen')).toEqual({ listingId: 'listing-dunk-only', beneficiary: 'teen' });
  });

  it('throws for a part with no listingId (the UI never calls this for an unbuyable part)', () => {
    const part = { ...DUNKING, listingId: null, listingPriceCents: null };
    expect(() => partCheckoutBody(part, 'self')).toThrow();
  });
});
