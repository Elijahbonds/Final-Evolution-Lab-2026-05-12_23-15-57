/**
 * lib/coach-terms.ts — the Coach Terms and Payout Terms, as typed, versioned data (Owner Inbox card C12).
 *
 * Drafted by Claude 2026-10-27 on owner approval; not lawyer-reviewed.
 * (Owner, in chat, 2026-10-27: "You do it. I approve." — the answer to card C12 "Approve wording: coach terms and payout
 * terms". The card's draft points were in the session scratchpad, round7/coach-business/terms-DRAFT-for-owner.md, never in
 * the repo. Its out-of-date fee line is fixed: since #445 the BUYER pays Stripe's processing fee. Its blanks are the
 * coordinator's conservative defaults of the same day:
 *   · processing fee: the buyer pays it, on top of the listed price;
 *   · FEL's share: 5% on Coach Free, 0% on Coach Pro (TUNED money, lib/coach-business/config.ts);
 *   · Free and Pro: read from lib/coach-business/config.ts (the client allowance and the Pro price defaults), not typed here;
 *   · the coach's refund minimum: a full refund for any session, or program week, not yet delivered;
 *   · insurance: recommended, not required; no claimed credential the coach does not hold;
 *   · disputes: the coach bears the dispute fee and the loss on their own sales; FEL recovers it from future payouts;
 *   · negative balances: recovered from future payouts; FEL may pause payouts until the balance clears;
 *   · minors: every existing under-18 rule kept exactly (lib/coach/teenGate.ts, lib/coach/coachConsent.ts).)
 *
 * WHAT IS TRUE IN CODE TODAY, AND WHAT THESE TERMS ONLY PERMIT. Every "how it works" line was read from the code: the
 * destination charge with on_behalf_of (lib/coach-business/connect.ts — the coach is the merchant of record), the
 * grossed-up split (lib/coach-business/fees.ts), refunds (REFUND_PROCESSING_FEE, on), Stripe's payout schedule, the client
 * allowance and the Pro gates (lib/coach-business/plan.ts), the client-approved highlights. Two lines give FEL a RIGHT the
 * code does not exercise yet: recovering a lost dispute and a negative balance from future payouts (docs/COACH-BUSINESS.md:
 * "Not built (owner call, payout terms)"). They are written as what FEL may do, not as what happens automatically.
 *
 * The version is what a coach's Stripe account records when they tick the box at Connect onboarding (lib/payments/terms.ts
 * COACH_TERMS_VERSION, recorded on the Express account's metadata), so a text change needs a new version: coach-terms.test.ts
 * holds each version to a fingerprint of its text. Pure, client-safe: no prisma, no next/*, no process.env.
 */

import type { StoreTermsSection } from './store-terms';
import { BUSINESS_CONTACT_EMAIL, BUSINESS_LEGAL_NAME } from './legal/business';
import { COACH_PRO_PRICE_DEFAULT_CENTS, FREE_CLIENT_LIMIT_DEFAULT, PLATFORM_FEE_BPS_FREE_DEFAULT, PLATFORM_FEE_BPS_PRO_DEFAULT, usdPlain } from './coach-business/config';
import { bpsLabel } from './coach-business/fees';

export const COACH_TERMS_DOC_VERSION = 'coach-terms-2026-10-27';
export const COACH_TERMS_PAGE_HREF = '/coach-terms';

const FREE_FEE = bpsLabel(PLATFORM_FEE_BPS_FREE_DEFAULT);
const PRO_FEE = bpsLabel(PLATFORM_FEE_BPS_PRO_DEFAULT);
const PRO_PRICE = usdPlain(COACH_PRO_PRICE_DEFAULT_CENTS);
const CLIENT_LIMIT: number = FREE_CLIENT_LIMIT_DEFAULT;
const CLIENTS = `${CLIENT_LIMIT} active client${CLIENT_LIMIT === 1 ? '' : 's'}`;

/** The Coach Terms and Payout Terms, in order. Section ids are stable and word-based. */
export const COACH_TERMS_SECTIONS: readonly StoreTermsSection[] = [
  {
    id: 'title',
    markdown:
      '# Final Evolution Lab Coach Terms and Payout Terms\n' +
      '\n' +
      `**Version:** ${COACH_TERMS_DOC_VERSION}\n` +
      '**Last updated:** October 27, 2026\n',
  },
  {
    id: 'short-version',
    markdown:
      '## The short version\n' +
      '\n' +
      `You run your own coaching business on FEL. You set your prices, and buyers pay you through Stripe. Buyers pay Stripe's processing fee on top of your price. FEL keeps ${FREE_FEE} of your price on Coach Free and ${PRO_FEE} on Coach Pro. Refunds come out of your sale. You must give a full refund for anything not yet delivered. Disputes and negative balances are yours, and FEL can recover them from your future payouts. You can coach a 13- to 17-year-old only through FEL's invite code or link, after a parent or guardian has said yes. You can never coach anyone under 13.\n`,
  },
  {
    id: 'who-we-are',
    markdown:
      '## 1. Who these terms are between\n' +
      '\n' +
      `- **"FEL," "we," "us"** means **${BUSINESS_LEGAL_NAME}**, a California limited liability company that runs the Final Evolution Lab app and website.\n` +
      '- **"You," "the coach"** means the person or business that coaches clients on FEL.\n' +
      '- These terms add to the general [Terms of Service](/terms) and the [Privacy Policy](/privacy). If they conflict, these terms control for your coaching on FEL.\n' +
      '- You agree to these terms when you tick the box before you set up payments. We save the version you agreed to with your payment account.\n',
  },
  {
    id: 'independent-business',
    markdown:
      '## 2. You are an independent business\n' +
      '\n' +
      "- You are an independent business. You are not FEL's employee, agent or partner, and you can't make promises for FEL.\n" +
      '- You are the seller of your coaching. Each sale is made in your name through your own Stripe account (you are the merchant of record), and FEL processes the payment for you.\n' +
      '- You decide what you offer, your prices (within the limits the app sets), what each package includes, how many clients you take, and your own refund policy, as long as it gives at least what section 6 requires.\n' +
      '- You are responsible for your own taxes. Where the law requires it, Stripe sends you a tax form (such as a 1099-K) for your sales.\n',
  },
  {
    id: 'plans',
    markdown:
      '## 3. Coach Free and Coach Pro\n' +
      '\n' +
      `- **Coach Free:** your profile, packages that clients apply for, a listing in the marketplace, and up to ${CLIENTS}.\n` +
      `- **Coach Pro:** ${PRO_PRICE} a month. Unlimited active clients, AI-drafted weekly updates that you approve, live sessions, and taking payments for your packages.\n` +
      "- Until Coach Pro is on sale, every coach can use the Coach Pro features. Your sales then carry the Coach Free share, unless you already have Coach Pro.\n" +
      '- We will tell you before we change a plan, its limits or its price. A change applies from your next billing period.\n',
  },
  {
    id: 'money',
    markdown:
      '## 4. Prices, fees and what you receive\n' +
      '\n' +
      "- **The buyer pays Stripe's processing fee.** It is shown to the buyer as its own line, on top of your listed price.\n" +
      `- **FEL's share:** ${FREE_FEE} of your listed price on each sale you make on Coach Free, and ${PRO_FEE} on Coach Pro. It is taken as an application fee when the buyer pays.\n` +
      "- **What you receive:** your listed price less FEL's share. Stripe's processing fee never comes out of your price.\n" +
      '- **Monthly packages** are charged every month until you or the client cancels. The same split applies to each month.\n',
  },
  {
    id: 'payouts',
    markdown:
      '## 5. Payouts\n' +
      '\n' +
      '- Stripe pays your money into your Stripe Express account and then to your bank, on Stripe\'s payout schedule. You can see your balance and payouts in your Stripe dashboard.\n' +
      "- FEL doesn't keep your money in its own account.\n" +
      '- You must keep your Stripe account details complete and true. Payments to you can stop while Stripe asks for something.\n',
  },
  {
    id: 'refunds',
    markdown:
      '## 6. Refunds\n' +
      '\n' +
      '- **The minimum you must give:** a full refund for any session, or any program week, that has not been delivered yet, when the client asks. Your own policy can give more, never less.\n' +
      '- **How a refund works:** you refund from your coach business page (or we do it at your request, or when these terms require it). The refunded part of your price comes back out of your sale. FEL hands back the same share of its fee.\n' +
      "- **The processing fee is refunded too, at FEL's cost.** The buyer gets back the matching share of the processing fee, and FEL pays Stripe's fee itself. So a refund never costs you more than the part of your price you refund.\n",
  },
  {
    id: 'disputes',
    markdown:
      '## 7. Disputes and negative balances\n' +
      '\n' +
      "- **Disputes (chargebacks):** if a buyer disputes a payment for your coaching, the dispute fee and any amount lost are yours. Stripe takes them from FEL first. FEL can recover them from your future payouts. If you win, what Stripe returns goes back the same way.\n" +
      '- **Negative balances:** if refunds, disputes or fees leave your Stripe balance below zero, FEL can recover the amount from your future payouts. FEL can also pause your payouts until the balance is back above zero.\n' +
      '- We show you each dispute on your coach business page. Answer them promptly and honestly, with the evidence we ask for.\n',
  },
  {
    id: 'minors',
    markdown:
      '## 8. Coaching minors\n' +
      '\n' +
      '- **Under 13: never.** You may not coach anyone under 13 on FEL.\n' +
      "- **13 to 17:** you may coach a 13- to 17-year-old only through FEL's own invite code or link, and only after a parent or legal guardian has said yes to coached training on FEL. Until then, FEL keeps them off your roster.\n" +
      '- **No contact outside FEL.** Do not contact a client under 18 outside FEL. That means no texts, calls, social media or private messages in other apps.\n' +
      "- A minor's health data is never shown to you. Results on your page are never about anyone under 18.\n" +
      '- Only verified adults (18+) can buy your packages.\n',
  },
  {
    id: 'conduct',
    markdown:
      '## 9. Conduct, credentials and insurance\n' +
      '\n' +
      "- **Credentials:** claim only the certifications, licences and experience you really hold. Don't call yourself a doctor, physical therapist or other licensed professional unless you are licensed as one.\n" +
      "- **Results on your page:** show a client's result only after that client approves it in the app. The client can withdraw it at any time. Never show a result about anyone under 18. Never promise results.\n" +
      '- **Coaching, not medical care.** Do not diagnose or treat injuries or conditions on FEL. Send a client to a qualified professional when they need one.\n' +
      '- **Insurance:** we recommend professional liability insurance for your coaching. It is not required.\n' +
      '- **Respect:** treat clients with respect, follow the law, and follow the community rules in the [Terms of Service](/terms).\n',
  },
  {
    id: 'ending',
    markdown:
      '## 10. Removal and ending\n' +
      '\n' +
      '- We may remove a listing, pause payments to you or close your coach account if you break these terms, put a client at risk or create risk for FEL. When we can, we will tell you why first.\n' +
      '- You can stop coaching on FEL at any time. You must still deliver, or refund under section 6, what clients have already paid for.\n' +
      '- Sections 6, 7 and 8 keep applying to sales made before an account is closed.\n',
  },
  {
    id: 'changes-contact',
    markdown:
      '## 11. Changes and contact\n' +
      '\n' +
      '- We may update these terms. We will tell you before a change applies. If you keep coaching after it applies, you accept it, and we may ask you to tick the box again.\n' +
      `- Questions: **${BUSINESS_CONTACT_EMAIL}**.\n`,
  },
];

/** The whole text (each section joined with a newline), for the fingerprint test. */
export function coachTermsText(sections: readonly StoreTermsSection[] = COACH_TERMS_SECTIONS): string {
  return sections.map((s) => s.markdown).join('\n');
}
