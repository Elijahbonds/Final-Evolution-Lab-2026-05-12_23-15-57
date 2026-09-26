import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createCatalogueItem, listCatalogue } from '@/lib/coach/catalogueServer';

export const dynamic = 'force-dynamic';

// The coach's prescribable catalogue (MIRROR-COACH P2, 2026-09-25). The rules — validation, the three tags, per-coach
// names, links only to the coach's own rows — are in lib/coach/catalogue.ts and lib/coach/catalogueServer.ts; this
// file only establishes who is calling. The POST used to write whatever it was sent (a `javascript:` video link, a
// tempo of "fast", a fourth cue sliced off in silence) and answered a second coach's "Goblet Squat" with a 409 about
// a name that coach had never used — the name was unique across all of FEL.

/* GET — list the calling coach's own program exercises, by name */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json(await listCatalogue(session.user.id));
  } catch (e) {
    console.error('program exercises GET error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

/* POST — create a program exercise owned by the calling coach */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'invalid_json' }, { status: 400 });

    const r = await createCatalogueItem(session.user.id, body);
    if (!r.ok) return NextResponse.json({ error: r.error, field: r.field }, { status: r.status });
    // The row itself at the top level, as before (lib/hooks/useExerciseLibrary.ts reads it that way), plus the
    // claims screen's heads-up for the form.
    return NextResponse.json({ ...(r.item as object), warnings: r.warnings }, { status: r.status });
  } catch (e) {
    console.error('program exercises POST error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
