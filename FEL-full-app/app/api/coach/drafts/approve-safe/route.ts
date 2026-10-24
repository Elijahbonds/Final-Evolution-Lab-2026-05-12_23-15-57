export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { rateLimit } from '@/lib/rate-limit';
import { approveAllSafe, type ApproveDb } from '@/lib/coach/weeklyDraft/approve';
import { NOTE_MAX_CHARS } from '@/lib/coach/weeklyDraft/thresholds';

/**
 * COACH-AI-DRAFT (2026-10-24): "Approve all safe" — POST { draftId, note? }. Every change in that athlete's draft that the
 * rules class as SAFE (eases, regressions, Prep correctives, check-ins) and is not decided yet, each through the same
 * checks and the same builder path as one approval; a REVIEW change (anything that moves the athlete up) is never in it.
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`coach-drafts:safe:${userId}`, 20, 60_000).ok) return bad('rate_limited', 429);
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return bad('invalid_json'); }
  if (!body || typeof body !== 'object' || Object.keys(body).some((k) => k !== 'draftId' && k !== 'note')) return bad('unexpected_field');
  const draftId = typeof body.draftId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.draftId) ? body.draftId : null;
  if (!draftId) return bad('draft_required');
  if (body.note != null && typeof body.note !== 'string') return bad('bad_note');
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, NOTE_MAX_CHARS) || null : null;
  const r = await approveAllSafe(prisma as unknown as ApproveDb, userId, draftId, note);
  if (!r.ok) return bad(r.error, r.status);
  return NextResponse.json(r.result);
}
