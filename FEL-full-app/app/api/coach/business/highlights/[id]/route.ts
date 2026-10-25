// COACH-BUSINESS: a result highlight, as its CLIENT sees it.
//   GET  → the text and its state, for the client it is about (anyone else: 404).
//   POST { action: 'approve' | 'withdraw' } → approve shows it (text only, no name) on the coach's public page; withdraw
//        hides it at once. The coach may withdraw too. Approving needs a verified adult: a minor's result is never public.
import { rateLimit } from '@/lib/rate-limit';
import { highlightById, consentHighlight, revokeHighlight } from '@/lib/coach-business/store';
import { bad, isVerifiedAdultUser, json, notReady, rawDb, readJson, sessionUserId } from '@/lib/coach-business/server';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const userId = await sessionUserId();
  if (!userId) return bad('unauthorized', 401);
  const db = rawDb();
  const off = await notReady(db);
  if (off) return off;
  const h = await highlightById(db, String(params?.id ?? ''));
  if (!h || h.clientId !== userId) return bad('not_found', 404);
  return json({ id: h.id, text: h.text, state: h.revokedAt ? 'withdrawn' : h.consentAt ? 'approved' : 'waiting' });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = await sessionUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`coach-business:hl-answer:${userId}`, 30, 60_000).ok) return bad('rate_limited', 429);
  const db = rawDb();
  const off = await notReady(db);
  if (off) return off;
  const id = String(params?.id ?? '');
  const body = (await readJson(req)) as { action?: unknown } | undefined;
  const h = await highlightById(db, id);
  if (!h || (h.clientId !== userId && h.coachId !== userId)) return bad('not_found', 404);
  if (body?.action === 'withdraw') {
    await revokeHighlight(db, id, userId);
    return json({ ok: true, state: 'withdrawn' });
  }
  if (body?.action !== 'approve' || h.clientId !== userId) return bad('invalid_action');
  if (!(await isVerifiedAdultUser(userId))) return bad('adults_only', 403, { message: 'Only adults can share a result publicly.' });
  await consentHighlight(db, id, userId);
  return json({ ok: true, state: 'approved' });
}
