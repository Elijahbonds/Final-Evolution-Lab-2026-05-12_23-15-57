/**
 * STORE-SIGNIN-RETURN. A signed-out buyer's Continue used to end on a raw "unauthorized" and the chosen slot
 * was lost. These helpers build the same-origin relative URL the buyer returns to after sign-in (listing page,
 * with the slot in the query so the form can preselect it) and read the slot back out of the return URL.
 *
 * The return URL is built from path segments and a slot timestamp only — never from a caller-supplied URL —
 * and safeLoginNext (lib/auth/safeNext.ts) re-validates it at the /login hop, so ?next= cannot leave origin.
 */
import { safeLoginNext } from '@/lib/auth/safeNext';

/** Query key carrying the chosen slot (an ISO timestamp, e.g. 2026-10-08T17:00:00.000Z). */
export const BOOK_SLOT_PARAM = 'slot';

/** /coach/<slug>/book/<listingId>, or null when a segment could escape the path (open-redirect guard). */
export function coachBookPath(slug: unknown, listingId: unknown): string | null {
  if (typeof slug !== 'string' || typeof listingId !== 'string') return null;
  const clean = (s: string) => {
    const t = s.trim();
    // A segment with a separator, scheme or encoded trick could turn the path into something else.
    return t && !/[/?#\\%:]/.test(t) ? t : null;
  };
  const s = clean(slug);
  const l = clean(listingId);
  return s && l ? `/coach/${encodeURIComponent(s)}/book/${encodeURIComponent(l)}` : null;
}

/** The listing page with the chosen slot in the query, or null when the inputs are not safe. */
export function coachBookReturnPath(slug: unknown, listingId: unknown, startsAt: unknown): string | null {
  const base = coachBookPath(slug, listingId);
  if (!base) return null;
  if (typeof startsAt !== 'string' || !isSlotValue(startsAt)) return base;
  return `${base}?${BOOK_SLOT_PARAM}=${encodeURIComponent(startsAt)}`;
}

/** True when a value can round-trip as a slot timestamp: a full ISO date-time with a timezone, or null. */
export function isSlotValue(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  const s = raw.trim();
  // A bare date or free text is not a slot; the select's values and the server's Date parse are ISO.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return false;
  return !Number.isNaN(new Date(s).getTime());
}

/** The slot from a return URL's query (searchParams.slot), or null when absent or malformed. */
export function slotFromSearchParams(raw: string | string[] | undefined): string | null {
  const first = Array.isArray(raw) ? raw[0] : raw;
  return isSlotValue(first) ? first.trim() : null;
}

/**
 * The buyer-facing sign-in link for a checkout 401: /login with a safe ?next=. When the return path cannot be
 * built it falls back to plain /login — the message still shows, only the return is dropped.
 */
export function coachSignInHref(slug: unknown, listingId: unknown, startsAt: unknown): string {
  const next = coachBookReturnPath(slug, listingId, startsAt);
  const safe = next ? safeLoginNext(next) : null;
  return safe ? `/login?next=${encodeURIComponent(safe)}` : '/login';
}
