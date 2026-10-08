/**
 * STORE-LISTING-FORMAT bundle/membership policy — the two open questions for Elijah, each a one-line default.
 * FE PM decision (1:25 PM PT, Oct 4 2026): no SQL, no join table, the JSON manifest used as-is, and these two
 * defaults live here so flipping either answer is a one-line change.
 *
 * 1. membershipIncludesCourses — TRUE (Elijah, 4:18 PM PT Oct 7 2026, STORE-ECON-EDU-10 Phase 3 "memberships SELL
 *    at launch; a membership opens a real program, not an empty page"): a membership (adult or teen) DOES grant the
 *    Signature Dunk Course and the Blueprint series, so it counts as owning them (read by `productsGrantedBy`,
 *    ./entitlement). On the money path this is also the double-charge guard: `ownedProductsFor` (./checkout) maps a
 *    buyer's ACTIVE/PAST_DUE rows through `productsGrantedBy`, so with this true a buyer who already owns the course
 *    or series gets 409 already_owned buying a membership, and a member buying the course or series is blocked the
 *    same way — nobody is charged twice for the same content.
 * 2. bundleOwnedPartsMode — 'block_if_any_owned': buying the bundle while the buyer already owns any of its parts is
 *    blocked with 409 already_owned, and the response lists the missing parts with their individual storePrices
 *    prices. 'allow_full_price' would let the bundle be bought at full price anyway (no credit/proration).
 *    Buying a single part that is already owned (e.g. via the bundle) is always 409 already_owned.
 */
export type BundleOwnedPartsMode = 'block_if_any_owned' | 'allow_full_price';

export const membershipIncludesCourses: boolean = true;
export const bundleOwnedPartsMode: BundleOwnedPartsMode = 'block_if_any_owned';
