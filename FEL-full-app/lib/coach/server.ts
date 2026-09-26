// Server helpers for /api/coach/* (lane 1). Thin: the program tree read used by every route, and the certified-coach gate.
import { prisma } from '@/lib/db';
import { treeExercise, type ProgramTree } from './loop';
import { sessionOrder } from './structure';
import { CATALOGUE_COACHING_SELECT } from './today';

export { treeExercise };

/**
 * The program tree's query. MIRROR-COACH P2 (2026-09-25): the catalogue row (`exercise`) was selected for `name` and
 * `category` only, so the coach's cues, common faults, demo video, easier/harder links and the pattern and brace tags
 * never reached the client's Today however fully the catalogue was written (P1 baseline, loop-baseline.test.ts
 * BASELINE 3). It now selects the coaching columns (lib/coach/today.ts CATALOGUE_COACHING_SELECT). toTree still
 * builds the same TreeExercise from it — the builder and the coach's program list read that — and the Today read
 * (lib/coach/todayServer.ts) reads the coaching off the same rows. The session-structure columns (section, key set,
 * superset, work/hold seconds, set-up cues, band) are SessionExercise's own and come with the row.
 */
export const TREE_INCLUDE = {
  blocks: { orderBy: { order: 'asc' as const }, include: { sessions: { orderBy: { order: 'asc' as const }, include: { exercises: { orderBy: { order: 'asc' as const }, include: { exercise: { select: CATALOGUE_COACHING_SELECT } } } } } } },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toTree(p: any): ProgramTree {
  return {
    id: p.id, name: p.name, coachId: p.coachId, clientId: p.clientId,
    blocks: p.blocks.map((b: any) => ({
      id: b.id, order: b.order, label: b.label, targetDate: b.targetDate ? new Date(b.targetDate).toISOString() : null,
      sessions: b.sessions.map((s: any) => ({
        id: s.id, order: s.order, label: s.label,
        // in running order — prep first, cool-down last, stored order inside a section — so every reader (Today,
        // /training, the builder) walks the session the way it is done without re-sorting it (MIRROR-COACH P2)
        exercises: sessionOrder(s.exercises.map((e: any) => treeExercise(e))),
      })),
    })),
  };
}

/** A coach is a CERTIFIED facilitator (owner decision 2026-09-06). */
export async function isCertifiedCoach(userId: string): Promise<boolean> {
  const fac = await prisma.facilitatorProfile.findUnique({ where: { userId }, select: { certificationStatus: true } });
  return fac?.certificationStatus === 'certified';
}
