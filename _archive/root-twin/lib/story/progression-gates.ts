import { prisma } from '@/lib/db';

/**
 * Story Mode Progression Gates (FEL_STORY_MODE_SPEC.md)
 * Each chapter is gated by PRQ thresholds + lesson completion.
 * Gates are checked server-side before progression mutations.
 */

export interface ChapterGate {
  chapterId: number;
  title: string;
  minPrq: number;
  minLessonsComplete: number;
}

export const CHAPTER_GATES: ChapterGate[] = [
  {
    chapterId: 1,
    title: 'The Awakening',
    minPrq: 30,
    minLessonsComplete: 2,
  },
  {
    chapterId: 2,
    title: 'The Glitch',
    minPrq: 45,
    minLessonsComplete: 6,
  },
  {
    chapterId: 3,
    title: 'Rising Tide',
    minPrq: 55,
    minLessonsComplete: 9,
  },
  {
    chapterId: 4,
    title: 'Mastery Lab',
    minPrq: 70,
    minLessonsComplete: 12,
  },
  {
    chapterId: 5,
    title: 'The Nexus Core',
    minPrq: 80,
    minLessonsComplete: 15,
  },
];

/**
 * Calculate composite PRQ score from PlayerProfile stats.
 * Weighted average of 8 attributes (strength, speed, endurance, agility, power, flexibility, recovery, mental).
 */
export async function computeUserPrq(userId: string): Promise<number> {
  const profile = await prisma.playerProfile.findUnique({
    where: { userId },
    select: {
      strength: true,
      speed: true,
      endurance: true,
      agility: true,
      power: true,
      flexibility: true,
      recovery: true,
      mental: true,
    },
  });

  if (!profile) return 0;

  const avg = (
    profile.strength +
    profile.speed +
    profile.endurance +
    profile.agility +
    profile.power +
    profile.flexibility +
    profile.recovery +
    profile.mental
  ) / 8;

  return Math.round(avg);
}

/**
 * Count completed lessons for a user.
 */
export async function countCompletedLessons(userId: string): Promise<number> {
  const count = await prisma.lessonProgress.count({
    where: { userId },
  });
  return count;
}

/**
 * Check if a user can enter a chapter.
 * Returns { canEnter, reason, currentPrq, lessonsComplete }.
 */
export async function checkChapterGate(
  userId: string,
  chapterId: number
): Promise<{
  canEnter: boolean;
  reason?: string;
  currentPrq: number;
  lessonsComplete: number;
}> {
  const gate = CHAPTER_GATES.find((g) => g.chapterId === chapterId);
  if (!gate) {
    return {
      canEnter: false,
      reason: `Chapter ${chapterId} not found`,
      currentPrq: 0,
      lessonsComplete: 0,
    };
  }

  const currentPrq = await computeUserPrq(userId);
  const lessonsComplete = await countCompletedLessons(userId);

  if (currentPrq < gate.minPrq) {
    return {
      canEnter: false,
      reason: `Requires PRQ ≥ ${gate.minPrq} (current: ${currentPrq})`,
      currentPrq,
      lessonsComplete,
    };
  }

  if (lessonsComplete < gate.minLessonsComplete) {
    return {
      canEnter: false,
      reason: `Requires ≥ ${gate.minLessonsComplete} lessons (completed: ${lessonsComplete})`,
      currentPrq,
      lessonsComplete,
    };
  }

  return {
    canEnter: true,
    currentPrq,
    lessonsComplete,
  };
}

/**
 * Record story node progression. Must pass gate check first.
 */
export async function recordStoryProgress(
  userId: string,
  nodeId: string,
  score: number,
  chapterId?: number
): Promise<void> {
  if (chapterId !== undefined) {
    const gate = await checkChapterGate(userId, chapterId);
    if (!gate.canEnter) {
      throw new Error(`Cannot progress: ${gate.reason}`);
    }
  }

  await prisma.storyNodeProgress.upsert({
    where: { userId_nodeId: { userId, nodeId } },
    create: {
      userId,
      nodeId,
      score,
      completedAt: new Date(),
    },
    update: {
      score,
      completedAt: new Date(),
    },
  });
}

/**
 * Get user's furthest unlocked chapter.
 */
export async function getUserMaxChapter(userId: string): Promise<number> {
  for (const gate of [...CHAPTER_GATES].reverse()) {
    const check = await checkChapterGate(userId, gate.chapterId);
    if (check.canEnter) {
      return gate.chapterId;
    }
  }
  return 0; // No chapters unlocked
}
