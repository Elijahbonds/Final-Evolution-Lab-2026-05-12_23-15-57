import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { recordServerEvent } from '@/lib/analytics-server';
import { isCatalogueMode } from '@/lib/session-payout';
import { decideRunEligibility, isAgentRunRequest } from '@/lib/sessions/runEligibility';
import { ruleFor } from '@/lib/sessions/modeScoreRules';
import { startRun } from '@/lib/sessions/sessionRuns';
import { serverTierFor } from '@/lib/sessions/runTier';
import { trustedClientIp } from '@/lib/rate-limits/clientIp';
import { checkRateLimits, retryAfterHeaders } from '@/lib/rate-limits/policy';

export const dynamic = 'force-dynamic';

/**
 * POST /api/sessions/start — ECONOMY-SESSIONS-HARDEN (2026-09-28). Body: { mode, playtest? }. Query: ?agent=1, ?playtest=1.
 *
 * Starts a run ON THE SERVER and returns { runId, modeSlug, startedAt, expiresAt, payoutEligible, reason }. The finish
 * (POST /api/sessions) must name this runId: the run belongs to this user, is still open and is of the same mode, its
 * duration is the server's (now − startedAt), and whether it pays was decided HERE and stored on it — from ?agent=1 (the
 * query, an x-fel-agent header or the page's own URL), the playtest flag, and the account's server-side test allowlist
 * (lib/sessions/runEligibility.ts). Nothing sent later can make it pay.
 *
 * RATE-LIMIT-WIRE (PR #289 QA rework, 2026-10-16): starts are limited per account and per the address the trusted proxy
 * set, at runRateLimit's staged start numbers, counted in the shared rate_limits table (lib/rate-limits) — not in this
 * instance's memory, and never on a client-written X-Forwarded-For. The finish counts its GameSession rows
 * (lib/sessions/finishRateLimit.ts).
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // before anything is read or written: past the window's starts, 429 (the finish's shape and header)
    const limited = await checkRateLimits(prisma, 'runStart', [
      { kind: 'user', value: userId },
      { kind: 'ip', value: trustedClientIp(req.headers) },
    ]);
    if (!limited.ok) {
      return NextResponse.json({ ok: false, reason: 'RATE_LIMITED', retryAfterSec: limited.retryAfterSec }, { status: 429, headers: retryAfterHeaders(limited) });
    }

    const body = await req.json().catch(() => ({}));
    const mode = typeof body?.mode === 'string' ? body.mode : '';
    if (!mode || mode.length > 64 || !isCatalogueMode(mode)) {
      console.warn('[sessions/start] SCORE_INVALID unknown_mode:', JSON.stringify(mode).slice(0, 80), 'user', userId);
      return NextResponse.json({ ok: false, reason: 'SCORE_INVALID', detail: 'unknown_mode' }, { status: 400 });
    }

    // the account as the database has it: role is written by no API route (the server-side test allowlist)
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true } });
    const agentRun = isAgentRunRequest({ url: req.url, headers: req.headers });
    let eligibility = decideRunEligibility({ url: req.url, headers: req.headers, body, user });
    // SK-4 / HP-9: a mode with no score rule is unpaid from the start — finish would be NO_RULES anyway.
    if (eligibility.payoutEligible && !ruleFor(mode)) {
      eligibility = { payoutEligible: false, reason: 'NO_RULES' as const };
    }
    // TIER-SERVER: the tier is the server's — PRO on any head-to-head start, the client's pick never read there
    const tier = serverTierFor(body);
    const run = await startRun(prisma, { userId, mode, eligibility, agentRun, tier });
    if (!run.payoutEligible) {
      await recordServerEvent({ name: 'session_run_unpaid', userId, props: { mode: run.modeSlug, reason: run.reason ?? '' } });
    }
    return NextResponse.json({ ok: true, ...run, tier: tier.tier });
  } catch (e) {
    console.error('session start error', e);
    return NextResponse.json({ error: 'Failed to start run' }, { status: 500 });
  }
}
