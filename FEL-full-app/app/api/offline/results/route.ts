export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { rateLimit } from '@/lib/rate-limit';
import type { RawDb } from '@/lib/coach/pendingSchema';
import { OFFLINE_RESULTS_PER_HOUR, RUN_KEY_HEADER, parseOfflineResult, recordOfflinePlay } from '@/lib/pwa/offlineResults';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/**
 * POST /api/offline/results — one single-player run played with no signal, sent by the phone when the signal is back
 * (lib/offline-cache.ts, header x-client-result-id = the device's id for the run). Offline-push, round 8.
 *
 * PRACTICE, NEVER PAID: it is recorded in the player's history (OfflinePlay) and nothing else — lib/pwa/offlineResults.ts
 * says why. Answers: 200 { ok, recorded } (recorded false = this run was already in); 400 a run that is not acceptable
 * (dropped by the phone); 401 signed out and 429 too many (kept, re-sent later); 503 not_ready before the pending SQL is
 * applied (kept, without using up a try).
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  if (!rateLimit(`offline-results:${userId}`, OFFLINE_RESULTS_PER_HOUR, 60 * 60 * 1000).ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: NO_STORE });
  }
  let body: unknown;
  try { body = await req.json(); } catch { return bad('invalid_json'); }
  const parsed = parseOfflineResult(body, req.headers.get(RUN_KEY_HEADER));
  if (!parsed.ok) return bad(parsed.error);
  const r = await recordOfflinePlay(prisma as unknown as RawDb, userId, parsed.value);
  if (r.status === 'not_ready') return NextResponse.json({ error: 'not_ready' }, { status: 503, headers: NO_STORE });
  if (r.status === 'failed') return NextResponse.json({ error: 'failed' }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ ok: true, recorded: r.status === 'recorded', paid: false }, { headers: NO_STORE });
}
