export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { isCertifiedCoach } from '@/lib/coach/server';
import { MAX_LIVE_INVITES_PER_COACH, invitePath, inviteUrl } from '@/lib/coach/invite';
import { createCodedInvite } from '@/lib/coach/inviteServer';
import { JOIN_BY_CODE_PATH, formatCode } from '@/lib/coach/inviteCode';
import { inviteEmail } from '@/lib/coach/inviteEmail';
import { parseRosterImport } from '@/lib/coach/bulkImport';
import { brandSignOff } from '@/lib/coach/branding';
import { brandingFor } from '@/lib/coach/brandingServer';
import type { RawDb } from '@/lib/coach/pendingSchema';
import { mailLinkOrigin, mailReady, sendMail } from '@/lib/mail';
import { rateLimit } from '@/lib/rate-limit';

/** Emails one coach may send in a day through the owner's mailbox — a bound on abuse, not on coaching. */
const EMAILS_PER_DAY = 150;

/**
 * POST /api/coach/invite/bulk — add a team at once, or email one athlete (coach-loop P1, 2026-10-20).
 *
 * Body: { text: string, send?: boolean }. `text` is a pasted list or a CSV (lib/coach/bulkImport.ts); one address on
 * its own is the single email invite. Every row gets its OWN one-shot invite with a typed code. A row with an email is
 * emailed its link when `send` is true and email is on (lib/mail, EMAIL_ENABLED); every row comes back on the coach's
 * sheet with its code and link, so with email off the coach hands the codes out.
 *
 * WHAT IS NEVER DONE: no address is looked up against accounts, and the answer never says whether an address has an
 * FEL account (the email-enumeration rule of lib/coach/rosterLookup.ts). Nothing is joined here — each athlete still
 * opens their invite, signs in and passes the teen gate. The only addresses in the answer are the ones the coach typed.
 *
 * Certified coaches only (lib/coach/server.ts), because this can send mail from the owner's mailbox.
 */
export async function POST(req: NextRequest) {
  const coachId = await currentUserId();
  if (!coachId) return bad('unauthorized', 401);
  if (!(await isCertifiedCoach(coachId))) return bad('facilitator_not_certified', 403);

  let body: { text?: unknown; send?: unknown };
  try { body = await req.json(); } catch { return bad('invalid_json'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('invalid_json');
  const parsed = parseRosterImport(typeof body.text === 'string' ? body.text : '');
  if (!parsed.rows.length) return NextResponse.json({ error: 'nothing_to_invite', problems: parsed.problems, duplicates: parsed.duplicates }, { status: 400 });

  const live = await prisma.coachInvite.count({ where: { coachId, closedAt: null, expiresAt: { gt: new Date() } } });
  const room = MAX_LIVE_INVITES_PER_COACH - live;
  if (parsed.rows.length > room) {
    return NextResponse.json({ error: 'too_many_invites', room: Math.max(0, room), asked: parsed.rows.length }, { status: 429 });
  }

  const wantSend = body.send === true;
  const origin = mailLinkOrigin();
  const canSend = wantSend && mailReady() && !!origin;
  const coach = canSend ? await prisma.user.findUnique({ where: { id: coachId }, select: { name: true } }) : null;
  // COACH-DELIVERY COA-04: the coach's brand signs the (plain-text) email, when they have one
  const signOff = canSend ? brandSignOff((await brandingFor(prisma as unknown as RawDb, [coachId])).get(coachId) ?? null, coach?.name ?? '') : null;

  const sheet: { line: number; name: string | null; email: string | null; code: string; path: string; emailed: 'sent' | 'off' | 'failed' | 'none' }[] = [];
  for (const row of parsed.rows) {
    const inv = await createCodedInvite(prisma, coachId, 'once');
    let emailed: 'sent' | 'off' | 'failed' | 'none' = row.email ? 'off' : 'none';
    if (row.email && canSend) {
      if (!rateLimit(`invite-email:${coachId}`, EMAILS_PER_DAY, 24 * 60 * 60 * 1000).ok) {
        emailed = 'off';
      } else {
        const msg = inviteEmail({ coachName: coach?.name ?? '', athleteName: row.name, link: inviteUrl(origin!, inv.token), code: inv.code, codeUrl: `${origin}${JOIN_BY_CODE_PATH}`, expiresAt: inv.expiresAt, signOff });
        const r = await sendMail({ to: row.email, ...msg });
        emailed = r.status === 'sent' ? 'sent' : r.status === 'disabled' ? 'off' : 'failed';
      }
    }
    sheet.push({ line: row.line, name: row.name, email: row.email, code: formatCode(inv.code), path: invitePath(inv.token), emailed });
  }

  return NextResponse.json({
    sheet, problems: parsed.problems, duplicates: parsed.duplicates, format: parsed.format ?? null,
    email: { requested: wantSend, on: mailReady() && !!origin },
  }, { status: 201 });
}
