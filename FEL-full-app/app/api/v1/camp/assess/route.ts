export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@/public/_prisma/client';
import { prisma } from '@/lib/db';
import { CURRICULUM, CURRICULUM_VERSION, PASS_MARK, requiredModules } from '@/lib/curriculum/blueprint';
// HOTFIX (2026-09-24): the questions, the answer key and the grader are server-only now (they used to ship
// to the browser inside blueprint.ts). This route is the one place that reads them.
import { gradeModule, missingAnswers, presentModule, type ModuleGrade } from '@/lib/curriculum/assessments';
import { ASSESS_POLICY, attemptGate, discloseResult, type AttemptGate } from '@/lib/camp/assessPolicy';
import { currentUserId, recomputeCertification, bad, requirePaidFacilitator } from '@/lib/camp/server';

/** GET /api/v1/camp/assess — my credentials, status, what is still missing, and each module's paper (no answers). */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  { const paywalled = await requirePaidFacilitator(userId); if (paywalled) return paywalled; }
  const creds = await prisma.credential.findMany({ where: { userId }, orderBy: { earnedAt: 'desc' } });
  const cert = await recomputeCertification(userId);
  const now = new Date();
  return NextResponse.json({
    curriculumVersion: CURRICULUM_VERSION,
    passMark: PASS_MARK,
    required: requiredModules(),
    policy: { cooldownSec: ASSESS_POLICY.cooldownSec, attemptCap: ASSESS_POLICY.cap, windowSec: ASSESS_POLICY.windowSec },
    status: cert.status, passedModules: cert.passedModules, missingModules: cert.missingModules,
    credentials: creds.map((c) => ({ trackKey: c.trackKey, moduleKey: c.moduleKey, score: c.score, passed: c.passed, curriculumVersion: c.curriculumVersion, earnedAt: c.earnedAt })),
    modules: CURRICULUM.tracks.flatMap((t) => t.modules.flatMap((m) => {
      const paper = presentModule(t.key, m.key);
      if (!paper) return [];
      return [{
        ref: paper.ref, title: m.title, summary: m.summary, required: m.requiredForCertification,
        // Options in PRESENTED order, no answer field. The POST answers by position in this order.
        questions: paper.questions,
        presentationId: paper.presentationId,
        attempt: attemptGate(creds.filter((c) => c.trackKey === t.key && c.moduleKey === m.key), now),
      }];
    })),
  });
}

type Recorded = { blocked: AttemptGate } | { blocked: null; after: AttemptGate };

/**
 * The gate check and the write happen in ONE serializable transaction. Checked outside it, ten parallel
 * submits would all read "no recent attempt" and all be graded — the cap would be decorative. Postgres
 * aborts all but one of a racing set (P2034); the loser retries once, now sees the winner's row, and gets
 * the honest cooldown/cap answer. Same pattern as purchaseCard in lib/economy.ts.
 */
async function recordAttempt(
  userId: string, trackKey: string, moduleKey: string,
  graded: ModuleGrade,
): Promise<Recorded | 'conflict'> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const rows = await tx.credential.findMany({
          where: { userId, trackKey, moduleKey, curriculumVersion: CURRICULUM_VERSION },
          select: { earnedAt: true, passed: true, curriculumVersion: true },
        });
        const now = new Date();
        const gate = attemptGate(rows, now);
        if (!gate.open) return { blocked: gate };
        const created = await tx.credential.create({
          data: { userId, trackKey, moduleKey, curriculumVersion: CURRICULUM_VERSION, score: graded.score, passed: graded.passed, answers: graded.graded as object },
          select: { earnedAt: true, passed: true, curriculumVersion: true },
        });
        return { blocked: null, after: attemptGate([...rows, created], now) };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (err) {
      const conflict = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034';
      if (!conflict) throw err;
    }
  }
  return 'conflict';
}

/**
 * POST /api/v1/camp/assess — { trackKey, moduleKey, presentationId, answers: { [questionKey]: presentedIndex } }
 * → graded HERE, stored, status recomputed.
 *
 * Refuses (and records nothing) when: the paper changed since it was shown (409 stale_questions), a
 * question is unanswered (400 incomplete_answers), the module is already passed (409), or it is resting
 * after a miss / out of attempts for the window (429 with Retry-After). A result carries score and counts;
 * per-question flags only on a pass — see discloseResult in lib/camp/assessPolicy.ts for why.
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  { const paywalled = await requirePaidFacilitator(userId); if (paywalled) return paywalled; }
  let body: { trackKey?: unknown; moduleKey?: unknown; presentationId?: unknown; answers?: unknown };
  try { body = await req.json(); } catch { return bad('invalid_json'); }
  // HOTFIX (2026-09-24): `null`, `[]` and `3` are valid JSON; reading .trackKey off null was a 500.
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('invalid_json');
  const trackKey = String(body.trackKey ?? ''), moduleKey = String(body.moduleKey ?? '');
  const paper = presentModule(trackKey, moduleKey);
  if (!paper) return bad('unknown_module', 404);
  if (body.presentationId !== paper.presentationId) return bad('stale_questions', 409);
  const answers: Record<string, number> = {};
  if (body.answers && typeof body.answers === 'object') {
    for (const [k, v] of Object.entries(body.answers as Record<string, unknown>)) if (typeof v === 'number' && Number.isInteger(v)) answers[k] = v;
  }
  const missing = missingAnswers(trackKey, moduleKey, answers);
  if (missing > 0) return NextResponse.json({ error: 'incomplete_answers', missing }, { status: 400 });
  const graded = gradeModule(trackKey, moduleKey, answers);
  if (!graded) return bad('unknown_module', 404);

  const recorded = await recordAttempt(userId, trackKey, moduleKey, graded);
  if (recorded === 'conflict') return bad('concurrent_attempt', 409);
  if (recorded.blocked) {
    const g = recorded.blocked;
    return NextResponse.json(
      { error: g.reason, retryAfterSec: g.retryAfterSec, attemptsLeft: g.attemptsLeft },
      { status: g.reason === 'already_passed' ? 409 : 429, headers: g.retryAfterSec ? { 'Retry-After': String(g.retryAfterSec) } : undefined },
    );
  }
  const cert = await recomputeCertification(userId);
  return NextResponse.json({ ...discloseResult(graded), attempt: recorded.after, status: cert.status, missingModules: cert.missingModules });
}
