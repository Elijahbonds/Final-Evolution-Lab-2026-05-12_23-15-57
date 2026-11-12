import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { kbTagView } from '@/lib/coach/kbTags';
import { libraryCardsByName, libraryViewer, type LibraryCard } from '@/lib/library/server';

export const dynamic = 'force-dynamic';

/* GET — published exercises for learner view.
 * MIRROR-COACH P2 (2026-09-25): each exercise carries `tags` — FEL's pattern / brace mode / skill layer for it and the
 * one-line reason (lib/coach/kbTags.ts), plus whether "Add to my catalogue" can copy it (the posture audit is an
 * assessment and cannot). The KB table has no tag columns; the tags are FEL data keyed by slug.
 * LIBRARY-ANATOMY-2 (2026-10-25): and `library` — the library card the exercise is, by name (lib/library/match.ts), or null. */
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

    const tags = exercises.map((e) => kbTagView(e.slug, e.category?.name));
    // LIBRARY-ANATOMY-2 (owner, 2026-10-25): a KB exercise the library has by name shows the library's stage (the athlete's
    // avatar doing it); the rest show their cue card. The library failing never fails the knowledge base.
    let library: (LibraryCard | null)[] = [];
    try {
      const viewer = await libraryViewer(session.user.id, (session.user as { role?: string }).role);
      library = await libraryCardsByName(viewer, exercises.map((e, i) => [e.name, tags[i]?.copyName]));
    } catch (e) {
      console.error('catalogue library match error', e);
    }
    const tagged = exercises.map((e, i) => ({ ...e, tags: tags[i], library: library[i] ?? null }));
    return NextResponse.json({ exercises: tagged, categories });
  } catch (e) {
    console.error('catalogue GET error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
