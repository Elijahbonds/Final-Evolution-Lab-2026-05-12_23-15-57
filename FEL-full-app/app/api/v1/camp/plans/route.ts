export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { CURRICULUM_VERSION, lessonByRef } from '@/lib/curriculum/blueprint';
import { needsGuardianConsent } from '@/lib/camp/certification';
import { currentUserId, bad } from '@/lib/camp/server';

/** GET /api/v1/camp/plans — plans I facilitate and plans where I am the mentee. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const plans = await prisma.goalPlan.findMany({
    where: { OR: [{ menteeId: userId }, { facilitatorUserId: userId }] },
    orderBy: { updatedAt: 'desc' },
    include: { sessions: { orderBy: { date: 'desc' }, take: 5 } },
  });
  return NextResponse.json({ plans });
}

/**
 * POST /api/v1/camp/plans — the intake. A CERTIFIED facilitator drafts a plan
 * for a mentee: { menteeId, goalText, tags?, linkedModuleKeys?, milestones?: [{ label, targetDate?, sessions: [{ label }] }] }.
 * The milestone timeline is a CoachingProgram (blocks = milestones).
 * Action variants: { action: 'lock', planId } — the mentee can say the goal back;
 * { action: 'activate', planId } — refused for a minor without accepted consent.
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  let body: any;
  try { body = await req.json(); } catch { return bad('invalid_json'); }

  if (body.action === 'lock' || body.action === 'activate') {
    const plan = await prisma.goalPlan.findUnique({ where: { id: String(body.planId ?? '') } });
    if (!plan) return bad('not_found', 404);
    if (plan.facilitatorUserId !== userId && plan.menteeId !== userId) return bad('forbidden', 403);
    if (body.action === 'lock') {
      if (plan.status !== 'draft') return bad('not_draft', 409);
      const updated = await prisma.goalPlan.update({ where: { id: plan.id }, data: { status: 'locked', lockedAt: new Date() } });
      return NextResponse.json({ plan: updated });
    }
    if (plan.status !== 'locked') return bad('not_locked', 409);
    // Minors: no active plan without an accepted guardian consent (owner decision).
    const mentee = await prisma.user.findUnique({ where: { id: plan.menteeId }, select: { dobYear: true } });
    const consent = await prisma.guardianConsent.findFirst({ where: { menteeId: plan.menteeId, acceptedAt: { not: null }, revokedAt: null }, orderBy: { acceptedAt: 'desc' } });
    const birthYear = consent?.menteeBirthYear ?? mentee?.dobYear ?? null;
    if (needsGuardianConsent(birthYear) && !consent) return bad('guardian_consent_required', 412);
    const updated = await prisma.goalPlan.update({ where: { id: plan.id }, data: { status: 'active' } });
    return NextResponse.json({ plan: updated });
  }

  // draft a new plan
  const fac = await prisma.facilitatorProfile.findUnique({ where: { userId } });
  if (fac?.certificationStatus !== 'certified') return bad('facilitator_not_certified', 403);
  const menteeId = String(body.menteeId ?? '');
  const goalText = String(body.goalText ?? '').trim().slice(0, 500);
  if (!menteeId || !goalText) return bad('mentee_and_goal_required');
  if (menteeId === userId) return bad('cannot_mentor_self');
  const mentee = await prisma.user.findUnique({ where: { id: menteeId }, select: { id: true } });
  if (!mentee) return bad('mentee_not_found', 404);
  const tags = Array.isArray(body.tags) ? body.tags.map(String).slice(0, 12) : [];
  const linked = (Array.isArray(body.linkedModuleKeys) ? body.linkedModuleKeys.map(String) : [])
    .filter((ref: string) => /^[a-z0-9-]+\/[a-z0-9]+$/.test(ref)).slice(0, 12);

  // The milestone timeline IS a CoachingProgram: blocks = milestones, sessions inside.
  const milestones: Array<{ label?: string; targetDate?: string; sessions?: Array<{ label?: string }> }> = Array.isArray(body.milestones) ? body.milestones.slice(0, 12) : [];
  const program = await prisma.coachingProgram.create({
    data: {
      coachId: userId, clientId: menteeId, name: goalText.slice(0, 80), startDate: new Date(),
      durationWeeks: Math.max(1, milestones.length || 4),
      blocks: {
        create: milestones.map((m, i) => ({
          order: i + 1, label: String(m.label ?? `Milestone ${i + 1}`).slice(0, 80),
          targetDate: m.targetDate ? new Date(m.targetDate) : null,
          sessions: { create: (m.sessions ?? [{ label: 'Session 1' }]).slice(0, 8).map((s, j) => ({ order: j + 1, label: String(s.label ?? `Session ${j + 1}`).slice(0, 80) })) },
        })),
      },
    },
  });
  const plan = await prisma.goalPlan.create({
    data: {
      menteeId, facilitatorUserId: userId, facilitatorId: fac.id, goalText, tags, status: 'draft',
      programId: program.id, linkedModuleKeys: linked, curriculumVersion: CURRICULUM_VERSION,
    },
  });
  return NextResponse.json({ plan, program, modules: linked.map((ref: string) => ({ ref, lesson: lessonByRef(ref)?.title ?? null })) });
}
