// fel-netd — the party ticket and the report slip (PARTY-CHAT lane, 2026-10-13).
//
// WHY A TICKET. netd has no database and no session cookie, so it cannot know who an account is or how old. The app can:
// GET /api/party/ticket reads the signed-in user and User.dobYear FROM THE DATABASE (lib/privacy/scanSaveGate.ts
// readDobYear; the STRICT verified-adult rule, lib/age/ageRules.ts) and signs what netd needs with PARTY_TICKET_SECRET,
// a secret both services hold. netd verifies the signature and the expiry and believes nothing else — a client cannot
// name itself an adult. NO VALID TICKET = TEEN RULES (presets and emotes only, no voice): a guest, an unknown age, an
// expired or forged ticket, and a netd with no secret configured all fail closed.
//
// WHY A SLIP. A report must name the reported ACCOUNT, but no client is ever told anyone's account id. So netd seals
// {reporter, reported, …} with AES-256-GCM under a key derived from the same secret and hands the sealed slip to the
// reporter, who can carry it to POST /api/party/report but cannot read or forge it.
//
// node:crypto only. The app imports this file in its server routes (never in a client bundle).
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface TicketClaims {
  v: 1;
  /** The account id, or null for a guest. Never sent to another client. */
  uid: string | null;
  /** A stable, opaque handle for this account (HMAC of the id): what a client may block by across parties. */
  pub: string;
  /** Display name, already cleaned by the app. */
  name: string;
  /** Verified 18+ by the STRICT rule, from the database. */
  adult: boolean;
  /** Expiry, ms since epoch. */
  exp: number;
}

/** A ticket lives long enough to cover a reload or a reconnect, and no longer. */
export const TICKET_TTL_MS = 10 * 60_000;

const b64u = (b: Buffer): string => b.toString('base64url');
const sign = (body: string, secret: string): string => b64u(createHmac('sha256', secret).update(body).digest());

/** The opaque handle for an account id. Same id + secret → same handle; it does not reveal the id. */
export function pubFor(uid: string, secret: string): string {
  return 'u' + sign(`pub:${uid}`, secret).slice(0, 15);
}

export function signTicket(claims: Omit<TicketClaims, 'v'>, secret: string): string {
  const body = b64u(Buffer.from(JSON.stringify({ v: 1, ...claims })));
  return `${body}.${sign(body, secret)}`;
}

/** The claims, or null for anything not signed by `secret`, expired, or malformed. Never throws. */
export function verifyTicket(token: unknown, secret: string | undefined, now: number): TicketClaims | null {
  if (!secret || typeof token !== 'string' || token.length > 2048) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(sign(body, secret));
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<TicketClaims>;
    if (c.v !== 1 || typeof c.exp !== 'number' || c.exp < now) return null;
    if (typeof c.pub !== 'string' || typeof c.name !== 'string' || typeof c.adult !== 'boolean') return null;
    if (c.uid !== null && typeof c.uid !== 'string') return null;
    return { v: 1, uid: c.uid ?? null, pub: c.pub, name: c.name, adult: c.adult === true, exp: c.exp };
  } catch {
    return null;
  }
}

// ── report slips ────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ReportSlip {
  v: 1;
  reporterUid: string | null;
  reportedUid: string | null;
  /** The reported member's name as the party saw it. */
  reportedName: string;
  /** The party code (no content: messages are never stored, not even here). */
  code: string;
  reason: string;
  at: number;
}

const keyOf = (secret: string): Buffer => createHash('sha256').update(`party-report:${secret}`).digest();

export function sealSlip(slip: Omit<ReportSlip, 'v'>, secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyOf(secret), iv);
  const enc = Buffer.concat([c.update(JSON.stringify({ v: 1, ...slip }), 'utf8'), c.final()]);
  return b64u(Buffer.concat([iv, c.getAuthTag(), enc]));
}

/** The slip, or null if it was not sealed with `secret` (or was changed). Never throws. */
export function openSlip(sealed: unknown, secret: string | undefined): ReportSlip | null {
  if (!secret || typeof sealed !== 'string' || sealed.length > 4096) return null;
  try {
    const buf = Buffer.from(sealed, 'base64url');
    if (buf.length < 29) return null;
    const d = createDecipheriv('aes-256-gcm', keyOf(secret), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    const json = Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
    const s = JSON.parse(json) as ReportSlip;
    return s && s.v === 1 && typeof s.code === 'string' ? s : null;
  } catch {
    return null;
  }
}
