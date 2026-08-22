import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOrCreateProfile } from '@/lib/profile-service';
import { computePrqDelta, MODE_ATTRS, prqScore, prqGrade } from '@/lib/prq';
import { postLc } from '@/lib/ledger';
import { sanitizeTallies } from '@/lib/game-systems';
import { createPrqEntry } from '@/lib/prq-entries';
import { addSeasonXp } from '@/lib/season/season-service';
import { recordMastery } from '@/lib/mastery/mastery-service';
import { recordServerEvent } from '@/lib/analytics-server';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode ?? '');
    const score = Math.max(0, Math.floor(Number(body?.score ?? 0)));
    const opponentScore = Math.max(0, Math.floor(Number(body?.opponentScore ?? 0)));
    const won = Boolean(body?.won);
    const duration = Math.max(0, Math.floor(Number(body?.duration ?? 0)));

    // Optional standardized fun-loop tallies (M6). Absent for legacy clients — all default to 0.
    const { hits, misses, dodges, combos, maxCombo } = sanitizeTallies(body);

    if (!mode) return NextResponse.json({ error: 'mode required' }, { status: 400 });

    const profile = await getOrCreateProfile(userId);
    const before = prqScore(profile as any);

    const prqDelta = computePrqDelta({ mode, score, won, duration });
    const xp = Math.max(5, Math.round(score * 1.5) + (won ? 50 : 10));
    const shards = Math.max(1, Math.floor(score / 20)) + (won ? 3 : 0);

    // Credits: hero-mode win +15 LC, daily streak +5*day (cap day 7)
    let credits = won ? 15 : 0;
    let streakDays = profile?.streakDays ?? 0;
    const lastStreak = new Date(profile?.lastStreakAt ?? 0).getTime();
    const now = Date.now();
    const daysSince = Math.floor((now - lastStreak) / DAY_MS);
    let streakBonus = 0;
    if (daysSince >= 1) {
      streakDays = daysSince === 1 ? Math.min(streakDays + 1, 7) : 1;
      streakBonus = 5 * streakDays;
      credits += streakBonus;
    }

    // Distribute PRQ delta to mode-relevant attributes
    const attrs = MODE_ATTRS?.[mode] ?? ['mental'];
    const attrData: Record<string, any> = {};
    for (const a of attrs) {
      const cur = Number((profile as any)?.[a] ?? 0);
      attrData[a] = Math.min(100, Math.round((cur + prqDelta) * 100) / 100);
    }

    const newBalance = (profile?.labCredits ?? 0) + credits;

    const { updated, createdSession } = await prisma.$transaction(async (tx) => {
      const updated = await tx.playerProfile.update({
        where: { userId },
        data: {
          ...attrData,
          xp: (profile?.xp ?? 0) + xp,
          shards: (profile?.shards ?? 0) + shards,
          labCredits: newBalance,
          streakDays,
          lastStreakAt: daysSince >= 1 ? new Date() : profile?.lastStreakAt,
          lastActiveAt: new Date(),
        },
      });
      const createdSession = await tx.gameSession.create({
        data: { userId, mode, score, opponentScore, won, xp, shards, prqDelta, credits, duration, hits, misses, dodges, combos, maxCombo },
      });
      if (credits > 0) {
        await postLc(tx, {
          userId,
          amount: credits,
          reason: won ? `Session win (${mode})${streakBonus ? ' + streak' : ''}` : `Daily streak day ${streakDays}`,
          balanceAfter: newBalance,
        });
      }
      // Task 3: emit drillResult PrqEntries for mode-relevant attributes.
      // prqDelta is the per-attribute gain; source = drillResult, linked to this session.
      if (prqDelta > 0) {
        const sessionId = (createdSession as any)?.id;
        for (const attr of attrs) {
          const newVal = Number((updated as any)?.[attr] ?? 0);
          await createPrqEntry(tx, {
            userId,
            attribute: attr as any,
            value: Math.round(newVal * 100) / 100,
            unit: 'score',
            source: 'drillResult',
            measuredAt: new Date(),
            sessionId: sessionId ?? null,
          }).catch((err: any) => {
            console.warn('PrqEntry drillResult write skipped:', err?.message);
          });
        }
      }

      return { updated, createdSession };
    });

    const after = prqScore(updated as any);

    // --- M13: season pass + mastery are additive and best-effort. A failure
    // here must never break the core session write above (they run after the
    // transaction and swallow their own errors). Server owns all grants. ---
    let season: Awaited<ReturnType<typeof addSeasonXp>> = null;
    try {
      season = await addSeasonXp({ userId, mode, score, won });
    } catch (err) {
      console.warn('season xp skipped:', (err as any)?.message);
    }

    let mastery: Awaited<ReturnType<typeof recordMastery>> | null = null;
    try {
      mastery = await recordMastery(userId, { mode, score, won, hits, misses, maxCombo });
    } catch (err) {
      console.warn('mastery record skipped:', (err as any)?.message);
    }

    // Telemetry: one row per completed session drives DAU / retention rollups.
    await recordServerEvent({
      name: 'session_complete',
      userId,
      props: { mode, score, won, duration },
    });

    return NextResponse.json({
      ok: true,
      sessionId: (createdSession as any)?.id ?? null,
      xp,
      shards,
      credits,
      streakDays,
      streakBonus,
      prqDelta: Math.round((after - before) * 100) / 100,
      prqBefore: before,
      prqAfter: after,
      grade: prqGrade(after),
      labCredits: newBalance,
      season: season
        ? {
            name: season.season.name,
            gained: season.gained,
            tier: season.tier,
            into: season.into,
            need: season.need,
            hasPro: season.hasPro,
            tierUps: season.events.map((e) => ({ tier: e.tier, rewards: e.rewards })),
          }
        : null,
      mastery: mastery
        ? { mode: mastery.mode, tier: mastery.tier, tierIndex: mastery.tierIndex, ups: mastery.events }
        : null,
    });
  } catch (e) {
    console.error('session error', e);
    return NextResponse.json({ error: 'Failed to record session' }, { status: 500 });
  }
}
