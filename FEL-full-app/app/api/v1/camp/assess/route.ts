export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { CURRICULUM, CURRICULUM_VERSION, gradeModule, requiredModules } from '@/lib/curriculum/blueprint';
import { currentUserId, recomputeCertification, bad, requirePaidFacilitator } from '@/lib/camp/server';

/** GET /api/v1/camp/assess — my credentials, status, and what is still missing. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  { const paywalled = await requirePaidFacilitator(userId); if (paywalled) return paywalled; }
  const creds = await prisma.credential.findMany({ where: { userId }, orderBy: { earnedAt: 'desc' } });
  const cert = await recomputeCertification(userId);
  return NextResponse.json({
    curriculumVersion: CURRICULUM_VERSION,
    required: requiredModules(),
    status: cert.status, passedModules: cert.passedModules, missingModules: cert.missingModules,
    credentials: creds.map((c) => ({ trackKey: c.trackKey, moduleKey: c.moduleKey, score: c.score, passed: c.passed, curriculumVersion: c.curriculumVersion, earnedAt: c.earnedAt })),
    modules: CURRICULUM.tracks.flatMap((t) => t.modules.map((m) => ({ ref: `${t.key}/${m.key}`, title: m.title, summary: m.summary, required: m.requiredForCertification, questions: m.lessons.flatMap((l) => l.assessment.map((q) => ({ key: q.key, prompt: q.prompt, options: q.options }))) }))),
  });
}

/** POST /api/v1/camp/assess — { trackKey, moduleKey, answers: { [questionKey]: optionIndex } } → graded, stored, status recomputed. */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  { const paywalled = await requirePaidFacilitator(userId); if (paywalled) return paywalled; }
  let body: { trackKey?: string; moduleKey?: string; answers?: Record<string, unknown> };
  try { body = await req.json(); } catch { return bad('invalid_json'); }
  const trackKey = String(body.trackKey ?? ''), moduleKey = String(body.moduleKey ?? '');
  const track = CURRICULUM.tracks.find((t) => t.key === trackKey);
  const mod = track?.modules.find((m) => m.key === moduleKey);
  if (!mod) return bad('unknown_module', 404);
  const answers: Record<string, number> = {};
  for (const [k, v] of Object.entries(body.answers ?? {})) if (typeof v === 'number' && Number.isInteger(v)) answers[k] = v;
  const graded = gradeModule(trackKey, moduleKey, answers);
  await prisma.credential.create({
    data: { userId, trackKey, moduleKey, curriculumVersion: CURRICULUM_VERSION, score: graded.score, passed: graded.passed, answers: graded.graded as object },
  });
  const cert = await recomputeCertification(userId);
  return NextResponse.json({ score: graded.score, passed: graded.passed, graded: graded.graded, status: cert.status, missingModules: cert.missingModules });
}
