export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { defaultFace, defaultEquipped, defaultJersey, sanitizeJersey, sanitizeFaceSliders, type FaceConfig } from '@/lib/closet/wearable-catalog';
import { filterEquipped } from '@/lib/closet/ownership';
import { readDobYear } from '@/lib/privacy/scanSaveGate';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';
import { decideLookHold, holdEquipped, holdFace, holdJersey, payloadHasImage, privacyRecord } from '@/lib/creator/lookPrivacy';

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
  const cards = await prisma.creatorCard.findMany({ where: { ownerId: userId }, select: { id: true, displayName: true, accent: true, rarity: true, mode: true } });   // PLAYER RING (2026-09-17): `mode` = the card's signature mode → the indicator's glyph
  return NextResponse.json({ look, owned: owned.map((o) => o.itemId), skins: cards });
}

/** POST /api/v1/closet — save face + equipped + optional creator-card skin. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  // Pictures never land in the row. A data URL, a remote image, or an image field refuses the save.
  if (payloadHasImage(body)) return NextResponse.json({ error: 'images_not_stored', saved: false }, { status: 400 });
  const adult = verifiedAdult(await readDobYear(prisma, userId, 'look_hold'));
  const hold = decideLookHold(adult, body?.saveLookNumbers === true, body?.modelTraining === true);
  const posted: FaceConfig = { ...defaultFace(), ...(body?.face ?? {}) };
  const sliders = sanitizeFaceSliders(body?.face?.sliders);
  if (sliders) posted.sliders = sliders; else delete posted.sliders;
  // Under 18 the written face is the catalog default. Adults without the numbers opt-in keep presets, not sliders.
  const face = holdFace(posted, hold);
  const equipped = body?.equipped ?? defaultEquipped();

  // Only equip owned wearables (server-side ownership check). The rule — owned OR one of the free
  // starters, and unowned resolves to EMPTY rather than a substitute — now lives in one module, because
  // it was written out here, again in components/closet-view.tsx, and the creator was about to be the
  // third copy. Same behaviour, one owner. A minor's worn set is the catalog default; their inventory
  // (ownedWearable) is not touched by this route.
  const owned = new Set((await prisma.ownedWearable.findMany({ where: { userId } })).map((o) => o.itemId));
  const cleanEquipped = holdEquipped(
    hold.uploadLook ? filterEquipped(equipped as Record<string, string | null>, owned) : equipped,
    hold,
  );

  // Creator-card skin: verify ownership before applying. Minors do not upload a skin choice.
  let skinCardId: string | null = null;
  if (hold.uploadLook && typeof body?.skinCardId === 'string' && body.skinCardId) {
    const owns = await prisma.creatorCard.findFirst({ where: { id: body.skinCardId, ownerId: userId } });
    if (owns) skinCardId = owns.id;
  }

  // A minor's plate is the blank default, written over any previous name, so the row cannot keep it.
  const jersey = hold.uploadLook
    ? (body?.jersey === undefined ? undefined : sanitizeJersey(body.jersey))
    : defaultJersey();

  const look = await prisma.avatarLook.upsert({
    where: { userId },
    update: { face: face as any, equipped: cleanEquipped as any, skinCardId, ...(jersey ? { jersey: jersey as any } : {}) },
    create: { userId, face: face as any, equipped: cleanEquipped as any, skinCardId, ...(jersey ? { jersey: jersey as any } : {}) },
  });
  return NextResponse.json({ look, privacy: privacyRecord(hold), lookLocal: !hold.uploadFace });
}
