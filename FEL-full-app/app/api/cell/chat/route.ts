import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  ARCHITECT_SYSTEM,
  BUILDER_SYSTEM,
  callLLM,
  type CellRole,
  type ChatMessage,
} from '@/lib/cell-engine';

export const dynamic = 'force-dynamic';

/**
 * POST /api/cell/chat
 *
 * Streams a CELL response for a given project conversation.
 * Body: { projectId?: string, message: string, role?: CellRole }
 *
 * If no projectId, creates a new CellProject.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const message = String(body?.message ?? '').trim();
    const role: CellRole = (['architect', 'builder', 'critic', 'summarizer'] as CellRole[]).includes(body?.role)
      ? body.role
      : 'architect';

    if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 });

    let projectId = body?.projectId as string | undefined;

    // Create project if new conversation
    if (!projectId) {
      const project = await prisma.cellProject.create({
        data: {
          userId,
          title: message.slice(0, 100),
          prompt: message,
        },
      });
      projectId = project.id;
    }

    // Verify ownership
    const project = await prisma.cellProject.findFirst({
      where: { id: projectId, userId },
    });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    // Save user message
    await prisma.cellMessage.create({
      data: { projectId, role: 'user', content: message },
    });

    // Load conversation history (last 20 messages for context)
    const history = await prisma.cellMessage.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    // Load relevant wisdom (top 5 by score)
    const wisdom = await prisma.cellWisdom.findMany({
      orderBy: { score: 'desc' },
      take: 5,
    });

    const wisdomContext = wisdom.length
      ? `\n\nCELL Wisdom (learned patterns):\n${wisdom.map((w: any) => `- [${w.category}] ${w.insight}`).join('\n')}`
      : '';

    // Build messages for LLM
    const systemPrompt = role === 'architect' ? ARCHITECT_SYSTEM : BUILDER_SYSTEM;
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt + wisdomContext },
      ...history.map((m: any) => ({
        role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    // Call LLM with streaming
    const llmResponse = await callLLM({ role, messages, stream: true });

    // Stream back to client, buffer for DB save
    const reader = llmResponse.body?.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let fullContent = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send projectId as first event
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'meta', projectId })}\n\n`)
          );

          if (!reader) {
            controller.close();
            return;
          }

          let partialRead = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            partialRead += decoder.decode(value, { stream: true });
            const lines = partialRead.split('\n');
            partialRead = lines.pop() ?? '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(data);
                  const delta = parsed?.choices?.[0]?.delta?.content ?? '';
                  if (delta) {
                    fullContent += delta;
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ type: 'delta', content: delta })}\n\n`)
                    );
                  }
                } catch {}
              }
            }
          }

          // Save assistant message
          await prisma.cellMessage.create({
            data: {
              projectId: projectId!,
              role,
              content: fullContent,
              model: role === 'architect' ? 'claude-fable-5' : 'gpt-5.4-mini',
            },
          });

          // If architect role, try to parse BuildPlan and update project
          if (role === 'architect' && fullContent.includes('"lanes"')) {
            try {
              // Extract JSON from response (may be wrapped in markdown)
              let json = fullContent;
              const jsonMatch = fullContent.match(/```(?:json)?\s*([\s\S]*?)```/);
              if (jsonMatch) json = jsonMatch[1];
              // Try direct parse
              const plan = JSON.parse(json.trim());
              if (plan?.lanes && Array.isArray(plan.lanes)) {
                await prisma.cellProject.update({
                  where: { id: projectId! },
                  data: {
                    title: plan.projectTitle ?? project.title,
                    genre: plan.genre ?? '',
                    buildPlan: JSON.stringify(plan),
                    status: 'ready',
                  },
                });
              }
            } catch {}
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
          );
        } catch (e) {
          console.error('[cell/chat] stream error', e);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'error', message: 'Stream interrupted' })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (e) {
    console.error('[cell/chat] error', e);
    return NextResponse.json({ error: 'CELL error' }, { status: 500 });
  }
}
