export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sweepOriginals } from '@/lib/coach-store/api';
import { assertCoachStoreOn } from '@/lib/coach-store/gate';
import { isAllowlistedCoach } from '@/lib/coach-store/coaches';

export async function POST() {
  const blocked = assertCoachStoreOn();
  if (blocked) return blocked;
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId || !isAllowlistedCoach(userId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const result = await sweepOriginals();
  return NextResponse.json(result);
}
