import { NextResponse } from 'next/server';
import { checkPePlan } from '@/lib/teach/api';
import { sessionUserId, teachApiDeps } from '@/lib/teach/server';

export const dynamic = 'force-dynamic';

/** POST /api/teach/pe-plan { title, band, parts } — PLAT-P10 (EDU-06): a PE plan checked against the format; nothing kept. */
export async function POST(req: Request) {
  try {
    const userId = await sessionUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const r = await checkPePlan(userId, await req.json().catch(() => null), teachApiDeps());
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error('teach pe-plan error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
