// lib/party/social/reports.ts — a party report, kept for review (PARTY-CHAT lane, 2026-10-13).
//
// THERE WAS NO MODERATION PATH for people in this repo (the creator review queue reviews cards, not conduct), so a party
// report goes to a NEW table, "PartyReport", that arrives with prisma/pending/2026-10-13-party-report.sql — which the
// OWNER applies. Until then this is a SAFE NO-OP: one information_schema probe (lib/coach/pendingSchema.ts, reused, not
// edited) says the table is not there, nothing is written, nothing 500s, and the person's block still works. Within
// ~5 minutes of the SQL being applied, reports start landing, with no deploy.
//
// What a report holds: who reported whom (account ids, from netd's sealed slip — never from the request), the party
// code, a fixed reason id, and when. NO MESSAGE CONTENT: party chat is never stored anywhere, so there is none to
// attach. Raw parameterised SQL ($1…), because the committed Prisma client does not know the table.
//
// RETENTION (owner, 2026-10-13: "12 months for party reports AND creator inquiries, with automatic deletion"): a report
// is deleted PARTY_REPORT_RETENTION_DAYS after it was filed. Same pattern as the creator inquiries
// (lib/creator/inquiryStore.ts): the delete runs on every successful save, best effort, and it is a no-op while the
// table does not exist (the same probe). A quiet stretch with no new report is covered by the DAILY cleanup
// (POST /api/cron/retention, lib/retention/retentionJob.ts; owner, 2026-10-13), which runs this same purge. lib/policies.ts tells the player the same period, and lib/party/social/reports.test.ts pins both numbers.
import { randomUUID } from 'node:crypto';
import { pendingProbe, type RawDb } from '@/lib/coach/pendingSchema';

/** How long a party report is kept before it is deleted. The privacy policy (lib/policies.ts) says "12 months". */
export const PARTY_REPORT_RETENTION_DAYS = 365;
import type { ReportSlip } from '@/server/netd/src/ticket';

const PROBE_SQL =
  `SELECT 1 AS "ok" FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'PartyReport' LIMIT 1`;
const INSERT_SQL =
  `INSERT INTO "PartyReport" ("id", "reporterId", "reportedId", "reportedName", "partyCode", "reason", "reportedAt") ` +
  `VALUES ($1, $2, $3, $4, $5, $6, $7)`;

// createdAt is `TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP`, so the cutoff is built from CURRENT_TIMESTAMP too: both sides go
// through the same session-time-zone conversion and agree whatever the zone. (CreatorInquiry's explicit UTC insert is why
// its purge says AT TIME ZONE 'UTC'.) The "PartyReport_createdAt_idx" index in the pending SQL serves this range delete.
export const PURGE_SQL = `DELETE FROM "PartyReport" WHERE "createdAt" < (CURRENT_TIMESTAMP - make_interval(days => $1::int))`;

const probe = pendingProbe('party_report', PROBE_SQL);
export function resetPartyReportProbe(): void { probe.reset(); }

/** What one purge did. `unavailable`: the table is not there (the pending SQL is not applied). `failed`: a real error. */
export type PurgeResult = { state: 'purged'; deleted: number } | { state: 'unavailable' } | { state: 'failed' };

/**
 * The purge with its count (the daily retention job, app/api/cron/retention, reports counts and nothing else). Never
 * throws. A NO-OP while the table does not exist (the probe): `unavailable`, nothing deleted.
 */
export async function purgeExpiredPartyReportsCounted(db: RawDb, now: number = Date.now()): Promise<PurgeResult> {
  if (!(await probe.ready(db, now))) return { state: 'unavailable' };
  try {
    const deleted = await db.$executeRawUnsafe(PURGE_SQL, PARTY_REPORT_RETENTION_DAYS);
    return { state: 'purged', deleted: typeof deleted === 'number' && deleted > 0 ? deleted : 0 };
  } catch (e) {
    probe.fail('party_report_purge_failed', e, now);
    return { state: (await probe.ready(db, now)) ? 'failed' : 'unavailable' };
  }
}

/**
 * Delete reports older than the retention period. A NO-OP while the table does not exist (the probe), so it is safe on
 * production before the pending SQL is applied. Never throws; resolves true when the delete ran.
 */
export async function purgeExpiredPartyReports(db: RawDb, now: number = Date.now()): Promise<boolean> {
  return (await purgeExpiredPartyReportsCounted(db, now)).state === 'purged';
}

export type ReportOutcome = 'stored' | 'not_available' | 'failed';

/** Store one report. The caller has opened the slip and checked the reporter is the session's account. Never throws. */
export async function storePartyReport(db: RawDb, slip: ReportSlip, now: number = Date.now()): Promise<ReportOutcome> {
  if (!(await probe.ready(db, now))) return 'not_available';
  try {
    await db.$executeRawUnsafe(INSERT_SQL, randomUUID(), slip.reporterUid, slip.reportedUid, slip.reportedName.slice(0, 12),
      slip.code.slice(0, 6), slip.reason.slice(0, 16), new Date(slip.at));
  } catch (e) {
    probe.fail('party_report_insert_failed', e, now);
    return 'failed';
  }
  // Retention: delete what is past its period. Best effort; the report above is already saved.
  await purgeExpiredPartyReports(db, now);
  return 'stored';
}

