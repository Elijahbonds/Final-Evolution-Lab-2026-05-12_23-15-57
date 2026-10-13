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
import { randomUUID } from 'node:crypto';
import { pendingProbe, type RawDb } from '@/lib/coach/pendingSchema';
import type { ReportSlip } from '@/server/netd/src/ticket';

const PROBE_SQL =
  `SELECT 1 AS "ok" FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'PartyReport' LIMIT 1`;
const INSERT_SQL =
  `INSERT INTO "PartyReport" ("id", "reporterId", "reportedId", "reportedName", "partyCode", "reason", "reportedAt") ` +
  `VALUES ($1, $2, $3, $4, $5, $6, $7)`;

const probe = pendingProbe('party_report', PROBE_SQL);
export function resetPartyReportProbe(): void { probe.reset(); }

export type ReportOutcome = 'stored' | 'not_available' | 'failed';

/** Store one report. The caller has opened the slip and checked the reporter is the session's account. Never throws. */
export async function storePartyReport(db: RawDb, slip: ReportSlip, now: number = Date.now()): Promise<ReportOutcome> {
  if (!(await probe.ready(db, now))) return 'not_available';
  try {
    await db.$executeRawUnsafe(INSERT_SQL, randomUUID(), slip.reporterUid, slip.reportedUid, slip.reportedName.slice(0, 12),
      slip.code.slice(0, 6), slip.reason.slice(0, 16), new Date(slip.at));
    return 'stored';
  } catch (e) {
    probe.fail('party_report_insert_failed', e, now);
    return 'failed';
  }
}
