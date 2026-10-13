import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readDobYear } from '@/lib/privacy/scanSaveGate';
import { buildTicket } from '@/lib/party/social/ticketServer';
import { partyIceServers } from '@/lib/party/social/iceServers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/party/ticket?name=… — PARTY-CHAT (2026-10-13). The signed ticket netd believes about this person: a stable
 * opaque handle, their party name, and whether they are a VERIFIED ADULT (User.dobYear from the database, the strict
 * rule; lib/party/social/ticketServer.ts). A guest or an unknown age gets no adult ticket, which netd treats as teen
 * rules. ICE servers (and a short-lived TURN credential, when configured) go to verified adults only: nobody else is
 * ever offered voice. Never cached; never the birth year, the account id or an email in the reply.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  const userId = typeof id === 'string' && id ? id : null;
  const name = new URL(req.url).searchParams.get('name') ?? '';
  const dobYear = userId ? await readDobYear(prisma, userId, 'party_ticket') : null;
  const out = buildTicket({ userId, dobYear, name, secret: process.env.PARTY_TICKET_SECRET || undefined, now: Date.now() });
  return NextResponse.json(
    { ticket: out.ticket, adult: out.adult, configured: out.configured, signedIn: !!userId, iceServers: out.adult ? partyIceServers() : [] },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
