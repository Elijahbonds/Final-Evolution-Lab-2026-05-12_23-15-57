import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isNexusEnabled, fetchQueue } from '@/lib/nexus-client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/nexus/queue
 *
 * Proxy to the NEXUS sequencer's adaptive lesson queue.
 * Returns the personalised queue when NEXUS is enabled,
 * or {enabled:false} when it isn't — so the client can
 * gracefully fall back to the static TRACKS curriculum.
 */
export async function GET() {
  try {
    if (!isNexusEnabled()) {
      return NextResponse.json({ enabled: false });
    }

    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const queue = await fetchQueue(userId);
    if (!queue) {
      return NextResponse.json({ enabled: true, items: [], fallback: true });
    }

    return NextResponse.json({ enabled: true, ...queue });
  } catch (e) {
    console.error('[nexus/queue] error', e);
    return NextResponse.json({ error: 'Failed to fetch queue' }, { status: 500 });
  }
}
