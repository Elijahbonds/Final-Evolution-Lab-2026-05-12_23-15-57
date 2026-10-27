export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { runAutomations, type AutomationDb } from '@/lib/coach/automations/server';
import { AUTOMATIONS_SECRET_HEADER, automationsSecret, verifyAutomationsSecret } from '@/lib/coach/automations/cron';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/**
 * POST /api/coach/automations/sweep — COACH-DELIVERY COA-01: every coach's enabled automations, run once (hourly is the
 * intended schedule: a weekly automation fires at its hour, a join or missed one within the hour).
 * Guarded by a shared secret, not a session (a scheduler has no user) — the /api/cron/retention pattern:
 *   (1) COACH_AUTOMATIONS_CRON_SECRET not set → 503 (FAIL CLOSED); (2) header x-coach-automations-secret wrong → 401;
 *   (3) right → the sweep. Answers COUNTS ONLY, never a name or a message. Idempotent within a PT day (the run rows).
 * The owner creates the Cloud Scheduler job (docs/COACH-DELIVERY.md); none runs FEL jobs today.
 */
export async function POST(req: NextRequest) {
  const secret = automationsSecret();
  if (!secret) return NextResponse.json({ error: 'automations_not_configured' }, { status: 503, headers: NO_STORE });
  if (!verifyAutomationsSecret(req.headers.get(AUTOMATIONS_SECRET_HEADER), secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  const summary = await runAutomations(prisma as unknown as AutomationDb);
  return NextResponse.json({ ok: true, ...summary }, { headers: NO_STORE });
}
