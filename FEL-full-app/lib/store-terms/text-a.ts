/**
 * STORE-TERMS-1 (PART 1 of 2) — the approved coach-store terms, Part A, as typed data.
 *
 * The text is Research's COACH-STORE-TOS-REFUND-FINAL.md, version store-terms-2026-10-04 (Oct 4 2026),
 * reproduced VERBATIM — not edited, fixed, reflowed, retitled or "improved" (not the /book/<listingId>
 * path, not the dates, not the numbering). FE PM 5:51 PM PT Oct 7. STORE-TERMS-2 appends Part B.
 *
 * Each section's markdown is the exact lines of that section joined with '\n' plus one trailing
 * '\n', so storeTermsText() (lib/store-terms.ts) reproduces the source text byte-for-byte. Section ids
 * are STABLE and WORD-BASED (never number-based) so a section can be inserted later without breaking
 * links. Pure, client-safe data: no prisma, no next/*, no process.env, no server-only.
 */

import type { StoreTermsSection } from '../store-terms';

/**
 * Part A of the store terms, in order. STORE-TERMS-2 appends Part B. Do not reorder, retitle or edit;
 * the whole-text sha256 in lib/store-terms.test.ts pins every character.
 */
export const STORE_TERMS_TEXT_A: StoreTermsSection[] = [
  {
    id: "title",
    markdown:
      "# Final Evolution Lab Coach Store: Terms of Service and Refund & Cancellation Policy\n" +
      "\n" +
      "**Version:** store-terms-2026-10-04\n" +
      "**Last updated:** October 4, 2026\n" +
      "\n" +
      "---\n",
  },
  {
    id: "short-version",
    markdown:
      "## The short version (plain language)\n" +
      "\n" +
      "These terms cover everything you buy in the Final Evolution Lab coach store at go.finalevolutiongroup.com: training programs, memberships, video reviews and live 1:1 online sessions. The seller is Final Evolution LLC, a California company, and Elijah Bonds is the coach. This is fitness coaching, not medical care. Jumping and plyometric training can cause injury, so check with a doctor before you start and stop if anything hurts. Results vary, and we don't promise any number of inches. Paid services are for adults. Teens 13–17 can use programs only when a parent or guardian buys them, and a teen's progress stays on the teen's phone. Children under 13 can't use the store. Memberships renew monthly until you cancel, and you can cancel online at any time with one click. Each product has its own refund rule (Part 2). Payments go through Stripe, and we never see your card number. Live sessions aren't recorded unless both of you agree. Questions: **FinalEvolution.us@gmail.com** · **(424) 415-8330**.\n" +
      "\n" +
      "---\n",
  },
  {
    id: "terms-of-service",
    markdown:
      "# PART 1. TERMS OF SERVICE\n",
  },
  {
    id: "who-we-are",
    markdown:
      "## 1. Who we are and what these terms cover\n" +
      "\n" +
      "- **\"We,\" \"us,\" \"FEL\"** means **Final Evolution LLC**, a California limited liability company that runs the Final Evolution Lab app and website (the **\"Site\"**), including go.finalevolutiongroup.com.\n" +
      "- **\"Seller\"** means the business named as the seller on your checkout page and your receipt. **Final Evolution LLC is the Seller for every listing in the store.**\n" +
      "- **\"Coach\"** means the person who delivers the coaching on a listing. That's **Elijah Bonds**: Pro Dunker, NASM Certified Corrective Exercise Specialist (CES), NASM Performance Enhancement Specialist (PES), and author of *The Neuro-Mechanic's Blueprint*.\n" +
      "- **\"Coaching Services\"** means anything bought in the store: programs, memberships, async video reviews and live 1:1 sessions.\n" +
      "- The store pages are the coach page (`/coach/elijahbonds`) and booking pages (`/book/<listingId>`).\n" +
      "- These store terms add to the general Final Evolution Lab [Terms of Service](/terms) and [Privacy Policy](/privacy). If they conflict, these store terms control for store purchases.\n" +
      "- When you check the box at checkout, you agree to these terms. We save the version you agreed to with your purchase.\n",
  },
  {
    id: "who-can-buy",
    markdown:
      "## 2. Who can buy and use the store\n" +
      "\n" +
      "- **Adults (18+), verified.** Only account holders our system has verified as 18 or older can buy, book a live session, request a video review or save progress to an account. If your age isn't verified, checkout won't open.\n" +
      "- **Under 13: not allowed.** Children under 13 can't use the coach store in any way. We don't sell to them or for them, and we don't knowingly collect their information.\n" +
      "- **Teens 13–17: only through a parent or legal guardian.** See §4.3.\n" +
      "  - The **parent or guardian is the buyer** and accepts these terms for themselves and on the teen's behalf.\n" +
      "  - The teen gets an unlock code and **no teen account is created**.\n" +
      "  - Teens can't book live sessions or request video reviews.\n" +
      "- **Your account.** One person per account. Keep your sign-in private. You're responsible for what happens on your account.\n" +
      "- **U.S. buyers only.** The store currently sells only to buyers in the United States.\n",
  },
  {
    id: "prices-and-payment",
    markdown:
      "## 3. Prices and payment\n" +
      "\n" +
      "- **Prices** are in U.S. dollars and shown on each listing before you pay. Current list prices:\n" +
      "\n" +
      "  | Listing | Price | Type |\n" +
      "  |---|---|---|\n" +
      "  | Dunking & Plyometrics, 8-week program | $79 | one-time |\n" +
      "  | FEL Membership | $29.99 / month | renews monthly until you cancel |\n" +
      "  | Teen Membership (bought by a parent or guardian for a 13–17 athlete) | $14.99 / month | renews monthly until cancelled |\n" +
      "  | Async video review | $45 | one-time |\n" +
      "  | Live 1:1 online session, 30 minutes | $65 | one-time, booked by time slot |\n" +
      "  | Live 1:1 online session, 60 minutes | $120 | one-time, booked by time slot |\n" +
      "\n" +
      "- **Payment** is handled by **Stripe** through Stripe Checkout. Stripe collects your card details directly. **FEL never sees or stores your full card number.** Stripe's own terms and privacy policy also apply to the payment.\n" +
      "- **Taxes.** If sales tax applies to your purchase, it's shown at checkout.\n" +
      "- **Referrals.** If you came through someone's referral link, FEL may pay that person a share of FEL's own platform fee. This never changes your price. Referral rewards go only to verified adults, and a refund or chargeback cancels the reward.\n",
  },
  {
    id: "what-you-can-buy",
    markdown:
      "## 4. What you can buy\n",
  },
  {
    id: "programs",
    markdown:
      "### 4.1 Programs (one-time digital purchase)\n" +
      "- **Dunking & Plyometrics, 8 weeks ($79).** This is a structured plan in the app, with drill cards and cues for each day. You re-screen on days 14, 28, 42 and 56.\n" +
      "- **Buy once, keep it.** You get a personal license to use the 8-week program for as long as the Site offers it.\n" +
      "- Buying a program doesn't add a membership, and a membership ending doesn't take away a program you bought.\n",
  },
  {
    id: "fel-membership",
    markdown:
      "### 4.2 FEL Membership ($29.99/month, adults)\n" +
      "- **What's included:** every program the coach releases (Dunking & Plyometrics now, the others as they launch) and **1 async video review credit for each paid month**. Unused credits roll over, up to **2 at a time**.\n" +
      "- **Automatic renewal:** see Part 2, §2.2. You can cancel online at any time.\n" +
      "- A failed payment adds no review credit.\n",
  },
  {
    id: "teen-membership",
    markdown:
      "### 4.3 Teen Membership ($14.99/month) and programs bought by a parent for a teen (13–17)\n" +
      "- **Who buys:** a verified-adult parent or legal guardian, on their own account. Checkout asks \"Who is this for? Me / My teen (13–17).\"\n" +
      "- **How the teen gets access:** the purchase creates a **single-use unlock code** for the parent to give the teen. The teen enters it on their own phone, and no teen account is created.\n" +
      "- **What we store:** the parent's purchase, plus a record that the code was redeemed and a random device token. **We don't collect the teen's name, age, scores, images or video. The teen's progress and movement data stay on the teen's phone and are never uploaded.**\n" +
      "  - The teen can make a one-page progress summary on the phone and choose to share it with the parent.\n" +
      "- **Teen-safe settings:** drills the coach marks as adult-only (for example, max-effort or loaded jumps) are hidden in teen mode.\n" +
      "- **Not included:** video reviews and live sessions.\n" +
      "- **New phone:** the parent can reissue the code from their account. Progress doesn't move to the new phone.\n" +
      "- **When it ends:** if the Teen Membership is cancelled or lapses, the code stops working at the end of the paid period. The phone locks the content the next time it checks in, or after 7 days offline.\n" +
      "- **Parent or guardian promises:** By buying for a teen, you confirm that:\n" +
      "  - you're the teen's parent or legal guardian;\n" +
      "  - the teen is 13–17;\n" +
      "  - you've read §§5–7 (health and safety) and agree to them for yourself and the teen;\n" +
      "  - you'll supervise the teen's training as appropriate for their age and experience, and make sure they have a safe space to train.\n",
  },
  {
    id: "video-review",
    markdown:
      "### 4.4 Async video review ($45, adults 18+)\n" +
      "- You upload **up to 3 clips of up to 60 seconds each**, add your goal and a short note, and answer \"Does anything hurt?\" The coach sends back a **voice-over video** breaking down your film, with drawings on your clip and **1 to 3 drills**.\n" +
      "- **Turnaround:** we aim to deliver your review **within 48 hours of upload**. This is a target, not a guarantee. If it's late, see the late-delivery refund in Part 2, §2.4.\n" +
      "- **Clip deletion:** **your original clips are deleted automatically 30 days after your review is delivered.** You can delete them sooner. The coach's reply video and notes stay in your account until you delete them.\n" +
      "- **Your clips are used only for your review.** They're never used to train AI, never shown publicly, and never used in marketing unless you give separate written permission.\n" +
      "- **Only upload yourself.** Don't upload anyone else, and **never upload a minor.**\n" +
      "- If you answer \"yes\" to \"Does anything hurt?\", your review starts with: *\"This is coaching, not medical advice. If pain continues or gets worse, see a doctor or physical therapist.\"*\n",
  },
  {
    id: "live-sessions",
    markdown:
      "### 4.5 Live 1:1 online sessions ($65 / 30 min, $120 / 60 min, adults 18+)\n" +
      "- **Booking:** pick an open time slot on the booking page. Times show in Pacific time and in your local time.\n" +
      "- **Where:** FEL's own **in-browser video room** on the Site. No outside app or meeting service is used. Only you and the coach can enter, and only around your booked time.\n" +
      "- **What you need:** a device with a camera, a microphone, an up-to-date browser and a stable connection. Some work or school networks block video calls.\n" +
      "- **Connection problems:** if the call can't connect, the room offers a **free reschedule** or a switch to an **async video review**. See Part 2, §2.5 for refunds.\n" +
      "- **Peer-to-peer video:** where possible, the video goes directly between your device and the coach's device. Like any direct call, each side's device can see the other's network (IP) address.\n" +
      "- **Recording:** §8. **Conduct in the room:** §9.\n",
  },
  {
    id: "not-medical-advice",
    markdown:
      "## 5. Not medical advice\n" +
      "\n" +
      "The Coaching Services are **fitness coaching and education only**.\n" +
      "- They are **not medical care**, physical therapy, diagnosis or treatment.\n" +
      "- They don't create a doctor-patient or therapist-patient relationship.\n" +
      "- Our movement screen and re-screens are movement checks, **not medical exams**.\n" +
      "- The coach's certifications are fitness certifications, not medical licenses.\n" +
      "- **Talk to a physician before you start** any new exercise program, especially if you:\n" +
      "  - have, or have had, an injury, surgery, a heart, lung or joint condition, or any other health condition;\n" +
      "  - are pregnant;\n" +
      "  - take medication that affects heart rate or balance;\n" +
      "  - have any pain.\n" +
      "- If you have a medical emergency, call 911.\n",
  },
  {
    id: "no-guaranteed-results",
    markdown:
      "## 6. No guaranteed results\n" +
      "\n" +
      "- **Results vary.** They depend on things like your training history, genetics, consistency, sleep, nutrition and recovery.\n" +
      "- **We don't guarantee any outcome.** That includes any number of inches added to your vertical jump, dunking by a certain date, making a team, or avoiding injury.\n" +
      "- Any example, testimonial or athlete result we show describes that person, not what you'll get.\n" +
      "- NASM and any other organization named in the coach's credentials don't sponsor or endorse the Coaching Services.\n",
  },
  {
    id: "exercise-risk",
    markdown:
      "## 7. Exercise risk and assumption of risk\n" +
      "\n" +
      "- **Exercise carries real risk.** Plyometric and jump training means jumping, bounding, depth drops and hard landings. It can cause injuries such as sprains, strains, tendon injuries, fractures and, rarely, serious injury or death.\n" +
      "- **Train safely:**\n" +
      "  - Use a safe, non-slip surface with enough room and ceiling height, and wear proper footwear.\n" +
      "  - Warm up, and follow the progressions in order.\n" +
      "  - Have someone nearby when you can.\n" +
      "  - **Stop right away** if you feel pain, dizziness, chest pain, shortness of breath or anything that doesn't feel right, and get medical help if needed.\n" +
      "- **You choose** whether to train, how hard and where. You're responsible for your training space and equipment.\n" +
      "- **Assumption of risk.** By using the Coaching Services, you confirm that you understand these risks and **voluntarily accept them**. (When a parent or guardian buys for a teen, the parent accepts them for the teen too.)\n",
  },
  {
    id: "recording-policy",
    markdown:
      "## 8. Recording policy for live sessions\n" +
      "\n" +
      "- **Live sessions are not recorded** by FEL or by the coach. The video room currently has no recording feature.\n" +
      "- **Don't record, screenshot or screen-capture the session** (with any app, device or second camera) **unless both people clearly agree first.** If recording is ever added, the room will ask **both** people to tap \"Allow\" first, and either person can say no.\n" +
      "- California generally requires the consent of **all parties** before a confidential communication is recorded (Cal. Penal Code § 632).\n" +
      "- Notes you take for yourself are fine.\n" +
      "- Async review reply videos aren't live-session recordings. They're the product you bought (§4.4).\n",
  },
  {
    id: "acceptable-use",
    markdown:
      "## 9. Acceptable use (including the video room)\n" +
      "\n" +
      "You agree not to:\n" +
      "- share, resell, post or publish programs, drill cards, reply videos, booking links or unlock codes;\n" +
      "- let anyone else use your account or your teen's code;\n" +
      "- harass, threaten, demean or discriminate against the coach or anyone else;\n" +
      "- show nudity or sexual content, act in a sexual way, or show illegal activity or weapons on camera, in a clip or in a note;\n" +
      "- bring anyone into the session without telling the coach;\n" +
      "- impersonate someone, lie about your age, or try to get around the age checks, the payment system or the video-room access rules;\n" +
      "- probe, scrape, overload, reverse-engineer or break the Site or the video room;\n" +
      "- upload malware, or clips of anyone but yourself.\n" +
      "\n" +
      "**If someone breaks these rules:**\n" +
      "- The coach may **end a session right away** if someone breaks these rules or the coach feels unsafe. A session ended for a client's misconduct isn't refunded.\n" +
      "- We may suspend or close accounts (§14).\n",
  },
  {
    id: "who-owns-what",
    markdown:
      "## 10. Who owns what\n" +
      "\n" +
      "- **Our content.** Programs, drills, cues, videos, text, graphics, the screen and the coach's reply videos belong to Final Evolution LLC or the coach. The same goes for *The Neuro-Mechanic's Blueprint* material and the FEL name and logos. Buying gives you a **personal, non-transferable, non-exclusive, revocable license** to use them for your own training (or your teen's). It isn't a sale of the content.\n" +
      "- **Your content.** Your clips, notes and goals stay yours. You give FEL and the coach a **limited license to store, view, process and annotate them only to deliver the service you bought**, and for no other purpose. That includes no marketing, no public display and no AI training. The license ends when the clips are deleted (§4.4).\n" +
      "  - The coach's annotated reply video includes your clip. You can keep it and use it personally. The coach won't reuse it without your separate written permission.\n" +
      "- **Feedback.** If you send us ideas or suggestions, we can use them without owing you anything.\n",
  },
  {
    id: "privacy",
    markdown:
      "## 11. Privacy\n" +
      "\n" +
      "How we handle personal information is explained in our [Privacy Policy](/privacy). How the free movement screen keeps things private is explained at [/screen/privacy](/screen/privacy): the camera runs on your phone, video isn't uploaded, recorded or saved, and nothing is saved for anyone under 18.\n",
  },
  {
    id: "chargebacks-and-disputes",
    markdown:
      "## 12. Chargebacks and payment disputes\n" +
      "\n" +
      "- **Please contact us first** at FinalEvolution.us@gmail.com or (424) 415-8330. We'll usually sort out a billing problem faster than a card dispute can.\n" +
      "- Contacting us first is a request, not a requirement. **You keep every right you have with your card issuer.**\n" +
      "- **While a chargeback is open**, we may pause access to the disputed item (for example, a program or membership). We restore it if the dispute is resolved in your favor or withdrawn.\n" +
      "- **If a chargeback is filed after you got the service** (for example, a completed session or a delivered review), we may send Stripe and your bank the records showing it was delivered. We may also close the account if the chargeback was filed in bad faith.\n" +
      "- Refunding a charge cancels any referral reward on it, and refunding a teen purchase deactivates the unlock code.\n",
  },
  {
    id: "changes",
    markdown:
      "## 13. Availability, changes to programs, and changes to these terms\n" +
      "\n" +
      "- **Availability.** We work to keep the Site and the video room running, but we can't promise they'll always be available or error-free. If something on our side stops a session, see Part 2, §2.5.\n" +
      "- **Programs may be improved over time**, for example with new drills or better cues. We won't take away the core of a program you've already paid for. If we discontinue a program within 12 months of your purchase, you get a prorated refund or a comparable program.\n" +
      "- **Membership changes.** If we make a material change to a membership's terms, or change its price, we'll tell you ahead of time as required by law, along with how to cancel (Part 2, §2.2).\n" +
      "- **Changes to these terms.** We'll post the new version with a new date and version number. Material changes will be shown in the app before they take effect. A change doesn't affect a session that's already booked or a purchase that's already complete, unless the law requires it.\n" +
      "- **If a coach page is hidden or a coach is suspended.** Live sessions and video reviews already booked with that coach are either delivered as booked or refunded in full to the original payment method, at the buyer's choice where delivery is still possible. Memberships tied to that coach stop renewing, and the current unused period is refunded pro rata.\n",
  },
  {
    id: "suspension-and-termination",
    markdown:
      "## 14. Suspension and termination\n" +
      "\n" +
      "- **You can stop at any time.** Cancel a membership (Part 2, §2.2) or close your account. Closing your account doesn't by itself refund past purchases. Part 2 controls refunds.\n" +
      "- **We may suspend or close an account** if you seriously or repeatedly break these terms, commit fraud or abuse, get around the age checks, file a bad-faith chargeback, or harass the coach. Where it's reasonable, we'll give notice first.\n" +
      "  - If we close your account **without cause**, we'll refund any unused prepaid time and anything not yet delivered.\n" +
      "  - If we close it **for cause**, refunds are at our discretion, except where the law requires them.\n" +
      "- **What survives:** sections on ownership, risk, liability, disputes and payments still apply after an account closes.\n",
  },
  {
    id: "limitation-of-liability",
    markdown:
      "## 15. Limitation of liability\n" +
      "\n" +
      "- **As-is.** The Site and digital content are provided \"as is\" and \"as available.\" To the extent the law allows, we disclaim implied warranties. Our promises about the services you buy are the ones in these terms.\n" +
      "- **Cap.** To the extent the law allows, FEL's and the coach's total liability for any claim about the Coaching Services is limited to **the amount you paid for the Coaching Services involved in the 12 months before the claim**.\n" +
      "- **No indirect damages.** To the extent the law allows, neither FEL nor the coach is liable for indirect, incidental, special or consequential damages, such as lost profits, lost scholarships or lost opportunities.\n" +
      "- **What this doesn't limit:** liability for fraud, willful injury, gross negligence, violation of law, or anything else the law doesn't allow us to limit. It also doesn't limit any non-waivable right you have under California law.\n",
  },
  {
    id: "governing-law-and-disputes",
    markdown:
      "## 16. Governing law and disputes\n" +
      "\n" +
      "- **Governing law.** California law governs these terms, without regard to conflict-of-law rules.\n" +
      "- **Talk to us first.** Before filing a claim, email FinalEvolution.us@gmail.com with a short description. Both sides try in good faith to resolve it within **30 days**.\n" +
      "- **Where disputes go.** Disputes go to the state or federal courts in Los Angeles County, California. Either side may use **small claims court** if the claim qualifies.\n" +
      "- Nothing here stops you from contacting a government consumer-protection agency.\n",
  },
  {
    id: "other-legal-terms",
    markdown:
      "## 17. Other legal terms\n" +
      "\n" +
      "- **Entire agreement.** These terms, the general Site terms, the Privacy Policy and your checkout confirmation are the whole agreement for store purchases.\n" +
      "- **Severability.** If a court finds part of these terms unenforceable, the rest still applies.\n" +
      "- **No waiver.** If we don't enforce something once, we can still enforce it later.\n" +
      "- **Assignment.** We may transfer these terms as part of a merger, sale or reorganization. You may not transfer them.\n" +
      "- **Things outside our control.** We're not responsible for delays caused by things we can't reasonably control, such as outages, natural disasters or a Stripe failure. Prepaid services that we can't deliver are rescheduled or refunded.\n" +
      "- **Electronic communications.** You agree to receive receipts, notices and changes to these terms electronically (in the app and/or by email).\n",
  },
  {
    id: "contact",
    markdown:
      "## 18. Contact\n" +
      "\n" +
      "**Final Evolution LLC**\n" +
      "Email: **FinalEvolution.us@gmail.com**\n" +
      "Phone: **(424) 415-8330**\n" +
      "Mail: **{BUSINESS_ADDRESS}**\n" +
      "\n" +
      "---\n",
  },
];
