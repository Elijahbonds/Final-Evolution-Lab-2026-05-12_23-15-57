import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { abacusAvailable } from '@/lib/abacus/killSwitch';
import { callCoachLLM } from '@/lib/coach-service';
import { MAX_QUESTION_CHARS } from '@/lib/library/ask/parse';
import { askLibrary, libraryViewer } from '@/lib/library/server';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/library/ask  { q, drafts? }
 *
 * EXERCISE-LIBRARY (2026-10-25), owner: "Make sure people can search for what they need, ask ai." The deterministic
 * reading (lib/library/ask) always answers; the AI layer joins only while the Abacus switch is on (off by default,
 * lib/abacus/killSwitch.ts) and the account is inside its AI allowance, and it can only reorder real entries by id.
 * Pain and injury questions never reach the AI. Rate-limited per account (lib/rate-limit): 20 questions a minute, of
 * which 6 may use the AI.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;
    const gate = rateLimit(`library-ask:${userId}`, 20, 60_000);
    if (!gate.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(gate.retryAfterSec) } });
    let body: { q?: unknown; drafts?: unknown };
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
    const q = typeof body?.q === 'string' ? body.q.trim().slice(0, MAX_QUESTION_CHARS) : '';
    if (!q) return NextResponse.json({ error: 'question_required' }, { status: 400 });
    const viewer = await libraryViewer(userId, (session.user as { role?: string }).role);
    const ai = abacusAvailable() && rateLimit(`library-ask-ai:${userId}`, 6, 60_000).ok
      ? (system: string, user: string) => callCoachLLM(system, [{ role: 'user', content: user }])
      : null;
    return NextResponse.json(await askLibrary(viewer, q, ai, body?.drafts === true));
  } catch (e) {
    console.error('library ask POST error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
