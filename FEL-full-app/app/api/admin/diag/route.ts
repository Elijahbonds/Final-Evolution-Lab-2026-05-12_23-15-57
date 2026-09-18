/**
 * app/api/admin/diag/route.ts — Ship Pass 2, Phase 5.
 * The owner's read of the game's own diagnostics: `game_diag` analytics events
 * (frame guard, identity, missing clip, camera fallback, fps floor, context
 * loss, load failure) from the last N hours, grouped by kind and mode, with the
 * most recent lines. Admin only, first-party data only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if ((session?.user as { role?: string } | undefined)?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const hours = Math.min(24 * 14, Math.max(1, Number(req.nextUrl.searchParams.get('hours') ?? 24)));
  const since = new Date(Date.now() - hours * 3600_000);
  const rows = await prisma.analyticsEvent.findMany({
    where: { name: 'game_diag', createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 2000,
    select: { props: true, createdAt: true, userId: true, sessionKey: true },
  });
  const byKind: Record<string, number> = {};
  const byMode: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const p = (r.props ?? {}) as { kind?: string; mode?: string };
    const kind = p.kind ?? '?', mode = p.mode ?? '?';
    byKind[kind] = (byKind[kind] ?? 0) + 1;
    (byMode[mode] ??= {})[kind] = ((byMode[mode] ?? {})[kind] ?? 0) + 1;
  }
  return NextResponse.json({
    hours, total: rows.length, byKind, byMode,
    recent: rows.slice(0, 50).map((r) => ({ at: r.createdAt, user: r.userId ? 'user' : 'guest', session: r.sessionKey, ...(r.props as object) })),
  });
}
