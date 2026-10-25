// COACH-BUSINESS: POST { clientId, text } — the coach asks a client on their live roster to approve a result for the
// public page. Nothing shows until the CLIENT approves that exact text as a verified adult (highlights/[id]).
import { prisma } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { HIGHLIGHT_MAX } from '@/lib/coach-business/profile';
import { insertHighlight } from '@/lib/coach-business/store';
import { bad, json, notReady, rawDb, readJson, currentUserId } from '@/lib/coach-business/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`coach-business:hl:${userId}`, 20, 60_000).ok) return bad('rate_limited', 429);
  const db = rawDb();
  const off = await notReady(db);
  if (off) return off;
  const body = (await readJson(req)) as { clientId?: unknown; text?: unknown } | undefined;
  const clientId = typeof body?.clientId === 'string' ? body.clientId : '';
  const text = typeof body?.text === 'string' ? body.text.replace(/\s+/g, ' ').trim() : '';
  if (!clientId || text.length < 10 || text.length > HIGHLIGHT_MAX) return bad('invalid_body');
  const link = await prisma.coachClient.findUnique({ where: { coachId_clientId: { coachId: userId, clientId } }, select: { endedAt: true } });
  if (!link || link.endedAt) return bad('not_your_client', 404);
  const id = await insertHighlight(db, userId, clientId, text);
  return json({ ok: true, id, approveUrl: `/coach/highlight/${id}` }, 201);
}
