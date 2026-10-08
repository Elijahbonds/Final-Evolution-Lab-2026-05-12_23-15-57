export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isCommunityKind } from '@/lib/pipelines/community';
import { loadCommunity } from '@/lib/pipelines/community-server';

/**
 * GET /api/v1/pipelines/community?kind=dance-songs|routines|scene-packs|recipes|reads|mc-lines
 *
 * PIPELINES (owner, 2026-10-06): approved Creator Cards as the slim, credited entries the game reads: Dance songs and
 * routines, Spot the Scene packs, Fuel-floor recipes, Knowledge Feed reads, MC lines. Only approved, public cards by
 * verified-adult creators, with no private upload, and only their public media copies (lib/pipelines/community.ts holds
 * every rule). Public by design (lib/api/routeContract.test.ts): it carries only what any player is shown in those
 * places. CDN-cached for five minutes; if the database cannot be reached it answers an empty list, so no game waits.
 */
export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get('kind');
  if (!isCommunityKind(kind)) return NextResponse.json({ error: 'unknown kind' }, { status: 400 });
  try {
    const entries = await loadCommunity(prisma, kind);
    return NextResponse.json({ kind, entries }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } });
  } catch (e) {
    console.warn('[FEL-PIPELINES] community list fell back to empty', kind, (e as Error)?.message);
    return NextResponse.json({ kind, entries: [] }, { headers: { 'Cache-Control': 'public, s-maxage=60' } });
  }
}
