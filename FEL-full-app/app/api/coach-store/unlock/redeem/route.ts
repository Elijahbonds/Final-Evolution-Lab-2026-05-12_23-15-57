export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { redeemUnlock } from '@/lib/coach-store/api';
import { assertCoachStoreOn } from '@/lib/coach-store/gate';

/** A parent-bought code plus a device token. No account. The body is not a session. */
export async function POST(req: NextRequest) {
  const blocked = assertCoachStoreOn();
  if (blocked) return blocked;
  const body = await req.json().catch(() => ({})) as { code?: unknown; deviceToken?: unknown };
  if (typeof body.code !== 'string' || typeof body.deviceToken !== 'string') {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  return redeemUnlock(body.code, body.deviceToken);
}
