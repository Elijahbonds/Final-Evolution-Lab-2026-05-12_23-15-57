import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { defaultDeps, programsOverview, signatureViewer } from '@/lib/signature/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/signature-programs — SIGNATURE-PROGRAMS (2026-10-25): the signature programs this viewer may see (approved;
 * the admin also sees drafts, labelled), each with the athlete's place in it. (Not /api/signature: that is M13's weekly
 * Signature Challenge.)
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { id?: string; role?: string } | undefined;
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const deps = defaultDeps();
    const viewer = await signatureViewer(user.id, user.role, deps);
    return NextResponse.json(await programsOverview(viewer, deps));
  } catch (e) {
    console.error('signature programs GET error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
