export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { grantServerReward } from '@/lib/wallet/wallet-service';
import { REASON } from '@/lib/wallet/reward-rules';
import {
  CHAPTERS, chapterByNumber, isChapterComplete, lessonId,
} from '@/lib/education/course';

/**
 * The Playbook course's progress, and what finishing a chapter pays.
 *
 * Progress reuses LessonProgress (trackKey + lessonKey, uniquely constrained per user) rather than inventing a
 * table — the model already existed and already means this. trackKey is 'playbook' so the movement course and
 * the older game-mechanics tracks share one store without colliding.
 *
 * THE PAYOUT IS THE SERVER'S. A client saying "I finished chapter 6" is a claim, not a fact: the route
 * recomputes completion from the rows it just wrote, and the shard grant is keyed so a replay cannot mint a
 * second one. Nothing about the amount is taken from the request.
 */

const TRACK = 'playbook';

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rows = await prisma.lessonProgress.findMany({
    where: { userId, trackKey: TRACK },
    select: { lessonKey: true },
  }).catch(() => []);

  return NextResponse.json({ done: rows.map((r) => r.lessonKey) });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const chapterNo = Number((body as { chapter?: unknown })?.chapter);
  const lessonKey = String((body as { lesson?: unknown })?.lesson ?? '');

  const chapter = chapterByNumber(chapterNo);
  if (!chapter) return NextResponse.json({ error: 'unknown_chapter' }, { status: 404 });
  // A lesson key is only real if this chapter teaches it. Otherwise any string could become a completed lesson,
  // and enough of them would manufacture a chapter completion and a payout.
  if (!chapter.lessons.some((l) => l.key === lessonKey)) {
    return NextResponse.json({ error: 'unknown_lesson' }, { status: 404 });
  }

  const id = lessonId(chapter.number, lessonKey);
  await prisma.lessonProgress.upsert({
    where: { userId_trackKey_lessonKey: { userId, trackKey: TRACK, lessonKey: id } },
    update: {},
    create: { userId, trackKey: TRACK, lessonKey: id },
  }).catch(() => null);

  // Recomputed from storage, not from what the client believes.
  const rows = await prisma.lessonProgress.findMany({
    where: { userId, trackKey: TRACK }, select: { lessonKey: true },
  }).catch(() => []);
  const done = new Set(rows.map((r) => r.lessonKey));

  const completedChapters = new Set(
    CHAPTERS.filter((c) => isChapterComplete(c, done)).map((c) => c.number),
  );
  const justFinished = isChapterComplete(chapter, done);

  let awarded = 0;
  if (justFinished) {
    // `alreadyPaid` excludes this chapter so the amount is computed as a first payment; the wallet's key is what
    // actually makes it once-only, which is why the key names the chapter.
    // THE AMOUNT IS NOT PASSED. grantServerReward prices the grant from the EDU_CHAPTER_COMPLETE rule, so the
    // request cannot influence it at all; the key names the chapter, so a replay returns the original entry
    // instead of minting a second payout.
    const res = await grantServerReward(prisma, {
      playerId: userId,
      reasonCode: REASON.EDU_CHAPTER_COMPLETE,
      idempotencyKey: `playbook:chapter:${userId}:${chapter.number}`,
      metadata: { track: TRACK, chapter: chapter.number },
    }).catch(() => null);
    awarded = res?.granted.shards ?? 0;
  }

  return NextResponse.json({
    done: [...done],
    chapterComplete: justFinished,
    awarded,
  });
}
