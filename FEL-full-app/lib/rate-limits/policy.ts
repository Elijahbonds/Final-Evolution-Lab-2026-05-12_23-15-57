// lib/rate-limits/policy.ts — RATE-LIMIT-WIRE (PR #289 QA rework, 2026-10-16): which buckets each limited route counts,
// and how many requests each one allows. QA's list: login, signup, run start, season claim, Arena submit. (The run FINISH
// keeps the PR's first cut, lib/sessions/finishRateLimit.ts: it counts GameSession rows, already shared.)
//
// Every bucket is an account, an email, or the address the TRUSTED proxy set (lib/rate-limits/clientIp.ts) — never the
// X-Forwarded-For entry the client wrote. An address bucket is skipped when there is no trusted address
// (TRUSTED_PROXY_HOPS unset); the account or email bucket always counts. The buckets are counted in the order given and
// the first refusal stops the rest, so a refused account never spends its address's allowance (runRateLimit's rule).
//
// The numbers (new, except where a source is named) — flagged for the owner, who can tune them here:
//   login        10 per email per 15 min (a person retyping a password does not reach it; a guesser does), 50 per
//                address per 15 min (a household or a venue sharing one address).
//   signup       5 per email per hour; 5 per address per 15 min (the number the route already had, per IP).
//   run start    lib/sessions/runRateLimit.ts RUN_RATE_LIMITS.start, unchanged: 30 per account a minute, 120 per address.
//   season claim 10 per account a minute: a claim mints nothing and the page sends one per tap of "collect".
//   Arena submit 20 per account a minute: a duel takes one score per player, and a run has to be played first.
import { RUN_RATE_LIMITS } from '@/lib/sessions/runRateLimit';
import { bucketKey, hitBucket, type LimitHit, type LimitRule } from './store';

export type LimitedRoute = 'login' | 'signup' | 'runStart' | 'seasonClaim' | 'arenaSubmit';
export type SubjectKind = 'email' | 'user' | 'ip';

const MIN = 60_000;

export const RATE_LIMITS: Readonly<Record<LimitedRoute, Partial<Record<SubjectKind, LimitRule>>>> = {
  login: { email: { limit: 10, windowMs: 15 * MIN }, ip: { limit: 50, windowMs: 15 * MIN } },
  signup: { email: { limit: 5, windowMs: 60 * MIN }, ip: { limit: 5, windowMs: 15 * MIN } },
  runStart: {
    user: { limit: RUN_RATE_LIMITS.start.perUser, windowMs: RUN_RATE_LIMITS.start.windowMs },
    ip: { limit: RUN_RATE_LIMITS.start.perIp, windowMs: RUN_RATE_LIMITS.start.windowMs },
  },
  seasonClaim: { user: { limit: 10, windowMs: MIN } },
  arenaSubmit: { user: { limit: 20, windowMs: MIN } },
};

export interface Subject {
  kind: SubjectKind;
  /** The email (normalised by the caller), account id or trusted address; null/empty skips this bucket. */
  value: string | null | undefined;
}

export type LimitVerdict = { ok: true } | ({ ok: false; route: LimitedRoute; kind: SubjectKind } & LimitHit);

/** Count the request into each of the route's buckets, in order, until one refuses. */
export async function checkRateLimits(db: unknown, route: LimitedRoute, subjects: Subject[], now?: number): Promise<LimitVerdict> {
  for (const s of subjects) {
    const rule = RATE_LIMITS[route][s.kind];
    if (!rule || !s.value) continue;
    const hit = await hitBucket(db, bucketKey(route, s.kind, s.value), rule, now);
    if (!hit.ok) {
      // one line, no email, address or account id: which route, which bucket, where it was counted
      console.warn(`[rate-limits] RATE_LIMITED ${route} by ${s.kind} (${hit.store}${hit.hits !== null ? `, ${hit.hits} in the window` : ''})`);
      return { ...hit, ok: false, route, kind: s.kind };
    }
  }
  return { ok: true };
}

/** The Retry-After header for a refusal. */
export function retryAfterHeaders(v: { retryAfterSec: number }): Record<string, string> {
  return { 'Retry-After': String(Math.max(1, Math.ceil(v.retryAfterSec))) };
}
