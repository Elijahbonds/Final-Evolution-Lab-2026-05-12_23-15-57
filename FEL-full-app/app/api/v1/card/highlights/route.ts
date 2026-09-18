import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { highlightCandidatesFor } from '@/lib/creator/card-stats-server';

export const dynamic = 'force-dynamic';

/** GET /api/v1/card/highlights — the caller's pinnable highlights (their PBs, wins, signature attempts). */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, candidates: await highlightCandidatesFor(userId) });
}
