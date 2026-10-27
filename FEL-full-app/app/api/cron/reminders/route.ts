export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { liveDeps } from '@/lib/push/server';
import { REMINDERS_SECRET_HEADER, liveReminderReads, runReminders, verifyRemindersSecret } from '@/lib/push/reminders';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/**
 * POST /api/cron/reminders — the daily reminders (offline-push, round 8, OFF-04): today's session or drill for athletes,
 * missed-session counts for coaches; verified adults who opted in only (lib/push/reminders.ts).
 *
 * Guarded by a shared secret, not a session (the retention job's pattern): REMINDERS_CRON_SECRET unset → 503 (fail
 * closed); the `x-reminders-secret` header missing or wrong → 401 (constant time); right → one run. Answers counts
 * only. Push off and email off → 200 { state: 'off' } and nothing is read. The owner creates the scheduler job.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.REMINDERS_CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'reminders_not_configured' }, { status: 503, headers: NO_STORE });
  if (!verifyRemindersSecret(req.headers.get(REMINDERS_SECRET_HEADER), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  }
  const summary = await runReminders(liveDeps(), liveReminderReads(prisma as never));
  return NextResponse.json(summary, { status: summary.ok ? 200 : 500, headers: NO_STORE });
}
