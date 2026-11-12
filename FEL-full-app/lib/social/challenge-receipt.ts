// CHALLENGES-2: the result receipt. A finished attempt answers with one, and it is the only thing a later step trusts
// about that attempt: the result card (/c/<code>?r=<receipt>) reads its scores from it, and the one-tap rematch mints the
// challenge back from the score it carries, never from a number the client sends again.
//
// Stateless: an HMAC under the challenge secret (lib/social/challenge-sign.ts challengeHmac, its own domain), so no
// table holds attempts (no schema change). It carries no name, no account id and no guest token: `w` is a keyed hash of
// who played, which only the server can recompute, so a receipt in a URL identifies nobody.

import { challengeHmac, challengeHmacMatches } from './challenge-sign';

export interface ChallengeReceipt {
  /** The challenge code. */
  c: string;
  /** The attempt's score (the challenge's unit). */
  s: number;
  /** The score it was against (the challenge's signed score). */
  ts: number;
  /** When the attempt was resolved, epoch ms. */
  at: number;
  /** Keyed hash of who played: whoKey('u', userId) or whoKey('g', guestHash). */
  w: string;
}

/** Keyed, truncated hash of a player. Not reversible without the secret; different for an account and a guest. */
export function whoKey(kind: 'u' | 'g', id: string): string {
  return challengeHmac('who', `${kind}:${id}`).slice(0, 16);
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s: string) => Buffer.from(s, 'base64url').toString('utf8');

export function signReceipt(r: ChallengeReceipt): string {
  const body = b64(JSON.stringify({ c: r.c, s: r.s, ts: r.ts, at: r.at, w: r.w }));
  return `${body}.${challengeHmac('receipt', body)}`;
}

/** The receipt, or null when it is malformed, forged or not for `code`. Never throws on bad input. */
export function verifyReceipt(token: unknown, code?: string): ChallengeReceipt | null {
  if (typeof token !== 'string' || token.length > 600) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  if (!/^[A-Za-z0-9_-]+$/.test(body)) return null;
  if (!challengeHmacMatches(challengeHmac('receipt', body), token.slice(dot + 1))) return null;
  try {
    const r = JSON.parse(unb64(body)) as Partial<ChallengeReceipt>;
    if (typeof r.c !== 'string' || typeof r.w !== 'string') return null;
    if (![r.s, r.ts, r.at].every((n) => typeof n === 'number' && Number.isSafeInteger(n))) return null;
    if (code !== undefined && r.c !== code) return null;
    return { c: r.c, s: r.s as number, ts: r.ts as number, at: r.at as number, w: r.w };
  } catch {
    return null;
  }
}
