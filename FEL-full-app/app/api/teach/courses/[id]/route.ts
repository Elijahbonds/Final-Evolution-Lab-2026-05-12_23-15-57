import { NextResponse } from 'next/server';
import { putCourse } from '@/lib/teach/api';
import { currentUserId } from '@/lib/camp/server';
import { teachApiDeps } from '@/lib/teach/server';

export const dynamic = 'force-dynamic';

/** PUT /api/teach/courses/<id> { title, summary, lessons, status } — save a draft, or publish (validated). 403 non-teacher. */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const r = await putCourse(userId, params.id, await req.json().catch(() => null), teachApiDeps());
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error('teach course PUT error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
