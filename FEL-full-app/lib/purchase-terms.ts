/**
 * lib/purchase-terms.ts — the Purchase Terms and Refund Policy for FEL's own sales (FEL Pro, the season pass, coin packs,
 * cosmetics) and for coaches' packages bought on FEL, as typed, versioned data (Owner Inbox card C28).
 *
 * Drafted by Claude 2026-10-27 on owner approval; not lawyer-reviewed.
 * (Owner, in chat, 2026-10-27: "You do it. I approve." — the answer to card C28 "Write: refund policy and store terms for
 * FEL Pro and other sales"; what it had to cover is docs/LAUNCH-SALES.md §9. Its blanks are the coordinator's
 * conservative defaults of the same day:
 *   · FEL Pro: cancel any time and keep access to the end of the paid period; a full refund, including the processing
 *     fee, on request within 14 days of a charge;
 *   · coaches' packages: the buyer pays Stripe's processing fee; the coach's refund minimum is a full refund for any
 *     session, or program week, not yet delivered, and a refund returns the processing fee too (REFUND_PROCESSING_FEE on);
 *   · minors: every existing under-18 rule kept exactly (18+ to buy, verified by birth year: lib/stripe/adult-gate.ts).
 *   · assumption: the season pass and coin packs take the same 14 days as FEL Pro and the audiobooks; the owner gave no
 *     number for them. What a refund does to each is what the code does (lib/stripe/refund-revoke.ts).)
 *
 * The coach store (FEL's own programs, memberships, 1:1 and video reviews) and audiobooks keep their own approved text
 * (lib/store-terms.ts, /store-terms); this text points there and changes nothing in it.
 *
 * WHAT IS TRUE IN CODE, AND WHAT IS NOT BUILT YET. A refund ends FEL Pro at once and cancels the subscription; a
 * refunded season pass closes its PRO lane and withdraws its cosmetics; a refunded coin pack takes back its coins, never
 * below zero (lib/stripe/refund-revoke.ts, lib/wallet/stripe-wallet-events.ts). Cancelling FEL Pro in the app is NOT built
 * yet: /api/stripe/portal (Stripe's billing portal) exists, and nothing links to it. So the cancel line names email only,
 * which is true today. Before FEL Pro goes on sale, link the portal from the account page and add it to the cancel line
 * (with a new version): California's automatic renewal law expects an easy online cancel (assumption: a lawyer confirms
 * what applies).
 *
 * The version is what a purchase records when the buyer ticks the box (lib/payments/terms.ts BUYER_TERMS → the Stripe
 * object's terms_version metadata), so a text change needs a new version: purchase-terms.test.ts holds each version to a
 * fingerprint of its text. Pure, client-safe: no prisma, no next/*, no process.env.
 */

import type { StoreTermsSection } from './store-terms';
import { BUSINESS_CONTACT_EMAIL, BUSINESS_LEGAL_NAME } from './legal/business';

export const PURCHASE_TERMS_VERSION = 'purchase-terms-2026-10-27';
export const PURCHASE_TERMS_HREF = '/purchase-terms';

/** Days after a charge in which FEL refunds FEL Pro, the season pass and coin packs on request. */
export const PURCHASE_REFUND_DAYS = 14;

/** The Purchase Terms and Refund Policy, in order. Section ids are stable and word-based. */
export const PURCHASE_TERMS_SECTIONS: readonly StoreTermsSection[] = [
  {
    id: 'title',
    markdown:
      '# Final Evolution Lab Purchase Terms and Refund Policy\n' +
      '\n' +
      `**Version:** ${PURCHASE_TERMS_VERSION}\n` +
      '**Last updated:** October 27, 2026\n',
  },
  {
    id: 'short-version',
    markdown:
      '## The short version\n' +
      '\n' +
      `These terms cover what you buy from FEL in the app: FEL Pro, the season pass, coin packs and cosmetics. They also cover a coach's package that you buy on FEL. You must be 18 or older to buy, and we check your age by your birth year. FEL Pro renews until you cancel. You can cancel at any time and keep FEL Pro until the end of the period you paid for. Ask within ${PURCHASE_REFUND_DAYS} days of a charge and we refund it in full. Payments go through Stripe, and we never see your card number.\n`,
  },
  {
    id: 'who-and-what',
    markdown:
      '## 1. Who sells what\n' +
      '\n' +
      `- **FEL's own products** (FEL Pro, the season pass, coin packs and cosmetics) are sold by **${BUSINESS_LEGAL_NAME}**, a California limited liability company ("FEL," "we," "us").\n` +
      "- **A coach's package** is sold by that coach. The coach is an independent business and the seller of their coaching. FEL takes the payment for the coach through Stripe.\n" +
      '- **The coach store** (FEL\'s own programs, memberships, 1:1 sessions and video reviews) and **audiobooks** are covered by the [store terms](/store-terms), not by these terms.\n' +
      '- These terms add to the [Terms of Service](/terms) and the [Privacy Policy](/privacy). When you tick the box before you pay, you agree to these terms. We save the version you agreed to with your payment.\n',
  },
  {
    id: 'who-can-buy',
    markdown:
      '## 2. Who can buy\n' +
      '\n' +
      '- **Adults (18+) only, verified by birth year.** You can buy only if the birth year on your account shows you are 18 or older. If we don\'t have your birth year yet, we ask for it before you can buy.\n' +
      '- **Under 18:** you can\'t buy anything in the app. A parent or guardian buys any paid access for a 13- to 17-year-old, as the [Terms of Service](/terms) say.\n' +
      '- **Under 13:** you can\'t have an account.\n' +
      '- Virtual items (coins, the season pass and cosmetics) have no cash value and can\'t be exchanged for money.\n',
  },
  {
    id: 'prices-payment',
    markdown:
      '## 3. Prices and payment\n' +
      '\n' +
      '- The price, and for FEL Pro how often you are charged, is shown on the page before you pay.\n' +
      '- Stripe processes every payment. Stripe collects your card details directly, and we never see or store your full card number.\n' +
      "- **A coach's package** shows the coach's price and Stripe's processing fee as its own line. You pay both.\n",
  },
  {
    id: 'fel-pro-renewal',
    markdown:
      '## 4. FEL Pro: renewal and cancelling\n' +
      '\n' +
      '- **It renews automatically.** FEL Pro weekly renews every week and FEL Pro monthly every month. Each renewal is charged to the card you used, at the price shown when you bought, until you cancel.\n' +
      "- **If the price changes,** we will tell you before your next renewal. Cancel before it if you don't want the new price.\n" +
      `- **Cancel at any time** by emailing **${BUSINESS_CONTACT_EMAIL}** from the email address on your account. We cancel it and confirm by email. Cancelling stops the next renewal.\n` +
      '- **You keep FEL Pro until the end of the period you have paid for.** It is not refunded unless you ask within the window in section 5.\n',
  },
  {
    id: 'refunds',
    markdown:
      '## 5. Refunds\n' +
      '\n' +
      '| Product | Refund | What a refund does |\n' +
      '|---|---|---|\n' +
      `| FEL Pro (weekly or monthly) | A full refund of a charge if you ask within ${PURCHASE_REFUND_DAYS} days of it | FEL Pro ends when we refund, and the subscription is cancelled |\n` +
      `| Season pass | A full refund if you ask within ${PURCHASE_REFUND_DAYS} days of purchase | The pass's PRO lane closes and the cosmetics it gave you are removed |\n` +
      `| Coin packs | A full refund if you ask within ${PURCHASE_REFUND_DAYS} days of purchase | The pack's coins are taken back, never below zero. Anything you already bought with coins stays yours |\n` +
      "| Cosmetics | Cosmetics are bought with coins, so they aren't refunded in money | They stay yours |\n" +
      "| A coach's package | The coach's own refund policy. At the least: a full refund for any session, or any program week, not yet delivered | The refunded part, and the same share of the processing fee, come back to you |\n" +
      '| Coach store and audiobooks | As the [store terms](/store-terms) say | As the store terms say |\n' +
      '\n' +
      '- **"Full" means everything you paid,** including any processing fee. We pay Stripe\'s fee ourselves and don\'t take it out of your refund.\n' +
      `- **How to ask:** email **${BUSINESS_CONTACT_EMAIL}** from the email address on your account. For a coach's package, ask your coach first. If you can't sort it out with them, email us.\n` +
      '- Refunds go back to the card you paid with. Your bank may take a few days to show it.\n' +
      '- **Your legal rights:** nothing in this policy limits any right you have under the law that can\'t be waived.\n',
  },
  {
    id: 'changes-contact',
    markdown:
      '## 6. Changes and contact\n' +
      '\n' +
      "- We may update these terms. A change doesn't affect a purchase you already made, or a FEL Pro period you already paid for. We may ask you to agree again before your next purchase.\n" +
      `- Questions: **${BUSINESS_CONTACT_EMAIL}**.\n`,
  },
];

/** The whole text (each section joined with a newline), for the fingerprint test. */
export function purchaseTermsText(sections: readonly StoreTermsSection[] = PURCHASE_TERMS_SECTIONS): string {
  return sections.map((s) => s.markdown).join('\n');
}
