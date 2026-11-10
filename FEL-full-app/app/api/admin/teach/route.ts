import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { decide, queue } from '@/lib/teach/api';
import { currentUserId } from '@/lib/camp/server';
import { teachApiDeps } from '@/lib/teach/server';

export const dynamic = 'force-dynamic';

/** GET /api/admin/teach — PLAT-P10 (EDU-01): the owner's queue of teacher applications. The admin role only. */
export async function GET() {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const r = await queue(teachApiDeps());
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error('admin teach GET error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

/** POST /api/admin/teach { id, decision: 'approved' | 'rejected', note? } — an approval grants the teacher role. */
export async function POST(req: Request) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const ownerId = await currentUserId();
    if (!ownerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const r = await decide(ownerId, await req.json().catch(() => null), teachApiDeps());
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error('admin teach POST error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
