export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readProgress, type DunkAttempt } from '@/lib/irl/dunkProgress';
import { MAX_VERTICAL_CM, type DunkFamily } from '@/lib/irl/dunkTracker';

/**
 * A measured dunk, and the history it joins.
 *
 * NUMBERS ONLY. The schema has carried the rule since M17 — "Raw video NEVER stored; only a keypoint timeline and
 * derived metrics" — and the owner chose to keep it (2026-09-20) rather than rewrite it for a re-watch feature.
 * The clip is recorded and measured on the athlete's own device; four numbers travel. That is also why this works
 * in a gym with one bar of signal.
 *
 * Stored as WorkoutScan, whose `kind` has listed 'dunk' as a value since the day it was written and never had
 * anything writing one.
 */

const FAMILIES = new Set<DunkFamily>([
  'BETWEEN-THE-LEGS', 'WINDMILL', '360', 'TOMAHAWK', 'ONE-HAND JAM', 'TWO-HAND JAM', 'ATTEMPT',
]);

/** A measurement the camera could not really have produced is not a measurement. MAX_VERTICAL_CM (130: the world
 *  record standing reach-to-rim differential, with room to spare) lives in the tracker, which refuses the same
 *  attempts first and says why; two copies let the tracker judge a 150 cm jump that this route then dropped. */
const MAX_FLIGHT_MS = 1400;

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rows = await prisma.workoutScan.findMany({
    where: { userId, kind: 'dunk' },
    orderBy: { createdAt: 'asc' },
    select: { metrics: true, createdAt: true },
    take: 500,
  }).catch(() => []);

  const attempts: DunkAttempt[] = rows.map((r) => {
    const m = (r.metrics ?? {}) as Partial<DunkAttempt>;
    return {
      at: r.createdAt.toISOString(),
      verticalCm: Number(m.verticalCm) || 0,
      flightTimeMs: Number(m.flightTimeMs) || 0,
      family: (FAMILIES.has(m.family as DunkFamily) ? m.family : 'ATTEMPT') as DunkFamily,
      ...(typeof m.difficulty === 'number' ? { difficulty: m.difficulty } : {}),
      ...(typeof m.execution === 'number' ? { execution: m.execution } : {}),
      ...(typeof m.style === 'number' ? { style: m.style } : {}),
      ...(typeof m.made === 'boolean' ? { made: m.made } : {}),
    };
  });

  return NextResponse.json({ attempts, progress: readProgress(attempts) });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const b = body as Partial<DunkAttempt>;

  const verticalCm = Number(b?.verticalCm);
  const flightTimeMs = Number(b?.flightTimeMs);
  // Refused rather than clamped: a 300 cm vertical is a broken measurement, and silently storing it as 130 would
  // put a number in somebody's history that their body never produced.
  if (!Number.isFinite(verticalCm) || verticalCm <= 0 || verticalCm > MAX_VERTICAL_CM) {
    return NextResponse.json({ error: 'implausible_vertical' }, { status: 400 });
  }
  if (!Number.isFinite(flightTimeMs) || flightTimeMs <= 0 || flightTimeMs > MAX_FLIGHT_MS) {
    return NextResponse.json({ error: 'implausible_flight' }, { status: 400 });
  }
  const family = (FAMILIES.has(b?.family as DunkFamily) ? b!.family : 'ATTEMPT') as DunkFamily;

  const metrics = {
    verticalCm: Math.round(verticalCm * 10) / 10,
    flightTimeMs: Math.round(flightTimeMs),
    family,
    ...(typeof b?.difficulty === 'number' ? { difficulty: b.difficulty } : {}),
    ...(typeof b?.execution === 'number' ? { execution: b.execution } : {}),
    ...(typeof b?.style === 'number' ? { style: b.style } : {}),
    ...(typeof b?.made === 'boolean' ? { made: b.made } : {}),
  };

  await prisma.workoutScan.create({ data: { userId, kind: 'dunk', metrics } }).catch(() => null);

  const rows = await prisma.workoutScan.findMany({
    where: { userId, kind: 'dunk' }, orderBy: { createdAt: 'asc' },
    select: { metrics: true, createdAt: true }, take: 500,
  }).catch(() => []);
  const attempts: DunkAttempt[] = rows.map((r) => {
    const m = (r.metrics ?? {}) as Partial<DunkAttempt>;
    return {
      at: r.createdAt.toISOString(),
      verticalCm: Number(m.verticalCm) || 0,
      flightTimeMs: Number(m.flightTimeMs) || 0,
      family: (FAMILIES.has(m.family as DunkFamily) ? m.family : 'ATTEMPT') as DunkFamily,
      ...(typeof m.made === 'boolean' ? { made: m.made } : {}),
    };
  });

  return NextResponse.json({ progress: readProgress(attempts) });
}
