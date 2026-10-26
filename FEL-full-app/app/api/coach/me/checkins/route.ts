export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { myForms, submit, type CheckinDb } from '@/lib/coach/checkins/server';

/**
 * COACH-PARITY (2026-10-26): the athlete's check-ins (lib/coach/checkins/server.ts).
 *   GET   the forms their live coaches assigned to them or a team of theirs: due or answered this period, with only the
 *         questions they may be asked (a teen: training questions, no free text; health questions: adults, switch on)
 *   POST  { formId, answers, health? } — training answers under the teen gate (403 with its message); health answers only
 *         for a verified adult (403 health_data_adults_only) with a live health_data grant (412 health_data_consent_required)
 * Before the pending SQL: GET { available: false }, POST 503.
 */
const db = () => prisma as unknown as CheckinDb;

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await myForms(db(), userId);
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await submit(db(), userId, await req.json().catch(() => null));
  return NextResponse.json(r.body, { status: r.status });
}
