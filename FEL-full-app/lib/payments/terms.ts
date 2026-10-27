// lib/payments/terms.ts — PAYMENTS-READY (2026-10-26): the terms a buyer or a coach agrees to before Stripe is called.
//
// THE PATTERN IS THE STORE TERMS' (lib/store-terms.ts, lib/coach-store/checkout.ts STORE-TERMS T4): the page sends
// `termsAccepted: true` and the `termsVersion` it showed; the server refuses anything else with 409 terms_required
// (naming the current version) BEFORE any Stripe call; the accepted version, and here also the time, ride on the Stripe
// object's metadata (`terms_version`, `terms_accepted_at`), so a refund or a dispute can say which text was agreed and
// when. No new column: the money record at Stripe is the record, as for the coach store.
//
// WHICH TERMS (OWNER-APPROVALS, 2026-10-27; owner, in chat: "You do it. I approve." — cards C12 and C28. Both texts:
// drafted by Claude 2026-10-27 on owner approval; not lawyer-reviewed).
//   · Buyers (a coach's package through Connect, and FEL Pro): the Purchase Terms and Refund Policy,
//     PURCHASE_TERMS_VERSION, at /purchase-terms (lib/purchase-terms.ts, card C28). They name both products: FEL Pro as
//     FEL's own sale, a coach's package as the coach's, with FEL's refund minimum. Until 2026-10-27 both ticked the coach
//     store's terms (/store-terms), which name neither; those stay the coach store's and the audiobooks' terms.
//   · Coaches (Stripe Connect onboarding, and the coach business's live switch): the Coach Terms and Payout Terms,
//     COACH_TERMS_VERSION, at /coach-terms (lib/coach-terms.ts, card C12). Setting it lifts the live-mode refusal
//     (coach_terms_unsigned): live coach payments still need the owner's COACH_CONNECT_LIVE and a live key.
//     Before 2026-10-27 the terms were not written and COACH_TERMS_VERSION was null. While it is null:
//       – test mode still runs end to end: the coach ticks the box and the account records the placeholder version
//         COACH_TERMS_TEST_PLACEHOLDER, which no live account can carry;
//       – LIVE mode refuses to start: COACH_CONNECT_LIVE with a live key answers 409 store_closed coach_terms_unsigned
//         (lib/coach-business/connect.ts connectGate, lib/coach-business/pro.ts proGate), and the preflight says so.
//     When the owner has signed text, set COACH_TERMS_VERSION to its version and COACH_TERMS_HREF to its page. This file
//     never holds terms text.
import { COACH_TERMS_DOC_VERSION, COACH_TERMS_PAGE_HREF } from '@/lib/coach-terms';
import { PURCHASE_TERMS_HREF, PURCHASE_TERMS_VERSION } from '@/lib/purchase-terms';

/** The coach terms + payout terms version. null = not written yet: live coach payments refuse to start. Written
 *  2026-10-27 on the owner's approval (card C12). */
export const COACH_TERMS_VERSION: string | null = COACH_TERMS_DOC_VERSION;
/** Where the coach terms are read. null while they do not exist (the box says they are not published yet). */
export const COACH_TERMS_HREF: string | null = COACH_TERMS_PAGE_HREF;
/** The version a TEST-mode account records while COACH_TERMS_VERSION is null. Never accepted in live mode. */
export const COACH_TERMS_TEST_PLACEHOLDER = 'coach-terms-unsigned-test-mode';

/** The buyer-side terms, per product that asks: the Purchase Terms and Refund Policy (card C28) for both. */
export const BUYER_TERMS = {
  coach_package: { version: PURCHASE_TERMS_VERSION, href: PURCHASE_TERMS_HREF },
  fel_pro: { version: PURCHASE_TERMS_VERSION, href: PURCHASE_TERMS_HREF },
} as const;
export type BuyerTermsProduct = keyof typeof BUYER_TERMS;

/** What a request carries (the store-terms field names, so every page sends the same shape). */
export interface TermsBody { termsAccepted?: unknown; termsVersion?: unknown }

export interface AcceptedTerms { version: string; acceptedAt: string }
export type TermsCheck = { ok: true; accepted: AcceptedTerms } | { ok: false; status: 409; body: { error: 'terms_required'; version: string | null } };

/**
 * The tick, checked: accepted only when `termsAccepted` is exactly true and `termsVersion` is exactly `expected`.
 * `expected` null (terms not written, live mode) never accepts. Pure; `now` stamps the acceptance.
 */
export function checkTerms(body: TermsBody | null | undefined, expected: string | null, now: Date = new Date()): TermsCheck {
  const b = body ?? {};
  if (expected === null || b.termsAccepted !== true || b.termsVersion !== expected) {
    return { ok: false, status: 409, body: { error: 'terms_required', version: expected } };
  }
  return { ok: true, accepted: { version: expected, acceptedAt: now.toISOString() } };
}

/** The Stripe metadata of an acceptance (the store terms' `terms_version` key, plus the time). */
export function termsMetadata(a: AcceptedTerms, prefix = ''): Record<string, string> {
  return { [`${prefix}terms_version`]: a.version, [`${prefix}terms_accepted_at`]: a.acceptedAt };
}

/**
 * The coach-terms version a coach must accept now: the signed version when there is one; in TEST mode, while none is
 * signed, the placeholder; in LIVE mode, while none is signed, null (nothing can be accepted, so nothing opens).
 */
export function coachTermsVersionFor(live: boolean, signed: string | null = COACH_TERMS_VERSION): string | null {
  if (signed) return signed;
  return live ? null : COACH_TERMS_TEST_PLACEHOLDER;
}

/** May the coach business run in live mode? Only once the coach terms are signed. */
export function coachTermsSigned(signed: string | null = COACH_TERMS_VERSION): boolean {
  return typeof signed === 'string' && signed.length > 0;
}

/** What the coach's tick box needs to render: the version to send back, the link (or none yet). */
export interface CoachTermsView { version: string | null; href: string | null; signed: boolean }

export function coachTermsView(live: boolean, signed: string | null = COACH_TERMS_VERSION, href: string | null = COACH_TERMS_HREF): CoachTermsView {
  return { version: coachTermsVersionFor(live, signed), href: signed ? href : null, signed: coachTermsSigned(signed) };
}
