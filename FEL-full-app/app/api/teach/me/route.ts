import { NextResponse } from 'next/server';
import { me } from '@/lib/teach/api';
import { currentUserId } from '@/lib/camp/server';
import { teachApiDeps } from '@/lib/teach/server';

export const dynamic = 'force-dynamic';

/** GET /api/teach/me — PLAT-P10 (EDU-01): the viewer's teacher state (tables ready, role, may author, latest application). */
export async function GET() {
  try {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const r = await me(userId, teachApiDeps());
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error('teach me error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
