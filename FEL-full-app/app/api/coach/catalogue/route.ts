import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { kbTagView } from '@/lib/coach/kbTags';

export const dynamic = 'force-dynamic';

/* GET — published exercises for learner view.
 * MIRROR-COACH P2 (2026-09-25): each exercise carries `tags` — FEL's pattern / brace mode / skill layer for it and the
 * one-line reason (lib/coach/kbTags.ts), plus whether "Add to my catalogue" can copy it (the posture audit is an
 * assessment and cannot). The KB table has no tag columns; the tags are FEL data keyed by slug. */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const exercises = await prisma.exercise.findMany({
      where: { published: true },
      include: { category: { select: { id: true, name: true } } },
      orderBy: [{ phase: 'asc' }, { chapter: 'asc' }, { sortOrder: 'asc' }],
    });

    const categories = await prisma.exerciseCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      where: { exercises: { some: { published: true } } },
    });

    const tagged = exercises.map((e) => ({ ...e, tags: kbTagView(e.slug, e.category?.name) }));
    return NextResponse.json({ exercises: tagged, categories });
  } catch (e) {
    console.error('catalogue GET error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
