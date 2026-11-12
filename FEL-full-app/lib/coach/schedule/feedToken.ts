// lib/coach/schedule/feedToken.ts — COACH-DELIVERY COA-05: the calendar feed's link. A calendar app has no session, so the
// link IS the access (the guardian report link's pattern, lib/coach/guardianLink.ts): `<userId>.<signature>`, an HMAC over
// the user id and a random nonce stored per person (CoachCalendarFeed), keyed from NEXTAUTH_SECRET through a key derived for
// this purpose only. It names nobody but the account it is for, cannot be forged or edited, and "reset the link" (a new
// nonce) kills every old copy. No secret = no feed (off, never weakly on). Server only.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const PURPOSE = 'fel-coach-calendar-feed-v1';
const ID = /^[A-Za-z0-9_-]{1,64}$/;

const key = (secret: string) => createHmac('sha256', secret).update(PURPOSE).digest();
const sign = (secret: string, userId: string, nonce: string) => createHmac('sha256', key(secret)).update(`${userId}.${nonce}`).digest('base64url');

export const newFeedNonce = (): string => randomBytes(18).toString('base64url');

export function feedToken(userId: string, nonce: string, secret: string | undefined = process.env.NEXTAUTH_SECRET): string | null {
  if (!secret || !ID.test(userId) || !nonce) return null;
  return `${userId}.${sign(secret, userId, nonce)}`;
}

/** The user id a token is for, or null. `nonceOf` reads that user's current nonce (null = feed off or reset). */
export async function readFeedToken(token: string, nonceOf: (userId: string) => Promise<string | null>, secret: string | undefined = process.env.NEXTAUTH_SECRET): Promise<string | null> {
  if (!secret || typeof token !== 'string') return null;
  const parts = token.replace(/\.ics$/i, '').split('.');
  if (parts.length !== 2 || !ID.test(parts[0])) return null;
  const nonce = await nonceOf(parts[0]);
  if (!nonce) return null;
  const want = Buffer.from(sign(secret, parts[0], nonce)), got = Buffer.from(parts[1]);
  return want.length === got.length && timingSafeEqual(want, got) ? parts[0] : null;
}

export const feedPath = (token: string) => `/api/coach/schedule/feed/${encodeURIComponent(token)}.ics`;
