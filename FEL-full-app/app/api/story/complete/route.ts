/**
 * POST /api/story/complete
 *
 * Marks a story node as completed. Called by GameShell after posting
 * a session result when a `?story=<nodeId>` param is present.
 *
 * Body: { nodeId: string, sessionId: string }
 *
 * Validates:
 *   - Session exists and belongs to the user
 *   - Session was played in the node’s mode (judgeStorySession, lib/progression)
 *   - Session is a win, when the node asks for one (a boss of a winnable mode) — or at its `orScore`, where it has one
 *   - Session has not already completed a DIFFERENT node (one session, one node)
 *   - Session score meets the node’s target (on the mode's own scale — lib/story-yardstick.ts)
 *   - Node is currently playable (unlocked, not already completed)
 * Then atomically creates StoryNodeProgress + awards LC via economy.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getNodeById } from '@/lib/story-data';
import { loadProgressionInput } from '@/lib/story-service';
import { isNodePlayable, evaluateCampaign, newlyUnlockedZones, judgeStorySession } from '@/lib/progression';
import { awardStoryReward } from '@/lib/story-economy';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const nodeId = body?.nodeId;
    const sessionId = body?.sessionId;

    if (typeof nodeId !== 'string' || !nodeId) {
      return NextResponse.json({ error: 'nodeId required' }, { status: 400 });
    }

    // Validate the node exists in campaign data
    const node = getNodeById(nodeId);
    if (!node) {
      return NextResponse.json({ error: 'Unknown node' }, { status: 400 });
    }

    // Validate session if provided
    let gameSession: { mode: string; score: number; won: boolean } | null = null;
    if (sessionId) {
      gameSession = await prisma.gameSession.findFirst({
        where: { id: sessionId, userId },
        select: { mode: true, score: true, won: true },
      });
      if (!gameSession) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
    }
    const sessionScore = gameSession?.score ?? 0;

    // HOTFIX (2026-09-24): only the score was checked, so a high-scoring run in any mode completed any node. The
    // session must be this node's mode, a win when the node asks for one, then at or over the target — in that order.
    // lib/story-complete-route.test.ts drives this handler and holds all three.
    const verdict = judgeStorySession(node, gameSession);
    if (!verdict.ok) {
      // the verdict IS the body (error, required, achieved — and a win boss's orScore + score), minus the flag
      const { ok: _ok, ...refusal } = verdict;
      return NextResponse.json(refusal, { status: 422 });
    }

    // HOTFIX (2026-09-24): one session completes one node. StoryNodeProgress.sessionId is @unique, so the database
    // already refused a second node on the same session — but the P2002 below answered it `ok: true,
    // alreadyCompleted: true`, reporting a completion that never happened. Asked first and answered as what it is.
    const usedBy = await prisma.storyNodeProgress.findUnique({ where: { sessionId }, select: { nodeId: true } });
    if (usedBy && usedBy.nodeId !== nodeId) {
      return NextResponse.json({ error: 'Session already used', nodeId: usedBy.nodeId }, { status: 409 });
    }

    // Check node is playable
    const inputBefore = await loadProgressionInput(userId);
    const { playable, reason } = isNodePlayable(nodeId, inputBefore);
    if (!playable) {
      if (reason === 'already-completed') {
        // Idempotent — return success without re-awarding
        const status = evaluateCampaign(inputBefore);
        return NextResponse.json({ ok: true, alreadyCompleted: true, ...status });
      }
      return NextResponse.json({ error: `Node not playable: ${reason}` }, { status: 422 });
    }

    // Atomically create progress + award LC
    const beforeStatus = evaluateCampaign(inputBefore);

    await prisma.$transaction(async (tx) => {
      // Create StoryNodeProgress (P2002 = already completed, race-safe)
      await tx.storyNodeProgress.create({
        data: {
          userId,
          nodeId,
          sessionId: sessionId || null,
          score: sessionScore,
        },
      });

      // Award LC
      if (node.rewardLC > 0) {
        await awardStoryReward(tx, {
          userId,
          nodeId,
          amount: node.rewardLC,
        });
      }
    });

    // Compute new status
    const inputAfter = await loadProgressionInput(userId);
    const afterStatus = evaluateCampaign(inputAfter);
    const newZones = newlyUnlockedZones(beforeStatus, afterStatus);

    return NextResponse.json({
      ok: true,
      rewardLC: node.rewardLC,
      badge: node.badge ?? null,
      newlyUnlockedZones: newZones,
      completionPct: afterStatus.completionPct,
      completedNodes: afterStatus.completedNodes,
      totalNodes: afterStatus.totalNodes,
    });
  } catch (error: unknown) {
    // Handle P2002 (unique constraint = already completed)
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      // HOTFIX (2026-09-24): the two unique keys mean different things. (userId, nodeId) is this node, already done —
      // idempotent. sessionId is a race of the check above: the session completed ANOTHER node first, and nothing
      // was written for this one, so it is not "completed".
      const target = (error as { meta?: { target?: unknown } }).meta?.target;
      if (Array.isArray(target) ? target.includes('sessionId') : String(target ?? '').includes('sessionId')) {
        return NextResponse.json({ error: 'Session already used' }, { status: 409 });
      }
      return NextResponse.json({ ok: true, alreadyCompleted: true });
    }
    console.error('[api/story/complete] POST failed:', error);
    return NextResponse.json(
      { error: 'Failed to complete story node' },
      { status: 500 },
    );
  }
}
