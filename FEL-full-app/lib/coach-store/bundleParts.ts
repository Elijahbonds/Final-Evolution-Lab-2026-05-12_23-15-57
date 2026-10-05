/**
 * BUNDLE-MISSING-PARTS-UI. Pure helpers (no I/O) shared by the 409 already_owned bundle response
 * (checkout.ts) and the book-form UI (components/coach-store). Everything here is additive on top of
 * ./entitlement's `BundlePart` / `missingBundleParts` — the pre-existing `error`/`owned`/`missing` fields and
 * BundlePart's `key`/`title`/`priceCents` never change shape.
 */
import type { BundlePart, OwnedBundlePart } from './entitlement';

/** A bundle member's listing lookup result: the single-product listing that sells it, if any is found. */
export interface PartListingMatch {
  listingId: string;
  priceCents: number;
}

/** `missing` once each part has been matched (or not) to the coach's own single-product listing for it. */
export interface BundlePartWithListing extends BundlePart {
  listingId: string | null;
  listingPriceCents: number | null;
}

/**
 * Pure: joins `missing` BundleParts to a key → listing map (built from a DB read elsewhere, see
 * checkout.ts's `findPartListingsFor`). No match → both new fields null (the UI then shows the part as
 * "not available" with no Buy button).
 */
export function attachListingMatches(
  missing: readonly BundlePart[],
  listingsByKey: ReadonlyMap<string, PartListingMatch>,
): BundlePartWithListing[] {
  return missing.map((part) => {
    const match = listingsByKey.get(part.key);
    return { ...part, listingId: match?.listingId ?? null, listingPriceCents: match?.priceCents ?? null };
  });
}

/** The already_owned bundle 409 body, parsed into a UI-ready view model. */
export interface AlreadyOwnedBundleView {
  owned: string[];
  ownedParts: OwnedBundlePart[];
  missing: BundlePartWithListing[];
}

function isBundlePartWithListing(v: unknown): v is BundlePartWithListing {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.key === 'string'
    && (typeof r.title === 'string' || r.title === null)
    && (typeof r.priceCents === 'number' || r.priceCents === null)
    && (typeof r.listingId === 'string' || r.listingId === null || r.listingId === undefined)
    && (typeof r.listingPriceCents === 'number' || r.listingPriceCents === null || r.listingPriceCents === undefined);
}

function isOwnedBundlePart(v: unknown): v is OwnedBundlePart {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.key === 'string' && (typeof r.title === 'string' || r.title === null);
}

/**
 * Pure: the bundle 409's view model, or null when `json` is not a bundle already_owned 409 with `missing`
 * (the plain single-product/listing already_owned 409 has no `missing` and keeps its existing plain-text error).
 */
export function parseAlreadyOwned(json: unknown): AlreadyOwnedBundleView | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, unknown>;
  if (j.error !== 'already_owned') return null;
  if (!Array.isArray(j.missing)) return null;
  const missing = j.missing.filter(isBundlePartWithListing).map((p) => ({
    key: p.key,
    title: p.title,
    priceCents: p.priceCents,
    listingId: p.listingId ?? null,
    listingPriceCents: p.listingPriceCents ?? null,
  }));
  const owned = Array.isArray(j.owned) ? j.owned.filter((v): v is string => typeof v === 'string') : [];
  const ownedParts = Array.isArray(j.ownedParts) ? j.ownedParts.filter(isOwnedBundlePart) : [];
  return { owned, ownedParts, missing };
}

/** The price a part's Buy button shows / its checkout will charge: the matched listing's price, else BundlePart's own. Null means no price is known — the UI shows neither a price nor a button. */
export function partPriceCents(part: BundlePartWithListing): number | null {
  return part.listingPriceCents ?? part.priceCents ?? null;
}

/** A part can be bought on its own only when it has a matched listing AND a known price. */
export function partIsBuyable(part: BundlePartWithListing): boolean {
  return part.listingId !== null && partPriceCents(part) !== null;
}

/** The POST body for a single part's own checkout — the same beneficiary the bundle attempt used. */
export function partCheckoutBody(part: BundlePartWithListing, beneficiary: 'self' | 'teen'): { listingId: string; beneficiary: 'self' | 'teen' } {
  if (!part.listingId) throw new Error('part has no listingId');
  return { listingId: part.listingId, beneficiary };
}
