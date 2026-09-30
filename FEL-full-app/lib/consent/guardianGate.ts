// lib/consent/guardianGate.ts — MIRROR-COACH P5 (2026-09-29): the youth-mode consent gate.
//
// PHASE-5 CONTRACT (youth-mode): decision #6 — "guardian consent before the Mirror or pain check-ins" for anyone
// under 18, and blank reads as under 18 (decision #20, the same rule every other age gate in this app already uses:
// lib/mirror/youth.ts isMinorForMirror, lib/mirror/screenCorrectives.ts youthGateFor, lib/coach/taxonomy.ts
// youthRules, lib/camp/certification.ts needsGuardianConsent — each a small, domain-scoped copy of the same age
// boundary, on purpose: one shared import across unrelated features is how a change to the rule in one place
// silently changes behaviour nobody was looking at in another). This file is that copy for CONSENT GATING
// specifically, and the one movement play's own body-play feature imports directly (PHASE-5 CONTRACT says so by
// name), which is why it stays dependency-free below — no Prisma, no fetch, no Date.now() side effects beyond an
// optional `now` parameter every function already takes a default for.
//
// WHAT THIS FILE DOES NOT DO. It does not read a database and it does not know about GuardianConsent the Prisma
// model — a caller (a route, a server component) reads the rows and hands this module plain objects
// (GuardianConsentLike). That is what "dependency-free" buys: a test here needs no Prisma client, no generated
// public/_prisma/client, and a lane that only has this file can still decide what a minor may or may not do.
//
// EXPOSING isYouth FOR PHASE 7. The breath toolbox (owner decision #11: "ramp-up breath adults-only… behind the
// intake") is not built yet — this phase's job is only to make sure whoever builds it has one boolean to ask, not a
// birth year to re-derive a rule from. `needsGuardian` already IS that boolean (decision #20's "blank = minor" is
// exactly "is this a youth", read for consent purposes) — there is no separate `isYouth` export here because adding
// one would be a second name for the same question this file already answers, which is the exact duplication its own
// header above is warning against for every OTHER copy of this rule.
//
// THE 60 MIN/DAY ACTIVITY TARGET (decision #6's last clause). assumption: repo-wide search (grep for
// target/goal/minute across app/, components/, lib/) found no dashboard that currently shows an adult activity
// target at all — no weekly-minutes figure, no WHO 150-minute reference, nothing profile-view.tsx or /train render
// today. So there is no live adult figure to override for a youth reader yet. `YOUTH_DAILY_ACTIVITY_TARGET_MINUTES`
// is exposed here, tested, and ready — same treatment as isYouth above — for whichever surface adds a daily/weekly
// target next; it is not wired into a screen by this phase because there is no screen yet to wire it into.

/** Under 18, or no birth year on file at all (owner decision #20 — a blank answer reads as the more careful case
 *  until it is answered, the same default lib/mirror/youth.ts, lib/coach/taxonomy.ts and lib/camp/certification.ts
 *  each already use for their own feature). A year-only birth date is compared by calendar year, same as those. */
export function needsGuardian(dobYear: number | null | undefined, now: Date = new Date()): boolean {
  if (dobYear == null) return true;
  return now.getFullYear() - dobYear < 18;
}

/**
 * One guardian-consent request, as this module needs it — never the Prisma row itself (see the file header). A
 * caller building this from a GuardianConsent row (prisma/schema.prisma) passes exactly these four fields.
 */
export interface GuardianConsentLike {
  /** When this request was created — used only to find the CURRENT one when more than one exists (a re-ask after a
   *  revoke, or a resent link, both write a NEW row rather than editing an old one, same append-only shape as
   *  HealthConsent's ledger — lib/health/consent.ts). */
  requestedAt: Date;
  /** Set once the guardian has used the link (app/api/v1/camp/consent GET ?token=). Null while still pending. */
  acceptedAt: Date | null;
  /** Set if this specific consent was withdrawn. A revoked request does not un-revoke by itself — a fresh request
   *  is a new row, same pattern as `acceptedAt`. */
  revokedAt: Date | null;
}

export type GuardianStatus = 'none' | 'pending' | 'accepted' | 'revoked';

/**
 * The CURRENT guardian-consent status for one mentee, from every request on file for them (oldest and newest
 * alike — the caller does not need to pre-filter). Only the most recently REQUESTED row decides the answer: an
 * athlete who asks a second guardian after the first went quiet is not left reading the first request's 'pending'
 * forever, and one who was accepted and later revoked reads 'revoked', not 'accepted', even though an accepted row
 * still sits earlier in the same list.
 */
export function guardianStatus(consents: readonly GuardianConsentLike[]): GuardianStatus {
  if (!consents.length) return 'none';
  const latest = consents.reduce((a, b) => (b.requestedAt > a.requestedAt ? b : a));
  if (latest.revokedAt) return 'revoked';
  if (latest.acceptedAt) return 'accepted';
  return 'pending';
}

/** The three features decision #6 and the PHASE-5 CONTRACT name as guardian-gated. `body_play` has no consumer yet
 *  (movement play's own feature) — named here anyway so its gate exists before its first caller does. */
export type GuardianGatedFeature = 'mirror' | 'pain_checkin' | 'body_play';

export interface GuardianGateInput {
  dobYear: number | null | undefined;
  consents: readonly GuardianConsentLike[];
}

/**
 * May this athlete use `feature` right now? True for anyone who does not need a guardian at all (needsGuardian is
 * false), and otherwise only once `guardianStatus` reads 'accepted'.
 *
 * ONE RULE FOR ALL THREE, on purpose, not an oversight: GuardianConsent (unlike HealthConsent) carries no `scope`
 * column — a mentee's guardian consent is one yes/no, not "yes for the Mirror but no for pain check-ins" — and
 * decision #6 names Mirror and pain check-ins in the same breath with no split between them. `feature` stays a real
 * parameter (not a boolean this collapses to before the switch) so a future feature that DOES need a different rule
 * has somewhere to add one without every existing call site changing its call shape.
 */
export function canUse(feature: GuardianGatedFeature, input: GuardianGateInput, now: Date = new Date()): boolean {
  if (!needsGuardian(input.dobYear, now)) return true;
  switch (feature) {
    case 'mirror':
    case 'pain_checkin':
    case 'body_play':
      return guardianStatus(input.consents) === 'accepted';
    default: {
      const exhaustive: never = feature;
      return exhaustive;
    }
  }
}

/** Owner decision #6's own number: a youth reader's activity target is 60 min/day, not the adult WHO figure (see
 *  the file header — no screen shows either figure yet). Minutes, not sessions: a short daily habit, counted the way
 *  WHO's own youth guideline counts it. */
export const YOUTH_DAILY_ACTIVITY_TARGET_MINUTES = 60;
