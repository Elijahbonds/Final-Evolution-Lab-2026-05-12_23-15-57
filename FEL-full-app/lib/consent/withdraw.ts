// lib/consent/withdraw.ts — SAFETY lane (SAF-01, 2026-10-25): the guardian's WITHDRAW link.
//
// THE GAP. Every reader of GuardianConsent already honours revokedAt (lib/consent/guardianGate.ts guardianStatus: the
// newest row decides, and a revoked newest row is not an accepted one), but nothing in the app ever WROTE revokedAt
// (app/api/v1/camp/consent/route.ts said so). The wording the owner is asked to approve promises "you can withdraw this
// at any time from the link in this email" (docs/COACH-LOOP.md §1, docs/TEAMS-SQUADS.md §3). This is that link.
//
// THE LINK: `<consentId>.<signature>`, an HMAC-SHA256 over the consent id, keyed from NEXTAUTH_SECRET with a key derived
// for this purpose only (lib/coach/guardianLink.ts's pattern; the session secret is never used raw). It names nobody.
//   · It cannot be forged or pointed at another consent: the id is inside the signature.
//   · SINGLE USE: the first withdraw sets revokedAt; every later use finds it set, writes nothing and says "already".
//   · It does not expire: a guardian may change their mind months later, and a withdraw only ever closes things.
//   · No secret, no link (null): the feature is off, never weakly on.
//
// WHAT A WITHDRAW WRITES. revokedAt = now on the consent the link was made for AND on every other unrevoked consent for
// the same athlete that this guardian gave (same guardianEmail, or accepted by the same account): "I withdraw" means
// this guardian's yes, not one row of it. It NEVER deletes a row — consent history must survive its own withdrawal, as
// app/api/health/consent/route.ts keeps HealthConsent. Another guardian's separate yes is left as it is (an owner call,
// docs/TEEN-SAFE-AUDIT.md).
//
// WHAT IT CLOSES. Nothing here touches a feature: every gate re-reads the consent on every request (lib/coach/teenGate.ts
// for rosters, set logs and the cool-down; lib/groups/gates.ts for squads; lib/combine/gate.ts for the combine;
// lib/coach/guardianReportServer.ts for the report links), so the next request after a withdraw is refused.
// tests/consent/withdraw-gates.test.ts runs each through its real route: 403, then 200, then 403.
//
// Server only (node:crypto).
import { createHmac, timingSafeEqual } from 'node:crypto';

const PURPOSE = 'fel-guardian-withdraw-v1';
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function key(secret: string): Buffer {
  return createHmac('sha256', secret).update(PURPOSE).digest();
}

function sign(secret: string, consentId: string): string {
  return createHmac('sha256', key(secret)).update(consentId).digest('base64url');
}

/** The withdraw token for one consent, or null when there is no secret to sign with. */
export function withdrawToken(consentId: string, secret: string | undefined = process.env.NEXTAUTH_SECRET): string | null {
  if (!secret || !ID_RE.test(consentId)) return null;
  return `${consentId}.${sign(secret, consentId)}`;
}

/** The consent id a token was made for, or null: unsigned, edited, malformed or no secret all read the same. */
export function readWithdrawToken(token: unknown, secret: string | undefined = process.env.NEXTAUTH_SECRET): string | null {
  if (!secret || typeof token !== 'string' || token.length > 200) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [consentId, sig] = parts;
  if (!ID_RE.test(consentId)) return null;
  const want = Buffer.from(sign(secret, consentId));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return consentId;
}

/** The page a withdraw link opens (it reads; the button on it writes — a link-preview crawler changes nothing). */
export const withdrawPath = (token: string) => `/consent/guardian/withdraw/${encodeURIComponent(token)}`;

/** The relative withdraw path for a consent, or null when links are off. */
export function withdrawHref(consentId: string, secret?: string): string | null {
  const t = withdrawToken(consentId, secret ?? process.env.NEXTAUTH_SECRET);
  return t ? withdrawPath(t) : null;
}

export interface WithdrawRow {
  id: string;
  menteeId: string;
  guardianEmail: string;
  acceptedById?: string | null;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

/** The calls a withdraw makes: the route's `prisma`, or a test stand-in. */
export interface WithdrawDb {
  guardianConsent: {
    findUnique(a: unknown): Promise<WithdrawRow | null>;
    updateMany(a: unknown): Promise<{ count: number }>;
  };
}

export type WithdrawOutcome = { state: 'withdrawn'; rows: number } | { state: 'already' } | { state: 'not_found' };

/**
 * Withdraw the consent a verified token names. One updateMany, so the rows land together, and its WHERE carries
 * revokedAt: null, so a row withdrawn a moment ago is never written twice (single use, even under a double tap).
 */
export async function withdrawConsent(db: WithdrawDb, consentId: string, now: Date = new Date()): Promise<WithdrawOutcome> {
  const row = await db.guardianConsent.findUnique({
    where: { id: consentId },
    select: { id: true, menteeId: true, guardianEmail: true, acceptedById: true, acceptedAt: true, revokedAt: true },
  });
  if (!row) return { state: 'not_found' };
  if (row.revokedAt) return { state: 'already' };
  const sameGuardian: Record<string, unknown>[] = [{ id: row.id }, { guardianEmail: row.guardianEmail }];
  if (row.acceptedById) sameGuardian.push({ acceptedById: row.acceptedById });
  const res = await db.guardianConsent.updateMany({
    where: { menteeId: row.menteeId, revokedAt: null, OR: sameGuardian },
    data: { revokedAt: now },
  });
  return res.count > 0 ? { state: 'withdrawn', rows: res.count } : { state: 'already' };
}
