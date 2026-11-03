import { NextResponse } from 'next/server';
import { practiceBest } from '@/lib/teach/api';
import { sessionUserId, teachApiDeps } from '@/lib/teach/server';

export const dynamic = 'force-dynamic';

/** GET /api/teach/practice?mode=<key> — PLAT-P10 (EDU-03): the viewer's own best score in a mode, for a practice block. */
export async function GET(req: Request) {
  try {
    const userId = await sessionUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const r = await practiceBest(userId, new URL(req.url).searchParams.get('mode') ?? '', teachApiDeps());
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error('teach practice error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
