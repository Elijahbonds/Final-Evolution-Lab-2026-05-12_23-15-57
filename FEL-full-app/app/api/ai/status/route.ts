import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { abacusEnabled } from '@/lib/abacus/killSwitch';
import type { AiStatus } from '@/lib/abacus/aiStatus';

// Reads a session, and the answer has to come from the env at request time, never from a build-time render.
export const dynamic = 'force-dynamic';

/**
 * GET /api/ai/status → { coach, studio }, each 'available' | 'coming_soon' (ABACUS-KILL).
 * It sends no user data and makes no Abacus call. It needs a session because lib/api/routeContract.test.ts wants a
 * guard or a PUBLIC_BY_DESIGN entry, and open PRs are changing that file. Signed out, the Coach and Studio read the
 * 401 as 'coming_soon'.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const availability = abacusEnabled() ? 'available' : 'coming_soon';
  const status: AiStatus = { coach: availability, studio: availability };
  return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
}
