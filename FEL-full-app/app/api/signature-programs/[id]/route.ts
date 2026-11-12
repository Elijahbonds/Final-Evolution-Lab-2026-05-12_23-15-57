import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSignatureId } from '@/lib/signature/content';
import { completeSession, defaultDeps, programPage, signatureViewer, startProgram, stopProgram } from '@/lib/signature/server';

export const dynamic = 'force-dynamic';

async function viewerOf() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) return null;
  const deps = defaultDeps();
  return { deps, viewer: await signatureViewer(user.id, user.role, deps) };
}

/** GET /api/signature-programs/:id — SIGNATURE-PROGRAMS (2026-10-25): the program page's view (404 when this viewer may not see it). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    if (!isSignatureId(params.id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const v = await viewerOf();
    if (!v) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const view = await programPage(v.viewer, params.id, v.deps);
    return view ? NextResponse.json(view) : NextResponse.json({ error: 'not_found' }, { status: 404 });
  } catch (e) {
    console.error('signature program GET error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

/**
 * POST /api/signature-programs/:id  { action: 'start' } | { action: 'done', sessionId: 'w3:B' } | { action: 'stop' }
 * An adult's progress is kept on the server; under youth rules the answer is { keep: 'device' } and nothing is written.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    if (!isSignatureId(params.id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const v = await viewerOf();
    if (!v) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    let body: { action?: unknown; sessionId?: unknown };
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
    const r = body?.action === 'start' ? await startProgram(v.viewer, params.id, v.deps)
      : body?.action === 'stop' ? await stopProgram(v.viewer, params.id, v.deps)
        : body?.action === 'done' ? await completeSession(v.viewer, params.id, body.sessionId, v.deps)
          : { status: 400, body: { error: 'bad_request' } };
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error('signature program POST error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
