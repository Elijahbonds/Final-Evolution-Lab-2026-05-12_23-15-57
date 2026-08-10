import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/* PATCH — update exercise */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (!session || role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const data: any = {};
    const fields = ['name','slug','categoryId','phase','chapter','bounceLevel','coachingCues','commonMistakes','progressions','regressions','prerequisites','targetPrqStat','dosage','videoUrl','thumbnailUrl','published','sortOrder'];
    for (const f of fields) {
      if (body[f] !== undefined) {
        if (f === 'phase' || f === 'chapter' || f === 'sortOrder') data[f] = Number(body[f]) || 0;
        else if (f === 'published') data[f] = Boolean(body[f]);
        else data[f] = body[f];
      }
    }

    const exercise = await prisma.exercise.update({ where: { id: params.id }, data });
    return NextResponse.json({ exercise });
  } catch (e) {
    console.error('exercise PATCH error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

/* DELETE — remove exercise */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (!session || role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await prisma.exercise.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('exercise DELETE error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
