import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

/** Require auth + admin/owner role. Returns userId or NextResponse error. */
export async function requireCrmAccess(): Promise<{ userId: string } | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = (session.user as any).id as string;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, email: true } });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 401 });
  }
  // Admin-only: role === 'admin' OR the platform owner
  const ownerEmail = 'elijahbonds1@gmail.com';
  if (user.role !== 'admin' && user.email !== ownerEmail) {
    return NextResponse.json({ error: 'Forbidden — CRM access requires admin role' }, { status: 403 });
  }
  return { userId };
}

export function isErrorResponse(r: { userId: string } | NextResponse): r is NextResponse {
  return r instanceof NextResponse;
}
