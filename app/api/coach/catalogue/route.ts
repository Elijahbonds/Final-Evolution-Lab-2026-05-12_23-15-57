import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/* GET — published exercises for learner view */
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

    return NextResponse.json({ exercises, categories });
  } catch (e) {
    console.error('catalogue GET error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
