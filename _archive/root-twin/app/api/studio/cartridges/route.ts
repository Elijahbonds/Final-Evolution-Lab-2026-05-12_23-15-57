export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isStudioCreatorEnabled, FEATURE_DISABLED } from '@/lib/flags';
import { resolveStudioTier, validateCartridgeManifest } from '@/lib/studio-service';

/**
 * GET /api/studio/cartridges
 *   ?mine=1 -> the caller's own cartridge listings (any status)
 *   default -> active published cartridges (public surface)
 */
export async function GET(req: NextRequest) {
  if (!isStudioCreatorEnabled()) return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  const mine = new URL(req.url).searchParams.get('mine') === '1';

  if (mine) {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const rows = await prisma.marketplaceListing.findMany({
      where: { creatorId: userId, listingType: 'CARTRIDGE' },
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json({ cartridges: rows.map(shape) });
  }

  const rows = await prisma.marketplaceListing.findMany({
    where: { listingType: 'CARTRIDGE', active: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return NextResponse.json({ cartridges: rows.map(shape) });
}

/**
 * POST /api/studio/cartridges
 * Publish a cartridge listing. Requires a Creator (or BYO) tier — FREE cannot publish.
 * Body: { title, description?, priceUsdCents, itemKey, sourceProjectId?, manifest }
 */
export async function POST(req: NextRequest) {
  if (!isStudioCreatorEnabled()) return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tier = await resolveStudioTier(userId);
  if (tier === 'FREE') {
    return NextResponse.json({ error: 'creator_required', message: 'A Creator subscription is required to publish cartridges.' }, { status: 402 });
  }

  const body = await req.json().catch(() => ({}));
  const title = String(body?.title ?? '').trim();
  const itemKey = String(body?.itemKey ?? '').trim();
  const priceUsd = Math.max(0, Math.round(Number(body?.priceUsdCents) || 0));
  const sourceProjectId = body?.sourceProjectId ? String(body.sourceProjectId) : null;

  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
  if (!itemKey) return NextResponse.json({ error: 'itemKey required' }, { status: 400 });

  const check = validateCartridgeManifest(body?.manifest);
  if (!check.ok) {
    return NextResponse.json({ error: 'invalid_manifest', details: check.errors }, { status: 400 });
  }

  // If a source project is given, it must belong to the caller.
  if (sourceProjectId) {
    const proj = await prisma.cellProject.findFirst({ where: { id: sourceProjectId, userId }, select: { id: true } });
    if (!proj) return NextResponse.json({ error: 'source project not found' }, { status: 404 });
  }

  const existing = await prisma.marketplaceListing.findUnique({ where: { itemKey } });
  if (existing) {
    if (existing.creatorId !== userId) {
      return NextResponse.json({ error: 'itemKey already taken' }, { status: 409 });
    }
    const updated = await prisma.marketplaceListing.update({
      where: { itemKey },
      data: {
        title,
        description: body?.description ? String(body.description) : null,
        priceUsd,
        listingType: 'CARTRIDGE',
        version: check.manifest!.version,
        manifest: JSON.stringify(check.manifest),
        sourceProjectId,
        active: true,
      },
    });
    return NextResponse.json({ cartridge: shape(updated), updated: true });
  }

  const created = await prisma.marketplaceListing.create({
    data: {
      creatorId: userId,
      title,
      description: body?.description ? String(body.description) : null,
      itemKey,
      priceUsd,
      listingType: 'CARTRIDGE',
      version: check.manifest!.version,
      manifest: JSON.stringify(check.manifest),
      sourceProjectId,
      active: true,
    },
  });
  return NextResponse.json({ cartridge: shape(created), created: true });
}

function shape(l: any) {
  let manifest: any = null;
  try { manifest = l.manifest ? JSON.parse(l.manifest) : null; } catch { manifest = null; }
  return {
    id: l.id,
    creatorId: l.creatorId,
    title: l.title,
    description: l.description,
    itemKey: l.itemKey,
    priceUsdCents: l.priceUsd,
    version: l.version,
    active: l.active,
    sourceProjectId: l.sourceProjectId,
    manifest,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}
