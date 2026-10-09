/**
 * lib/sessions/runRateLimit.ts — ECONOMY-SESSIONS-HARDEN (2026-09-28), FIX 2 step 7. STAGED: NOT WIRED.
 *
 * The per-user and per-IP limits for starting and finishing runs (POST /api/sessions/start, POST /api/sessions). No
 * route imports this file yet, on purpose (FE PM): it goes live together with the staged claim rate-limit work once
 * the live database is back, and it is never applied on the fel_dev-only stamp. The wiring is two lines per route —
 *
 *     const gate = sessionRunGate('start', userId, clientKeyFromHeaders(req.headers));
 *     if (!gate.ok) return NextResponse.json({ ok: false, reason: 'RATE_LIMITED', retryAfterSec: gate.retryAfterSec }, { status: 429, headers: { 'Retry-After': String(gate.retryAfterSec) } });
 *
 * — kept out of the routes until that GO, and written out in the land report.
 *
 * The limiter underneath is lib/rate-limit.ts: a fixed window in one server instance's memory. That is why it waits for
 * the shared store: on the hosted function several instances each count their own window.
 *
 * The numbers: the shortest believable run of any mode is seconds long (lib/sessions/modeScoreRules.ts), so a player
 * finishing more than a dozen runs a minute is not playing. Starts get more room than finishes, because every REPLAY and
 * every remount starts a run whether it is finished or not. The IP limits sit above the user limits so a household or a
 * venue on one address is not throttled by one another's play.
 */

import { rateLimit, type RateLimitResult } from '@/lib/rate-limit';

export type RunPhase = 'start' | 'finish';

export const RUN_RATE_LIMITS: Readonly<Record<RunPhase, { perUser: number; perIp: number; windowMs: number }>> = {
  start: { perUser: 30, perIp: 120, windowMs: 60_000 },
  finish: { perUser: 12, perIp: 60, windowMs: 60_000 },
};

/** Both buckets for one request. The user bucket is counted first; a refused user never spends the IP's allowance. */
export function sessionRunGate(phase: RunPhase, userId: string, ip: string, limiter: typeof rateLimit = rateLimit): RateLimitResult {
  const l = RUN_RATE_LIMITS[phase];
  const user = limiter(`sessions:${phase}:user:${userId}`, l.perUser, l.windowMs);
  if (!user.ok) return user;
  return limiter(`sessions:${phase}:ip:${ip || 'unknown'}`, l.perIp, l.windowMs);
}
