/**
 * POST /api/wallet/equip  { assetId | null }
 *
 * Equip (or unequip with null) an owned AvatarCard cosmetic on the shared
 * avatar rig. Ownership is verified server-side through the ONE entitlements
 * service — a user cannot equip a cosmetic they do not own.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOrCreateProfile } from '@/lib/profile-service';
import { ownsAvatarAsset } from '@/lib/entitlements';
import { getCosmetic } from '@/lib/cosmetics';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const raw = body?.assetId;
    const assetId = raw === null || raw === undefined ? null : String(raw);

    await getOrCreateProfile(userId);

    if (assetId === null) {
      const profile = await prisma.playerProfile.update({
        where: { userId },
        data: { cosmeticAssetId: null },
      });
      return NextResponse.json({ ok: true, cosmeticAssetId: profile.cosmeticAssetId });
    }

    if (!getCosmetic(assetId)) {
      return NextResponse.json({ error: 'Unknown cosmetic' }, { status: 400 });
    }
    if (!(await ownsAvatarAsset(prisma, userId, assetId))) {
      return NextResponse.json({ error: 'You do not own this cosmetic' }, { status: 403 });
    }

    const profile = await prisma.playerProfile.update({
      where: { userId },
      data: { cosmeticAssetId: assetId },
    });
    return NextResponse.json({ ok: true, cosmeticAssetId: profile.cosmeticAssetId });
  } catch (e) {
    console.error('wallet/equip error', e);
    return NextResponse.json({ error: 'Equip failed' }, { status: 500 });
  }
}
