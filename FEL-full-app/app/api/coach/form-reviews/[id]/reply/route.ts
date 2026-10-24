export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { replyToFormReview, type FormReviewDb } from '@/lib/coach/formReview/server';

/**
 * POST /api/coach/form-reviews/[id]/reply — { cueId?, note?, rep?, markOnly? }: the coach's preset cue and short note,
 * posted to the program's thread, and the set marked reviewed (markOnly: reviewed with no message).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  let body: unknown;
  try { body = await req.json(); } catch { return bad('invalid_json'); }
  const r = await replyToFormReview(prisma as unknown as FormReviewDb, userId, String(params.id ?? ''), body);
  return NextResponse.json(r.body, { status: r.status });
}
