import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { runBuild } from '@/lib/cell-build';
import { extractWisdom, type BuildPlan } from '@/lib/cell-engine';
import { isStudioCreatorEnabled } from '@/lib/flags';
import { checkBuildAllowed, settleBuildOverage } from '@/lib/studio-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/cell/compile  { projectId }
 *
 * Executes the stored BuildPlan as a MULTI-FILE build:
 *   - builder lanes emit file operations against the project file tree
 *   - critic pass emits targeted file fixes on the assembled bundle
 *   - the file tree is bundled into one runnable HTML for preview
 * Lane statuses and project.status persist incrementally for live polling.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const projectId = String(body?.projectId ?? '');
    const force = Boolean(body?.force);
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

    const project = await prisma.cellProject.findFirst({ where: { id: projectId, userId } });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    let plan: BuildPlan | null = null;
    try {
      plan = JSON.parse(project.buildPlan || '');
    } catch {
      plan = null;
    }
    if (!plan || !Array.isArray(plan.lanes) || plan.lanes.length === 0) {
      return NextResponse.json({ error: 'No valid build plan to execute' }, { status: 400 });
    }

    // M3 Track C: Studio Creator quota / budget gate (only when the flag is ON).
    let priorMeteredUsdCents = 0;
    if (isStudioCreatorEnabled()) {
      const gate = await checkBuildAllowed(userId);
      if (!gate.allowed) {
        const status = gate.reason === 'build_quota_exceeded' ? 429 : 402;
        return NextResponse.json(
          { error: 'studio_gate', reason: gate.reason, detail: gate.detail, tier: gate.tier, usage: gate.usage, creditBalance: gate.creditBalance },
          { status }
        );
      }
      priorMeteredUsdCents = gate.usage.meteredUsdCents;
    }

    const result = await runBuild(projectId, { userId, force });

    // M3 Track C: draw prepaid overage credits for spend beyond the included budget.
    let overageChargedCredits = 0;
    if (isStudioCreatorEnabled() && result.spentUsd > 0) {
      try {
        const buildUsdCents = Math.round(result.spentUsd * 100);
        const settled = await settleBuildOverage(userId, {
          priorMeteredUsdCents,
          buildUsdCents,
          buildId: result.buildId,
        });
        overageChargedCredits = settled.chargedCredits;
      } catch (e) {
        console.error('[cell/compile] overage settle failed', e);
      }
    }

    try {
      const wisdoms = extractWisdom({ plan, success: result.success });
      for (const w of wisdoms) {
        await prisma.cellWisdom.create({
          data: { projectId, category: w.category, insight: w.insight, score: result.success ? 1 : 0 },
        });
      }
    } catch {}

    return NextResponse.json({
      ok: true,
      status: result.success ? 'ready' : (result.budgetHit ? 'needs-attention' : 'failed'),
      fileCount: result.fileCount,
      buildId: result.buildId,
      spentUsd: result.spentUsd,
      escalations: result.escalations,
      budgetHit: result.budgetHit,
      ranLanes: result.ranLanes,
      cachedLanes: result.cachedLanes,
      overageChargedCredits,
    });
  } catch (e) {
    console.error('[cell/compile] error', e);
    return NextResponse.json({ error: 'Build failed' }, { status: 500 });
  }
}
