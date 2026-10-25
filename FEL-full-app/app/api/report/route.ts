export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { readCaller, type CallerDb } from '@/lib/safety/caller';
import { fileReport, type ReportsDb } from '@/lib/safety/reports';

/**
 * POST /api/report { target, ref, reason, note? } — SAFETY lane (SAF-05, 2026-10-25): report a profile, a squad post, a
 * group, a challenge result or a coach message. Signed in only. The person behind the target is found on the server.
 * Answers { received: true } whatever happened to the report (stored, duplicate, unknown target, before the SQL), so it
 * says nothing about who or what exists and never who else reported. 400 invalid_report; 401; 422 note_refused (contact
 * details in a note); 429 rate_limited. Rules: lib/safety/reports.ts.
 */
export async function POST(req: Request) {
  const caller = await readCaller(prisma as unknown as CallerDb);
  const r = await fileReport(prisma as unknown as ReportsDb, caller, await req.json().catch(() => null));
  return NextResponse.json(r.body, { status: r.status });
}
