import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isNexusEnabled, reportSessionResult } from '@/lib/nexus-client';

export const dynamic = 'force-dynamic';

/**
 * POST /api/nexus/session-result
 *
 * Proxies completed-session data to the NEXUS sequencer so it
 * can update mastery and recompute the lesson queue.
 * Only fires when NEXUS is enabled; returns {ok:false,reason} otherwise.
 */
export async function POST(req: Request) {
  try {
    if (!isNexusEnabled()) {
      return NextResponse.json({ ok: false, reason: 'nexus_disabled' });
    }

    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const result = await reportSessionResult({
      userId,
      sessionId: String(body?.sessionId ?? ''),
      mode: String(body?.mode ?? ''),
      score: Number(body?.score ?? 0),
      won: Boolean(body?.won),
      duration: Number(body?.duration ?? 0),
      prqAfter: Number(body?.prqAfter ?? 0),
    });

    if (!result) {
      return NextResponse.json({ ok: false, reason: 'gateway_unavailable' });
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('[nexus/session-result] error', e);
    return NextResponse.json({ error: 'Failed to report session' }, { status: 500 });
  }
}
