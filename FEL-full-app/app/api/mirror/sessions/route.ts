export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isProUser, paywall, PAYWALL_STATUS } from '@/lib/pro-guard';
import { RECENT_SETS, recordCheckValues } from '@/lib/mirror/baselines';
import { valueFromRow } from '@/lib/mirror/progressReading';
import { canSaveScanNumbers, refuseScanSave } from '@/lib/privacy/scanSaveGate';

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
  // TEEN-WRITE-BLOCK (FE PM 23:05 PT): a session summary is kept only for a verified 18+ account that opted in (today nobody).
  if (!(await canSaveScanNumbers(prisma, session.user.id))) return refuseScanSave();

  // PERSONAL BASELINES (MIRROR-COACH P4, carry-and-baselines lane, 2026-09-29): an optional, additive
  // `checkValues` map — the pattern's own per-check numeric readings for THIS session (e.g. carryAudit's
  // `{ 'hipHike:right': 0.12 }`), stored as one more key inside the existing faultCounts Json column via
  // lib/mirror/baselines.ts's recordCheckValues. NO SCHEMA CHANGE: every existing zone-keyed count already in
  // faultCounts is kept exactly as the pattern's audit wrote it; a session whose body handed no checkValues at
  // all (every older client, and any pattern that has not adopted this yet) behaves exactly as before.
  const checkValues = isPlainRecordOfNumbers(body.checkValues) ? body.checkValues : null;
  const faultCounts = checkValues ? recordCheckValues(body.faultCounts, checkValues) : ((body.faultCounts ?? {}) as object);

  // "VS YOUR LAST 3" (MIRROR-PROGRESS, plan Phase 4, 2026-10-07): a body that asks (`recent: true`) gets back the
  // headline number (lib/mirror/progressReading.ts valueFromRow) of this account's last 3 saved sessions of the SAME
  // pattern, read BEFORE this one is written — so the review compares the set just done with the ones before it, in one
  // request. Past the gate above only: a minor, no birth year, or an adult who has not opted in was refused already and
  // nothing of theirs is read (their "vs your last 3" is on their own phone — lib/mirror/deviceProgress.ts). A failed
  // read answers `recent: null` and the session still saves. assumption: 3 of the athlete's own newest sessions are the
  // free tier's "read back the most recent ones" (header), not the Pro trend view.
  const recent = body.recent === true ? await recentValues(session.user.id, patternId) : undefined;

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
      faultCounts,
    },
  });
  return NextResponse.json(recent === undefined ? { id: created.id, saved: true } : { id: created.id, saved: true, recent });
}

/** The headline of the last RECENT_SETS readable sessions of this pattern, oldest first; null when the read failed. */
async function recentValues(userId: string, patternId: string): Promise<{ values: number[] } | null> {
  try {
    const rows = await prisma.mirrorSession.findMany({
      where: { userId, patternId },
      orderBy: { createdAt: 'desc' },
      // a few spare: a set too short to read was saved without a value and is skipped, not counted as one of the 3
      take: RECENT_SETS * 4,
      select: { patternId: true, reps: true, faultCounts: true },
    });
    const values = rows.map(valueFromRow).filter((v): v is number => v !== null).slice(0, RECENT_SETS).reverse();
    return { values };
  } catch {
    return null;
  }
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

/** Per-check values a session may carry. A pattern reads a handful; more is not a pattern's readings (MIRROR-PROGRESS). */
const MAX_CHECK_VALUES = 32;

/** A plain object of finite numbers — never trusts the client's `checkValues` shape further than that. MIRROR-PROGRESS
 *  (2026-10-07): and at most MAX_CHECK_VALUES of them, each key at most 64 characters; anything bigger is not stored. */
function isPlainRecordOfNumbers(v: unknown): v is Record<string, number> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length > MAX_CHECK_VALUES) return false;
  return entries.every(([k, n]) => k.length <= 64 && typeof n === 'number' && Number.isFinite(n));
}
