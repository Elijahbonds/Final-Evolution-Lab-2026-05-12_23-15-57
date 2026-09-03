// The composed "Shared Profile" read-model (gap report §2 / G6): PRQ,
// movement signature, credentials, performance history and resiliency, read
// from the four sources that already exist. No new tables; pure helpers for
// the deltas so the session record and the profile agree.
import { prisma } from '@/lib/db';
import { analyzeMovement } from '@/lib/workout/movement-screen';
import { computeResiliency, type SessionOutcome } from './resiliency';
import { certificationStatusFor } from './certification';

export const PRQ_ATTRS = ['strength', 'speed', 'endurance', 'agility', 'power', 'flexibility', 'recovery', 'mental'] as const;

/** Latest value per attribute at or before `at` (null → all time). */
export function latestPerAttribute(entries: { attribute: string; value: number; measuredAt: Date }[], at: Date | null): Record<string, number> {
  const out: Record<string, number> = {};
  const sorted = [...entries].filter((e) => !at || e.measuredAt <= at).sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
  for (const e of sorted) out[e.attribute] = e.value;
  return out;
}

export function prqDelta(before: Record<string, number>, after: Record<string, number>): Record<string, number> {
  const d: Record<string, number> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (k in before && k in after) d[k] = Math.round((after[k] - before[k]) * 100) / 100;
  }
  return d;
}

/** Numeric-leaf delta between two movement analyses (pillars, flags ignored). */
export function numericDelta(a: unknown, b: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return out;
  const walk = (x: Record<string, unknown>, y: Record<string, unknown>, prefix: string) => {
    for (const k of Object.keys(y)) {
      const va = x[k], vb = y[k];
      if (typeof va === 'number' && typeof vb === 'number') out[prefix + k] = Math.round((vb - va) * 100) / 100;
      else if (va && vb && typeof va === 'object' && typeof vb === 'object') walk(va as Record<string, unknown>, vb as Record<string, unknown>, `${prefix}${k}.`);
    }
  };
  walk(a as Record<string, unknown>, b as Record<string, unknown>, '');
  return out;
}

export function toOutcomes(sessions: { mode: string; won: boolean; createdAt: Date }[]): SessionOutcome[] {
  return sessions.map((s) => ({ at: s.createdAt.getTime(), modeKey: s.mode, outcome: s.won ? 'win' : 'loss' }));
}

function safeAnalyze(metrics: unknown): unknown {
  try { return analyzeMovement(metrics as never); } catch { return null; }
}

export async function composeProfile(userId: string, since: Date | null = null) {
  const [profile, entries, scans, games, creds, fac] = await Promise.all([
    prisma.playerProfile.findUnique({ where: { userId } }),
    prisma.prqEntry.findMany({ where: { userId }, orderBy: { measuredAt: 'asc' } }),
    prisma.workoutScan.findMany({ where: { userId, kind: 'movement_screen' }, orderBy: { createdAt: 'desc' }, take: 2 }),
    prisma.gameSession.findMany({ where: { userId, ...(since ? { createdAt: { gte: since } } : {}) }, orderBy: { createdAt: 'desc' }, take: 60 }),
    prisma.credential.findMany({ where: { userId } }),
    prisma.facilitatorProfile.findUnique({ where: { userId } }),
  ]);
  const prqNow = latestPerAttribute(entries, null);
  const prqThen = since ? latestPerAttribute(entries, since) : {};
  const latestScan = scans[0] ? safeAnalyze(scans[0].metrics) : null;
  const prevScan = scans[1] ? safeAnalyze(scans[1].metrics) : null;
  return {
    prq: {
      card: profile ? Object.fromEntries(PRQ_ATTRS.map((k) => [k, (profile as unknown as Record<string, number>)[k]])) : null,
      measured: prqNow,
      delta: since ? prqDelta(prqThen, prqNow) : null,
      entries: entries.length,
    },
    movement: { latest: latestScan, latestAt: scans[0]?.createdAt ?? null, delta: latestScan && prevScan ? numericDelta(prevScan, latestScan) : null },
    credentials: certificationStatusFor(creds, fac?.revokedAt ?? null),
    history: {
      sessions: games.length,
      wins: games.filter((g) => g.won).length,
      byMode: games.reduce<Record<string, number>>((acc, g) => { acc[g.mode] = (acc[g.mode] ?? 0) + 1; return acc; }, {}),
      recent: games.slice(0, 10).map((g) => ({ id: g.id, mode: g.mode, score: g.score, won: g.won, at: g.createdAt })),
    },
    resiliency: computeResiliency(toOutcomes(games)),
  };
}
