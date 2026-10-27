export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import type { RawDb } from '@/lib/coach-business/store';
import { coachReviews, reviewContext, setReviewStatus, submitReview } from '@/lib/coach-business/reviews';

/**
 * COACH-DELIVERY COA-10 (2026-10-27): client reviews of a coach (lib/coach-business/reviews.ts).
 *   GET  ?slug=<coach page>   may I review this coach (a verified adult whose package with them ended), and my review
 *   GET                       the coach's own reviews, text included, to read and hide/show
 *   POST { action: 'review', slug, stars, text? } | { action: 'hide' | 'show', id }
 * No money moves here. Before prisma/pending/2026-10-26-coach-delivery.sql is applied: { available: false } / 503.
 */
const db = () => prisma as unknown as RawDb;

async function coachIdOf(slug: unknown): Promise<string | null> {
  if (typeof slug !== 'string' || !slug || slug.length > 120) return null;
  const i = await prisma.instructor.findUnique({ where: { slug }, select: { userId: true, published: true } }).catch(() => null);
  return i?.published ? i.userId : null;
}

export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const slug = req.nextUrl.searchParams.get('slug');
  if (slug === null) {
    const r = await coachReviews(db(), userId);
    return NextResponse.json(r.body, { status: r.status });
  }
  const coachId = await coachIdOf(slug);
  if (!coachId) return bad('not_found', 404);
  const r = await reviewContext(db(), userId, coachId);
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (body?.action === 'hide' || body?.action === 'show') {
    const r = await setReviewStatus(db(), userId, body);
    return NextResponse.json(r.body, { status: r.status });
  }
  const coachId = await coachIdOf(body?.slug);
  if (!coachId) return bad('not_found', 404);
  const r = await submitReview(db(), userId, { ...body, coachId });
  return NextResponse.json(r.body, { status: r.status });
}
