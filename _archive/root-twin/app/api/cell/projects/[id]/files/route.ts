import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { completeText, FILE_BUILDER_SYSTEM, type BuildPlan } from '@/lib/cell-engine';
import { parseFileOps, bundleFiles } from '@/lib/cell-files';
import { applyOps, loadFiles, summarizeFiles } from '@/lib/cell-build';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function owned(id: string, userId: string) {
  return prisma.cellProject.findFirst({ where: { id, userId } });
}

/** GET /api/cell/projects/[id]/files — the project file tree. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await owned(params.id, userId)))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const files = await prisma.projectFile.findMany({
    where: { projectId: params.id },
    orderBy: { path: 'asc' },
    select: { path: true, content: true, kind: true, summary: true, updatedAt: true },
  });
  return NextResponse.json({ files });
}

/**
 * POST /api/cell/projects/[id]/files
 *   { action: 'regenerate', path }  — rebuild ONE file with the builder model.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const project = await owned(params.id, userId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? '');
  const path = String(body?.path ?? '');
  if (action !== 'regenerate' || !path)
    return NextResponse.json({ error: 'action=regenerate and path required' }, { status: 400 });

  let plan: BuildPlan | null = null;
  try {
    plan = JSON.parse(project.buildPlan || '');
  } catch {}
  const summary = `${plan?.projectTitle || project.title} — ${plan?.genre || ''}. ${plan?.summary || ''}`.trim();

  const files = await loadFiles(params.id);
  const manifest = files.map((f) => `- ${f.path}`).join('\n');
  const target = files.find((f) => f.path === path);

  try {
    const text = await completeText({
      role: 'builder',
      maxTokens: 4000,
      messages: [
        { role: 'system', content: FILE_BUILDER_SYSTEM },
        {
          role: 'user',
          content: `PROJECT: ${summary}\nORIGINAL REQUEST: ${project.prompt || summary}\n\nCURRENT FILES:\n${manifest}\n\nREGENERATE ONLY THIS FILE: ${path}\nCurrent content:\n${
            target?.content?.slice(0, 6000) || '(new file)'
          }\n\nEmit a single update op for ${path} (JSON only). Improve/fix it while keeping it consistent with the rest of the project.`,
        },
      ],
    });
    const ops = parseFileOps(text).filter((o) => o.path === path || o.path.endsWith(path.split('/').pop() || path));
    if (!ops.length) return NextResponse.json({ error: 'No file operation produced' }, { status: 422 });
    const changed = await applyOps(params.id, ops.map((o) => ({ ...o, path })));
    const after = await loadFiles(params.id);
    await summarizeFiles(params.id, after, changed);
    const html = bundleFiles(after);
    await prisma.cellProject.update({
      where: { id: params.id },
      data: { artifacts: JSON.stringify({ html, fileCount: after.length, generatedAt: new Date().toISOString() }) },
    });
    return NextResponse.json({ ok: true, changed });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Regenerate failed' }, { status: 500 });
  }
}
