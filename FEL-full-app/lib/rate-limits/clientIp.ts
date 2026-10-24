// lib/rate-limits/clientIp.ts — RATE-LIMIT-WIRE (PR #289 QA rework, 2026-10-16): the caller's address, as the TRUSTED
// proxy recorded it, or nothing.
//
// X-Forwarded-For is a list. A client may send one of its own, and every proxy on the way APPENDS the address it saw
// the request come from. So the leftmost entries are whatever the client typed, and only the last N entries were
// written by proxies we run behind. lib/rate-limit.ts clientKeyFromHeaders reads the FIRST entry, which is why rotating
// a fake X-Forwarded-For walked straight past the signup limit (QA, PR #289).
//
// Here the address is the entry TRUSTED_PROXY_HOPS places from the right: with 1 trusted hop, the last entry (written by
// the one proxy in front of the server); with 2, the one before it; and so on. Whatever the client puts in front of the
// list never reaches that slot. A list shorter than the hop count did not come through the trusted chain (a request
// straight to the backend URL, or a forged short list), so it gives no address at all.
//
// TRUSTED_PROXY_HOPS UNSET → null, always, and the limits key on the account and the email alone. That is the default
// on purpose: how many proxies append on the production path (Firebase Hosting in front of Cloud Run) has to be measured
// on a real deploy, and a hop count that is too small would put every visitor behind the CDN's own address into one
// shared bucket. assumption: nothing in this repo records that measurement; the owner sets the env once it is taken.
import { isIP } from 'node:net';

export const TRUSTED_PROXY_HOPS_ENV = 'TRUSTED_PROXY_HOPS';
const MAX_HOPS = 10;

/** The configured hop count, or null when unset or not a whole number from 1 to 10. */
export function trustedProxyHops(env: Record<string, string | undefined> = process.env): number | null {
  const raw = (env[TRUSTED_PROXY_HOPS_ENV] ?? '').trim();
  if (!/^\d{1,2}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= MAX_HOPS ? n : null;
}

/** The address the trusted proxy set, or null when there is none to trust. Never the client's own claim. */
export function trustedClientIp(headers: Headers, env: Record<string, string | undefined> = process.env): string | null {
  const hops = trustedProxyHops(env);
  if (hops === null) return null;
  const list = (headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length < hops) return null;
  const ip = list[list.length - hops]!;
  return isIP(ip) ? ip.toLowerCase() : null;
}
