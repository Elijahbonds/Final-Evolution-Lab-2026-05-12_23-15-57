import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { reviewAct, reviewOverview, type ReviewAction } from '@/lib/library/server';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/library?batch=&status=draft|approved|rejected|all&offset=  — the owner's review list, by batch.
 * POST /api/admin/library  { action: 'approve'|'reject', ids } | { action: 'approve-batch', batch } |
 *                          { action: 'edit', entry, approve? } | { action: 'moderate', submissionId, decision, note?, entry? }
 * EXERCISE-LIBRARY (2026-10-25). The admin role only (lib/admin/requireAdmin.ts, the existing moderator check).
 * Writes answer 503 library_not_ready until the pending SQL is applied.
 */
export async function GET(req: Request) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(await reviewOverview(new URL(req.url).searchParams));
  } catch (e) {
    console.error('admin library GET error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const session = await getServerSession(authOptions);
    const moderatorId = session?.user?.id;
    if (!moderatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    let body: ReviewAction;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
    const ok = body && ['approve', 'reject', 'approve-batch', 'edit', 'moderate'].includes((body as { action?: string }).action ?? '');
    if (!ok) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    const r = await reviewAct(moderatorId, body);
    return NextResponse.json(r.ok ? r : { error: r.error, issues: 'issues' in r ? r.issues : undefined }, { status: r.status });
  } catch (e) {
    console.error('admin library POST error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
