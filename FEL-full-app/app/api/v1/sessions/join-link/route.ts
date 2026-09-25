export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { upcomingGroupSlots, privateSlots } from '@/lib/sessions/schedule';
import { isSessionKey, mayPostJoinLink, mayTakeDownJoinLink, normaliseJoinUrl, JOIN_LINK_ERROR_COPY } from '@/lib/sessions/joinLink';
import { joinLinkStaff, saveJoinLink, clearJoinLink } from '@/lib/sessions/joinLinkServer';

type Caller = { userId: string; sessionKey: string; body: any } | NextResponse;

/**
 * Who is asking, about which slot, and may they post for it. Staff is checked BEFORE the URL is looked at, so a
 * player learns nothing about the link rules by probing. A booking gives no say over the link.
 */
async function staffCaller(req: NextRequest): Promise<Caller> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const sessionKey = body?.sessionKey;
  if (!isSessionKey(sessionKey)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  if (!mayPostJoinLink(await joinLinkStaff(userId, sessionKey))) {
    return NextResponse.json({ error: 'forbidden', message: JOIN_LINK_ERROR_COPY.forbidden }, { status: 403 });
  }
  return { userId, sessionKey, body };
}

/** A slot on the schedule now, or one somebody holds a confirmed booking for. */
async function knownSlot(sessionKey: string): Promise<boolean> {
  const now = new Date();
  if (upcomingGroupSlots(now, 8).some((s) => s.sessionKey === sessionKey)) return true;
  if (privateSlots(now, 8).some((s) => s.sessionKey === sessionKey)) return true;
  return (await prisma.sessionBooking.count({ where: { sessionKey, status: 'confirmed' } })) > 0;
}

function writeFailed(error: 'join_links_not_ready' | 'join_link_save_failed') {
  return error === 'join_links_not_ready'
    ? NextResponse.json({ error, message: JOIN_LINK_ERROR_COPY.join_links_not_ready }, { status: 503 })
    : NextResponse.json({ error }, { status: 500 });
}

/**
 * POST /api/v1/sessions/join-link
 * Body: { sessionKey, url }
 * The slot's coach or an admin posts (or replaces) the link its booked players join by. https only; stored
 * normalised; answered with the host the page shows beside it.
 */
export async function POST(req: NextRequest) {
  const c = await staffCaller(req);
  if (c instanceof NextResponse) return c;
  const v = normaliseJoinUrl(c.body?.url);
  if (!v.ok) return NextResponse.json({ error: v.error, message: JOIN_LINK_ERROR_COPY[v.error] }, { status: 400 });
  if (!(await knownSlot(c.sessionKey))) return NextResponse.json({ error: 'slot_unavailable', message: JOIN_LINK_ERROR_COPY.slot_unavailable }, { status: 404 });
  const saved = await saveJoinLink(c.sessionKey, v.url, c.userId);
  if (!saved.ok) return writeFailed(saved.error);
  return NextResponse.json({ ok: true, sessionKey: c.sessionKey, link: { url: v.url, host: v.host } });
}

/**
 * DELETE /api/v1/sessions/join-link
 * Body: { sessionKey }
 * Takes a wrong link down before the session starts; the booked players see "not posted yet" again. Once it has started
 * the link stays (409 join_link_locked) and a wrong one is replaced with POST: the wallet pays back a session that never
 * had a link, and a link taken down would leave no trace that it had one (lib/sessions/joinLink.ts mayTakeDownJoinLink).
 */
export async function DELETE(req: NextRequest) {
  const c = await staffCaller(req);
  if (c instanceof NextResponse) return c;
  if (!mayTakeDownJoinLink(c.sessionKey, Date.now())) {
    return NextResponse.json({ error: 'join_link_locked', message: JOIN_LINK_ERROR_COPY.join_link_locked }, { status: 409 });
  }
  const cleared = await clearJoinLink(c.sessionKey);
  if (!cleared.ok) return writeFailed(cleared.error);
  return NextResponse.json({ ok: true, sessionKey: c.sessionKey, link: null });
}
