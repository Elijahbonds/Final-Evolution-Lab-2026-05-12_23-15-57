export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { recordCooldown } from '@/lib/coach/cooldownServer';

/**
 * POST /api/coach/me/cooldown — the client tapped "done" on Today's automatic cool-down (MIRROR-COACH P6, 2026-09-29).
 *  { programId, sessionId } → { clientSessionId, cooldownDoneAt, already }
 * Stamps ClientSession.cooldownDoneAt on the coached session the cool-down followed (the open one, or the one just
 * completed), so P9's PRQ recovery can count completed cool-downs. Never scored, paid or streaked. The gates (the
 * intake's hard stop first, then the program, the session, and "is this a session Today puts the cool-down on") and
 * the choice of row are lib/coach/cooldownServer.ts recordCooldown.
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  let body: unknown;
  try { body = await req.json(); } catch { return bad('invalid_json'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('invalid_json');
  const r = await recordCooldown(prisma, userId, body as Record<string, unknown>);
  if (!r.ok) return bad(r.error, r.status);
  const { ok: _ok, ...out } = r;
  return NextResponse.json(out);
}
