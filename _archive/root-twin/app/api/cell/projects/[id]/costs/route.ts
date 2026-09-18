import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cell/projects/[id]/costs
 *
 * Cost + token breakdown for a project drawn from CellUsage rows:
 *   - cumulative project total (tokens, $, calls, escalations)
 *   - per-build rollups (most recent first)
 *   - per-lane breakdown for the most recent build
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const project = await prisma.cellProject.findFirst({ where: { id: params.id, userId } });
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const rows = await prisma.cellUsage.findMany({
    where: { projectId: params.id },
    orderBy: { createdAt: 'asc' },
  });

  let inTok = 0, outTok = 0, cost = 0, escalations = 0;
  const buildMap = new Map<string, {
    buildId: string; at: Date; inTok: number; outTok: number; costUsd: number;
    calls: number; escalations: number;
  }>();

  for (const r of rows) {
    inTok += r.inputTokens; outTok += r.outputTokens; cost += r.costUsd;
    if (r.escalated) escalations++;
    const b = buildMap.get(r.buildId) ?? {
      buildId: r.buildId, at: r.createdAt, inTok: 0, outTok: 0, costUsd: 0, calls: 0, escalations: 0,
    };
    b.inTok += r.inputTokens; b.outTok += r.outputTokens; b.costUsd += r.costUsd;
    b.calls++; if (r.escalated) b.escalations++;
    b.at = r.createdAt;
    buildMap.set(r.buildId, b);
  }

  const builds = Array.from(buildMap.values()).sort((a, b) => +b.at - +a.at);
  const latest = builds[0];

  const latestLanes = latest
    ? rows
        .filter((r) => r.buildId === latest.buildId)
        .map((r) => ({
          laneId: r.laneId,
          laneTitle: r.laneTitle,
          role: r.role,
          provider: r.provider,
          model: r.model,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          costUsd: r.costUsd,
          escalated: r.escalated,
          at: r.createdAt,
        }))
    : [];

  return NextResponse.json({
    total: { inputTokens: inTok, outputTokens: outTok, costUsd: cost, calls: rows.length, escalations },
    builds,
    latestBuildId: latest?.buildId ?? null,
    latestLanes,
  });
}
