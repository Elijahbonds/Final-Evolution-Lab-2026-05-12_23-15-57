import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const progress = await prisma.lessonProgress.findMany({ where: { userId } });
    return NextResponse.json({
      completed: progress?.map((p: any) => `${p?.trackKey}/${p?.lessonKey}`) ?? [],
    });
  } catch (e) {
    console.error('education error', e);
    return NextResponse.json({ error: 'Failed to load progress' }, { status: 500 });
  }
}
