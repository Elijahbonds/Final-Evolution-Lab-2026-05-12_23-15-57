import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { abacusAvailable } from '@/lib/abacus/killSwitch';
import { callCoachLLM } from '@/lib/coach-service';
import { MAX_ASK_CHARS, type RequestEdits } from '@/lib/program-ask/request';
import { askProgram } from '@/lib/program-ask/server';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/program-ask  { q, edits? }
 *
 * PROGRAM-ASK (2026-11-02), owner: "The AI should be able to give me an entire workout program if I tell it, all I have
 * is a band." The deterministic reading and the rule-based builder always answer (lib/program-ask); the AI polish joins
 * only while the Abacus switch is on (off by default, lib/abacus/killSwitch.ts) and inside its allowance, and it can only
 * pick between entries the builder already found equivalent and write the "why" paragraph. A pain or injury ask gets
 * FEL's existing lines and no program. Rate-limited per account: 12 builds a minute, of which 3 may use the AI.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;
    const gate = rateLimit(`program-ask:${userId}`, 12, 60_000);
    if (!gate.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(gate.retryAfterSec) } });
    let body: { q?: unknown; edits?: unknown };
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
    const q = typeof body?.q === 'string' ? body.q.trim().slice(0, MAX_ASK_CHARS) : '';
    if (!q) return NextResponse.json({ error: 'question_required' }, { status: 400 });
    const edits = body?.edits && typeof body.edits === 'object' && !Array.isArray(body.edits) ? body.edits as RequestEdits : null;
    const ai = abacusAvailable() && rateLimit(`program-ask-ai:${userId}`, 3, 60_000).ok
      ? (system: string, user: string) => callCoachLLM(system, [{ role: 'user', content: user }])
      : null;
    return NextResponse.json(await askProgram({ id: userId, role: (session.user as { role?: string }).role }, q, edits, ai));
  } catch (e) {
    console.error('program-ask POST error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
