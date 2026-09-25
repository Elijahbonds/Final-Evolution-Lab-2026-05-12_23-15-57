/**
 * lib/sessions/joinLink.ts
 * ========================
 * PURE rules for a session's join link (owner decision 2026-09-24: "Build a join link now — add a booking record with
 * a date/time and a join link the coach pastes in (Zoom/Meet/etc.)"). Before this, /sessions took the shards, said
 * "Booked! See you there." and never told the player where "there" was.
 *
 *  - THE URL: https only, nothing like `name@` in front of the host, a real domain name (no IP, no localhost), at most
 *    JOIN_URL_MAX characters, stored in its normalised form. The host goes beside the link on the page so a player can
 *    see where it leads before tapping it.
 *  - WHO POSTS IT: an admin (role admin|owner — lib/camp/server isOwner) or the slot's coach (slotCoachId below).
 *  - WHO READS IT: a player holding a CONFIRMED booking for the slot, the coach and admins. A cancelled, refunded or
 *    pending row reads nothing.
 *
 * No Prisma, no DOM; lib/sessions/joinLinkServer.ts does the reads and writes.
 */
import { GROUP_CONFIG } from './schedule';

export const JOIN_URL_MAX = 500;

export type JoinUrlError = 'url_required' | 'url_too_long' | 'url_not_https' | 'url_invalid' | 'url_has_login' | 'url_bad_host';
export type JoinUrlResult = { ok: true; url: string; host: string } | { ok: false; error: JoinUrlError };

// eslint-disable-next-line no-control-regex
const SPACE_OR_CONTROL = /[\s\u0000-\u001f\u007f-\u009f]/;
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD = /^([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/** A public domain name: two or more DNS labels ending in a real top-level label. IPs, localhost and bare words fail. */
function isDomainName(hostname: string): boolean {
  if (hostname.length > 253 || hostname.startsWith('[')) return false; // an IPv6 literal
  const labels = hostname.split('.');
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return false;
  return TLD.test(labels[labels.length - 1]); // an IPv4 address ends in digits, so it fails here
}

/**
 * A pasted link, checked and normalised, or the reason it was refused. The literal `https://` prefix is required
 * BEFORE the parser runs, because the parser forgives: `https:evil.example` and `https:\\evil.example` both come out as
 * https://evil.example/. The normalised form (lowercase scheme and host, punycode host, default port dropped) is what
 * is stored and shown, so the host a player sees is the host the link opens.
 */
export function normaliseJoinUrl(raw: unknown): JoinUrlResult {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, error: 'url_required' };
  const s = raw.trim();
  if (s.length > JOIN_URL_MAX) return { ok: false, error: 'url_too_long' };
  if (!/^https:\/\//i.test(s)) return { ok: false, error: 'url_not_https' };
  if (SPACE_OR_CONTROL.test(s) || s.includes('\\')) return { ok: false, error: 'url_invalid' };
  let u: URL;
  try { u = new URL(s); } catch { return { ok: false, error: 'url_invalid' }; }
  if (u.protocol !== 'https:') return { ok: false, error: 'url_not_https' };
  // https://zoom.us@evil.example opens evil.example; a meeting link never needs a login in front of its host
  if (u.username || u.password || /^https:\/\/[^/?#]*@/i.test(s)) return { ok: false, error: 'url_has_login' };
  if (!isDomainName(u.hostname)) return { ok: false, error: 'url_bad_host' };
  const url = u.toString();
  if (url.length > JOIN_URL_MAX) return { ok: false, error: 'url_too_long' };
  return { ok: true, url, host: u.host };
}

/** The schedule's slot ids: gw_YYYY-MM-DD for a group workout, pv_YYYY-MM-DD_HH for a private 1-on-1. */
const SESSION_KEY = /^(gw_\d{4}-\d{2}-\d{2}|pv_\d{4}-\d{2}-\d{2}_\d{1,2})$/;
export function isSessionKey(v: unknown): v is string {
  return typeof v === 'string' && SESSION_KEY.test(v);
}

/**
 * The coach ACCOUNT behind a slot, if the schedule or booking data names one. Today neither does: the schedule names
 * one host for every group workout and private 1-on-1 by display name only (GROUP_CONFIG.host), and a SessionBooking
 * row carries no coach. So every slot answers null and admins post every link. When a slot gains a host account it is
 * wired here, and that coach must also be a certified facilitator to post (joinLinkServer.isSlotCoach).
 */
export function slotCoachId(_sessionKey: string): string | null {
  return null;
}

export interface JoinLinkStaff { isAdmin: boolean; isCoach: boolean }

/** Posting or clearing a slot's link: an admin, or that slot's coach. Holding a booking gives no say over the link. */
export function mayPostJoinLink(staff: JoinLinkStaff): boolean {
  return staff.isAdmin || staff.isCoach;
}

export interface BookingRowLike { userId: string; sessionKey: string; status: string }

/** A private 1-on-1 slot (pv_…): it holds one player. */
export function isPrivateKey(sessionKey: string): boolean {
  return sessionKey.startsWith('pv_');
}

/**
 * Who holds each private 1-on-1 slot: the player whose CONFIRMED booking came first. The booking route refuses a second
 * player, but two bookings racing each other can both land; the slot, and its link, stay the first booker's. Pass every
 * player's confirmed rows for the slots in question.
 */
export function privateHolders(rows: (BookingRowLike & { id: string; createdAt: Date | string })[]): Map<string, string> {
  const first = new Map<string, { userId: string; at: number; id: string }>();
  for (const r of rows) {
    if (r.status !== 'confirmed' || !isPrivateKey(r.sessionKey)) continue;
    const at = new Date(r.createdAt).getTime();
    const had = first.get(r.sessionKey);
    if (!had || at < had.at || (at === had.at && r.id < had.id)) first.set(r.sessionKey, { userId: r.userId, at, id: r.id });
  }
  return new Map([...first].map(([key, h]) => [key, h.userId]));
}

/**
 * The slots whose link this player may read, from their own booking rows: CONFIRMED rows only. The caller's query
 * already asks for confirmed rows; this re-checks, so a widened query can never hand a cancelled or refunded booking
 * (or somebody else's) a link. A private 1-on-1 link goes to the slot's holder only (privateHolders), never to a second
 * booker as well.
 */
export function readableKeys(userId: string, bookings: BookingRowLike[], holders: ReadonlyMap<string, string>): string[] {
  const keys = bookings
    .filter((b) => b.userId === userId && b.status === 'confirmed' && isSessionKey(b.sessionKey))
    .filter((b) => !isPrivateKey(b.sessionKey) || holders.get(b.sessionKey) === userId)
    .map((b) => b.sessionKey);
  return [...new Set(keys)];
}

/** Minutes each kind runs (lib/sessions/schedule.ts: group 60, private 1-on-1 45). */
export const SESSION_LENGTH_MIN: Record<string, number> = { group_workout: GROUP_CONFIG.durationMin, private_1on1: 45 };

/** The longest session runs this long: a booking that started longer ago than this is over, whatever its kind. */
export const LONGEST_SESSION_MIN = Math.max(GROUP_CONFIG.durationMin, ...Object.values(SESSION_LENGTH_MIN));

/** True once the session is over, so the page stops promising a link for it. */
export function sessionEnded(kind: string, startsAtIso: string, nowMs: number): boolean {
  const start = new Date(startsAtIso).getTime();
  if (!Number.isFinite(start)) return false;
  return nowMs > start + (SESSION_LENGTH_MIN[kind] ?? GROUP_CONFIG.durationMin) * 60_000;
}

export interface HostingRow {
  sessionKey: string;
  kind: 'group_workout' | 'private_1on1';
  startsAtIso: string;
  booked: number;
}

/**
 * The slots a host posts links for: every upcoming group workout on the schedule, plus any other slot with a
 * confirmed booking (a private 1-on-1 is only worth a link once somebody has booked it). Soonest first.
 */
export function hostingRows(
  groupSlots: { sessionKey: string; startsAtIso: string }[],
  booked: { sessionKey: string; kind: string; count: number; startsAt: Date | string }[],
): HostingRow[] {
  const rows = new Map<string, HostingRow>();
  for (const s of groupSlots) rows.set(s.sessionKey, { sessionKey: s.sessionKey, kind: 'group_workout', startsAtIso: s.startsAtIso, booked: 0 });
  for (const b of booked) {
    if (!isSessionKey(b.sessionKey)) continue;
    const row = rows.get(b.sessionKey);
    if (row) { row.booked += b.count; continue; }
    rows.set(b.sessionKey, {
      sessionKey: b.sessionKey,
      kind: b.sessionKey.startsWith('pv_') ? 'private_1on1' : 'group_workout',
      startsAtIso: new Date(b.startsAt).toISOString(),
      booked: b.count,
    });
  }
  return [...rows.values()].sort((a, b) => a.startsAtIso.localeCompare(b.startsAtIso));
}

/** What the page says when a post is refused. Plain words; the coach or admin reads these, never a player. */
export const JOIN_LINK_ERROR_COPY: Record<string, string> = {
  url_required: 'Paste a link first.',
  url_too_long: `That link is too long (${JOIN_URL_MAX} characters max).`,
  url_not_https: 'Use a link that starts with https://',
  url_invalid: 'That is not a link we can use. Copy it again from Zoom, Meet or your meeting app.',
  url_has_login: 'Links with a name@ before the site are not allowed.',
  url_bad_host: 'That link has no real site name in it.',
  forbidden: 'Only the session’s coach or an admin can post this link.',
  slot_unavailable: 'That session is not on the schedule.',
  join_links_not_ready: 'Join links are not switched on yet. The database needs its update first.',
};
