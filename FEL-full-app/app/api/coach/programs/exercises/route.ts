import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/* GET — list the calling coach's own program exercises */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const exercises = await prisma.programExercise.findMany({
      where: { coachId: session.user.id },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(exercises);
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

    const body = await req.json();
    if (!body.name) return NextResponse.json({ error: 'Name required' }, { status: 400 });

    const exercise = await prisma.programExercise.create({
      data: {
        coachId: session.user.id,
        name: body.name,
        category: body.category || 'general',
        demoVideoUrl: body.demoVideoUrl || null,
        primaryCues: Array.isArray(body.primaryCues) ? body.primaryCues.filter(Boolean).slice(0, 3) : [],
        commonFaults: body.commonFaults ?? undefined,
        equipment: Array.isArray(body.equipment) ? body.equipment.filter(Boolean) : [],
        defaultTempo: body.defaultTempo || '3-1-1-0',
        progressionOfId: body.progressionOfId || null,
        regressionOfId: body.regressionOfId || null,
      },
    });
    return NextResponse.json(exercise);
  } catch (e: any) {
    console.error('program exercises POST error', e);
    if (e?.code === 'P2002') return NextResponse.json({ error: 'An exercise with that name already exists' }, { status: 409 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
