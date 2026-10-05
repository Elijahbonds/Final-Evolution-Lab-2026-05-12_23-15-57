export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { listSlots } from '@/lib/coach-store/api';
import { assertCoachStoreOn } from '@/lib/coach-store/gate';

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const blocked = assertCoachStoreOn();
  if (blocked) return blocked;
  const duration = req.nextUrl.searchParams.get('duration') === '60' ? 60 : 30;
  return listSlots(params.slug, duration);
}
