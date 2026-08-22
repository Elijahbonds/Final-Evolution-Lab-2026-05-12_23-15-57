/**
 * GET /api/drills/[drillId] — server-authoritative drill unlock gate.
 *
 * Returns 200 with the launch descriptor ONLY if the user owns a DrillCard
 * that grants this drill (checked via the ONE entitlements service). Otherwise
 * 403 with the catalog card that would unlock it (so the client can show a
 * buy CTA). A client cannot launch a drill it hasn't paid for.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ownsDrill, cardForDrill } from '@/lib/entitlements';
import type { HeroMode } from '@/lib/card-catalog';

export const dynamic = 'force-dynamic';

// Hero mode → the existing play route it launches into.
const HERO_HREF: Record<HeroMode, string> = {
  dunking: '/play/dunk',
  karate: '/play/karate',
};

export async function GET(_req: Request, { params }: { params: { drillId: string } }) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const drillId = String(params?.drillId ?? '');
    const card = cardForDrill(drillId);
    if (!card) return NextResponse.json({ error: 'Unknown drill' }, { status: 404 });

    const owned = await ownsDrill(prisma, userId, drillId);
    if (!owned) {
      return NextResponse.json(
        { error: 'locked', unlockCardId: card.id, costLC: card.costLC },
        { status: 403 }
      );
    }

    const base = HERO_HREF[card.heroMode];
    return NextResponse.json({
      ok: true,
      drillId,
      title: card.title,
      heroMode: card.heroMode,
      launchHref: `${base}?drill=${encodeURIComponent(drillId)}`,
    });
  } catch (e) {
    console.error('drills gate error', e);
    return NextResponse.json({ error: 'Failed to resolve drill' }, { status: 500 });
  }
}
