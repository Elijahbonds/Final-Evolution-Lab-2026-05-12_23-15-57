/**
 * app/api/signature/route.ts
 * ==========================
 * M13 Step 3 — weekly Signature Challenge (hoops modes). GET returns this
 * week's three seeded signatures, the athlete's own best + today's attempt
 * count, and a per-mode leaderboard. POST records an attempt, capped at 1/day
 * per signature (server-enforced). Server owns all scores.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { currentSignatures, signatureFor, SIGNATURE_MODES, type SignatureMode } from '@/lib/mastery/signature';

export const dynamic = 'force-dynamic';

function startOfUtcDay(d = new Date()): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

async function leaderboardFor(challengeKey: string, limit = 10) {
  const rows = await prisma.signatureAttempt.findMany({
    where: { challengeKey },
    orderBy: { score: 'desc' },
    take: 200,
  });
  // Keep each athlete's best only, then take the top `limit`.
  const best = new Map<string, number>();
  for (const r of rows) {
    const prev = best.get(r.userId) ?? -Infinity;
    if (r.score > prev) best.set(r.userId, r.score);
  }
  const ranked = [...best.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  const users = await prisma.user.findMany({
    where: { id: { in: ranked.map(([id]) => id) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.name ?? 'Athlete']));
  return ranked.map(([userId, score], i) => ({
    rank: i + 1,
    name: nameById.get(userId) ?? 'Athlete',
    score,
  }));
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id ?? null;
  const sigs = currentSignatures();
  const dayStart = startOfUtcDay();

  const out = await Promise.all(
    sigs.map(async (sig) => {
      const leaderboard = await leaderboardFor(sig.challengeKey);
      let myBest: number | null = null;
      let attemptsToday = 0;
      if (userId) {
        const mine = await prisma.signatureAttempt.findMany({
          where: { userId, challengeKey: sig.challengeKey },
          select: { score: true, createdAt: true },
        });
        if (mine.length) myBest = Math.max(...mine.map((m) => m.score));
        attemptsToday = mine.filter((m) => m.createdAt >= dayStart).length;
      }
      return { ...sig, leaderboard, myBest, attemptsToday, canAttempt: userId ? attemptsToday < 1 : false };
    }),
  );

  return NextResponse.json({ authed: !!userId, signatures: out });
}

const bodySchema = z.object({
  mode: z.enum(SIGNATURE_MODES),
  score: z.number().finite().min(0).max(100000),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id ?? null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const sig = signatureFor(parsed.data.mode as SignatureMode);
  const dayStart = startOfUtcDay();

  // Server-enforced 1/day cap per signature.
  const already = await prisma.signatureAttempt.count({
    where: { userId, challengeKey: sig.challengeKey, createdAt: { gte: dayStart } },
  });
  if (already >= 1) {
    return NextResponse.json({ error: 'daily_limit', message: 'One attempt per day per signature.' }, { status: 429 });
  }

  const score = Math.round(parsed.data.score);
  await prisma.signatureAttempt.create({
    data: { userId, mode: sig.mode, challengeKey: sig.challengeKey, score },
  });

  const beat = score >= sig.targetScore;
  const leaderboard = await leaderboardFor(sig.challengeKey);
  return NextResponse.json({ ok: true, beat, targetScore: sig.targetScore, score, leaderboard });
}
