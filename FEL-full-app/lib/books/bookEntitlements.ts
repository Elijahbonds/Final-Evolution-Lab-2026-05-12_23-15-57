/**
 * Who may read a book file.
 *
 * A bundle covers the ebook and the audiobook. An ebook purchase does not
 * cover the audio, and a revoked row covers nothing. Samples are not decided
 * here — the delivery gate treats `file.sample` as public.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { BookFormat } from './bookCatalog';

export interface OwnedOffer {
  bookSlug: string;
  format: string;
  status: string;
}

export function normalizeBookEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function offerCovers(ownedFormat: string, need: 'ebook' | 'audiobook'): boolean {
  if (ownedFormat === 'bundle') return true;
  return ownedFormat === need;
}

export function hasBookAccess(
  rows: readonly OwnedOffer[],
  bookSlug: string,
  need: 'ebook' | 'audiobook',
): boolean {
  return rows.some((row) => row.status === 'ACTIVE' && row.bookSlug === bookSlug && offerCovers(row.format, need));
}

export function isBookFormat(value: string): value is BookFormat {
  return value === 'ebook' || value === 'audiobook' || value === 'bundle';
}

export interface BookClaimStore {
  claimByEmail(userId: string, email: string): Promise<number>;
}

/** Attach guest purchases to an account. Same email, still-unclaimed rows only. */
export async function claimBookEntitlements(
  store: BookClaimStore,
  userId: string,
  email: string,
): Promise<number> {
  const normalized = normalizeBookEmail(email);
  if (!userId || !normalized.includes('@')) return 0;
  return store.claimByEmail(userId, normalized);
}

export interface ReaderIdentity {
  userId: string | null;
  email: string | null;
}

/**
 * A short-lived proof that this browser just paid, so the receipt page can
 * request signed URLs before the buyer creates an account. It is not itself
 * an entitlement — delivery still checks the purchase row.
 */
export function mintReaderGrant(secret: string, email: string, ttlSeconds = 60 * 60, now = Date.now()): string {
  if (!secret) throw new Error('reader grant secret is empty');
  const exp = Math.floor(now / 1000) + ttlSeconds;
  const body = Buffer.from(`${normalizeBookEmail(email)}|${exp}`).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function readReaderGrant(secret: string, token: string, now = Date.now()): { email: string } | null {
  if (!secret || !token) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(body, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const sep = decoded.lastIndexOf('|');
  if (sep <= 0) return null;
  const email = decoded.slice(0, sep);
  const exp = Number(decoded.slice(sep + 1));
  if (!email.includes('@') || !Number.isFinite(exp) || exp * 1000 < now) return null;
  return { email };
}
