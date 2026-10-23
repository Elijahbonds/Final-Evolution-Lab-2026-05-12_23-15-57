// inviteCode — a short typed code beside the invite link (coach-loop P1, 2026-10-20).
//
// THE GAP (platform roadmap §1.2): the invite is a 32-character base64url token. Fine in a link or a QR, useless on a
// gym whiteboard or read aloud across a court. The owner's answer for adding clients is "invite link + code".
//
// THE SHAPE, WITH NO SCHEMA CHANGE. A new invite's token STARTS with its code: `ABCD2345~<32 random base64url chars>`.
//   · The code is 8 characters of Crockford base32 (no I, L, O, U), 40 bits, shown as ABCD-2345. It is typed into
//     /coach/join, which finds the open invite whose token starts with `CODE~` and sends the athlete to the same
//     landing page the link opens. Same invite, same expiry, same one-shot rule, same revoke.
//   · `~` is not a base64url character, so an older token (pure base64url) can never be mistaken for a coded one, and
//     it is unreserved in a URL, so the link needs no escaping.
//   · The link itself keeps its full strength (192 random bits after the code). The code is the weaker credential on
//     purpose, the way a printed gym code is: the lookup answers open invites only and is rate-limited per address.
//
// Pure. The bytes come from the route (node:crypto).

/** Crockford base32: digits and capitals without I, L, O, U, so nothing on a whiteboard reads as two characters. */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 8;
export const CODE_SEPARATOR = '~';

const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/** 8 characters from 5 random bytes (40 bits, 5 bits each). */
export function codeFromBytes(bytes: Uint8Array): string {
  if (bytes.length < 5) throw new Error('codeFromBytes needs 5 bytes');
  // 40 bits fit exactly in a double (2^40 < 2^53), so plain arithmetic, no BigInt
  let bits = 0;
  for (let i = 0; i < 5; i++) bits = bits * 256 + bytes[i];
  let out = '';
  for (let i = CODE_LENGTH - 1; i >= 0; i--) out += CODE_ALPHABET[Math.floor(bits / 32 ** i) % 32];
  return out;
}

/** What a person typed, as a code: case, spaces and dashes forgiven; O→0, I and L→1 (Crockford's own rule). */
export function normalizeCode(typed: unknown): string | null {
  if (typeof typed !== 'string') return null;
  const c = typed.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return CODE_RE.test(c) ? c : null;
}

/** ABCD-2345: how a code is shown and printed. */
export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function tokenWithCode(code: string, random: string): string {
  return `${code}${CODE_SEPARATOR}${random}`;
}

/** The code a token carries, or null for an older, code-less token. */
export function codeOfToken(token: string): string | null {
  const i = token.indexOf(CODE_SEPARATOR);
  if (i !== CODE_LENGTH) return null;
  const c = token.slice(0, i);
  return CODE_RE.test(c) ? c : null;
}

/** The `startsWith` a lookup by code uses. */
export const codeTokenPrefix = (code: string): string => `${code}${CODE_SEPARATOR}`;

/** Where a typed code is entered. `?code=` pre-fills it (a printed sheet can carry one). */
export const JOIN_BY_CODE_PATH = '/coach/join';

/** A person types codes, a script guesses them: 20 tries per address per 10 minutes is plenty for the first. */
export const CODE_LOOKUP_RATE = { limit: 20, windowMs: 10 * 60 * 1000 };
