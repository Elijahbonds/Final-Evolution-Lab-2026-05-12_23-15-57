// COACH-BUSINESS (2026-10-25): the coach's own business — GET the dashboard, PUT the public profile and marketplace opt-in.
// A coach's public profile is for verified adults only (a minor never gets a public, indexed page).
import { rateLimit } from '@/lib/rate-limit';
import { loadDashboard, saveProfile } from '@/lib/coach-business/dashboard';
import { bad, isVerifiedAdultUser, json, rawDb, readJson, sessionUserId } from '@/lib/coach-business/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const userId = await sessionUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`coach-business:get:${userId}`, 60, 60_000).ok) return bad('rate_limited', 429);
  return json(await loadDashboard(rawDb(), userId));
}

export async function PUT(req: Request) {
  const userId = await sessionUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`coach-business:put:${userId}`, 20, 60_000).ok) return bad('rate_limited', 429);
  if (!(await isVerifiedAdultUser(userId))) return bad('adults_only', 403, { message: 'Coach profiles are for verified adults (18+).' });
  const r = await saveProfile(rawDb(), userId, await readJson(req));
  return r.ok ? json({ ok: true, slug: r.slug }) : bad(r.error, r.status);
}
