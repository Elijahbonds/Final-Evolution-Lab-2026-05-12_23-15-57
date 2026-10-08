/**
 * lib/stripe/site-origin.ts — STORE-READY B3 (F7): the one place Stripe success/cancel/return URLs get their
 * origin from. It reads NEXTAUTH_URL (the server's own configured site URL), trimmed, no trailing slash, and
 * NEVER the request's Origin header — a caller-controlled header must never steer where Stripe sends a buyer
 * back. Unset/blank answers null; the caller answers store_closed 'site_url_not_set'.
 */
export function siteOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = (env.NEXTAUTH_URL ?? '').trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}
