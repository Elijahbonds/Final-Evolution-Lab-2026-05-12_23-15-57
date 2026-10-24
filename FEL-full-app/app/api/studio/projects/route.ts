import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { listProjects } from '@/lib/nexus-studio/cloudRoute';
import { sessionUserId, studioSaveDeps } from '@/lib/nexus-studio/cloudDeps';

export const dynamic = 'force-dynamic';

/**
 * GET /api/studio/projects → the signed-in account's saved Studio projects (no documents), its quota, and whether it may
 * save now. NEXUS STUDIO SAVE (docs/NEXUS-STUDIO-SAVE.md §5); the logic is lib/nexus-studio/cloudRoute.ts listProjects
 * (a guest gets 401 there). Not behind STUDIO_CLOUD_SAVE_ENABLED: what was saved stays visible and deletable.
 */
export async function GET() {
  const userId = sessionUserId(await getServerSession(authOptions));
  const a = await listProjects(studioSaveDeps(userId));
  return NextResponse.json(a.body, { status: a.status, headers: a.headers });
}
