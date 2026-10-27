// COACH-DELIVERY COA-12 (2026-10-27): POST { packageId, scope: 'roster' | 'team' | 'athlete', scopeId? } — send a team fee
// (a 'team_fee' package) into the program thread of each ADULT athlete it reaches. lib/coach-business/teamFee.ts.
// Payments off → 409 store_closed payments_off, nothing sent.
import { prisma } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { connectGate, paymentsClosed } from '@/lib/coach-business/connect';
import { sendTeamFee, type TeamFeeDeps } from '@/lib/coach-business/teamFee';
import { bad, json, liveDeps, readJson, currentUserId } from '@/lib/coach-business/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const gate = connectGate();
  if (!gate.ok) return paymentsClosed(gate.reason);
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`coach-business:team-fee:${userId}`, 5, 60_000).ok) return bad('rate_limited', 429);
  const d = liveDeps();
  const r = await sendTeamFee({ db: prisma as unknown as TeamFeeDeps['db'], env: d.env, now: d.now, coachSlug: d.coachSlug }, userId, await readJson(req));
  if (!r.ok) return r.error === 'store_closed' && r.reason ? paymentsClosed(r.reason as never) : bad(r.error, r.status);
  return json(r);
}
