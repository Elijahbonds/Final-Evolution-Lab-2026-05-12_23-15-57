export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isAdmin, readCaller, type CallerDb } from '@/lib/safety/caller';
import { actOnReport, adminQueue, decideAppeal } from '@/lib/safety/reports';
import type { RawDb } from '@/lib/safety/store';

/**
 * SAFETY lane (SAF-05, 2026-10-25): the moderation queue's actions. role 'admin' only — anyone else is 403, before a read.
 *   GET   { available, reports, appeals } — the open queue.
 *   POST  { op: 'report', reportId, action: dismiss|warn|mute|ban, reason?, days? } or
 *         { op: 'appeal', moderationId, decision: uphold|lift }. Every action writes a ModerationAudit row.
 */
async function admin() {
  const c = await readCaller(prisma as unknown as CallerDb);
  return isAdmin(c) ? c : null;
}

export async function GET() {
  if (!(await admin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const q = await adminQueue(prisma as unknown as RawDb);
  return NextResponse.json({ available: q !== null, reports: q?.reports ?? [], appeals: q?.appeals ?? [] });
}

export async function POST(req: Request) {
  const a = await admin();
  if (!a) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { op?: unknown } | null;
  const db = prisma as unknown as RawDb;
  const r = body?.op === 'appeal' ? await decideAppeal(db, a.userId, body) : body?.op === 'report' ? await actOnReport(db, a.userId, body) : { status: 400, body: { error: 'invalid' } };
  return NextResponse.json(r.body, { status: r.status });
}
