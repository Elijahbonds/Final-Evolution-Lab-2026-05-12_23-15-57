import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { libraryViewer, submitToLibrary } from '@/lib/library/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/coach/programs/exercises/:id/submit — "Submit to library" (EXERCISE-LIBRARY, 2026-10-25).
 * The coach's own row only (anyone else's answers 404). A snapshot goes to the owner's moderation queue; the coach's
 * row stays private and theirs. 503 library_not_ready until the pending SQL is applied.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const viewer = await libraryViewer(session.user.id, (session.user as { role?: string }).role);
    const r = await submitToLibrary(viewer, String(params.id ?? '').slice(0, 64));
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ submission: r.submission, notes: r.notes }, { status: r.status });
  } catch (e) {
    console.error('catalogue submit POST error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
