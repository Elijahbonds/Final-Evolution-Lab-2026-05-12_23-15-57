/**
 * app/api/mastery/route.ts
 * ========================
 * M13 Step 3 — the athlete's mastery map (hub badges + profile panel).
 *
 * `mastery` is the original per-mode {tier,tierIndex} map that hub-world and
 * profile-view read for their badges; it is kept exactly as it was. `ladder`
 * adds the full progression read for /mastery — band position, form trend and
 * what moves each rung next.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getMasteryLadder, getMasteryMap } from '@/lib/mastery/mastery-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [mastery, ladder] = await Promise.all([getMasteryMap(userId), getMasteryLadder(userId)]);
  return NextResponse.json({ mastery, ladder });
}
