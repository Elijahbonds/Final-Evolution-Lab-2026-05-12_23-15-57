// lib/data-rights/deleteRateLimit.ts — ACCOUNT-DELETE (2026-10-25): how often one account may try to delete itself.
//
// The delete checks the password, so without a limit a stolen session could guess passwords through it. Counted per
// ACCOUNT (the session's id — a request cannot choose it) in the shared rate_limits table (lib/rate-limits/store.ts:
// one bucket for every server instance, HMAC'd, never the id in the clear), BEFORE the password is checked.
//
// The shared store FAILS OPEN when its table is missing or the database blinks (its rule). For a password check that is
// too generous, so when the shared count did not happen this falls back to the per-instance window
// (lib/rate-limit.ts): weaker across instances, never nothing.
//
// The numbers (new, flagged): 5 tries per account per 15 minutes — the same shape as login's per-email limit
// (lib/rate-limits/policy.ts, 10 per 15 min) at half the count, because a person deletes an account once.

import { rateLimit } from '@/lib/rate-limit';
import { bucketKey, hitBucket, type LimitRule } from '@/lib/rate-limits/store';

export const ACCOUNT_DELETE_LIMIT: LimitRule = { limit: 5, windowMs: 15 * 60_000 };

export interface DeleteLimit {
  ok: boolean;
  retryAfterSec: number;
  store: 'table' | 'memory';
}

/** Count one delete attempt for this account. Never throws. */
export async function hitAccountDeleteLimit(db: unknown, userId: string, now: number = Date.now()): Promise<DeleteLimit> {
  const hit = await hitBucket(db, bucketKey('accountDelete', 'user', userId), ACCOUNT_DELETE_LIMIT, now);
  if (hit.store === 'table') return { ok: hit.ok, retryAfterSec: hit.retryAfterSec, store: 'table' };
  const mem = rateLimit(`accountDelete:user:${userId}`, ACCOUNT_DELETE_LIMIT.limit, ACCOUNT_DELETE_LIMIT.windowMs);
  return { ok: mem.ok, retryAfterSec: mem.retryAfterSec, store: 'memory' };
}
