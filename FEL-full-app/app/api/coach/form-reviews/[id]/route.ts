export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { deleteFormReview, formReviewDetail, type FormReviewDb } from '@/lib/coach/formReview/server';

const db = () => prisma as unknown as FormReviewDb;

/** GET /api/coach/form-reviews/[id] — one sent set with its keypoint tracks, for its coach (live roster) or its client. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await formReviewDetail(db(), userId, String(params.id ?? ''));
  return NextResponse.json(r.body, { status: r.status });
}

/** DELETE /api/coach/form-reviews/[id] — the client deletes a set they sent. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await deleteFormReview(db(), userId, String(params.id ?? ''));
  return NextResponse.json(r.body, { status: r.status });
}
