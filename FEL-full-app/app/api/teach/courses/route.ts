import { NextResponse } from 'next/server';
import { listCourses, newCourse } from '@/lib/teach/api';
import { sessionUserId, teachApiDeps } from '@/lib/teach/server';

export const dynamic = 'force-dynamic';

/** GET /api/teach/courses — PLAT-P10 (EDU-02): a teacher's own courses. 403 for anyone who may not author. */
export async function GET() {
  try {
    const userId = await sessionUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const r = await listCourses(userId, teachApiDeps());
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error('teach courses GET error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

/** POST /api/teach/courses { title } — a new draft course. */
export async function POST(req: Request) {
  try {
    const userId = await sessionUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const r = await newCourse(userId, await req.json().catch(() => null), teachApiDeps());
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error('teach courses POST error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
