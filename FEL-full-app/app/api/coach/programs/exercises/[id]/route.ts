import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { deleteCatalogueItem, updateCatalogueItem } from '@/lib/coach/catalogueServer';

export const dynamic = 'force-dynamic';

// MIRROR-COACH P2 (2026-09-25): both verbs go through lib/coach/catalogueServer.ts. The PUT used to copy any of nine
// fields straight into the row unchecked (an empty name, a link to ANOTHER coach's exercise as the regression), and the
// DELETE of an exercise that was in a program hit the SessionExercise foreign key and answered a bare 500. Another
// coach's id answers 404 on both, exactly like a missing one.

/* PUT — update a program exercise owned by the calling coach (only the fields sent change) */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'invalid_json' }, { status: 400 });

    const r = await updateCatalogueItem(session.user.id, params.id, body);
    if (!r.ok) return NextResponse.json({ error: r.error, field: r.field }, { status: r.status });
    return NextResponse.json({ ...(r.item as object), warnings: r.warnings });
  } catch (e) {
    console.error('program exercise PUT error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

/* DELETE — remove a program exercise owned by the calling coach (refused while a program prescribes it) */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const r = await deleteCatalogueItem(session.user.id, params.id);
    if (!r.ok) return NextResponse.json({ error: r.error, count: r.count }, { status: r.status });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('program exercise DELETE error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
