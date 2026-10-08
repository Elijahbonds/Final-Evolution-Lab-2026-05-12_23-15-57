/**
 * STORE-TERMS-2 (PART 2 of 2) — the approved coach-store terms, Part B, as typed data.
 *
 * Same source and same rule as Part A (lib/store-terms/text-a.ts): Research's
 * COACH-STORE-TOS-REFUND-FINAL.md, version store-terms-2026-10-04 (Oct 4 2026), reproduced VERBATIM —
 * not edited, fixed, reflowed, retitled or "improved". FE PM 5:51 PM PT Oct 7. Part B is the refund
 * and cancellation policy (PART 2 of the document), which is why Part A's product sections already
 * point here ("Each product has its own refund rule (Part 2)", "see Part 2, §2.2", "§2.4", "§2.5").
 *
 * Same layout contract as Part A: each section's markdown is the exact lines of that section joined
 * with '\n' plus one trailing '\n', so storeTermsText() reproduces the source text byte-for-byte.
 * Section ids stay STABLE and WORD-BASED (never number-based) so a section can be inserted later
 * without breaking links. Pure, client-safe data: no prisma, no next/*, no process.env, no server-only.
 */

import type { StoreTermsSection } from '../store-terms';

/**
 * Part B of the store terms, in order, appended after Part A. Do not reorder, retitle or edit; the
 * whole-text sha256 in lib/store-terms.test.ts pins every character.
 */
export const STORE_TERMS_TEXT_B: StoreTermsSection[] = [
  {
    id: "refund-policy",
    markdown: "# PART 2. REFUND & CANCELLATION POLICY\n",
  },
  {
    id: "refund-short-version",
    markdown:
      "## 2.0 The short version (plain language)\n" +
      "\n" +
      "Each product has its own refund rule, below. The quick map: a program is refunded only if something on our side keeps it from working; a membership renews monthly until you cancel, and cancelling stops the next renewal — it doesn't refund the current month; a video review can be cancelled before the coach starts work, and is refunded if it's late or never delivered; a live session is refunded in full up to 24 hours before the start, and inside that window there's no refund but one free reschedule. Cancel a membership online at [/account/coaching](/account/coaching) — no phone call, no email, no fee.\n",
  },
  {
    id: "programs-refunds",
    markdown:
      "## 2.1 Programs (one-time digital purchase)\n" +
      "\n" +
      "- **Digital, delivered right away.** A program appears in your account as soon as your payment goes through, so there is no cooling-off return.\n" +
      "- **Refundable when it's broken on our side.** If a technical problem on our side keeps you from getting into a program you bought and we can't fix it within a reasonable time, you get a full refund.\n" +
      "- **Not refundable** for a change of mind, because you finished it, or because the results weren't what you hoped (see §6).\n" +
      "- **Teen purchases.** The same rules apply to a program a parent or guardian buys for a teen. A refunded teen purchase deactivates the teen's unlock code (see §2.3).\n",
  },
  {
    id: "membership-renewal-and-cancellation",
    markdown:
      "## 2.2 Membership renewal and cancellation\n" +
      "\n" +
      "- **Automatic renewal.** FEL Membership and Teen Membership renew **monthly** until you cancel. Each renewal charges the card on file at the then-current monthly price.\n" +
      "- **Reminder of the price.** The monthly price is on the listing and in §3, and it's shown again at checkout before you pay.\n" +
      "- **Cancel online, any time.** Cancel at [/account/coaching](/account/coaching) with one click. No phone call, no email, no cancellation fee, and no minimum term.\n" +
      "- **When cancellation takes effect.** Cancellation stops the next renewal. You keep access until the end of the paid period, and **no partial-month refund** is given for time left in the current month.\n" +
      "- **Failed payment.** If a renewal payment fails, the membership goes past due and no review credit is added for that month. If the payment isn't fixed, the membership ends.\n" +
      "- **Refunds of a renewal charge.** A renewal that already charged is refunded only if it was unauthorized, was a clear billing error, or a refund is required by law. Otherwise the month you paid for stands and the membership simply doesn't renew again.\n",
  },
  {
    id: "teen-membership-refunds",
    markdown:
      "## 2.3 Teen Membership and parent-bought programs (13–17)\n" +
      "\n" +
      "- **The parent or guardian is the buyer,** so the parent or guardian cancels and receives any refund — the teen has no account and holds no purchase.\n" +
      "- **Monthly, cancellable any time.** Teen Membership follows the same renewal and cancellation rules as the adult membership (§2.2).\n" +
      "- **Refund deactivates the code.** When a teen purchase is refunded — a membership renewal, a chargeback, or a refunded program — the teen's unlock code is deactivated. The content locks at the end of the paid period, the next time the phone checks in, or after 7 days offline (see §4.3).\n" +
      "- **Progress stays on the phone.** A refund or cancellation never deletes anything from the teen's phone; the progress already on it stays there.\n",
  },
  {
    id: "video-review-refunds",
    markdown:
      "## 2.4 Async video review ($45)\n" +
      "\n" +
      "- **Free cancellation until the coach starts work.** You can cancel a video review and get a full refund any time before the coach begins your review. Once the coach has started work, the review is no longer refundable for a change of mind.\n" +
      "- **Late delivery.** We aim to deliver within **48 hours of upload** (§4.4). If we don't deliver within 48 hours, you can cancel for a **full refund**.\n" +
      "- **Never delivered.** A review that is never delivered is refunded in full.\n" +
      "- **Clips are deleted either way.** Whether the review is delivered, cancelled or refunded, your original clips are still deleted on the schedule in §4.4 (30 days, or sooner if you delete them).\n" +
      "- **Refund to the original card** through Stripe.\n",
  },
  {
    id: "live-session-refunds",
    markdown:
      "## 2.5 Live 1:1 sessions ($65 / 30 min, $120 / 60 min)\n" +
      "\n" +
      "- **Free cancel or reschedule until 24 hours before the start.** Up to 24 hours before your session, you can cancel for a **full refund** or reschedule free, as often as needed.\n" +
      "- **Inside 24 hours: no refund, one free reschedule.** Within 24 hours of the start there is **no refund**, but you can **reschedule once, free**.\n" +
      "- **A no-show counts as a completed session** and is not refunded.\n" +
      "- **Connection problems.** If the call can't connect, the room offers a **free reschedule** or a switch to an **async video review** instead; the connection reschedule is always free and doesn't use up your one inside-window reschedule.\n" +
      "- **If the coach cancels,** you choose a **full refund** or a free reschedule.\n" +
      "- **Refund to the original card** through Stripe.\n",
  },
  {
    id: "how-to-request-a-refund",
    markdown:
      "## 2.6 How to request a refund\n" +
      "\n" +
      "- Email **FinalEvolution.us@gmail.com** from your account email (or reply to your receipt) with what you bought and when.\n" +
      "- **We answer within 2 business days.** Approved refunds go back to the original card through Stripe; Stripe's posting time to your statement is outside our control.\n" +
      "- **Please contact us before a chargeback.** We'll usually sort out a billing problem faster than a card dispute can — and contacting us first never costs you any card-issuer right (see §12).\n" +
      "\n" +
      "---\n",
  },
  {
    id: "mailing-address",
    markdown:
      "## 2.7 Seller and mailing address\n" +
      "\n" +
      "The Seller for every listing is **Final Evolution LLC** (§1).\n" +
      "\n" +
      "**Final Evolution LLC**\n" +
      "Email: **FinalEvolution.us@gmail.com**\n" +
      "Phone: **(424) 415-8330**\n" +
      "Mail: **{BUSINESS_ADDRESS}**\n",
  },
];
