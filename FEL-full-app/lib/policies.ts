/**
 * lib/policies.ts — policy version + draft content (plumbing only).
 *
 * The actual legal text will be dropped in by Elijah + lawyer.
 * DRAFT — NOT LEGAL TEXT markers are present on every page.
 */

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
// MIRROR-COACH P6 (2026-09-29): bumped again, §5 only — it now names the optional daily check-in (sleep, soreness,
// energy, mood; lib/health/readiness.ts) in what is collected, where it lives, who can see it and what an erase
// deletes, because it is stored under the same health-data consent and §5 listed only the intake and pain
// check-ins. 2026-09-29-draft never shipped (it is on the mirror lane's open PR only), but a new string is the rule
// this file keeps, and it costs nothing: a bump re-prompts no one.
export const CURRENT_POLICY_VERSION = '2026-09-29b-draft';

export const TERMS_CONTENT = `
# Terms of Service

**Version: ${CURRENT_POLICY_VERSION}**

> ⚠️ **DRAFT — NOT LEGAL TEXT.** This is placeholder structure. Final copy
> will be authored by qualified legal counsel before any paid features launch.

## 1. Acceptance

By creating an account on Final Evolution Lab (“the Service”), you agree to
these Terms of Service and our Privacy Policy.

## 2. Account & Eligibility

You must be at least 13 years of age to use the Service. If you are under 18,
you must have a parent or legal guardian’s consent.

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

You may export or delete your PRQ data at any time from your Profile
settings. Account deletion removes all personal data.

## 5. Health-Adjacent Data

PRQ attributes (e.g. vertical, balance, recovery) are fitness metrics. We do not collect medical data through them, and these values are stored with their source and measurement date for full traceability. This section covers a different, separate kind of data: a short health intake, per-exercise pain check-ins and an optional daily check-in, for people who choose to use the Mirror or a coached program.

**What this is.** Before the Mirror or a coached program asks your body to do anything, it can ask you a short intake about your training history and any red-flag symptoms. While you train, you can log a quick pain check-in — which exercise, where it hurt, how much, and an optional note — including a next-morning follow-up. Before a session you can also answer a quick daily check-in — how you slept, how sore you are, your energy and your mood, each on a 1-to-5 scale, every question optional and the whole thing skippable — which only sets how long that day's warm-up runs and whether to offer an easier day. We also ask for your birth year here if we do not already have it, because the rules that apply to a minor are stricter than the rules that apply to an adult.

**Consent first, always.** None of this is collected until you say yes to it, separately from creating an account or accepting this Policy. Saying yes to the Service does not turn this on. If you are under 18, or you have not told us your birth year, a parent or guardian has to give that consent before any of it is collected, and a pain check-in from an under-18 account always tells you to stop and tell an adult rather than offering anything else.

**Where it lives, and where it never goes.** Your intake answers, pain check-ins, daily check-ins and the birth year you gave us here are stored on FEL's own servers and nowhere else. We do not sell this data, license it, or use it to target advertising, to you or to anyone else. It never appears on a share link, a public page, or anything a coach can forward to someone else — a share carries training content, never a client's data (see §7). It is never used to compute your PRQ, never unlocks anything, and never earns Lab Credits, shards or any other reward: what you tell us about pain or how you feel changes what the app suggests next, not what it scores or pays.

**Who can see it.** Only you, by default. Turning on coach access for one specific coach lets that coach read your intake, pain check-ins and daily check-ins; you can turn it off at any time, for one coach or all of them, from Health data in your account settings. Turning it off stops that coach from seeing anything logged after that; it does not erase what they already read.

**Your rights.** You can view, export or erase this data at any time from Health data in your account settings, separately from the rest of your account (see §8). Erasing it deletes your intake answers, your pain check-ins, your daily check-ins and your consent records; it never touches a workout plan or your PRQ history, because those never held this data to begin with. Withdrawing consent stops new collection immediately and offers you the erase button in the same place.

**Consumer health data laws.** Some places have a law specifically for data like this, beyond ordinary privacy law — for example Washington State's My Health My Data Act. Rather than work out where each law applies, we extend the same protections everywhere, to everyone: a specific opt-in kept separate from the rest of this Policy, no sale of this data under any circumstance, no use of it or of your location to target advertising, and the same view, export, deletion and consent-withdrawal rights described above, honored the same way regardless of where you are.

None of the above is medical advice, and nothing in this section changes §3's AI-Generated Content notice or the Mirror's own on-screen wording: camera-based reads are labelled estimates, they do not diagnose or name a condition, and they describe what a movement builds capacity for, never what it prevents or reduces the risk of.

## 6. Camera and Body Tracking

Some features use your camera: playing with your body as the controller, the Mirror, Prove It and face scan. The camera picture is processed on your device, in your browser. It never leaves your browser and is never stored. Face scan can also read a photo you choose; that photo is handled the same way.

When you play, only numbers worked out from the camera (for example jump height, rep counts or form reads) may be saved to your history. Face scan keeps only the face settings it picks, never the picture.

Before body play, a space check makes sure the camera can see all of you and the floor. It also checks how bright the picture is. Both happen on your device, and nothing from them is sent or saved. Your choice to play a game with your body is remembered on this device only. The small self-view of you is shown only on your screen.

The tracking model files are downloaded to your device when a camera feature first needs them, so the tracking can run there. The body-tracking files come from our own servers. Face scan's model file comes from Google's servers (storage.googleapis.com), and if our copy of the body-tracking files is ever missing they come from jsDelivr and Google instead. These downloads never include your picture.

## 7. Third Parties

We do not sell personal data. Payment processing (when enabled) uses
Stripe, governed by Stripe’s privacy policy.

## 8. Your Rights

You may request data export (JSON) or deletion via your Profile settings.

## 9. Changes

We may update this Policy. Material changes will be communicated in-app.
`;
