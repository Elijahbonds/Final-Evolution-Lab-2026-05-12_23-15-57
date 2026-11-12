import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { libraryEntry, libraryViewer } from '@/lib/library/server';

export const dynamic = 'force-dynamic';

/** GET /api/library/:id — one library entry with its easier / harder neighbours (EXERCISE-LIBRARY, 2026-10-25). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const viewer = await libraryViewer(session.user.id, (session.user as { role?: string }).role);
    const r = await libraryEntry(viewer, String(params.id ?? '').slice(0, 100));
    if (!r) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(r);
  } catch (e) {
    console.error('library entry GET error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
