import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import {
  AI_CHAT_ADULTS_ONLY, AI_SHARE_COPY, aiChatAccess, grantAiShare, revokeAiShare, type AiAccessDb,
} from '@/lib/coach/aiChatAccess';

export const dynamic = 'force-dynamic';

// COACH-AI Phase 8 (2026-10-07): the AI coach's sharing consent (lib/coach/aiChatAccess.ts).
//   GET  → { adult, consented, copy } for the signed-in account.
//   POST { action: 'grant' }  → verified adults only (403 ai_coach_adults_only otherwise); idempotent.
//   POST { action: 'revoke' } → anyone, always (taking your data back needs no age).
// It sends nothing to an AI provider, so it does not sit behind abacusEnabled(): a withdrawal must work while the AI
// coach is off too. The coach chat route re-checks both conditions itself on every request.

async function userIdOf(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: unknown } | undefined)?.id;
  return typeof id === 'string' && id ? id : null;
}

export async function GET() {
  const userId = await userIdOf();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const a = await aiChatAccess(prisma as unknown as AiAccessDb, userId);
  return NextResponse.json({ adult: a.adult, consented: a.consented, copy: AI_SHARE_COPY });
}

export async function POST(req: Request) {
  const userId = await userIdOf();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!rateLimit(`coach-chat-consent:${userId}`, 20, 60_000).ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  const db = prisma as unknown as AiAccessDb;
  try {
    if (body?.action === 'revoke') {
      await revokeAiShare(db, userId);
      return NextResponse.json({ consented: false });
    }
    if (body?.action !== 'grant') return NextResponse.json({ error: 'bad_action' }, { status: 400 });
    const a = await aiChatAccess(db, userId);
    if (!a.adult) return NextResponse.json({ ...AI_CHAT_ADULTS_ONLY }, { status: 403 });
    await grantAiShare(db, userId);
    return NextResponse.json({ consented: true });
  } catch (e) {
    console.error('coach chat consent error', e instanceof Error ? e.name : typeof e);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
