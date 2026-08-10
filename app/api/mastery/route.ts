/**
 * app/api/mastery/route.ts
 * ========================
 * M13 Step 3 — the athlete's mastery map (hub badges + profile panel).
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getMasteryMap } from '@/lib/mastery/mastery-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const mastery = await getMasteryMap(userId);
  return NextResponse.json({ mastery });
}
