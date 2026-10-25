import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { libraryViewer, searchLibrary } from '@/lib/library/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/library/search?q=&pattern=&equipment=&muscle=&level=&sport=&layer=&category=&goal=&lowLoad=&only=1&drafts=1
 *
 * EXERCISE-LIBRARY (2026-10-25): the shared library's search (lib/library/search/engine.ts) for anyone signed in.
 * Approved entries only; a coach may add drafts=1 to see drafts too (labelled). Youth rules apply to the viewer.
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const viewer = await libraryViewer(session.user.id, (session.user as { role?: string }).role);
    return NextResponse.json(await searchLibrary(viewer, new URL(req.url).searchParams));
  } catch (e) {
    console.error('library search GET error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
