/**
 * STORE-LISTING-FORMAT bundle/membership policy — the two open questions for Elijah, each a one-line default.
 * FE PM decision (1:25 PM PT, Oct 4 2026): no SQL, no join table, the JSON manifest used as-is, and these two
 * defaults live here so flipping either answer is a one-line change.
 *
 * 1. membershipIncludesCourses — false: a membership (adult or teen) does NOT grant the Signature Dunk Course or
 *    the Blueprint series, so it never counts as owning them (read by `productsGrantedBy`, ./entitlement).
 * 2. bundleOwnedPartsMode — 'block_if_any_owned': buying the bundle while the buyer already owns any of its parts is
 *    blocked with 409 already_owned, and the response lists the missing parts with their individual storePrices
 *    prices. 'allow_full_price' would let the bundle be bought at full price anyway (no credit/proration).
 *    Buying a single part that is already owned (e.g. via the bundle) is always 409 already_owned.
 */
export type BundleOwnedPartsMode = 'block_if_any_owned' | 'allow_full_price';

export const membershipIncludesCourses: boolean = false;
export const bundleOwnedPartsMode: BundleOwnedPartsMode = 'block_if_any_owned';
