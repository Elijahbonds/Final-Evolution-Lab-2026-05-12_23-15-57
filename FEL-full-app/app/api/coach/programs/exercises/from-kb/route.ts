import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { copyKbToCatalogue } from '@/lib/coach/catalogueServer';

export const dynamic = 'force-dynamic';

/**
 * POST /api/coach/programs/exercises/from-kb  { kbExerciseId }
 *
 * "Add to my catalogue" (MIRROR-COACH P2, 2026-09-25). The Blueprint knowledge base (prisma Exercise, 20 seeded
 * exercises with cues, mistakes and video) and the coach's prescribable catalogue (ProgramExercise) were two libraries
 * with no path between them, and the builder takes only the second — so the breath, foot and recovery work the KB
 * teaches could be read on the Exercises tab but never put in a program. This copies one published KB exercise into
 * the caller's catalogue with FEL's pattern / brace / skill-layer tags (lib/coach/kbTags.ts). 201 with the new row;
 * 200 with `already: true` when the coach already has one by that name.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    let body: { kbExerciseId?: unknown };
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
    const kbExerciseId = typeof body?.kbExerciseId === 'string' ? body.kbExerciseId.trim().slice(0, 64) : '';
    if (!kbExerciseId) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const r = await copyKbToCatalogue(session.user.id, kbExerciseId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ item: r.item, already: r.already, dropped: r.dropped }, { status: r.status });
  } catch (e) {
    console.error('catalogue from-kb POST error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
