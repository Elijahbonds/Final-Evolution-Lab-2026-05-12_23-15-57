import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/* GET — list all categories */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const categories = await prisma.exerciseCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { exercises: true } } },
    });
    return NextResponse.json({ categories });
  } catch (e) {
    console.error('categories GET error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

/* POST — create category */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (!session || role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const cat = await prisma.exerciseCategory.create({
      data: {
        name: body.name || 'New Category',
        description: body.description || '',
        sortOrder: Number(body.sortOrder) || 0,
      },
    });
    return NextResponse.json({ category: cat });
  } catch (e: any) {
    if (e?.code === 'P2002') return NextResponse.json({ error: 'Category name already exists' }, { status: 409 });
    console.error('categories POST error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
