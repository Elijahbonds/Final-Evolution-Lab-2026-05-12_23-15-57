// lib/analyticsReserved.ts — SELLER-18-1 v3 (Cyber re-review N1 / C1): analytics event names only the SERVER may write.
//
// POST /api/analytics stores whatever event name a client sends, stamped with the caller's own user id. A row whose name
// the server itself trusts as a record (the seller takedown's review record, lib/seller/server.ts, which the takedown
// also reads as its "already held" marker) must never come from a client: a forged 'frozen' row would make the takedown
// skip the Stripe payout freeze. Every name here is dropped at the client door, whatever its spacing or casing.
// Pure, no imports: the analytics route and the seller gate both read it.

/** The seller takedown's durable review record (lib/seller/server.ts SELLER_REVIEW_EVENT). */
export const SELLER_REVIEW_EVENT = 'seller_age_review';

/** Names a client may never write through /api/analytics. */
export const SERVER_ONLY_EVENT_NAMES: ReadonlySet<string> = new Set([SELLER_REVIEW_EVENT]);

/** True for a server-only name, compared trimmed and case-folded (so 'Seller_Age_Review ' is dropped too). */
export function isServerOnlyEventName(name: unknown): boolean {
  return typeof name === 'string' && SERVER_ONLY_EVENT_NAMES.has(name.trim().toLowerCase());
}
