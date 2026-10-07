/**
 * lib/policies.ts — policy version + draft content (plumbing only).
 *
 * The actual legal text will be dropped in by Elijah + lawyer.
 * DRAFT — NOT LEGAL TEXT markers are present on every page.
 */

import { BUSINESS_CONTACT_EMAIL, BUSINESS_LEGAL_NAME, BUSINESS_MAILING_ADDRESS } from './legal/business';

// CONTEXT (2026-09-24): bumped from '2026-07-15-draft' with the camera section (Privacy §6). The version is what a
// signup records as the text it accepted (auth-form → /api/signup → User.policyVersion), so a text change that keeps
// the old string leaves that record unable to say which text anyone saw. Nothing compares a stored version with this
// one, so a bump re-prompts no one: it re-labels /privacy and /terms and changes what new signups store. The Terms
// share it and re-label too, although their text did not change. policies.test.ts fails on a text change without one.
// MOVEMENT PLAY P4 (2026-09-25): bumped again with §6's space-check paragraph (the check, the brightness sample, the
// remembered choice, the self-view). 2026-09-24-draft is live and signups recorded it for the text without it.
// MIRROR-COACH P5 (2026-09-29): bumped again with §5's rewrite — Health-Adjacent Data used to be three sentences
// (owner decision #4 was still just "YES, WITH INTAKE + CONSENT" on paper). It now says what a health intake and a
// pain check-in collect, that both need a separate opt-in before anything is gathered, that none of it is sold, used
// for ads, put in a share link, scored or paid, who can see it (the person; a coach only with a live coach_view
// grant), how to export/erase/withdraw, that a minor needs a guardian's consent first, and addresses
// consumer-health-data laws (e.g. Washington's My Health My Data Act) by extending the same rights to everyone
// everywhere rather than only where a given law requires it. 2026-09-25-draft is live and signups recorded it for
// the old three-sentence §5.
// BODY-PLAY-WORKS (2026-10-01): bumped again, §6 only — the body-tracking files come from our own servers only.
// The sentence that said a missing copy falls back to jsDelivr and Google was left over from before that fallback
// was removed. Face scan's model is unchanged. 2026-09-30-draft is the text without this sentence.
// MIRROR-COACH P6 (2026-09-29): bumped again, §5 only — it now names the optional daily check-in (sleep, soreness,
// energy, mood; lib/health/readiness.ts) in what is collected, where it lives, who can see it and what an erase
// deletes, because it is stored under the same health-data consent and §5 listed only the intake and pain
// check-ins. 2026-09-29-draft never shipped (it is on the mirror lane's open PR only), but a new string is the rule
// this file keeps, and it costs nothing: a bump re-prompts no one.
// MIRROR-COACH P7 FIX (2026-09-29, review): bumped again, §5 only — it now names the Dial-Up Breath's use log (lib/breath/
// rampGate.ts; schema.prisma BreathLog) in what is collected, where it lives and what an erase deletes, and says the
// breath waits a week after an erase or a first opt-in. The export and both erases already carried the log while §5
// still listed only the intake, pain and daily check-ins and the consent records (decisions #4, #17, #18; P6 bumped §5
// the same way for the readiness check-in). 2026-09-29b-draft never shipped either; a new string is still the rule.
// MIRROR-COACH-ERASE (2026-09-30, owner 07:53 PT, "No wait and fix"): bumped again, §5 only — an erase keeps the
// consent records as proof of agreement and withdrawal, and it does not start the Dial-Up Breath's first-week wait
// over. A first opt-in still waits that week. 2026-09-29c-draft never shipped either; a new string is still the rule.
// MIRROR-PROGRESS (2026-10-07, owner decision "Add it + version bump"): bumped again, §6 only — the Mirror's "vs your last
// 3" keeps one number per finished set (and when) on the device for anyone whose Mirror results are not saved to their
// account (owner decision 1: under-18s keep their progress on the device only; lib/mirror/deviceProgress.ts), never sent,
// and "Forget on this phone" removes it. 2026-10-01-draft is the text without this paragraph.
// LEGAL-COPY (2026-10-07, FE PM Oct 7 2:39 PM PT, Elijah "I say okay"; the last code step before the store opens): bumped
// to the first non-draft label. What changed: Terms §2 now says 18+ to buy/book, 13–17 only with a parent's consent and
// parent-bought access, and no account under 13; Terms §9 Contact and Privacy §11 Contact are new (legal name, contact
// email, mailing address — all from lib/legal/business.ts); Privacy §10 "When You Buy From the Store" is new (Research &
// Advisor verbatim); §4 says an account is deleted by email (no in-app route yet), §7 names Google Cloud as host, and §5's
// stale "(see §7)" is gone. 2026-10-07-draft is the text without these. A bump re-prompts no one: nothing reads a stored
// version back, so existing consent records stay as each person accepted them.
export const CURRENT_POLICY_VERSION = '2026-10-07';

export const TERMS_CONTENT = `
# Terms of Service

**Version: ${CURRENT_POLICY_VERSION}**

> ⚠️ **DRAFT — NOT LEGAL TEXT.** This is placeholder structure. Final copy
> will be authored by qualified legal counsel before any paid features launch.

## 1. Acceptance

By creating an account on Final Evolution Lab (“the Service”), you agree to
these Terms of Service and our Privacy Policy.

## 2. Account & Eligibility

You must be 18 or older to buy anything, book coaching or a review, or agree to the store terms. Store purchases are for verified adults (18+) only.

If you are 13 to 17, you may use the Service only with a parent or legal guardian’s consent, and any paid access for you is bought by your parent or guardian.

We can’t create an account for anyone under 13. A child under 13 may use the free movement screen only with an adult present, and nothing from it is saved.

## 3. Lab Credits & Virtual Currency

Lab Credits (“LC”) are a virtual soft currency used within the Service.
LC have no real-world monetary value and cannot be exchanged for real currency.

## 4. User Content

You retain ownership of content you create. By submitting content, you grant
us a non-exclusive license to display it within the Service.

## 5. Prohibited Conduct

You agree not to: exploit, abuse, or farm the LC economy; reverse-engineer
the Service; harass other users; or violate applicable law.

## 6. Termination

We may suspend or terminate your account for violations of these Terms.

## 7. Limitation of Liability

_[To be completed by legal counsel.]_

## 8. Changes

We may update these Terms. Continued use after changes constitutes acceptance.

## 9. Contact

${BUSINESS_LEGAL_NAME}
${BUSINESS_CONTACT_EMAIL}
Mail: ${BUSINESS_MAILING_ADDRESS}
`;

export const PRIVACY_CONTENT = `
# Privacy Policy

**Version: ${CURRENT_POLICY_VERSION}**

> ⚠️ **DRAFT — NOT LEGAL TEXT.** This is placeholder structure. Final copy
> will be authored by qualified legal counsel.

## 1. Data We Collect

- **Account data:** email, name, hashed password.
- **Performance data (PRQ):** self-reported or drill-derived fitness
  attributes (e.g. vertical jump, reaction time). Source and timestamp
  are stored with every value.
- **Game session data:** mode, score, duration, win/loss.
- **Coach chat inputs:** messages sent to the AI coach.

## 2. How We Use Your Data

- To operate and improve the Service.
- To compute your Player Readiness Quotient (PRQ).
- Coach chat inputs are processed by AI models to generate responses.

## 3. AI-Generated Content

The Coach and Studio features use AI models. Outputs are generated
guidance, not professional advice. See our AI Disclosure.

## 4. Data Retention & Deletion

You may export or delete your PRQ data at any time from your Profile settings. Until an in-app delete option exists, you can have your account and personal data deleted by emailing ${BUSINESS_CONTACT_EMAIL} from the email address on your account.

## 5. Health-Adjacent Data

PRQ attributes (e.g. vertical, balance, recovery) are fitness metrics. We do not collect medical data through them, and these values are stored with their source and measurement date for full traceability. This section covers a different, separate kind of data: a short health intake, per-exercise pain check-ins and an optional daily check-in, for people who choose to use the Mirror or a coached program.

**What this is.** Before the Mirror or a coached program asks your body to do anything, it can ask you a short intake about your training history and any red-flag symptoms. While you train, you can log a quick pain check-in — which exercise, where it hurt, how much, and an optional note — including a next-morning follow-up. Before a session you can also answer a quick daily check-in — how you slept, how sore you are, your energy and your mood, each on a 1-to-5 scale, every question optional and the whole thing skippable — which only sets how long that day's warm-up runs and whether to offer an easier day. If you are an adult and your answers allow it, a coached program can also offer an optional Dial-Up Breath before a session's key set; when you start one, we note that you used it, which session it was for and when, and nothing else, so we can hold it to its weekly limit. We also ask for your birth year here if we do not already have it, because the rules that apply to a minor are stricter than the rules that apply to an adult.

**Consent first, always.** None of this is collected until you say yes to it, separately from creating an account or accepting this Policy. Saying yes to the Service does not turn this on. If you are under 18, or you have not told us your birth year, a parent or guardian has to give that consent before any of it is collected, and a pain check-in from an under-18 account always tells you to stop and tell an adult rather than offering anything else.

**Where it lives, and where it never goes.** Your intake answers, pain check-ins, daily check-ins, your Dial-Up Breath uses and the birth year you gave us here are stored on FEL's own servers and nowhere else. We do not sell this data, license it, or use it to target advertising, to you or to anyone else. It never appears on a share link, a public page, or anything a coach can forward to someone else — a share carries training content, never a client's data. It is never used to compute your PRQ, never unlocks anything, and never earns Lab Credits, shards or any other reward: what you tell us about pain or how you feel changes what the app suggests next, not what it scores or pays.

**Who can see it.** Only you, by default. Turning on coach access for one specific coach lets that coach read your intake, pain check-ins and daily check-ins; you can turn it off at any time, for one coach or all of them, from Health data in your account settings. Turning it off stops that coach from seeing anything logged after that; it does not erase what they already read.

**Your rights.** You can view, export or erase this data at any time from Health data in your account settings, separately from the rest of your account (see §8). Erasing it deletes your intake answers, your pain check-ins, your daily check-ins and your Dial-Up Breath uses. Your consent records are kept, as proof of what you agreed to and when you withdrew. It never touches a workout plan or your PRQ history, because those never held this data to begin with. The first time you opt in, the Dial-Up Breath waits a week before it is offered. Erasing this data does not start that week over. Withdrawing consent stops new collection immediately and offers you the erase button in the same place.

**Consumer health data laws.** Some places have a law specifically for data like this, beyond ordinary privacy law — for example Washington State's My Health My Data Act. Rather than work out where each law applies, we extend the same protections everywhere, to everyone: a specific opt-in kept separate from the rest of this Policy, no sale of this data under any circumstance, no use of it or of your location to target advertising, and the same view, export, deletion and consent-withdrawal rights described above, honored the same way regardless of where you are.

None of the above is medical advice, and nothing in this section changes §3's AI-Generated Content notice or the Mirror's own on-screen wording: camera-based reads are labelled estimates, they do not diagnose or name a condition, and they describe what a movement builds capacity for, never what it prevents or reduces the risk of.

## 6. Camera and Body Tracking

Some features use your camera: playing with your body as the controller, the Mirror, Prove It and face scan. The camera picture is processed on your device, in your browser. It never leaves your browser and is never stored. Face scan can also read a photo you choose; that photo is handled the same way.

When you play, only numbers worked out from the camera (for example jump height, rep counts or form reads) may be saved to your history. Face scan keeps only the face settings it picks, never the picture.

Before body play, a space check makes sure the camera can see all of you and the floor. It also checks how bright the picture is. Both happen on your device, and nothing from them is sent or saved. Your choice to play a game with your body is remembered on this device only. The small self-view of you is shown only on your screen.

The Mirror can compare a set with your last three. If your Mirror results are not saved to your account, that comparison keeps one number for each finished set, and when it was done, on this device only. It is never sent, and "Forget on this phone" in the Mirror's review removes it.

The tracking model files are downloaded to your device when a camera feature first needs them, so the tracking can run there. The body-tracking files come from our own servers only. Face scan's model file comes from Google's servers (storage.googleapis.com). These downloads never include your picture.

## 7. Third Parties

We do not sell personal data. Payment processing (when enabled) uses Stripe, governed by Stripe’s privacy policy. Google Cloud hosts the site, our database and stored files as our processor/host. See §10 for the store.

## 8. Your Rights

You may request data export (JSON) or deletion via your Profile settings.

## 9. Changes

We may update this Policy. Material changes will be communicated in-app.

## 10. When You Buy From the Store

This section covers the Final Evolution coach store: programs, memberships, live 1:1 sessions and video reviews sold by Final Evolution LLC. The rest of this Policy still applies. Only adults 18 and over can buy, book or join a session, based on the birth year given when the account was created.

**What we collect.** Your account name and email. The details of each order and booking: what you bought, the price, when you paid, your session time and time zone, and any cancellations, reschedules or refunds. What you tell us when you book or request a review: your goal, a short note and your yes-or-no answer to "Does anything hurt?". Messages between you and your coach, including when each one was read. If you use a referral code, whose code it was and the reward it earned them. From Stripe, whether your payment went through and the reference numbers Stripe uses for your customer record, checkout, payment and subscription.

**What we don't collect.** Stripe collects your card details directly, and we never see or store your full card number. Live sessions are not recorded. The video room has no recording feature, and the video goes directly between your device and the coach's device.

**Video reviews.** For a video review you upload up to 3 clips of up to 60 seconds each. They are kept in private cloud storage, and only you and your coach can open them, through links that expire within an hour. We delete your original clips 30 days after your review is delivered, or 30 days after the review is cancelled or refunded if it was never delivered. The coach's reply video and written review stay available to you until you ask us to delete them. Your clips are used only for your review. They are never used for marketing, shown publicly or used to train AI.

**Why we use it.** To take payment, give you access to what you bought, schedule and run your sessions, deliver your reviews, let you and your coach message each other, give you a receipt, pay referral rewards, handle cancellations, refunds and disputes, prevent fraud, and keep the business and tax records the law requires. We use your email to identify your account, show it on your receipt and contact you about an order or booking. Your answer about pain is used only to add a safety note to your coaching. It is never scored, sold or used for ads. Buying from the store does not sign you up for marketing emails.

**Who sees it and who we share it with.** Your coach (today that is Elijah Bonds) sees your booking details, notes, clips and messages so they can coach you. Stripe processes payments: we give Stripe your email and an account reference number, and Stripe handles your payment details under its own privacy policy. Google Cloud hosts the site, our database and the review clip storage. To connect a live session, your device uses a Google connection server, and your device and the coach's device can see each other's network (IP) address, as in any direct video call. The person whose referral code you used is not shown your name or what you bought. We do not sell your personal information or share it for advertising. We may disclose information if the law requires it.

**How long we keep it.** Order, payment, refund and referral records: 7 years after the purchase, for tax and accounting, then deleted. Booking and review details, including your goal, note and pain answer: 2 years after the session or review, then deleted. Original review clips: as described above. Messages with your coach: while your program is active and for 2 years after it ends. Live session connection data: it expires after 10 minutes and is then cleared. Your account details: while your account is open. If you ask us to delete something sooner, we will, except records the law requires us to keep.

**Teens and children.** The store is for adults. A teen aged 13 to 17 can use a program only when a parent or legal guardian buys it on their own adult account. The teen gets an unlock code, and no teen account is created. For a teen purchase we keep the parent's order, a scrambled (hashed) copy of the code, a scrambled copy of a random device token and the date the code was used. We do not collect the teen's name, age, scores, images or video, and the teen's progress stays on the teen's phone. Children under 13 cannot use the store.

**Your rights.** You can ask to see the store information we hold about you, get a copy of it, correct it or delete it. Email FinalEvolution.us@gmail.com from the email address on your account, or write to Final Evolution LLC, ${BUSINESS_MAILING_ADDRESS}. We may ask you to confirm it is you, and we will answer within 45 days. We will not charge you or treat you differently for asking. Records the law requires us to keep, such as tax records, are kept until that period ends. Stripe keeps its own payment records under its own policy.

**California residents.** If you live in California, the rights above are yours: to know what we collect and why, to see it, to correct it, to delete it, and not to be treated differently for using these rights. We do not sell or share your personal information, as California law uses those words.

## 11. Contact

${BUSINESS_LEGAL_NAME}
${BUSINESS_CONTACT_EMAIL}
Mail: ${BUSINESS_MAILING_ADDRESS}
`;
