import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { deleteProject, getProject, putProject, type CloudAnswer } from '@/lib/nexus-studio/cloudRoute';
import { sessionUserId, studioSaveDeps } from '@/lib/nexus-studio/cloudDeps';
import { isStudioCloudSaveEnabled } from '@/lib/flags';

export const dynamic = 'force-dynamic';

const send = (a: CloudAnswer) => NextResponse.json(a.body, { status: a.status, headers: a.headers });
const signedIn = async () => sessionUserId(await getServerSession(authOptions));

/**
 * One saved Studio project (docs/NEXUS-STUDIO-SAVE.md §5; the logic is lib/nexus-studio/cloudRoute.ts, which answers a guest
 * with 401):
 *   GET    → { project, projectId, name, rev, bytes, updatedAt }   (sanitised again on the way out)
 *   PUT    { baseRev, project } → { rev, … } | 409 conflict          (STUDIO_CLOUD_SAVE_ENABLED, checked before the session)
 *   DELETE → { deleted }                                            (never behind the switch or the age rule)
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return send(await getProject(studioSaveDeps(await signedIn()), params.id));
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  // the switch first: off, the session is not even read (the same order as app/api/cell/venue)
  if (!isStudioCloudSaveEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const userId = await signedIn();
  const text = await req.text().catch(() => '');
  return send(await putProject(studioSaveDeps(userId), params.id, text));
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  return send(await deleteProject(studioSaveDeps(await signedIn()), params.id));
}
