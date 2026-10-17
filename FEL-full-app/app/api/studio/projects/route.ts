import { NextResponse } from 'next/server';
import { listProjects } from '@/lib/nexus-studio/cloudRoute';
import { studioSaveDeps } from '@/lib/nexus-studio/cloudDeps';

export const dynamic = 'force-dynamic';

/**
 * GET /api/studio/projects → the signed-in account's saved Studio projects (no documents), its quota, and whether it may
 * save now. NEXUS STUDIO SAVE (docs/NEXUS-STUDIO-SAVE.md §5); the logic is lib/nexus-studio/cloudRoute.ts listProjects.
 * Not behind STUDIO_CLOUD_SAVE_ENABLED: what was saved stays visible and deletable whatever the switch says.
 */
export async function GET() {
  const a = await listProjects(await studioSaveDeps());
  return NextResponse.json(a.body, { status: a.status, headers: a.headers });
}
