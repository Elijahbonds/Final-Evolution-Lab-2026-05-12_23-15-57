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
 *   - Session score meets the node’s target
 *   - Node is currently playable (unlocked, not already completed)
 * Then atomically creates StoryNodeProgress + awards LC via economy.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getNodeById } from '@/lib/story-data';
import { loadProgressionInput } from '@/lib/story-service';
import { isNodePlayable, evaluateCampaign, newlyUnlockedZones } from '@/lib/progression';
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
    let sessionScore = 0;
    if (sessionId) {
      const gameSession = await prisma.gameSession.findFirst({
        where: { id: sessionId, userId },
        select: { score: true },
      });
      if (!gameSession) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
      sessionScore = gameSession.score;
    }

    // Check score meets target
    if (sessionScore < node.targetScore) {
      return NextResponse.json(
        { error: 'Score below target', required: node.targetScore, achieved: sessionScore },
        { status: 422 },
      );
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
      return NextResponse.json({ ok: true, alreadyCompleted: true });
    }
    console.error('[api/story/complete] POST failed:', error);
    return NextResponse.json(
      { error: 'Failed to complete story node' },
      { status: 500 },
    );
  }
}
