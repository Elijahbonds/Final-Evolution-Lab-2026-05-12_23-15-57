export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { cancelBooking } from '@/lib/coach-store/api';
import { assertCoachStoreOn } from '@/lib/coach-store/gate';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const blocked = assertCoachStoreOn();
  if (blocked) return blocked;
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return cancelBooking(userId, params.id);
}
