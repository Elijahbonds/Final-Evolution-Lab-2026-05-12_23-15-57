import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { completeText } from '@/lib/cell-engine';
import { abacusAvailable, aiComingSoonResponse, AiDisabledError } from '@/lib/abacus/killSwitch';
import { rateLimit } from '@/lib/rate-limit';
import { readDobYear, type GateDb } from '@/lib/privacy/scanSaveGate';
import { AI_BUILDER_AGE_REFUSED, aiBuilderAllowed } from '@/lib/nexus-studio/aiAccess';
import { AI_LIMITS, aiExplainSystem, aiExplainUser, aiVenueSystem, aiVenueUser, sanitizeAiEdits, sanitizeSummary } from '@/lib/nexus-studio/aiEdits';
import { sanitizeVenue } from '@/lib/nexus-studio/doc';
import { studioAudienceOk, studioNotFound } from '@/lib/nexus-studio/audience';

export const dynamic = 'force-dynamic';

/** Per account: a burst and a day (each answer is one model call). */
const VENUE_AI_RATE = { minute: { limit: 6, windowMs: 60_000 }, day: { limit: 120, windowMs: 86_400_000 } } as const;
/** The request body's ceiling (a venue of 600 objects is ~150 kB of JSON). */
const VENUE_AI_MAX_BODY = 400_000;

/**
 * POST /api/cell/venue  { prompt: string, venue: StudioVenue }  →  { edits: AiEdit[], dropped: number }
 *
 * NEXUS STUDIO track 2 (docs/NEXUS-STUDIO.md §3): CELL answers a creator's venue request with Studio EDITS, not files —
 * the browser compiles them into one command on the Studio's undo stack (lib/nexus-studio/aiEdits.ts). In order, before
 * anything leaves: 1. the ABACUS kill switch (first, before the session or the body); 2. signed in; 2b. NEX-01: the Studio's
 * audience — NEXUS_STUDIO_ENABLED on and the account's role, read from the database on this request, founder or admin
 * (lib/nexus-studio/audience.ts); anyone else gets the 404 /studio gives them; 3. a rate limit per
 * account; 4. TEENS (13–17) AND ADULTS (owner, 2026-10-14: "Teens too") from the database's User.dobYear — under 13 and an
 * unknown age are refused (lib/nexus-studio/aiAccess.ts has the rule and why); 5. the body: a capped prompt and a venue run
 * through the import sanitiser.
 * What is sent: the prompt and the venue's settings and placements (venueBrief) — never the account, a character or a look.
 * What comes back is sanitised here AND again in the browser; the model's text itself is never returned or executed.
 *
 * studio-4b: the edits may also propose scripts and casts (aiEdits.ts; a cast names a character only as the creator typed it —
 * the request carries no character). And `{ mode: 'explain', venue }` → `{ summary }`: a read-only, plain-language summary of the
 * venue (no prompt; the same venue brief is sent, nothing more), through the same switch, sign-in, rate limit, age line and body
 * cap, in the same order; the summary is plain text, sanitised here (sanitizeSummary) and shown as text.
 * No new environment variable or secret: it runs on CELL's existing key, behind CELL's existing switch.
 */
export async function POST(req: Request) {
  if (!abacusAvailable()) return aiComingSoonResponse('studio');
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await studioAudienceOk(prisma, userId))) return studioNotFound();

    for (const [name, w] of [['minute', VENUE_AI_RATE.minute], ['day', VENUE_AI_RATE.day]] as const) {
      const rl = rateLimit(`cell-venue:${name}:${userId}`, w.limit, w.windowMs);
      if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
    }

    if (!aiBuilderAllowed(await readDobYear(prisma as unknown as GateDb, userId, 'cell_venue'))) {
      return NextResponse.json({ ...AI_BUILDER_AGE_REFUSED }, { status: 403 });
    }

    const text = await req.text().catch(() => '');
    if (text.length > VENUE_AI_MAX_BODY) return NextResponse.json({ error: 'body_too_large' }, { status: 413 });
    let body: unknown = null;
    try { body = JSON.parse(text); } catch { body = null; }
    const b = (body && typeof body === 'object' ? body : {}) as { prompt?: unknown; venue?: unknown; mode?: unknown };
    if (b.mode === 'explain') {
      const venue = sanitizeVenue(b.venue, new Set());
      if (!venue) return NextResponse.json({ error: 'venue_required' }, { status: 400 });
      const said = await completeText({
        role: 'builder', maxTokens: 400,
        messages: [{ role: 'system', content: aiExplainSystem() }, { role: 'user', content: aiExplainUser(venue) }],
      });
      const summary = sanitizeSummary(said);
      if (!summary) return NextResponse.json({ error: 'ai_failed' }, { status: 502 });
      return NextResponse.json({ summary }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const prompt = typeof b.prompt === 'string' ? b.prompt.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
    if (!prompt) return NextResponse.json({ error: 'prompt_required' }, { status: 400 });
    if (prompt.length > AI_LIMITS.prompt) return NextResponse.json({ error: 'prompt_too_long' }, { status: 400 });
    const venue = sanitizeVenue(b.venue, new Set());
    if (!venue) return NextResponse.json({ error: 'venue_required' }, { status: 400 });

    const answer = await completeText({
      role: 'builder', jsonMode: true, maxTokens: 2000,
      messages: [{ role: 'system', content: aiVenueSystem() }, { role: 'user', content: aiVenueUser(prompt, venue) }],
    });
    const { edits, dropped } = sanitizeAiEdits(answer);
    return NextResponse.json({ edits, dropped }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof AiDisabledError) return aiComingSoonResponse('studio');
    console.error('[cell/venue] error', e instanceof Error ? e.name : 'unknown');
    return NextResponse.json({ error: 'ai_failed' }, { status: 502 });
  }
}
