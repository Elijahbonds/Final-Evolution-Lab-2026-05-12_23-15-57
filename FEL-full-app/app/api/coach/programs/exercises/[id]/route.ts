import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/* PUT — update a program exercise owned by the calling coach */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const existing = await prisma.programExercise.findUnique({ where: { id: params.id } });
    if (!existing || existing.coachId !== session.user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await req.json();
    const data: any = {};
    const fields = ['name', 'category', 'demoVideoUrl', 'primaryCues', 'commonFaults', 'equipment', 'defaultTempo', 'progressionOfId', 'regressionOfId'];
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f];
    }

    const exercise = await prisma.programExercise.update({ where: { id: params.id }, data });
    return NextResponse.json(exercise);
  } catch (e) {
    console.error('program exercise PUT error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

/* DELETE — remove a program exercise owned by the calling coach */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const existing = await prisma.programExercise.findUnique({ where: { id: params.id } });
    if (!existing || existing.coachId !== session.user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await prisma.programExercise.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('program exercise DELETE error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
