import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { bundleFiles } from '@/lib/cell-files';
import { loadFiles } from '@/lib/cell-build';

export const dynamic = 'force-dynamic';

/** GET /api/cell/projects/[id]/bundle — assembled runnable HTML (raw). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });
  const project = await prisma.cellProject.findFirst({ where: { id: params.id, userId } });
  if (!project) return new NextResponse('Not found', { status: 404 });

  const files = await loadFiles(params.id);
  const html = files.length ? bundleFiles(files) : '<!DOCTYPE html><html><body style="font-family:sans-serif;background:#050505;color:#888;padding:2rem">No files built yet.</body></html>';
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
