export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { coachQueue, mySets, submitFormReview, type FormReviewDb } from '@/lib/coach/formReview/server';
import { MAX_SUBMISSION_BYTES } from '@/lib/coach/formReview/payload';
import { canSaveScanNumbers } from '@/lib/privacy/scanSaveGate';

const db = () => prisma as unknown as FormReviewDb;

/**
 * GET /api/coach/form-reviews — the signed-in coach's review queue (unreviewed first, flagged first; each item's flags,
 * score and trend). ?mine=1 — the signed-in client's own sent sets instead. COACH-VIDEO-REVIEW (lib/coach/formReview).
 */
export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = req.nextUrl.searchParams.get('mine') === '1' ? await mySets(db(), userId) : await coachQueue(db(), userId);
  return NextResponse.json(r.body, { status: r.status });
}

/**
 * POST /api/coach/form-reviews — a recorded set, POSE DATA ONLY (lib/coach/formReview/payload.ts refuses anything else).
 * A movement-data save: GAP 1 row 1k (lib/privacy/scanSaveGate.ts). An adult needs canSaveScanNumbers (verified 18+ AND
 * the AB-04 opt-in); every other gate is lib/coach/formReview/gate.ts's.
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const text = await req.text().catch(() => '');
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > MAX_SUBMISSION_BYTES) return bad('too_large', 413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return bad('invalid_json'); }
  const canSave = await canSaveScanNumbers(prisma, userId);
  const r = await submitFormReview(db(), userId, body, bytes, canSave);
  return NextResponse.json(r.body, { status: r.status });
}
