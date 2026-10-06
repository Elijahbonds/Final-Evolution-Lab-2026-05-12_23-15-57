export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { reviewCard, getCard, CardError } from '@/lib/creator/creative-card-service';
import { canApprove, canFlag, cleanMoods, cleanNote, roleOf, FLAGS_MAX, type FlagRecord, type SoundtrackRecord } from '@/lib/creator/creative-card-review';
import { promoteCardMedia, UploadsComingSoon } from '@/lib/soundtrack/storage';

/**
 * POST /api/v1/creative-card/[id]/review
 *   { decision: 'approved' | 'rejected', note?, rotation?: 'on' | 'featured', moods?: string[] }   founder/admin
 *   { decision: 'flag', note? }                                                                    founder/admin/mod
 *
 * CREATOR SOUNDTRACK phase 0 (owner, 2026-10-06: "approvers = founder + admin (mods flag only)"). This route let a mod
 * approve. Now a mod may only FLAG (stats.flags, shown at the top of the review queue). Approving:
 *  - copies the card's pending uploads into the public bucket first (stats.publicMedia); if that copy fails the card is
 *    NOT approved, so an approved card never points at audio nobody can hear.
 *  - goes through reviewCard, which honours the creator's own public/private choice and the teen rule, records the note,
 *    and pays the capped one-time coin.
 *  - for a music card, `rotation` puts the track into the soundtrack ('featured' plays more often). Pulling it out again
 *    is POST /api/v1/creative-card/[id]/rotation.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const role = await roleOf(prisma, userId);
  if (!canFlag(role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let body: { decision?: unknown; note?: unknown; rotation?: unknown; moods?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
  const decision = body?.decision;
  if (decision !== 'approved' && decision !== 'rejected' && decision !== 'flag') {
    return NextResponse.json({ error: 'decision must be approved|rejected|flag' }, { status: 422 });
  }
  if (decision !== 'flag' && !canApprove(role)) {
    return NextResponse.json({ error: 'forbidden: only the founder or an admin approves; mods may flag' }, { status: 403 });
  }

  try {
    const card = await getCard(prisma, params.id);
    if (!card) return NextResponse.json({ error: 'no card' }, { status: 404 });
    const now = new Date();
    const stats = { ...(card.stats as unknown as Record<string, unknown>) };

    if (decision === 'flag') {
      const flags = Array.isArray(stats.flags) ? (stats.flags as FlagRecord[]) : [];
      const note = cleanNote(body.note);
      const next: FlagRecord[] = [...flags, { by: userId, at: now.toISOString(), ...(note ? { note } : {}) }].slice(-FLAGS_MAX);
      await prisma.creativeCard.update({ where: { id: card.id }, data: { stats: { ...stats, flags: next } as never } });
      return NextResponse.json({ ok: true, flags: next.length });
    }

    if (decision === 'approved') {
      let publicMedia: Record<string, string>;
      try {
        publicMedia = await promoteCardMedia(card.art);
      } catch (e) {
        if (e instanceof UploadsComingSoon) return NextResponse.json({ error: 'storage is not set up: the card stays pending' }, { status: 503 });
        throw e;
      }
      const rotation = body.rotation === 'on' || body.rotation === 'featured' ? body.rotation : null;
      const soundtrack: SoundtrackRecord | undefined = card.primary === 'music' && rotation
        ? { rotation, by: userId, at: now.toISOString(), ...(cleanMoods(body.moods) ? { moods: cleanMoods(body.moods) } : {}) }
        : undefined;
      if (Object.keys(publicMedia).length || soundtrack) {
        const prior = (stats.publicMedia ?? {}) as Record<string, string>;
        await prisma.creativeCard.update({
          where: { id: card.id },
          data: { stats: { ...stats, publicMedia: { ...prior, ...publicMedia }, ...(soundtrack ? { soundtrack } : {}) } as never },
        });
      }
    }

    return NextResponse.json(await reviewCard(prisma, params.id, decision, { by: userId, note: body.note as string | undefined, now }));
  } catch (e) {
    if (e instanceof CardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[FEL-CREATIVE] reviewCard failed', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
