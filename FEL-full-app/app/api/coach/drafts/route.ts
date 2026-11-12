export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { isCertifiedCoach } from '@/lib/coach/server';
import { rateLimit } from '@/lib/rate-limit';
import { aiCallerFromEnv, coachWeek, type DraftReadDb } from '@/lib/coach/weeklyDraft/server';
import { decideChange, parseDecideBody, type ApproveDb } from '@/lib/coach/weeklyDraft/approve';
import { coachFeatureRefusal, type PlanDb } from '@/lib/coach-business/planServer';

/**
 * COACH-AI-DRAFT (2026-10-24): the coach's weekly Drafts inbox.
 *   GET  → { weekKey, approvals, drafts }: one draft per athlete on the coach's LIVE roster who passes the teen gate
 *          (lib/coach/weeklyDraft/server.ts reads under every gate; the rules engine drafts; the AI layer adds words only
 *          while the Abacus switch is on and the drafts tables exist). `approvals` is false until the pending SQL is
 *          applied (prisma/pending/2026-10-24-coach-ai-draft.sql): the drafts still read, nothing can be approved.
 *   POST { draftId, changeId, decision: 'approve' | 'edit' | 'reject', edits?, note? } → one decision, written through the
 *          program builder with an audit row (lib/coach/weeklyDraft/approve.ts has every check, in order).
 * Certified coaches only: a draft is a set of builder writes, and the builder writes for certified coaches only.
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!(await isCertifiedCoach(userId))) return bad('facilitator_not_certified', 403);
  if (!rateLimit(`coach-drafts:get:${userId}`, 30, 60_000).ok) return bad('rate_limited', 429);
  // COACH-BUSINESS: AI drafts are a Coach Pro feature while COACH_PRO_ENABLED is on (off by default: no change).
  const pro = await coachFeatureRefusal(prisma as unknown as PlanDb, userId, 'ai_drafts');
  if (pro) return pro;
  try {
    return NextResponse.json(await coachWeek(prisma as unknown as DraftReadDb, userId, new Date(), aiCallerFromEnv()));
  } catch (e) {
    console.error('[coach/drafts] not drafted', e instanceof Error ? e.name : typeof e);
    return bad('drafts_failed', 500);
  }
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`coach-drafts:post:${userId}`, 60, 60_000).ok) return bad('rate_limited', 429);
  const pro = await coachFeatureRefusal(prisma as unknown as PlanDb, userId, 'ai_drafts');
  if (pro) return pro;
  let body: unknown;
  try { body = await req.json(); } catch { return bad('invalid_json'); }
  const parsed = parseDecideBody(body);
  if (!parsed.ok) return bad(parsed.error);
  const r = await decideChange(prisma as unknown as ApproveDb, userId, parsed.input);
  if (!r.ok) return NextResponse.json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, { status: r.status });
  return NextResponse.json({ decision: r.decision, already: r.already, written: r.written });
}
