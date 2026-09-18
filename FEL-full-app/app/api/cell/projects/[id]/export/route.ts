import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { loadFiles } from '@/lib/cell-build';

export const dynamic = 'force-dynamic';

/** GET /api/cell/projects/[id]/export — download the project tree as a .zip. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });
  const project = await prisma.cellProject.findFirst({ where: { id: params.id, userId } });
  if (!project) return new NextResponse('Not found', { status: 404 });

  const files = await loadFiles(params.id);
  const zip = new JSZip();
  for (const f of files) zip.file(f.path, f.content ?? '');
  if (!files.length) zip.file('README.txt', 'This project has no files yet. Run a build first.');

  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const safe = (project.title || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safe}.zip"`,
    },
  });
}
