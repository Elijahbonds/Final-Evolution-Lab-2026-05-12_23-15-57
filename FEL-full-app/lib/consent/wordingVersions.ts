// lib/consent/wordingVersions.ts — SAFETY lane (SAF-03, 2026-10-25): which guardian wording a consent row was asked
// under, as a NUMBER on the row instead of a guess from its request date.
//
// BEFORE: GuardianConsent recorded no wording, so lib/coach/coachConsent.ts and lib/groups/gates.ts told a coach-training
// (or squads) consent from an old camp-plan one by WHEN it was requested (requestedAt >= the go-live day). That holds
// only if the words and the date ship in the same deploy, to the minute.
// NOW: prisma/pending/2026-10-25-guardian-consent-wording.sql adds GuardianConsent."wordingVersion" (INTEGER, NULL for
// every existing row). The request route stamps the version that was live when the request was made
// (lib/consent/wording.ts stampWordingVersion); a gate asks versionCovers(). A row with no version (every row before the
// SQL, or a stamp that failed) falls back to the request-date proxy, exactly as before — so nothing changes for a row
// that has none.
//
// Pure, no imports: lib/coach/coachConsent.ts and lib/groups/gates.ts both read this, and neither may import the other's
// wording module without a cycle.
//
// ADDING A VERSION: any change to the words a guardian reads is a NEW number here, never an edit of an old row's words —
// a stored version must always mean the words that guardian saw.

export type GuardianScope = 'camp_plan' | 'coach_training' | 'squads';

/** Version → what a yes under it covers. 1 is today's live wording (owner decision 2026-10-06, "Match today"). */
export const WORDING_VERSIONS: Readonly<Record<number, readonly GuardianScope[]>> = {
  1: ['camp_plan'],
  2: ['camp_plan', 'coach_training'],
  3: ['camp_plan', 'squads'],
  4: ['camp_plan', 'coach_training', 'squads'],
};

/** The version whose scopes are exactly camp_plan plus the live ones. */
export function versionFor(live: { coachTraining: boolean; squads: boolean }): number {
  if (live.coachTraining && live.squads) return 4;
  if (live.coachTraining) return 2;
  if (live.squads) return 3;
  return 1;
}

/** Does a consent asked under `version` cover `scope`? An unknown number covers nothing (fail closed). */
export function versionCovers(version: number, scope: GuardianScope): boolean {
  return WORDING_VERSIONS[version]?.includes(scope) ?? false;
}

/**
 * The one rule both gates use. `since` = the scope's go-live day (null = not live: nothing covers it, whatever the row
 * says — the owner's kill switch stays a single constant). A row with a recorded version is judged by it; a row
 * without one by the request-date proxy the gates used before the column existed.
 */
export function consentCovers(
  c: { requestedAt: Date; wordingVersion?: number | null },
  scope: Exclude<GuardianScope, 'camp_plan'>,
  since: Date | null,
): boolean {
  if (since == null) return false;
  if (typeof c.wordingVersion === 'number') return versionCovers(c.wordingVersion, scope);
  return c.requestedAt.getTime() >= since.getTime();
}
