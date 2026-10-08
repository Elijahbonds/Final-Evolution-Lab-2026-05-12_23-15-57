import { abacusEnabled, aiComingSoonResponse } from '@/lib/abacus/killSwitch';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOrCreateProfile } from '@/lib/profile-service';
import { PRQ_ATTRS } from '@/lib/prq';
import { withPainSafety } from '@/lib/coach/aiSystemPrompt';
import { isMinorForMirror } from '@/lib/mirror/youth';
import { rateLimit } from '@/lib/rate-limit';
import { AI_CHAT_ADULTS_ONLY, AI_CHAT_CONSENT_REQUIRED, aiChatAccess, type AiAccessDb } from '@/lib/coach/aiChatAccess';
import {
  AI_CHAT_RATE, AI_CHAT_TOP_EXERCISES, catalogueHeading, catalogueText, learnerContext, parseChatBody, relevantAttributes,
  weakestAttribute, type CatalogueRow,
} from '@/lib/coach/aiChatGuard';

export const dynamic = 'force-dynamic';

// MIRROR-COACH P5 (2026-09-29): this is the LIVE AI coach — lib/coach-service.ts's buildSystemPrompt has no real
// caller anywhere in the app (see lib/coach/aiSystemPrompt.ts's own header) and is not what this route uses. The
// pain-safety addendum (FEL's disclosure + the same four rules lib/health/painRule.ts's decide() enforces in the
// check-in loop) is appended below, once, to whatever this SYSTEM_PROMPT ends up being for a given request.
const SYSTEM_PROMPT = `You are Coach Elijah Bonds — a Neuro-Performance Coach and Professional Dunker.
You teach the Bonds Bounce Blueprint and exercise catalogue through the Final Evolution Lab platform.

CORE RULES:
1. ONLY reference exercises that exist in the EXERCISE CATALOGUE provided below. NEVER invent exercises, cues, or dosages.
2. Be supportive, adaptive, never shaming — especially around recovery, rest, and difficulty.
3. When building workout plans, select exercises based on the learner's PRQ profile weaknesses and goals.
4. Sequence progressions per the Blueprint phases: System Scan → Hardware Calibration → Physics of Flight → Basketball Application → System Integration.
5. Always explain WHY an exercise matters — connect to the architecture metaphor.
6. If asked about something outside the catalogue, say "That's not in our current catalogue yet — let me show you what we do have that targets the same area."
7. Keep responses conversational but precise. Use coaching cues exactly as authored.
8. Reference video demonstrations when available — say "Watch my demo for this one" and mention the exercise has a video.
9. You ARE Elijah. Speak in first person. This is YOUR curriculum, YOUR methods, YOUR philosophy.
10. For recovery data: adapt recommendations based on the learner's wearable/recovery information if available.

BLUEPRINT PHILOSOPHY:
- "Architecture precedes load" — never load a misaligned structure
- The CNS is the gatekeeper, not the muscle
- Fascia is the communication network
- Throw-Catch methodology: Oscillate → Lock → Release → Reset
- The breath is the foundation of everything`;

// COACH-AI Phase 8 (2026-10-07): the hardening the owner asked for before this route is switched back on (owner
// decision 8: abacusEnabled() stays as it is, off by default, and still runs FIRST). In order, before anything leaves:
//   1. the kill switch (unchanged);  2. signed in;  3. rateLimit() per account (a minute and a day window,
//   lib/coach/aiChatGuard.ts AI_CHAT_RATE);  4. ADULTS ONLY from the DB's User.dobYear and 5. a live AI-sharing consent
//   (lib/coach/aiChatAccess.ts) — both 403, nothing read from the body;  6. the body: role allowlist and count/length
//   caps (400 with a fixed code, nothing trimmed silently).
// What is sent: the question, the one or two attributes it is about (never the whole PRQ, its score or grade), and the
// top AI_CHAT_TOP_EXERCISES published exercises that target them (never the whole catalogue). The provider's stream is
// passed through as bytes (lib/coach/chatStream.ts has the client half of plan item #11).
export async function POST(req: Request) {
  try {
    if (!abacusEnabled()) return aiComingSoonResponse('coach');
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    for (const [name, w] of [['minute', AI_CHAT_RATE.minute], ['day', AI_CHAT_RATE.day]] as const) {
      const rl = rateLimit(`coach-chat:${name}:${userId}`, w.limit, w.windowMs);
      if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
    }

    const access = await aiChatAccess(prisma as unknown as AiAccessDb, userId);
    if (!access.adult) return NextResponse.json({ ...AI_CHAT_ADULTS_ONLY }, { status: 403 });
    if (!access.consented) return NextResponse.json({ ...AI_CHAT_CONSENT_REQUIRED }, { status: 403 });

    const input = parseChatBody(await req.text().catch(() => ''));
    if (!input.ok) return NextResponse.json({ error: input.error }, { status: input.error === 'body_too_large' ? 413 : 400 });
    const userMessages = input.messages;
    const question = userMessages[userMessages.length - 1].content;

    // MIRROR-COACH P5 FIX (2026-09-29, code review): the chat's minor-safety rule (aiSystemPrompt.ts PAIN_SAFETY_RULES
    // rule 2) is grounded in the same fact every other age gate reads (lib/mirror/youth.ts isMinorForMirror(User.dobYear)).
    // COACH-AI: a minor no longer gets this far (step 4), so this is defence in depth — kept so the prompt never
    // depends on the gate above staying put.
    const isMinor = isMinorForMirror(access.dobYear);

    const profile = await getOrCreateProfile(userId);
    const attrs: Record<string, number> = {};
    for (const a of PRQ_ATTRS) { attrs[a] = Number((profile as any)?.[a] ?? 0); }
    const relevant = relevantAttributes(attrs, question);
    const weakest = weakestAttribute(attrs);

    const exercises: CatalogueRow[] = await prisma.exercise.findMany({
      where: { published: true, targetPrqStat: { in: relevant } },
      select: {
        name: true, phase: true, chapter: true, bounceLevel: true, targetPrqStat: true, dosage: true, coachingCues: true,
        regressions: true, videoUrl: true, category: { select: { name: true } },
      },
      orderBy: [{ phase: 'asc' }, { chapter: 'asc' }, { sortOrder: 'asc' }],
      take: AI_CHAT_TOP_EXERCISES,
    });

    const systemBase = SYSTEM_PROMPT + learnerContext(attrs, relevant, weakest) + catalogueHeading(exercises.length) + catalogueText(exercises);
    const fullSystem = withPainSafety(systemBase, { isMinor });

    // Call LLM with streaming
    const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        messages: [
          { role: 'system', content: fullSystem },
          ...userMessages,
        ],
        stream: true,
        max_tokens: 2000,
      }),
    });

    if (!response.ok || !response.body) {
      // the status only: a provider's error text can quote the request, which is the user's own words
      console.error('LLM API error:', response.status);
      return NextResponse.json({ error: 'Coach is temporarily unavailable' }, { status: 502 });
    }

    // The provider's bytes, untouched. The old loop decode()-d each chunk WITHOUT { stream: true } and re-encoded it,
    // which turned a character split across two chunks into two replacement characters.
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (e) {
    console.error('coach chat error', e instanceof Error ? e.name : typeof e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
