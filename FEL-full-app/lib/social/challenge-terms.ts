// CHALLENGES-2 (owner, 2026-10-22: "beat my score"): what a challenge is on, how long it lives, and who won.
//
// Pure and client-safe (no server import), so the /c pages, the result card and the routes read one rule.
//
//   · KIND. A challenge is on a game score (the default, every challenge minted before this) or on a real training rep:
//     a Mirror number the server measured and saved (jump height, form). The rep kind rides in the signed payload's
//     optional `x` (lib/social/challenge-link-core.ts ChallengeExtra), so a plain score challenge signs the same bytes
//     it always did.
//   · 48 HOURS. A challenge lives CHALLENGE_TTL_MS from its signed, server-stamped time `t`. No new field: `t` is in
//     the signature already, so the expiry cannot be edited without forging the link.
//     assumption: links minted before CHALLENGE_TTL_FROM_MS (2026-10-24 00:00 PT) keep the old rule (no expiry; a v1
//     link still sunsets with CHALLENGE-SIGN-V2). Expiring them too is one line (set the cut-over to 0), and it would
//     turn every older shared link into "this challenge ended" at once, so it is the owner's call.
//   · WHO WON. Higher is better for every kind (a jump, a clean-rep share, a game score). Equal is a tie. The existing
//     `beat` (ChallengeLinkCore.resolve: strictly higher) is unchanged; `outcome` adds the tie.

import { MODE_INFO, canonicalModeKey } from '@/lib/game-data';
import type { ChallengeExtra } from './challenge-link-core';
import { JUMP_CHECK } from '@/lib/vertical/copy';   // VERTICAL-EASY: one name for the hands-on-hips jump check

/** A challenge is open for 48 hours (owner, 2026-10-22). */
export const CHALLENGE_TTL_MS = 48 * 60 * 60 * 1000;
/** 2026-10-24 00:00 PDT. Links stamped before it keep the pre-v2 rule (no expiry). */
export const CHALLENGE_TTL_FROM_MS = Date.UTC(2026, 9, 24, 7, 0, 0);

export type ChallengeKind = 'score' | 'rep';
export type RepMetric = 'jump' | 'form';
export type ChallengeOutcome = 'won' | 'lost' | 'tie';

export interface RepMetricSpec {
  label: string;
  /** How the stored integer reads. */
  format: (score: number) => string;
  /** Where a player measures it (the existing Mirror surfaces). */
  measureHref: string;
  measureLabel: string;
}

/**
 * The Mirror numbers a challenge can be on. A challenge score is an integer (the signer refuses anything else):
 *   jump  tenths of an inch (24.5 in → 245), from a saved jump (lib/profile-v2/assemble.ts jumpCmOf)
 *   form  percent clean reps, 0–100, from a saved Mirror squat or lunge set (lib/mirror/progressReading.ts valueFromRow)
 */
export const REP_METRICS: Record<RepMetric, RepMetricSpec> = {
  jump: {
    label: 'Jump',
    format: (n) => `${(n / 10).toFixed(1)} in`,
    measureHref: '/play/mirror/assess?run=jump',
    measureLabel: JUMP_CHECK,
  },
  form: {
    label: 'Form',
    format: (n) => `${Math.round(n)}% clean reps`,
    measureHref: '/play/mirror?pattern=squat',
    measureLabel: 'Do a Mirror squat set',
  },
};

export function isRepMetric(m: unknown): m is RepMetric {
  return m === 'jump' || m === 'form';
}

export interface ChallengeTerms {
  kind: ChallengeKind;
  metric: RepMetric | null;
  /** This challenge answers another one (a rematch): that challenge's code, score and name. */
  re: { code: string; score: number; tag: string } | null;
}

/** The terms a stored payload carries. Anything unrecognised reads as a plain score challenge. */
export function termsOf(payload: { x?: ChallengeExtra | null } | null | undefined): ChallengeTerms {
  const x = payload?.x ?? null;
  const metric = x && x.kind === 'rep' && isRepMetric(x.metric) ? x.metric : null;
  const re =
    x && typeof x.re === 'string' && x.re && typeof x.reScore === 'number' && Number.isFinite(x.reScore)
      ? { code: x.re, score: x.reScore, tag: typeof x.reTag === 'string' ? x.reTag : 'ATHLETE' }
      : null;
  return { kind: metric ? 'rep' : 'score', metric, re };
}

/** The payload's `x` for these terms, or undefined for a plain score challenge (so its signed bytes do not change). */
export function extraFor(terms: { metric?: RepMetric | null; re?: ChallengeTerms['re'] }): ChallengeExtra | undefined {
  const x: ChallengeExtra = {};
  if (terms.metric) { x.kind = 'rep'; x.metric = terms.metric; }
  if (terms.re) { x.re = terms.re.code; x.reScore = terms.re.score; x.reTag = terms.re.tag; }
  return Object.keys(x).length ? x : undefined;
}

/** When the challenge closes (epoch ms), or null for a link minted before the 48-hour rule. */
export function challengeExpiresAt(payload: { t?: unknown } | null | undefined): number | null {
  const t = payload?.t;
  if (typeof t !== 'number' || !Number.isFinite(t) || t < CHALLENGE_TTL_FROM_MS) return null;
  return t + CHALLENGE_TTL_MS;
}

export function isChallengeExpired(payload: { t?: unknown } | null | undefined, now: number = Date.now()): boolean {
  const at = challengeExpiresAt(payload);
  return at !== null && now >= at;
}

/** "47 h left", "35 min left", "Ended". */
export function timeLeftLabel(expiresAt: number | null, now: number = Date.now()): string | null {
  if (expiresAt === null) return null;
  const ms = expiresAt - now;
  if (ms <= 0) return 'Ended';
  const h = Math.floor(ms / 3_600_000);
  if (h >= 1) return `${h} h left`;
  return `${Math.max(1, Math.ceil(ms / 60_000))} min left`;
}

export function outcomeOf(target: number, attempt: number): ChallengeOutcome {
  return attempt > target ? 'won' : attempt < target ? 'lost' : 'tie';
}

/** A score as the challenge reads it: a game score as a whole number, a rep in its unit. */
export function formatChallengeScore(terms: Pick<ChallengeTerms, 'metric'>, score: number): string {
  if (terms.metric) return REP_METRICS[terms.metric].format(score);
  return Math.round(score).toLocaleString('en-US');
}

/** The tag the server stamps when it shows no name (lib/social/challenge-identity.ts). */
export const ANON_TAG = 'ATHLETE';

/** What a page prints for a challenger: a name an adult chose to show, else "A friend". Never a guess at who. */
export function displayTag(tag: string | null | undefined): string {
  const t = (tag ?? '').trim();
  return !t || t.toUpperCase() === ANON_TAG || t.toUpperCase() === 'GUEST' || t.toUpperCase() === 'CHALLENGER' ? 'A friend' : t;
}

/** The game's name, or the Mirror number's. */
export function challengeTitle(modeKey: string, terms: Pick<ChallengeTerms, 'metric'>): string {
  if (terms.metric) return `${REP_METRICS[terms.metric].label} (Mirror)`;
  const info = MODE_INFO[canonicalModeKey(modeKey)];
  return info?.name ?? modeKey.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}
