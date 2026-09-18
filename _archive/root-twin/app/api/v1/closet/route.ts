export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { defaultFace, defaultEquipped, type FaceConfig } from '@/lib/closet/wearable-catalog';

/** GET /api/v1/closet — current look + owned wearables + applied card skin. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let look = await prisma.avatarLook.findUnique({ where: { userId } });
  if (!look) {
    look = await prisma.avatarLook.create({ data: { userId, face: defaultFace() as any, equipped: defaultEquipped() as any } });
  }
  const owned = await prisma.ownedWearable.findMany({ where: { userId } });
  const cards = await prisma.creatorCard.findMany({ where: { ownerId: userId }, select: { id: true, displayName: true, accent: true, rarity: true } });
  return NextResponse.json({ look, owned: owned.map((o) => o.itemId), skins: cards });
}

/** POST /api/v1/closet — save face + equipped + optional creator-card skin. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const face: FaceConfig = { ...defaultFace(), ...(body?.face ?? {}) };
  const equipped = body?.equipped ?? defaultEquipped();

  // Only equip owned wearables (server-side ownership check).
  const owned = new Set((await prisma.ownedWearable.findMany({ where: { userId } })).map((o) => o.itemId));
  const cleanEquipped: Record<string, string | null> = {};
  for (const [slot, itemId] of Object.entries(equipped)) {
    cleanEquipped[slot] = itemId && (owned.has(itemId as string) || ['top_lab', 'shorts_court', 'shoes_flight'].includes(itemId as string)) ? (itemId as string) : (itemId == null ? null : cleanEquipped[slot] ?? null);
  }

  // Creator-card skin: verify ownership before applying.
  let skinCardId: string | null = null;
  if (typeof body?.skinCardId === 'string' && body.skinCardId) {
    const owns = await prisma.creatorCard.findFirst({ where: { id: body.skinCardId, ownerId: userId } });
    if (owns) skinCardId = owns.id;
  }

  const look = await prisma.avatarLook.upsert({
    where: { userId },
    update: { face: face as any, equipped: cleanEquipped as any, skinCardId },
    create: { userId, face: face as any, equipped: cleanEquipped as any, skinCardId },
  });
  return NextResponse.json({ look });
}
