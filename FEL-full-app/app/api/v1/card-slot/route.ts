export const dynamic = 'force-dynamic';

// /api/v1/card-slot — the start screen's CREATOR CARD slot (FINISH-RELEASE, 2026-09-15; lib/creator/cardSlot.ts).
//
// GET  → { cards, equipped }: the caller's own creator cards, plus cards owned from other creators, and which is on.
// POST { id | null } → equips one (or BASE). Ownership is checked HERE, never trusted from the client.
//
// The equipped card is AvatarLook.skinCardId — the field the identity pipe already paints the hero from
// (playerIdentity.resolveIdentity), so equipping on the start screen and applying a skin in the Closet are the same
// write, and the hero cannot disagree with the slot. This route touches ONLY that field: the Closet's POST rewrites
// face and wardrobe too, and a card pick must not reset a look.
//
// OWNED cards: there is no model yet for holding another creator's card (CardOwnership keys the catalog's drill /
// challenge / avatar cards, not CreatorCard rows). The slot's shape carries `source: 'owned'` so the list grows when
// that lands (post-RC, with the mocap packages) without the screen changing; until then the list is your own cards.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { defaultFace, defaultEquipped } from '@/lib/closet/wearable-catalog';
import { toSlotCards } from '@/lib/creator/cardSlot';

async function uid(): Promise<string | undefined> {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id;
}

export async function GET() {
  const userId = await uid();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const [mine, look] = await Promise.all([
      prisma.creatorCard.findMany({ where: { ownerId: userId }, select: { id: true, displayName: true, accent: true, rarity: true, signatureMove: true }, take: 12 }),
      prisma.avatarLook.findUnique({ where: { userId }, select: { skinCardId: true } }),
    ]);
    const cards = toSlotCards(mine, 'mine');
    const equipped = look?.skinCardId && cards.some((c) => c.id === look.skinCardId) ? look.skinCardId : null;
    return NextResponse.json({ cards, equipped });
  } catch {
    // a start screen must never fail because a profile row could not be read — BASE, no cards
    return NextResponse.json({ cards: [], equipped: null });
  }
}

export async function POST(req: NextRequest) {
  const userId = await uid();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null) as { id?: unknown } | null;
  const id = typeof body?.id === 'string' && body.id ? body.id : null;
  if (id) {
    const owns = await prisma.creatorCard.findFirst({ where: { id, ownerId: userId }, select: { id: true } });
    if (!owns) return NextResponse.json({ error: 'not_owned' }, { status: 403 });
  }
  await prisma.avatarLook.upsert({
    where: { userId },
    update: { skinCardId: id },
    create: { userId, face: defaultFace() as any, equipped: defaultEquipped() as any, skinCardId: id },
  });
  return NextResponse.json({ equipped: id });
}
