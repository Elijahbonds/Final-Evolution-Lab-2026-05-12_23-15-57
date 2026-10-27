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

import { gapUnderEighteenYears } from '@/lib/age/ageRules';

/** Under 18, or no birth year on file at all (owner decision #20 — a blank answer reads as the more careful case
 *  until it is answered, the same default lib/mirror/youth.ts, lib/coach/taxonomy.ts and lib/camp/certification.ts
 *  each already use for their own feature). A year-only birth date is compared by calendar year, same as those.
 *
 *  AGE-HELPERS-CONSOLIDATE (2026-10-04, option (a)): this file's own guard (`== null` only — NOT `!dobYear`, so a
 *  dobYear of 0 or NaN falls through to the arithmetic below rather than short-circuiting) is unchanged; only the
 *  `< 18` threshold line itself is shared, from lib/age/ageRules.ts's gapUnderEighteenYears (its NaN-safe `< 18`
 *  form — see that function's own doc comment for why this is NOT `!gapAtLeastEighteenYears(...)`). */
export function needsGuardian(dobYear: number | null | undefined, now: Date = new Date()): boolean {
  if (dobYear == null) return true;
  return gapUnderEighteenYears(dobYear, now);
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

/**
 * WHAT A GUARDIAN'S YES COVERS, in the words both guardian screens say it (app/consent/guardian/[token]/page.tsx for a
 * coach's or camp's link, player-request.tsx for the athlete's own). MIRROR-COACH P6 FIX (2026-09-29, code review —
 * "the guardian's yes now unlocks the daily readiness check-in, but the guardian is never told"): the screens read this
 * list, so what a guardian is asked to OK is exactly what the yes unlocks.
 *
 * OWNER DECISION 2026-10-06 ("Match today"): the list named the Mirror, pain check-ins and the daily check-in, which a
 * guardian's yes no longer unlocks — TEEN-WRITE-BLOCK (2026-09-29) saves pain and daily check-ins only for a verified
 * 18+ (canWriteHealthData, guardian or not), and the Mirror runs on the device for everyone with no guardian gate,
 * saving nothing under 18 (app/play/mirror/page.tsx). What an accepted consent unlocks today is one thing: a camp plan
 * going live (app/api/v1/camp/plans 'activate' refuses a minor's plan with guardian_consent_required without one) —
 * what /consent/guardian already tells the player (0c4ddb47). So the guardian is now asked for exactly that.
 * Copy only: no stored consent is touched or re-asked. A GuardianConsent row records no wording (prisma/schema.prisma),
 * and every reader (the plans route, guardianStatus, canUse) reads acceptedAt / revokedAt alone, so a consent given
 * under the old, wider wording still reads accepted — it covered more than this, never less.
 * `canUse` and its GuardianGatedFeature list are unchanged (readiness GET still reads them); when a new thing starts
 * to need a guardian's yes, it gets a line here before it ships.
 */
export type GuardianConsentUnlock = 'camp_plan';
export const GUARDIAN_CONSENT_COVERS: readonly { unlocks: GuardianConsentUnlock; words: string }[] = [
  { unlocks: 'camp_plan', words: 'start a camp plan their coach builds with them' },
];

/** "Before Sam can start a camp plan their coach builds with them, we ask a parent or guardian to confirm that's OK."
 *  (A longer list joins as "a, b or c".) */
export function guardianConsentAsk(menteeName: string): string {
  const w = GUARDIAN_CONSENT_COVERS.map((c) => c.words);
  const list = w.length > 1 ? `${w.slice(0, -1).join(', ')} or ${w[w.length - 1]}` : w[0];
  return `FEL is a training app. Before ${menteeName} can ${list}, we ask a parent or guardian to confirm that's OK.`;
}

/** Owner decision #6's own number: a youth reader's activity target is 60 min/day, not the adult WHO figure (see
 *  the file header — no screen shows either figure yet). Minutes, not sessions: a short daily habit, counted the way
 *  WHO's own youth guideline counts it. */
export const YOUTH_DAILY_ACTIVITY_TARGET_MINUTES = 60;

// ── OWNER-APPROVED WORDING, NOT LIVE YET (owner, in chat, 2026-10-27: "You do it. I approve.") ─────────────────────────
// The two guardian-consent texts below were drafts for the owner (Owner Inbox cards C10 and C08; docs/COACH-LOOP.md §1
// and docs/TEAMS-SQUADS.md §3). The owner approved both as written. They are kept here word for word
// (tests/owner-approvals/consent-wording.test.ts holds them to the docs), and they are NOT on any screen yet, on
// purpose: the screens keep guardianConsentAsk (today's camp-plan line) until the go-live steps ship TOGETHER, because a
// consent's request date is the only record of which words the guardian saw (lib/coach/coachConsent.ts):
//   1. the screens say these words for a request made on or after the go-live day;
//   2. a teen whose accepted consent predates the words can send a new request (today /consent/guardian says "all set");
//   3. COACH_TRAINING_CONSENT_SINCE / SQUADS_CONSENT_SINCE are set to that go-live day (a UTC midnight on or after the
//      deploy — the deploy is the owner's, so the date is too);
//   4. the guardian's withdraw path is built. NOTHING writes GuardianConsent.revokedAt today, so the withdraw sentences
//      are held back by GUARDIAN_WITHDRAW_LIVE (false): the owner's own recommendation on both cards ("drop the last
//      paragraph until the withdraw link is built"; "the withdraw link must be built before this goes live").
// Until then COACH_TRAINING_CONSENT_SINCE and SQUADS_CONSENT_SINCE stay null and every 13–17 account fails closed, as before.

/** The guardian withdraw path exists (step 4 above). False: nothing writes GuardianConsent.revokedAt yet. */
export const GUARDIAN_WITHDRAW_LIVE = false;

/** Card C10 (docs/COACH-LOOP.md §1), approved 2026-10-27: a guardian's yes to coached training. Paragraphs in order;
 *  `yes` is the "If you say yes:" list. */
export function coachTrainingConsentWords(name: string, withdrawLive: boolean = GUARDIAN_WITHDRAW_LIVE): {
  lead: string; yesHeading: string; yes: string[]; never: string; withdraw: string | null;
} {
  return {
    lead: `FEL is a training app. Before ${name} can join a coach's roster and train with them here, we ask a parent or guardian to confirm that's OK.`,
    yesHeading: 'If you say yes:',
    yes: [
      `${name} can join a coach's roster on FEL, and that coach can write their training programs.`,
      `FEL saves ${name}'s training: the sets they log (exercises, reps, weights, effort), the sessions they complete, the goals they set and how far through each program they are. Their coach sees it.`,
      'You can get a training report by email: sessions and sets done, nothing measured about the body.',
      'A camp plan their coach builds with them can go live.',
    ],
    never: 'What a yes never unlocks: Mirror scans, pain check-ins, daily check-ins and any health data are saved only for players 18 and over, with or without your yes.',
    withdraw: withdrawLive ? `You can withdraw this at any time from the link in this email; ${name}'s coach then stops seeing new training, and the report links stop working.` : null,
  };
}

/** Card C08 (docs/TEAMS-SQUADS.md §3), approved 2026-10-27: a guardian's yes to a teen joining squads. */
export function squadsConsentWords(name: string, withdrawLive: boolean = GUARDIAN_WITHDRAW_LIVE): string[] {
  return [
    `FEL is a training app. ${name} would like to join a squad: a small group of friends who see whether each other did the daily drill, a weekly points table from drills and games, and preset reactions (like 🔥 or 👏).`,
    'There are no messages, comments or private chats, and squads have no public page.',
    `Squadmates see ${name}'s first name, whether they did the daily drill, their place in the weekly table and the challenges they choose to post.`,
    `They never see ${name}'s game scores, camera numbers or health data.`,
    ...(withdrawLive ? [`You can withdraw this at any time from the link in this email; ${name} then leaves every squad.`] : []),
  ];
}
