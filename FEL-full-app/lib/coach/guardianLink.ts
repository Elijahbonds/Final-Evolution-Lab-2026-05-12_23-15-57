// guardianLink — the capability link a guardian opens to read a teen's training report (coach-loop P1, 2026-10-20).
//
// A guardian has no account (GuardianConsent holds a name and an email). The roadmap's done-when: "the guardian's
// report link opens with no account and shows training only". So the link IS the access, and it is built so that:
//   · it names nothing: `<consentId>.<expiry>.<signature>` — no athlete, no guardian, no email;
//   · it cannot be forged or edited: an HMAC-SHA256 over the consent id and the expiry, keyed from NEXTAUTH_SECRET
//     (a key derived for this purpose only, so the session secret is never used raw);
//   · it dies: a fixed lifetime, and at once when the consent is revoked — the page re-reads the consent on every
//     open, so no table of links is needed (no schema change) and revoking the consent revokes every link.
//
// Server only (node:crypto).

import { createHmac, timingSafeEqual } from 'node:crypto';

export const GUARDIAN_LINK_TTL_DAYS = 14;
const PURPOSE = 'fel-guardian-report-v1';

function key(secret: string): Buffer {
  return createHmac('sha256', secret).update(PURPOSE).digest();
}

function sign(secret: string, consentId: string, expSec: number): string {
  return createHmac('sha256', key(secret)).update(`${consentId}.${expSec}`).digest('base64url');
}

/** null when there is no secret to sign with (the feature is off, never weakly on). */
export function guardianReportToken(consentId: string, nowMs: number, secret: string | undefined = process.env.NEXTAUTH_SECRET): string | null {
  if (!secret || !/^[A-Za-z0-9_-]{1,64}$/.test(consentId)) return null;
  const exp = Math.floor(nowMs / 1000) + GUARDIAN_LINK_TTL_DAYS * 86_400;
  return `${consentId}.${exp}.${sign(secret, consentId, exp)}`;
}

/** The consent id a token was made for, or null: unsigned, edited, expired, malformed or no secret all read the same. */
export function readGuardianReportToken(token: string, nowMs: number, secret: string | undefined = process.env.NEXTAUTH_SECRET): string | null {
  if (!secret || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [consentId, expRaw, sig] = parts;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(consentId) || !/^\d{1,12}$/.test(expRaw)) return null;
  const exp = Number(expRaw);
  if (exp * 1000 <= nowMs) return null;
  const want = Buffer.from(sign(secret, consentId, exp));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return consentId;
}

export const guardianReportPath = (token: string) => `/guardian/report/${encodeURIComponent(token)}`;
