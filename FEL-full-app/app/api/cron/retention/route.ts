export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { RawDb } from '@/lib/coach/pendingSchema';
import { RETENTION_SECRET_HEADER, runRetentionCleanup, verifyRetentionSecret } from '@/lib/retention/retentionJob';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/**
 * POST /api/cron/retention — the daily retention cleanup (owner, 2026-10-13): deletes party reports and creator
 * inquiries older than 12 months, so the privacy policy's promise holds on a quiet day with no new rows.
 *
 * Guarded by a shared secret, not a session (a scheduler has no user): the same pattern as /api/coach-store/reconcile
 * and /api/arena/reclaim. Auth, in order:
 *   (1) RETENTION_CRON_SECRET not configured -> 503 (FAIL CLOSED: a deploy that has not opted in does nothing);
 *   (2) the `x-retention-secret` header missing or wrong -> 401, compared in constant time (verifyRetentionSecret);
 *   (3) right -> run both purges.
 * Answers COUNTS ONLY ({ ok, partyReportsDeleted, creatorInquiriesDeleted, partyReports, creatorInquiries }), never a
 * row. A table that is not there yet is a no-op with zero counts (200). Idempotent: run it twice, the second deletes
 * nothing. A real database error on either purge -> 500 { ok: false, ... counts }.
 *
 * The scheduled call (the owner creates the Cloud Scheduler job; see docs/RETENTION-JOB.md): once a day,
 *   POST https://<site host>/api/cron/retention   with header  x-retention-secret: <secret>.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.RETENTION_CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'retention_not_configured' }, { status: 503, headers: NO_STORE });
  
  if (!verifyRetentionSecret(req.headers.get(RETENTION_SECRET_HEADER), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  }

  const summary = await runRetentionCleanup(prisma as unknown as RawDb);
  if (!summary.ok) console.error('[cron/retention] a purge failed');
  return NextResponse.json(summary, { status: summary.ok ? 200 : 500, headers: NO_STORE });
}
