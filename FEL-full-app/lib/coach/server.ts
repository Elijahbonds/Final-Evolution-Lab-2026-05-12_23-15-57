// Server helpers for /api/coach/* (lane 1). Thin: the program tree read used by every route, and the certified-coach gate.
import { prisma } from '@/lib/db';
import type { ProgramTree } from './loop';

export const TREE_INCLUDE = {
  blocks: { orderBy: { order: 'asc' as const }, include: { sessions: { orderBy: { order: 'asc' as const }, include: { exercises: { orderBy: { order: 'asc' as const }, include: { exercise: { select: { name: true, category: true } } } } } } } },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toTree(p: any): ProgramTree {
  return {
    id: p.id, name: p.name, coachId: p.coachId, clientId: p.clientId,
    blocks: p.blocks.map((b: any) => ({
      id: b.id, order: b.order, label: b.label, targetDate: b.targetDate ? new Date(b.targetDate).toISOString() : null,
      sessions: b.sessions.map((s: any) => ({
        id: s.id, order: s.order, label: s.label,
        exercises: s.exercises.map((e: any) => ({ id: e.id, order: e.order, name: e.exercise.name, sets: e.sets, reps: e.reps, load: e.load, tempo: e.tempo, restSeconds: e.restSeconds, coachNote: e.coachNote })),
      })),
    })),
  };
}

/** A coach is a CERTIFIED facilitator (owner decision 2026-09-06). */
export async function isCertifiedCoach(userId: string): Promise<boolean> {
  const fac = await prisma.facilitatorProfile.findUnique({ where: { userId }, select: { certificationStatus: true } });
  return fac?.certificationStatus === 'certified';
}
