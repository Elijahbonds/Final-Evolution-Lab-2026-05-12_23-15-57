import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { openSlip } from '@/server/netd/src/ticket';
import { storePartyReport } from '@/lib/party/social/reports';
import type { RawDb } from '@/lib/coach/pendingSchema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/party/report {slip} — PARTY-CHAT (2026-10-13). A report of someone in a party. The body carries only netd's
 * SEALED slip (server/netd/src/ticket.ts): the accounts it names come from inside the seal, never from the request, and
 * the slip must belong to the caller (its reporter is this session's account, or a guest slip from a guest). Stored in
 * "PartyReport" once prisma/pending/2026-10-13-party-report.sql is applied; until then a safe no-op ({stored:false}).
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  const userId = typeof id === 'string' && id ? id : null;
  let body: { slip?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }
  const slip = openSlip(body?.slip, process.env.PARTY_TICKET_SECRET || undefined);
  if (!slip) return NextResponse.json({ stored: false, reason: 'not_configured_or_invalid' }, { status: 200 });
  if (slip.reporterUid !== userId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const outcome = await storePartyReport(prisma as unknown as RawDb, slip);
  return NextResponse.json({ stored: outcome === 'stored', reason: outcome === 'stored' ? undefined : outcome });
}
