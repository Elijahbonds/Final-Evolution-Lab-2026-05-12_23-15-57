// lib/retention/retentionJob.ts — the DAILY retention cleanup (owner, 2026-10-13).
//
// The privacy policy (lib/policies.ts) says party reports and creator inquiries are deleted after 12 months. Each store
// already purges on every write (lib/party/social/reports.ts, lib/creator/inquiryStore.ts), but a quiet stretch with no
// new row left old ones in place. POST /api/cron/retention runs both purges once a day, behind a shared secret, so the
// promise holds without anyone writing a row. The trigger is a Cloud Scheduler job the OWNER creates (docs/RETENTION-JOB.md);
// this repo ships no scheduler.
//
// The same shape as the other secret-protected jobs (lib/coach-store/reconcile.ts verifyReconcileSecret,
// lib/arena-reclaim.ts verifyReclaimSecret): a shared secret in a header, compared in constant time.
//
// What it answers: COUNTS ONLY. Never a row, an id, an email, a code or a message. A table that is not there yet (the
// pending SQL is not applied) is a no-op with zero counts. Running it twice deletes nothing the second time.
import { createHash, timingSafeEqual } from 'node:crypto';
import type { RawDb } from '@/lib/coach/pendingSchema';
import { purgeExpiredPartyReportsCounted, type PurgeResult } from '@/lib/party/social/reports';
import { purgeExpiredInquiries } from '@/lib/creator/inquiryStore';

/** The header a scheduler sends the secret in. */
export const RETENTION_SECRET_HEADER = 'x-retention-secret';

/** Constant-time secret check (the same shape as verifyReconcileSecret): both sides are hashed, so lengths always match. */
export function verifyRetentionSecret(presented: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || typeof presented !== 'string' || !presented) return false;
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}

export type TableState = PurgeResult['state'];

export interface RetentionSummary {
  /** False only when a purge hit a real database error (the route answers 500). */
  ok: boolean;
  partyReportsDeleted: number;
  creatorInquiriesDeleted: number;
  /** Per table: `purged`, `unavailable` (no table yet: nothing done), or `failed`. No row data. */
  partyReports: TableState;
  creatorInquiries: TableState;
}

const deleted = (r: PurgeResult): number => (r.state === 'purged' ? r.deleted : 0);

/** Run both purges. Neither stops the other. Never throws. */
export async function runRetentionCleanup(db: RawDb, now: number = Date.now()): Promise<RetentionSummary> {
  const [reports, inquiries] = await Promise.all([
    purgeExpiredPartyReportsCounted(db, now).catch((): PurgeResult => ({ state: 'failed' })),
    purgeExpiredInquiries(db, now).catch((): PurgeResult => ({ state: 'failed' })),
  ]);
  return {
    ok: reports.state !== 'failed' && inquiries.state !== 'failed',
    partyReportsDeleted: deleted(reports),
    creatorInquiriesDeleted: deleted(inquiries),
    partyReports: reports.state,
    creatorInquiries: inquiries.state,
  };
}
