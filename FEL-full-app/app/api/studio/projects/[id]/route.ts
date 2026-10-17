import { NextResponse } from 'next/server';
import { deleteProject, getProject, putProject, type CloudAnswer } from '@/lib/nexus-studio/cloudRoute';
import { isStudioCloudSaveEnabled } from '@/lib/flags';
import { studioSaveDeps } from '@/lib/nexus-studio/cloudDeps';

export const dynamic = 'force-dynamic';

const send = (a: CloudAnswer) => NextResponse.json(a.body, { status: a.status, headers: a.headers });

/**
 * One saved Studio project (docs/NEXUS-STUDIO-SAVE.md §5; the logic is lib/nexus-studio/cloudRoute.ts):
 *   GET    → { project, projectId, name, rev, bytes, updatedAt }   (sanitised again on the way out)
 *   PUT    { baseRev, project } → { rev, … } | 409 conflict          (STUDIO_CLOUD_SAVE_ENABLED, checked before the session)
 *   DELETE → { deleted }                                            (never behind the switch or the age rule)
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return send(await getProject(await studioSaveDeps(), params.id));
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  // the switch first: off, the session is not even read (the same order as app/api/cell/venue)
  if (!isStudioCloudSaveEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const text = await req.text().catch(() => '');
  return send(await putProject(await studioSaveDeps(), params.id, text));
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  return send(await deleteProject(await studioSaveDeps(), params.id));
}
