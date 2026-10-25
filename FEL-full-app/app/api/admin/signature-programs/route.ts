import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { defaultDeps, reviewAct, reviewOverview, type ReviewAction } from '@/lib/signature/server';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/signature-programs — the owner's review of the four signature programs: status, checks, edits, gaps.
 * POST /api/admin/signature-programs  { action: 'approve' | 'reject' | 'draft', id, note? } | { action: 'edit', id, edits, note? }
 * SIGNATURE-PROGRAMS (2026-10-25). The admin role only (lib/admin/requireAdmin.ts, the library review's check). Writes
 * answer 503 signature_not_ready until the pending SQL is applied; an edit or approval with any problem answers 422.
 */
export async function GET() {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(await reviewOverview(defaultDeps()));
  } catch (e) {
    console.error('admin signature GET error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const session = await getServerSession(authOptions);
    const adminId = (session?.user as { id?: string } | undefined)?.id;
    if (!adminId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    let body: ReviewAction;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
    if (!body || !['approve', 'reject', 'draft', 'edit'].includes((body as { action?: string }).action ?? '') || typeof body.id !== 'string') {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    const r = await reviewAct(adminId, body, defaultDeps());
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error('admin signature POST error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
