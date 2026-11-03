import { NextResponse } from 'next/server';
import { apply } from '@/lib/teach/api';
import { sessionUserId, teachApiDeps } from '@/lib/teach/server';

export const dynamic = 'force-dynamic';

/** POST /api/teach/apply { discipline, bio, sample, links } — PLAT-P10 (EDU-01): an adult's teacher application, screened. */
export async function POST(req: Request) {
  try {
    const userId = await sessionUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => null);
    const r = await apply(userId, body, teachApiDeps());
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error('teach apply error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
