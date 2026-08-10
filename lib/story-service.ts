/**
 * lib/story-service.ts
 *
 * Server-only data access for story mode: loads the three progression
 * inputs (StoryNodeProgress + PlayerProfile PRQ + LessonProgress count)
 * that feed the pure engine in lib/progression.ts.
 *
 * Adapted: PlayerProfile has no `prq` column — overall PRQ is derived
 * from 8 attribute columns via lib/prq.ts. LessonProgress rows represent
 * completed lessons (no status field).
 */

import { prisma } from '@/lib/db';
import { prqScore, PRQ_ATTRS } from '@/lib/prq';
import type { ProgressionInput } from '@/lib/progression';

export async function loadProgressionInput(
  userId: string,
): Promise<ProgressionInput> {
  const [progressRows, profile, lessonsCompleted] = await Promise.all([
    prisma.storyNodeProgress.findMany({
      where: { userId },
      select: { nodeId: true },
    }),
    prisma.playerProfile.findUnique({
      where: { userId },
    }),
    // All LessonProgress rows represent completed lessons (no status field)
    prisma.lessonProgress.count({
      where: { userId },
    }),
  ]);

  // Derive overall PRQ from 8 attributes
  let prqOverall = 50;
  if (profile) {
    const attrs: Record<string, number> = {};
    for (const a of PRQ_ATTRS) {
      attrs[a] = (profile as Record<string, unknown>)[a] as number ?? 50;
    }
    prqOverall = prqScore(attrs);
  }

  return {
    completedNodeIds: new Set(progressRows.map((r) => r.nodeId)),
    prqOverall,
    lessonsCompleted,
  };
}
