import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOrCreateProfile } from '@/lib/profile-service';
import { applyLc } from '@/lib/wallet/wallet-service';
import { loadWarmupContext } from '@/lib/coach/warmupServer';
import { loadDailyDrill } from '@/lib/daily-drill/load';
import { claimDailyDrill } from '@/lib/daily-drill/claim';
import { recordServerEvent } from '@/lib/analytics-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/daily-drill/claim { key } — DAILY-DRILL (2026-10-24): today's drill was finished on the camera. The server
 * recomputes today's drill (lib/daily-drill/load.ts) and pays the day's credit and streak day once
 * (lib/daily-drill/claim.ts). The body names the drill, never an amount; nothing the camera read is sent.
 *   200 { status: 'granted' | 'already', amount, streakBonus, streakDays }
 *   409 { status: 'not_today' | 'stopped' }   401 signed out   400 no key
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const key = (body as { key?: unknown } | null)?.key;
  if (typeof key !== 'string' || !key) return NextResponse.json({ error: 'key required' }, { status: 400 });
  try {
    const view = await loadDailyDrill(prisma, userId, { warmupContext: (id, now) => loadWarmupContext(prisma, id, now) });
    const r = await claimDailyDrill(prisma, userId, view, key, {
      now: () => new Date(), readProfile: (id) => getOrCreateProfile(id), applyLc,
    });
    // telemetry carries no amounts (lib/analytics.ts rule) and nothing the camera read
    if (r.status === 'granted') await recordServerEvent({ name: 'daily_drill_done', userId, props: { focus: view.focus } }).catch(() => {});
    return NextResponse.json(r, { status: r.status === 'granted' || r.status === 'already' ? 200 : 409 });
  } catch (e) {
    console.error('[daily-drill/claim] failed', e);
    return NextResponse.json({ error: 'claim failed' }, { status: 500 });
  }
}
