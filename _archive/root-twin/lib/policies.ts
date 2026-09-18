/**
 * lib/policies.ts — policy version + draft content (plumbing only).
 *
 * The actual legal text will be dropped in by Elijah + lawyer.
 * DRAFT — NOT LEGAL TEXT markers are present on every page.
 */

export const CURRENT_POLICY_VERSION = '2026-07-15-draft';

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

PRQ attributes (e.g. vertical, balance, recovery) are fitness metrics.
We do not collect medical data. These values are stored with their source
and measurement date for full traceability.

## 6. Third Parties

We do not sell personal data. Payment processing (when enabled) uses
Stripe, governed by Stripe’s privacy policy.

## 7. Your Rights

You may request data export (JSON) or deletion via your Profile settings.

## 8. Changes

We may update this Policy. Material changes will be communicated in-app.
`;
