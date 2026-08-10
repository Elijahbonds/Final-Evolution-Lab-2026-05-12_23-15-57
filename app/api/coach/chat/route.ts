import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOrCreateProfile } from '@/lib/profile-service';
import { prqScore, prqGrade, PRQ_ATTRS } from '@/lib/prq';

export const dynamic = 'force-dynamic';

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

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => null);
    const userMessages = body?.messages ?? [];
    if (!userMessages.length) return NextResponse.json({ error: 'No messages' }, { status: 400 });

    // Fetch learner's PRQ profile
    const profile = await getOrCreateProfile(userId);
    const attrs: Record<string, number> = {};
    for (const a of PRQ_ATTRS) { attrs[a] = Number((profile as any)?.[a] ?? 0); }
    const score = prqScore(attrs);
    const grade = prqGrade(score);

    // Find weakest stat
    let weakest: string = PRQ_ATTRS[0];
    let weakestVal = Infinity;
    for (const a of PRQ_ATTRS) {
      if (attrs[a] < weakestVal) { weakestVal = attrs[a]; weakest = a; }
    }

    // Fetch lesson completion count
    const lessonCount = await prisma.lessonProgress.count({ where: { userId } });

    // Fetch full exercise catalogue for context
    const exercises = await prisma.exercise.findMany({
      where: { published: true },
      include: { category: { select: { name: true } } },
      orderBy: [{ phase: 'asc' }, { chapter: 'asc' }, { sortOrder: 'asc' }],
    });

    const catalogueText = exercises.map((e: any) => {
      let entry = `[${e.category?.name}] ${e.name} (Phase ${e.phase}, Ch${e.chapter}, ${e.bounceLevel})`;
      entry += `\nTarget: ${e.targetPrqStat || 'general'} | Dosage: ${e.dosage}`;
      entry += `\nCues: ${e.coachingCues}`;
      if (e.commonMistakes) entry += `\nMistakes: ${e.commonMistakes}`;
      if (e.progressions) entry += `\nProgressions: ${e.progressions}`;
      if (e.regressions) entry += `\nRegressions: ${e.regressions}`;
      if (e.prerequisites) entry += `\nPrerequisites: ${e.prerequisites}`;
      if (e.videoUrl) entry += `\n🎬 Video demo available`;
      return entry;
    }).join('\n\n');

    const learnerContext = `\n\nLEARNER PROFILE:\n- PRQ Score: ${score} (${grade.label})\n- Attributes: ${PRQ_ATTRS.map(a => `${a}: ${Math.round(attrs[a])}`).join(', ')}\n- Weakest stat: ${weakest} (${Math.round(weakestVal)})\n- Lessons completed: ${lessonCount}\n- Streak days: ${profile?.streakDays ?? 0}`;

    const fullSystem = SYSTEM_PROMPT + learnerContext + `\n\nEXERCISE CATALOGUE:\n${catalogueText}`;

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

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      console.error('LLM API error:', response.status, errText);
      return NextResponse.json({ error: 'Coach is temporarily unavailable' }, { status: 502 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        if (!reader) { controller.close(); return; }
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(encoder.encode(decoder.decode(value)));
          }
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (e) {
    console.error('coach chat error', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
