// COACH-BUSINESS: POST { slug, goal, note?, packageId? } — an adult applies to a coach from the coach's page or /coaches.
// Under 18 or age unknown: 403 guardian_required, nothing stored (lib/coach-business/service.ts applyToCoach).
import { rateLimit } from '@/lib/rate-limit';
import { applyToCoach } from '@/lib/coach-business/service';
import { bad, json, liveDeps, readJson, currentUserId } from '@/lib/coach-business/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`coach-business:apply:${userId}`, 10, 60 * 60_000).ok) return bad('rate_limited', 429);
  const r = await applyToCoach(liveDeps(), userId, await readJson(req));
  return r.ok ? json({ ok: true }) : bad(r.error, r.status, r.message ? { message: r.message } : undefined);
}
