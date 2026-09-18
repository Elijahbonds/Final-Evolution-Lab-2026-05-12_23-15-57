export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { CURRICULUM_VERSION, lessonByRef } from '@/lib/curriculum/blueprint';
import { currentUserId, bad } from '@/lib/camp/server';

interface TemplateStructure { blocks: { label: string; pacingDays: number; sessions: { label: string; moduleKeys: string[]; modeKey: string | null }[] }[] }

/** GET /api/v1/camp/templates — published templates plus my own. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const fac = await prisma.facilitatorProfile.findUnique({ where: { userId } });
  const templates = await prisma.campTemplate.findMany({
    where: { OR: [{ published: true }, ...(fac ? [{ authorId: fac.id }] : [])] },
    orderBy: { updatedAt: 'desc' },
    include: { author: { select: { userId: true } } },
  });
  return NextResponse.json({ curriculumVersion: CURRICULUM_VERSION, templates });
}

/**
 * POST /api/v1/camp/templates
 *   { action: 'export', goalPlanId, name, description?, publish? }  → a template from a plan's program
 *   { action: 'import', templateId, menteeId, goalText, reconcile? } → a new draft plan; 409 on a curriculum
 *     version mismatch unless reconcile:true (the facilitator has reviewed the differences)
 *   { action: 'fork', templateId, name }                               → a copy credited to the source
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const fac = await prisma.facilitatorProfile.findUnique({ where: { userId } });
  if (fac?.certificationStatus !== 'certified') return bad('facilitator_not_certified', 403);
  let body: any;
  try { body = await req.json(); } catch { return bad('invalid_json'); }

  if (body.action === 'export') {
    const plan = await prisma.goalPlan.findUnique({ where: { id: String(body.goalPlanId ?? '') } });
    if (!plan || plan.facilitatorUserId !== userId) return bad('not_found', 404);
    const program = plan.programId ? await prisma.coachingProgram.findUnique({ where: { id: plan.programId }, include: { blocks: { orderBy: { order: 'asc' }, include: { sessions: { orderBy: { order: 'asc' } } } } } }) : null;
    const structure: TemplateStructure = {
      blocks: (program?.blocks ?? []).map((b, i, arr) => ({
        label: b.label,
        pacingDays: b.targetDate && arr[i - 1]?.targetDate ? Math.max(1, Math.round((b.targetDate.getTime() - arr[i - 1].targetDate!.getTime()) / 86_400_000)) : 7,
        sessions: b.sessions.map((s) => ({ label: s.label, moduleKeys: plan.linkedModuleKeys, modeKey: null })),
      })),
    };
    const t = await prisma.campTemplate.create({
      data: { authorId: fac.id, name: String(body.name ?? plan.goalText).slice(0, 80), description: typeof body.description === 'string' ? body.description.slice(0, 500) : null, curriculumVersion: plan.curriculumVersion, structure: structure as object, published: Boolean(body.publish) },
    });
    return NextResponse.json({ template: t });
  }

  const template = await prisma.campTemplate.findUnique({ where: { id: String(body.templateId ?? '') } });
  if (!template) return bad('not_found', 404);
  if (!template.published && template.authorId !== fac.id) return bad('forbidden', 403);

  if (body.action === 'fork') {
    const copy = await prisma.campTemplate.create({
      data: { authorId: fac.id, name: String(body.name ?? `${template.name} (fork)`).slice(0, 80), description: template.description, curriculumVersion: template.curriculumVersion, structure: template.structure as object, forkedFromId: template.id },
    });
    return NextResponse.json({ template: copy });
  }

  if (body.action === 'import') {
    if (template.curriculumVersion !== CURRICULUM_VERSION && !body.reconcile) {
      return NextResponse.json({ error: 'curriculum_version_mismatch', templateVersion: template.curriculumVersion, currentVersion: CURRICULUM_VERSION }, { status: 409 });
    }
    const menteeId = String(body.menteeId ?? ''); const goalText = String(body.goalText ?? template.name).trim().slice(0, 500);
    if (!menteeId || menteeId === userId) return bad('mentee_required');
    const structure = template.structure as unknown as TemplateStructure;
    let day = 0;
    const program = await prisma.coachingProgram.create({
      data: {
        coachId: userId, clientId: menteeId, name: goalText.slice(0, 80), startDate: new Date(), durationWeeks: Math.max(1, Math.ceil(structure.blocks.reduce((a, b) => a + (b.pacingDays || 7), 0) / 7)),
        blocks: { create: structure.blocks.map((b, i) => { day += b.pacingDays || 7; return { order: i + 1, label: b.label, targetDate: new Date(Date.now() + day * 86_400_000), sessions: { create: b.sessions.map((s, j) => ({ order: j + 1, label: s.label })) } }; }) },
      },
    });
    const linked = [...new Set(structure.blocks.flatMap((b) => b.sessions.flatMap((s) => s.moduleKeys)))].filter((r) => lessonByRef(r) || /^[a-z0-9-]+\/[a-z0-9]+$/.test(r)).slice(0, 12);
    const plan = await prisma.goalPlan.create({
      data: { menteeId, facilitatorUserId: userId, facilitatorId: fac.id, goalText, status: 'draft', programId: program.id, linkedModuleKeys: linked, curriculumVersion: CURRICULUM_VERSION, templateId: template.id },
    });
    await prisma.campTemplate.update({ where: { id: template.id }, data: { uses: { increment: 1 } } });
    return NextResponse.json({ plan, program, reconciled: template.curriculumVersion !== CURRICULUM_VERSION });
  }
  return bad('unknown_action');
}
