/**
 * STORE-TERMS (PART 2 of 2) — the approved coach-store terms, Part B, as typed data.
 *
 * The text is Research's COACH-STORE-TOS-REFUND-FINAL.md, version store-terms-2026-10-04 (Oct 4 2026),
 * Part 2 (Refund & Cancellation Policy, sections 2.1-2.7), reproduced VERBATIM — not edited, fixed,
 * reflowed, retitled or "improved". FE PM 5:51 PM PT Oct 7; copied in by AM (FE PM 3:37 AM PT Oct 8),
 * generated from the same approved section data as Part A. The business mailing address is the
 * {BUSINESS_ADDRESS} token, rendered from lib/legal/business.ts; never typed here.
 *
 * Each section's markdown is the exact lines of that section joined with '\n' plus one trailing
 * '\n', so storeTermsText() (lib/store-terms.ts) over [...STORE_TERMS_TEXT_A, ...STORE_TERMS_TEXT_B]
 * reproduces the source text byte-for-byte. Section ids are STABLE and WORD-BASED (never number-based)
 * so a section can be inserted later without breaking links. Pure, client-safe data: no prisma,
 * no next/*, no process.env, no server-only.
 */

import type { StoreTermsSection } from '../store-terms';

/**
 * Part B of the store terms, in order, appended after Part A. Do not reorder, retitle or edit;
 * the whole-text sha256 pins every character.
 */
export const STORE_TERMS_TEXT_B: StoreTermsSection[] = [
  {
    id: "refund-policy",
    markdown:
      "# PART 2. REFUND & CANCELLATION POLICY\n" +
      "\n" +
      "This policy is part of the Terms of Service above. \"Refund\" means money back to your original payment method through Stripe. Refunds are made within **5 business days** of approval. Banks usually take **5–10 business days** to post a refund after that. We don't control that timing.\n" +
      "\n" +
      "**How to ask for a refund or cancel:** use the buttons on your account page (`/account/coaching`), or email FinalEvolution.us@gmail.com, or call or text (424) 415-8330. We count a request by when you sent it, not when we read it.\n" +
      "\n" +
      "Quick view:\n" +
      "\n" +
      "| Product | Rule |\n" +
      "|---|---|\n" +
      "| 8-week program ($79) | Full refund within **14 days** of purchase |\n" +
      "| Membership ($29.99/mo) | Cancel anytime online; access to end of the paid month; **no partial-month refunds**; first charge refundable within 7 days if no review credit used |\n" +
      "| Teen Membership ($14.99/mo) | Same as Membership; the parent cancels |\n" +
      "| Async review ($45) | Full refund before you upload; full refund if not delivered within **7 days** of upload |\n" +
      "| Live 1:1 ($65 / $120) | Free cancel or reschedule until **24 h** before; inside 24 h, no refund but one free reschedule |\n" +
      "| Client no-show | No refund; session counts as used |\n" +
      "| Coach no-show or coach cancels | **Full refund** or free reschedule, your choice |\n" +
      "| Tech failure on our side | Free reschedule, switch to video review, or full refund, your choice |\n",
  },
  {
    id: "refund-program",
    markdown:
      "## 2.1 Dunking & Plyometrics 8-week program ($79, one-time)\n" +
      "\n" +
      "- You get a **full refund if you ask within 14 days of purchase**, no questions asked. That window ends right at your first re-screen (day 14). After 14 days, purchases are final, except where Terms §13 (discontinued program) or the law says otherwise.\n" +
      "- **One refund per person per program.** If you buy the same program again after a refund, the second purchase is final after the window.\n" +
      "- **Teen purchases:** the parent asks for the refund. The refund **deactivates the teen's unlock code**. The teen's progress stays on their phone, but the program locks.\n" +
      "- A refund ends your license to the program content.\n",
  },
  {
    id: "refund-membership",
    markdown:
      "## 2.2 FEL Membership ($29.99/month) and Teen Membership ($14.99/month): automatic renewal terms\n" +
      "\n" +
      "> **Automatic renewal terms (shown at checkout right next to the \"Subscribe\" button, and in your receipt):**\n" +
      "> **Your membership renews automatically every month and you'll be charged the monthly price ($29.99 for the FEL Membership, $14.99 for the Teen Membership, plus any tax) on the same day each month until you cancel.** There is no minimum commitment. **You can cancel anytime online** from your account page with one click, or by emailing FinalEvolution.us@gmail.com. Cancelling stops future charges; you keep access until the end of the month you've already paid for. Partial months aren't refunded, except as described in this policy. If we ever change the price, we'll tell you 7 to 30 days before the new price applies, and you can cancel before then.\n" +
      "\n" +
      "**Cancelling**\n" +
      "- **Online, any time, at once:** a prominent **\"Cancel membership\"** button on your account page. No call, chat or email is needed. We may ask you to sign in.\n" +
      "- **If you can't sign in**, email FinalEvolution.us@gmail.com from the address on your account, or call or text (424) 415-8330.\n" +
      "  - If you leave a voicemail asking to cancel, we'll **process it or call you back within one business day**.\n" +
      "- If we ever show an offer when you cancel, a **\"Click to cancel\"** button stays visible the whole time.\n" +
      "- Cancelling **stops the next renewal**. You keep access, and any banked review credits, **until the end of the period you've paid for**. Unused credits then expire.\n" +
      "- For the **Teen Membership**, the parent or guardian (the buyer) cancels from their own account. The teen's code goes inactive at the end of the paid period.\n" +
      "\n" +
      "**Refunds**\n" +
      "- **Cancel anytime; no refunds for partial months**, except:\n" +
      "  - **First charge:** a full refund if you ask within **7 days** of your first membership charge and haven't used a review credit.\n" +
      "  - **Forgotten renewal:** a full refund of a renewal charge if you ask within **48 hours** of that charge and haven't used anything since.\n" +
      "- If a review credit was used in the month, that month's charge isn't refunded. Banked credits have no cash value.\n",
  },
  {
    id: "refund-teen-membership",
    markdown:
      "## 2.3 Teen Membership: extra notes\n" +
      "- The **parent or guardian** is the buyer and the \"consumer\" for automatic-renewal purposes. All notices and cancellation go to them.\n" +
      "- The same refund rules as the adult Membership (§2.2) apply.\n" +
      "- A refund or cancellation deactivates the unlock code at the end of the paid period, or right away for a full refund.\n",
  },
  {
    id: "refund-video-review",
    markdown:
      "## 2.4 Async video review ($45)\n" +
      "\n" +
      "- **Before you upload:** cancel any time for a **full refund**.\n" +
      "- **After you upload, before delivery:** we don't refund just because you changed your mind once the coach has started.\n" +
      "- **Late delivery:**\n" +
      "  - Target turnaround is **48 hours** from upload.\n" +
      "  - If your review isn't delivered within **7 days** of your upload, you can ask for a **full refund** or keep waiting.\n" +
      "- **Unusable clips:** if your clip can't be reviewed (for example it's too dark, too short, or not of you), we'll ask for a new one before the clock starts. If you don't send one within **14 days**, we refund in full.\n" +
      "- **After delivery:** the review is final. If something's clearly wrong (wrong clip reviewed, missing drills, broken video), tell us within **7 days** and we'll redo it or refund it.\n" +
      "- **Membership review credits** aren't refunded as cash. A late review returns the credit (up to the 2-credit cap) instead.\n",
  },
  {
    id: "refund-live-sessions",
    markdown:
      "## 2.5 Live 1:1 online sessions ($65 / 30 min, $120 / 60 min)\n" +
      "\n" +
      "**Cancelling or rescheduling**\n" +
      "- **More than 24 hours before the start:** cancel for a **full refund**, or reschedule for free.\n" +
      "- **Within 24 hours of the start:** **no refund**, but you get **one free reschedule** for that booking.\n" +
      "- The 24 hours count from the scheduled start time on your confirmation, whatever time zone you're in.\n" +
      "\n" +
      "**If you don't show up**\n" +
      "- If you haven't joined within **10 minutes** of the start, the coach may close the session. It **counts as used, with no refund**.\n" +
      "- Joining late gets you **the time that's left**; the session isn't extended.\n" +
      "\n" +
      "**If the coach doesn't show up or cancels**\n" +
      "- If the coach cancels, or hasn't joined within **10 minutes** of the start, you choose a **full refund** or a free reschedule.\n" +
      "- If the coach is late but joins, you get your full booked time, or a partial refund for the missed minutes if your schedule can't stretch.\n" +
      "\n" +
      "**If the technology fails on our side** (the video room can't connect, or our servers go down)\n" +
      "- You choose: a **free reschedule** that **doesn't use up** your one free reschedule, a switch to an **async video review**, or a **full refund**.\n" +
      "- If the problem is on your side (your network, device or browser), the normal 24-hour rule applies. But if it's a first-time problem, the coach can offer a reschedule as a courtesy.\n" +
      "\n" +
      "**Session ended for misconduct:** no refund (Terms §9).\n",
  },
  {
    id: "refund-every-product",
    markdown:
      "## 2.6 Things that apply to every product\n" +
      "\n" +
      "- **Stripe fees:** Stripe doesn't return its processing fees on a refund. **We refund the full price you paid** and absorb that fee ourselves. We don't deduct it from your refund.\n" +
      "- **Promotions or discounts:** a refund returns what you actually paid.\n" +
      "- **Refunds and credits have no cash value** except as stated above.\n" +
      "- **Your legal rights:** nothing in this policy limits any right you have under the law that can't be waived.\n" +
      "- **Changes:** a change to this policy doesn't affect a session already booked or a purchase already made. Membership changes follow §2.2.\n",
  },
  {
    id: "mailing-address",
    markdown:
      "## 2.7 Business mailing address\n" +
      "You can also send cancellation requests and notices by mail to:\n" +
      "{BUSINESS_ADDRESS}\n",
  },
];
