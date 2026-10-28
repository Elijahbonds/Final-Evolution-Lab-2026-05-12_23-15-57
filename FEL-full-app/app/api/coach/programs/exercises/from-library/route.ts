import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { addLibraryToCatalogue, libraryViewer } from '@/lib/library/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/coach/programs/exercises/from-library  { libraryId }
 *
 * EXERCISE-LIBRARY (2026-10-25): "Add to my catalogue" from the shared library. Copies the entry into the caller's
 * own ProgramExercise rows through the catalogue's own validation, returns the row they already have by that name
 * (`already: true`) instead of a second one, and keeps the library link when its column exists (`linked`).
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    let body: { libraryId?: unknown };
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
    const libraryId = typeof body?.libraryId === 'string' ? body.libraryId.trim().slice(0, 100) : '';
    if (!libraryId) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const viewer = await libraryViewer(session.user.id, (session.user as { role?: string }).role);
    const r = await addLibraryToCatalogue(viewer, libraryId);
    if (!r.ok) return NextResponse.json({ error: r.error, field: 'field' in r ? r.field : undefined }, { status: r.status });
    return NextResponse.json({ item: r.item, already: r.already, linked: r.linked }, { status: r.status });
  } catch (e) {
    console.error('catalogue from-library POST error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
