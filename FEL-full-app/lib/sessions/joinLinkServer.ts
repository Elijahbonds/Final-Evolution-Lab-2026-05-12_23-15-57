// Server side of a session's join link (lib/sessions/joinLink.ts has the rules). Thin: who is staff for a slot, and the
// reads and writes of SessionJoinLink.
//
// THE TABLE MAY NOT EXIST YET. SessionJoinLink is a new model, and the code can deploy before the schema is pushed to
// the database. A read then fails (P2021, or no accessor at all on a client generated before the model), and /sessions
// must still load: every link reads as "not posted yet". A write fails with a clear 'join_links_not_ready' instead.
// Nothing here logs a URL or a Prisma message (which quotes the calling code) — only the error code.
import { prisma } from '@/lib/db';
import { isMissingTable } from '@/lib/db/errors';
import { isOwner } from '@/lib/camp/server';
import { isCertifiedCoach } from '@/lib/coach/server';
import { normaliseJoinUrl, slotCoachId, type JoinLinkStaff } from './joinLink';

export interface JoinLink { url: string; host: string }

const noAccessor = (err: unknown) => err instanceof TypeError && !(prisma as { sessionJoinLink?: unknown }).sessionJoinLink;
const errorCode = (err: unknown): string => {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : noAccessor(err) ? 'no_accessor' : 'unknown';
};
const tableMissing = (err: unknown) => isMissingTable(err) || noAccessor(err);

/** Admins are role admin|owner, read fresh from the database (the same check the camp revoke route uses). */
export function isSessionAdmin(userId: string): Promise<boolean> {
  return isOwner(userId);
}

/** The slot's coach: the account the schedule names for it (none today, see slotCoachId), and a certified facilitator. */
export async function isSlotCoach(userId: string, sessionKey: string): Promise<boolean> {
  const coachId = slotCoachId(sessionKey);
  return !!coachId && coachId === userId && (await isCertifiedCoach(userId));
}

export async function joinLinkStaff(userId: string, sessionKey: string): Promise<JoinLinkStaff> {
  const isAdmin = await isSessionAdmin(userId);
  return { isAdmin, isCoach: isAdmin ? false : await isSlotCoach(userId, sessionKey) };
}

/**
 * The posted links for these slots. The CALLER decides which keys this viewer may read (readableKeys for a player,
 * staff for a host); a key missing from the map is "not posted yet". A stored row that no longer passes
 * normaliseJoinUrl is dropped rather than shown. Null when the links could not be read: every one then shows as not
 * posted, and nothing may be promised about an ended session (the wallet pays nothing back until they can be read).
 */
export async function readJoinLinks(sessionKeys: string[]): Promise<Map<string, JoinLink> | null> {
  const out = new Map<string, JoinLink>();
  if (!sessionKeys.length) return out;
  try {
    const rows = await prisma.sessionJoinLink.findMany({ where: { sessionKey: { in: sessionKeys } }, select: { sessionKey: true, url: true } });
    for (const r of rows) {
      const v = normaliseJoinUrl(r.url);
      if (v.ok) out.set(r.sessionKey, { url: v.url, host: v.host });
    }
    return out;
  } catch (err) {
    console.warn('[sessions] join links unreadable, shown as not posted:', errorCode(err));
    return null;
  }
}

export type JoinLinkWrite = { ok: true } | { ok: false; error: 'join_links_not_ready' | 'join_link_save_failed' };

/** Posts (or replaces) a slot's link. `url` must already be normalised. */
export async function saveJoinLink(sessionKey: string, url: string, setById: string): Promise<JoinLinkWrite> {
  try {
    await prisma.sessionJoinLink.upsert({ where: { sessionKey }, create: { sessionKey, url, setById }, update: { url, setById } });
    return { ok: true };
  } catch (err) {
    console.warn('[sessions] join link not saved:', errorCode(err));
    return { ok: false, error: tableMissing(err) ? 'join_links_not_ready' : 'join_link_save_failed' };
  }
}

/**
 * Takes a slot's link down (a wrong paste, before the session starts: the route checks mayTakeDownJoinLink). Clearing a
 * link that was never posted is not an error.
 */
export async function clearJoinLink(sessionKey: string): Promise<JoinLinkWrite> {
  try {
    await prisma.sessionJoinLink.deleteMany({ where: { sessionKey } });
    return { ok: true };
  } catch (err) {
    console.warn('[sessions] join link not cleared:', errorCode(err));
    return { ok: false, error: tableMissing(err) ? 'join_links_not_ready' : 'join_link_save_failed' };
  }
}
