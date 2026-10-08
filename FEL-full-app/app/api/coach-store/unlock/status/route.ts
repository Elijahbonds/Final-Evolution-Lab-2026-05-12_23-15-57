export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { unlockStatus } from '@/lib/coach-store/api';
import { assertCoachStoreOn } from '@/lib/coach-store/gate';

export async function POST(req: NextRequest) {
  const blocked = assertCoachStoreOn();
  if (blocked) return blocked;
  const body = await req.json().catch(() => ({})) as { code?: unknown; deviceToken?: unknown };
  if (typeof body.code !== 'string' || typeof body.deviceToken !== 'string') {
    return NextResponse.json({ active: false });
  }
  return unlockStatus(body.code, body.deviceToken);
}
