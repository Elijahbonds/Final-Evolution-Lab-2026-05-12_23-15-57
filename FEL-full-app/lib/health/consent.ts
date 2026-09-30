// lib/health/consent.ts — MIRROR-COACH P5 (2026-09-29): the health-data consent ledger, read as one current state.
//
// HealthConsent (schema.prisma) is an append-only ledger, not a row you edit in place: granting again after a
// withdraw writes a NEW row rather than clearing `revokedAt` on the old one, so the history of who granted or
// revoked what, and when, is never rewritten (the same reason HealthIntake.redFlags and PainCheckIn.decision are
// stored rather than recomputed — see those models' own comments). This module turns that ledger into "what's true
// right now", which is what a settings page and a route guard both actually need: the newest un-revoked row of a
// given scope (and, for 'coach_view', of a given coach).
//
// Pure: no Prisma, no network. The route (app/api/health/consent/route.ts) reads the ledger and the athlete's
// active coaches, then calls this to decide what to show and what to allow.

export interface ConsentRow {
  scope: string;              // 'health_data' | 'coach_view'
  coachId: string | null;
  grantedAt: Date;
  revokedAt: Date | null;
}

function newestLive(rows: readonly ConsentRow[]): ConsentRow | null {
  const live = rows.filter((r) => !r.revokedAt);
  if (!live.length) return null;
  return live.reduce((a, b) => (b.grantedAt > a.grantedAt ? b : a));
}

/** The live 'health_data' grant, if any — the newest un-revoked row of that scope. Null means the athlete has never
 *  granted it, or has withdrawn and not re-granted since. */
export function activeHealthDataConsent(rows: readonly ConsentRow[]): ConsentRow | null {
  return newestLive(rows.filter((r) => r.scope === 'health_data'));
}

/** The live 'coach_view' grant for one specific coach, if any. */
export function activeCoachViewConsent(rows: readonly ConsentRow[], coachId: string): ConsentRow | null {
  return newestLive(rows.filter((r) => r.scope === 'coach_view' && r.coachId === coachId));
}

/** True only when BOTH hold: the athlete currently has live 'health_data' consent, and the target is a coach who is
 *  currently active on this athlete's roster (a live CoachClient row, checked by the caller — this function takes
 *  the boolean rather than a Prisma row, so it stays pure). Sharing what was never collected is nothing to share,
 *  and granting a view onto data the athlete has not opted FEL into collecting at all would be backwards. */
export function canGrantCoachView(hasHealthDataConsent: boolean, isActiveCoach: boolean): boolean {
  return hasHealthDataConsent && isActiveCoach;
}

export interface CoachConsentView {
  coachId: string;
  name: string;
  /** True while a live 'coach_view' grant exists for this coach. */
  viewGranted: boolean;
  grantedAt: string | null;
}

export interface HealthConsentView {
  healthData: { granted: boolean; grantedAt: string | null };
  coaches: CoachConsentView[];
}

/**
 * The whole settings-page view in one call: whether health-data collection is currently opted in, and — for every
 * coach currently on the athlete's roster, whether coach or not — whether that coach currently has a live view.
 * A coach who no longer coaches this athlete (CoachClient.endedAt set) is simply not in `activeCoaches`, so a
 * withdrawn coach relationship drops out of the list on its own rather than needing its consent explicitly revoked.
 */
export function buildHealthConsentView(
  consents: readonly ConsentRow[],
  activeCoaches: readonly { coachId: string; name: string }[],
): HealthConsentView {
  const healthData = activeHealthDataConsent(consents);
  const coaches = activeCoaches.map((c) => {
    const grant = activeCoachViewConsent(consents, c.coachId);
    return { coachId: c.coachId, name: c.name, viewGranted: !!grant, grantedAt: grant ? grant.grantedAt.toISOString() : null };
  });
  return {
    healthData: { granted: !!healthData, grantedAt: healthData ? healthData.grantedAt.toISOString() : null },
    coaches,
  };
}
