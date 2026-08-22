import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** GET /api/cell/projects/[id] — load project with messages */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const project = await prisma.cellProject.findFirst({
      where: { id: params.id, userId },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, take: 100 },
        files: {
          orderBy: { path: 'asc' },
          select: { path: true, kind: true, summary: true, updatedAt: true },
        },
      },
    });

    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ project });
  } catch (e) {
    console.error('[cell/project] error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
