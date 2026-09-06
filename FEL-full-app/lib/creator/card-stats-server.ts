// Server side of the scouting profile (lane 5): compose the public stat blocks from the Shared Profile read-model plus
// mode mastery and the ladder, and the owner's highlight candidates. Everything here comes from recorded sessions.
import { prisma } from '@/lib/db';
import { composeProfile } from '@/lib/camp/profile';
import { bestSample, candidateHighlights, masteryLabel, maskStats, normalizeVisibility, recordsByMode, type HighlightCandidate, type PublicStats, type Visibility } from './card-stats';

export async function computePublicStats(userId: string): Promise<PublicStats> {
  const [profile, mastery, ladder, sessions] = await Promise.all([
    composeProfile(userId),
    prisma.modeMastery.findMany({ where: { userId }, orderBy: { tier: 'desc' } }),
    prisma.ladderEntry.findMany({ where: { userId }, orderBy: { bestScore: 'desc' }, take: 1, include: { season: { select: { mode: true, weekStart: true } } } }),
    prisma.gameSession.findMany({ where: { userId }, select: { mode: true, score: true, won: true }, take: 500, orderBy: { createdAt: 'desc' } }),
  ]);
  const prq = profile.prq.measured && Object.keys(profile.prq.measured).length ? profile.prq.measured : profile.prq.card;
  return {
    prq: prq ? Object.fromEntries(Object.entries(prq).map(([k, v]) => [k, Math.round(Number(v))])) : null,
    mastery: mastery.map((m) => ({ mode: m.mode, tier: m.tier, label: masteryLabel(m.tier), best: bestSample(m.samples) })),
    records: recordsByMode(sessions),
    resiliency: profile.history.sessions ? { attempts: profile.resiliency.attempts, retryRate: profile.resiliency.retryRate, returnedAfterLoss: profile.resiliency.returnedAfterLoss } : null,
    movement: profile.movement.latestAt ? { latestAt: new Date(profile.movement.latestAt).toISOString(), delta: profile.movement.delta } : null,
    ladder: ladder[0] ? { mode: ladder[0].season.mode, bestScore: ladder[0].bestScore, weekStart: ladder[0].season.weekStart.toISOString() } : null,
    verified: true,
  };
}

export async function publicStatsFor(userId: string, showStats: unknown): Promise<{ stats: PublicStats; visibility: Visibility }> {
  const visibility = normalizeVisibility(showStats);
  return { stats: maskStats(await computePublicStats(userId), visibility), visibility };
}

export async function highlightCandidatesFor(userId: string): Promise<HighlightCandidate[]> {
  const [sessions, sigs] = await Promise.all([
    prisma.gameSession.findMany({ where: { userId }, select: { id: true, mode: true, score: true, won: true, createdAt: true }, orderBy: { score: 'desc' }, take: 200 }),
    prisma.signatureAttempt.findMany({ where: { userId }, select: { id: true, mode: true, score: true, createdAt: true }, orderBy: { score: 'desc' }, take: 50 }),
  ]);
  return candidateHighlights(sessions, sigs);
}
