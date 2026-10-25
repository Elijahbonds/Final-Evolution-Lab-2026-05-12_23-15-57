import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { libraryViewer, mySubmissionList, myLibraryLinks, withdrawMine } from '@/lib/library/server';

export const dynamic = 'force-dynamic';

/** GET /api/library/submissions — the caller's own submissions and library links (EXERCISE-LIBRARY, 2026-10-25). */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const viewer = await libraryViewer(session.user.id, (session.user as { role?: string }).role);
    const [subs, links] = await Promise.all([mySubmissionList(viewer), myLibraryLinks(viewer)]);
    return NextResponse.json({ ...subs, links });
  } catch (e) {
    console.error('library submissions GET error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

/** POST /api/library/submissions { action: 'withdraw', id } — take back a pending submission. */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    let body: { action?: unknown; id?: unknown };
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
    if (body?.action !== 'withdraw' || typeof body.id !== 'string') return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    const viewer = await libraryViewer(session.user.id, (session.user as { role?: string }).role);
    const r = await withdrawMine(viewer, body.id.slice(0, 64));
    return NextResponse.json(r.ok ? { ok: true } : { error: r.error }, { status: r.status });
  } catch (e) {
    console.error('library submissions POST error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
