export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isProUser, paywall, PAYWALL_STATUS } from '@/lib/pro-guard';

/**
 * The Neuromechanic Mirror's training record.
 *
 * The overlay has always computed a real SessionSummary — reps, tempo, per-zone time-in-stable and
 * fault counts — and then thrown it away when the tab closed. Every session evaporated, which made
 * the most capable feature in the product incapable of showing progress.
 *
 * FREE: write every session, and read back the most recent ones. A player always owns their own
 * training record and can see how the last few sessions went.
 * FEL PRO: the full history and the trend across it.
 */

/** How far back the free tier can read. Enough to be useful, not enough to replace the trend view. */
const FREE_HISTORY = 5;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }

  const patternId = typeof body.patternId === 'string' ? body.patternId : null;
  const durationMs = num(body.durationMs);
  if (!patternId || durationMs <= 0) {
    return NextResponse.json({ error: 'patternId and durationMs required' }, { status: 400 });
  }
  // a summary shorter than a single rep is a tab that was opened and closed; storing it would
  // pollute the trend with noise the player never intended to record
  if (durationMs < 3000) return NextResponse.json({ skipped: 'too_short' });

  const created = await prisma.mirrorSession.create({
    data: {
      userId: session.user.id,
      patternId,
      startedAt: new Date(num(body.startedAtMs) || Date.now()),
      durationMs: Math.round(durationMs),
      reps: Math.max(0, Math.round(num(body.reps))),
      avgTempoMs: body.avgTempoMs == null ? null : Math.round(num(body.avgTempoMs)),
      avgFrameMs: num(body.avgFrameMs),
      timeInStableMs: (body.timeInStableMs ?? {}) as object,
      faultCounts: (body.faultCounts ?? {}) as object,
    },
  });
  return NextResponse.json({ id: created.id, saved: true });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const wantsTrend = req.nextUrl.searchParams.get('trend') === '1';
  const pro = await isProUser(userId);

  if (wantsTrend && !pro) {
    return NextResponse.json(
      paywall('Mirror history and trends', `Your last ${FREE_HISTORY} sessions stay free, and every session you record is kept.`),
      { status: PAYWALL_STATUS },
    );
  }

  const sessions = await prisma.mirrorSession.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: pro ? 200 : FREE_HISTORY,
  });

  const total = await prisma.mirrorSession.count({ where: { userId } });

  return NextResponse.json({
    sessions,
    total,
    // stated plainly: nothing is hidden or deleted, the view is just shorter
    showing: sessions.length,
    pro,
    ...(pro ? {} : { note: `Showing your ${FREE_HISTORY} most recent of ${total} recorded sessions. All of them are kept.` }),
  });
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
