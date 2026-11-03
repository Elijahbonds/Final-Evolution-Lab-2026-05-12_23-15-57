import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { libraryForDevice, libraryViewer } from '@/lib/library/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/library/all?drafts=1
 *
 * PLAT-P08 (2026-11-02): the viewer's slice of the library, so the search screen searches on the device as they type
 * (lib/library/search/page.ts searchPage, the same function /api/library/search runs). Approved entries; a coach may add
 * drafts=1. Youth rules apply here, on the server. Private to the viewer; a short browser cache.
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const viewer = await libraryViewer(session.user.id, (session.user as { role?: string }).role);
    const body = await libraryForDevice(viewer, new URL(req.url).searchParams.get('drafts') === '1');
    return NextResponse.json(body, { headers: { 'cache-control': 'private, max-age=300' } });
  } catch (e) {
    console.error('library all GET error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
