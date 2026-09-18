import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/* GET — list all exercises (with category) */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const exercises = await prisma.exercise.findMany({
      include: { category: { select: { id: true, name: true } } },
      orderBy: [{ phase: 'asc' }, { chapter: 'asc' }, { sortOrder: 'asc' }],
    });
    return NextResponse.json({ exercises });
  } catch (e) {
    console.error('exercises GET error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

/* POST — create a new exercise */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (!session || role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const slug = (body.slug || body.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug) return NextResponse.json({ error: 'Name required' }, { status: 400 });

    const exercise = await prisma.exercise.create({
      data: {
        name: body.name || '',
        slug,
        categoryId: body.categoryId,
        phase: Number(body.phase) || 1,
        chapter: Number(body.chapter) || 1,
        bounceLevel: body.bounceLevel || 'foundation',
        coachingCues: body.coachingCues || '',
        commonMistakes: body.commonMistakes || '',
        progressions: body.progressions || '',
        regressions: body.regressions || '',
        prerequisites: body.prerequisites || '',
        targetPrqStat: body.targetPrqStat || '',
        dosage: body.dosage || '',
        videoUrl: body.videoUrl || '',
        thumbnailUrl: body.thumbnailUrl || '',
        published: body.published ?? false,
        sortOrder: Number(body.sortOrder) || 0,
      },
    });
    return NextResponse.json({ exercise });
  } catch (e: any) {
    console.error('exercises POST error', e);
    if (e?.code === 'P2002') return NextResponse.json({ error: 'Slug already exists' }, { status: 409 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
