export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { readCaller, isAdmin, type CallerDb } from '@/lib/safety/caller';
import { fileProblem } from '@/lib/safety/problem';
import { setProblemStatus, type RawDb } from '@/lib/safety/store';

/**
 * POST /api/report/problem — SAFETY lane (SAF-04, 2026-10-25): "Report a problem" from the support page. Signed in or
 * not. The body is the automatic context (lib/safety/problemContext.ts) and, from a verified adult only, a short typed
 * note. Stored WITHOUT any account id, email or address (lib/safety/problem.ts). 200 { received, stored } — stored is
 * false until prisma/pending/2026-10-25-user-reports.sql is applied; 429 rate_limited; 422 text_refused.
 *
 * PATCH { id, status: 'new' | 'done' } — the admin inbox marks one handled. role 'admin' only (403 otherwise).
 */
export async function POST(req: Request) {
  const caller = await readCaller(prisma as unknown as CallerDb);
  const body = await req.json().catch(() => null);
  const r = await fileProblem(prisma as unknown as RawDb, caller, req.headers, body);
  return NextResponse.json(r.body, { status: r.status });
}

export async function PATCH(req: Request) {
  const caller = await readCaller(prisma as unknown as CallerDb);
  if (!isAdmin(caller)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { id?: unknown; status?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id.slice(0, 64) : '';
  const status = body?.status === 'done' ? 'done' : body?.status === 'new' ? 'new' : null;
  if (!id || !status) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  const ok = await setProblemStatus(prisma as unknown as RawDb, id, status);
  return NextResponse.json({ ok }, { status: ok ? 200 : 503 });
}
