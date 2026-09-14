// THE CARD IS THE ONE SURFACE THAT TALKS TO SOMEBODY ELSE (2026-09-13).
//
// Build-order item #8: "Creator Cards as a read surface over existing progression data." Everything items 1–7
// produced — snapshots, gates, credentials, coach programs — is read here and nothing is stored here. The
// brief's rule, verbatim: "No monetization surface reads raw scan data directly; it reads `PRQSnapshot` and
// `CreatorCard`." So this file takes a SharedProfile and never a ScanRecord, and `CreatorCardRef` already
// says why: "a read over progression — never a second place credentials live."
//
// WHY IT NEEDS TO BE STRICTER THAN THE DASHBOARD, WHICH ALREADY LOOKED STRICT.
//
// Every read surface before this one talks to an athlete about themselves. They already know whether they
// scanned. If the dashboard overstates something, the person reading it is the person who can tell.
//
// A card talks to somebody ELSE — a coach picking clients, an athlete picking a coach, a scout. The reader
// cannot check any of it, has no way to tell a measured 82 from a typed-in 82, and is making a decision
// involving money. That is the definition of the surface where numbers inflate, so the rules here are
// mechanical rather than editorial:
//
//   1. A CLAIM CARRIES ITS RECEIPT OR IT DOES NOT RENDER. Every block has a `basis` — measured, earned,
//      played, estimated — and there is deliberately no fifth value meaning "self-reported, presented like
//      the others". A snapshot with no `sourceScanAt` is a BASELINE, not a measurement, and a baseline is
//      withheld from the card rather than shown with a quiet asterisk. The asterisk is the thing that never
//      survives contact with a UI.
//
//   2. A CLAIM AGES. This is the gap the live card has today: the verified shield sits next to a number from
//      eight months ago forever, because the card stores a snapshot and a snapshot has no clock. Here a
//      measurement is FRESH, then STALE (shown, with its age, no shield), then EXPIRED (the number is
//      withheld and only "last measured N months ago" survives). An old reading is not a current claim, and
//      the honest thing to say at that point is when it was taken, not what it said.
//
//   3. ATTEMPTED IS NOT EARNED, and a credential names the curriculum it was earned against. `credentials()`
//      already filters on `passed === true`; what is added here is that a credential earned against a
//      superseded curriculum says so, because a card is read months after the fact.
//
//   4. NO PUBLIC PRESENCE FOR MINORS, decided here rather than in a component. Courts, verbatim: "Accounts
//      flagged under 18 have no public presence in this system at all." `projectCard` returns null and there
//      is nothing downstream to get wrong.
//
//   5. AGAINST THEMSELVES, NEVER AGAINST A POPULATION. No percentile, no rank, no "top N". A card is where
//      that temptation is strongest and where it is least checkable.
//
// Pure: no Prisma, no DOM, no scan records.

import type { SharedProfile, PRQSnapshot, AcademyProgress } from '../profile/sharedProfile';
import { currentPRQ, credentials } from '../profile/sharedProfile';
import type { Protocol } from '../profile/protocol';
import { partition } from '../profile/protocol';
import { PROGRAM_DISCLAIMER } from '../mirror/program';
import { ageDaysOf, freshnessNote, freshnessOf, type Freshness } from './claimClock';

export { FRESH_DAYS, EXPIRES_DAYS, freshnessOf, ageLabel, type Freshness } from './claimClock';

const DAY = 86_400_000;

/**
 * Where a claim came from. There is no value here for "the owner typed it in".
 *
 * · measured  — a PRQSnapshot with a scan behind it
 * · earned    — a passed credential
 * · played    — recorded sessions
 * · estimated — derived from observation counts, and always carries the disclaimer
 */
export type Basis = 'measured' | 'earned' | 'played' | 'estimated';

/** The trajectory window, matching the athlete dashboard so the two surfaces cannot disagree. */
export const TRAJECTORY_WINDOW_DAYS = 28;
/** Below this many observed sessions there is no signature to speak of — a count of two is an anecdote. */
export const MIN_SIGNATURE_SESSIONS = 5;

/**
 * The standing block: the composite, and how much it is still worth saying.
 *
 * `composite` goes null when the reading has expired. That is not a display choice made later — the number
 * is not in the projection at all, so no component can decide to render it anyway.
 */
export interface Standing {
  composite: number | null;
  basis: 'measured';
  measuredAt: string;
  ageDays: number;
  freshness: Freshness;
  /** What the card prints under the number. Always populated, including when the number is gone. */
  note: string;
  /** The shield. Fresh measurements only. */
  verified: boolean;
}

/** A change against this athlete's own past. Null delta means not enough history to say — never 0. */
export interface Trajectory {
  delta: number | null;
  windowDays: number;
  label: string;
}

export interface CardCredential {
  trackKey: string;
  moduleKey: string;
  earnedAt: string;
  basis: 'earned';
  /** The curriculum it was earned against, when the record carries one. */
  curriculumVersion: string | null;
  /** True when that version is no longer the current one. Shown, not hidden. */
  superseded: boolean;
}

/** A threshold this athlete has cleared. A fact about a gate, never a claim about a body. */
export interface CardUnlock {
  key: string;
  title: string;
  basis: 'measured';
}

/**
 * The movement signature, as engagement rather than anatomy.
 *
 * Values are persistence counts — "this pattern showed up in 5 of the last 7 sessions" — and the disclaimer
 * is part of the data so a component cannot render the numbers without it.
 */
export interface CardSignature {
  zones: Record<string, number>;
  sessions: number;
  basis: 'estimated';
  disclaimer: string;
}

export interface CardProgression {
  clientId: string;
  displayName: string;
  /** Null when there is no measurement worth standing behind. */
  standing: Standing | null;
  trajectory: Trajectory | null;
  credentials: CardCredential[];
  unlocks: CardUnlock[];
  /** Null below MIN_SIGNATURE_SESSIONS. */
  signature: CardSignature | null;
  /** Recorded sessions behind the card, so "played" claims have a denominator. */
  sessionsPlayed: number;
  /** Every basis appearing anywhere above, for a legend. */
  bases: Basis[];
}

export interface ProjectOptions {
  /** Under-18 accounts have no public presence. Defaults to false; pass the canonical CreatorRecord flag. */
  minor?: boolean;
  /** The protocol catalogue to report unlocks against. */
  catalogue?: readonly Protocol[];
  /** The live curriculum version, for marking superseded credentials. */
  curriculumVersion?: string;
  now?: number;
}

/**
 * A snapshot the card may stand behind.
 *
 * The `sourceScanAt` check is the whole point: `PRQSnapshot` documents itself as "a snapshot with no source
 * is a baseline", and a baseline is a starting value somebody was given, not a thing that was measured. On a
 * dashboard that distinction is a nuance; on a card it is the difference between a number and a claim.
 */
function measuredSnapshot(profile: SharedProfile): PRQSnapshot | null {
  const snap = currentPRQ(profile);
  return snap?.sourceScanAt ? snap : null;
}

function standingFrom(snap: PRQSnapshot, now: number): Standing {
  const ageDays = ageDaysOf(snap.at, now) ?? 0;
  const freshness = freshnessOf(ageDays);
  return {
    composite: freshness === 'expired' ? null : snap.composite,
    basis: 'measured',
    measuredAt: snap.at,
    ageDays,
    freshness,
    note: freshnessNote(ageDays),
    verified: freshness === 'fresh',
  };
}

/** The newest measured snapshot at or before `atIso`. */
function measuredAt(profile: SharedProfile, atIso: string): PRQSnapshot | null {
  const before = profile.prq
    .filter((s) => s.sourceScanAt && s.at <= atIso)
    .sort((a, b) => a.at.localeCompare(b.at));
  return before.length ? before[before.length - 1] : null;
}

/**
 * The trajectory, under the dashboard's two-point rule.
 *
 * Null when there is one reading, because "+0" beside a single measurement reads as "trained hard, held
 * steady" and means "we have no idea". On a card that misreading is somebody else's hiring decision.
 */
function trajectoryFrom(profile: SharedProfile, snap: PRQSnapshot, now: number): Trajectory {
  const windowStart = new Date(now - TRAJECTORY_WINDOW_DAYS * DAY).toISOString();
  const past = measuredAt(profile, windowStart);
  if (!past || past.at === snap.at) {
    return { delta: null, windowDays: TRAJECTORY_WINDOW_DAYS, label: 'First measurement' };
  }
  const delta = Math.round((snap.composite - past.composite) * 10) / 10;
  return {
    delta,
    windowDays: TRAJECTORY_WINDOW_DAYS,
    label: delta === 0 ? 'Level' : `${delta > 0 ? '+' : ''}${delta} in ${TRAJECTORY_WINDOW_DAYS} days`,
  };
}

function credentialsFrom(profile: SharedProfile, current: string | undefined): CardCredential[] {
  return credentials(profile)
    .slice()
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .map((a: AcademyProgress) => ({
      trackKey: a.trackKey,
      moduleKey: a.moduleKey,
      earnedAt: a.completedAt,
      basis: 'earned' as const,
      curriculumVersion: a.curriculumVersion ?? null,
      // unknown version is not assumed current: a credential with no version recorded cannot be vouched for
      superseded: !!current && a.curriculumVersion !== current,
    }));
}

/**
 * Project the public face of an athlete's progression.
 *
 * Returns null for a minor — decided here so no component downstream has the opportunity to render a child.
 */
export function projectCard(
  profile: SharedProfile,
  opts: ProjectOptions = {},
): CardProgression | null {
  if (opts.minor) return null;

  const now = opts.now ?? Date.now();
  const snap = measuredSnapshot(profile);
  const standing = snap ? standingFrom(snap, now) : null;

  // an expired reading is not a base to measure a trend from either
  const trajectory = snap && standing?.freshness !== 'expired' ? trajectoryFrom(profile, snap, now) : null;

  const creds = credentialsFrom(profile, opts.curriculumVersion);

  // unlocks are reported only against a reading the card is standing behind; a gate cleared on an expired
  // scan is not a cleared gate today, and the gate itself says so when it is re-evaluated
  const unlocks: CardUnlock[] =
    opts.catalogue && standing && standing.composite !== null
      ? partition(opts.catalogue, profile, now).open
          .filter((p) => p.unlock)                      // an ungated protocol is not an achievement
          .map((p) => ({ key: p.key, title: p.title, basis: 'measured' as const }))
      : [];

  const signature: CardSignature | null =
    profile.signature.sessions >= MIN_SIGNATURE_SESSIONS
      ? {
          zones: profile.signature.zones,
          sessions: profile.signature.sessions,
          basis: 'estimated',
          disclaimer: PROGRAM_DISCLAIMER,
        }
      : null;

  const bases: Basis[] = [];
  if (standing && standing.composite !== null) bases.push('measured');
  if (creds.length) bases.push('earned');
  if (profile.history.length) bases.push('played');
  if (signature) bases.push('estimated');

  return {
    clientId: profile.clientId,
    displayName: profile.displayName,
    standing,
    trajectory,
    credentials: creds,
    unlocks,
    signature,
    sessionsPlayed: profile.history.length,
    bases,
  };
}

/**
 * Can this card wear the verified shield?
 *
 * One function so the answer cannot drift between the card face, the coach directory and the store. It is
 * deliberately narrow: a fresh, scan-backed measurement. Credentials do not buy it — a passed exam says
 * somebody learned something, not that anybody measured them.
 */
export function isVerified(card: CardProgression | null): boolean {
  return !!card?.standing?.verified;
}

/**
 * The single line a card prints when it has nothing verified to show.
 *
 * Written as an invitation rather than an absence, because the honest empty state of a card is "this person
 * has not been measured yet", and the useful version of that sentence says what to do about it.
 */
export function emptyStateFor(card: CardProgression | null): string | null {
  if (!card) return null;
  if (card.standing === null) return 'No System Scan yet — nothing here is measured.';
  if (card.standing.freshness === 'expired') return card.standing.note;
  return null;
}
