// Server side of the scouting profile (lane 5): compose the public stat blocks from the Shared Profile read-model plus
// mode mastery and the ladder, and the owner's highlight candidates. Everything here comes from recorded sessions.
import { prisma } from '@/lib/db';
import { composeProfile } from '@/lib/camp/profile';
import { ageDaysOf, freshnessNote, freshnessOf } from './claimClock';
import { bestSample, candidateHighlights, masteryLabel, maskStats, normalizeVisibility, recordsByMode, type HighlightCandidate, type PublicStats, type Visibility } from './card-stats';

export async function computePublicStats(userId: string): Promise<PublicStats> {
  const [profile, mastery, ladder, sessions, newest] = await Promise.all([
    composeProfile(userId),
    prisma.modeMastery.findMany({ where: { userId }, orderBy: { tier: 'desc' } }),
    prisma.ladderEntry.findMany({ where: { userId }, orderBy: { bestScore: 'desc' }, take: 1, include: { season: { select: { mode: true, weekStart: true } } } }),
    prisma.gameSession.findMany({ where: { userId }, select: { mode: true, score: true, won: true }, take: 500, orderBy: { createdAt: 'desc' } }),
    // the card stored a snapshot and a snapshot has no clock — this is the timestamp the shield needs
    prisma.prqEntry.findFirst({ where: { userId }, orderBy: { measuredAt: 'desc' }, select: { measuredAt: true } }),
  ]);
  const measured = !!(profile.prq.measured && Object.keys(profile.prq.measured).length);
  const prq = measured ? profile.prq.measured : profile.prq.card;

  const measuredAt = measured && newest ? newest.measuredAt.toISOString() : null;
  const ageDays = ageDaysOf(measuredAt, Date.now());
  const freshness = ageDays === null ? null : freshnessOf(ageDays);
  // an expired reading is withheld rather than shown with a caveat: a caveat is the thing that does not
  // survive contact with a UI, and this block is read by somebody who cannot check it
  const publish = prq && freshness !== 'expired';

  return {
    prq: publish ? Object.fromEntries(Object.entries(prq).map(([k, v]) => [k, Math.round(Number(v))])) : null,
    prqSource: publish ? (measured ? 'measured' : 'profile') : null,
    prqMeasuredAt: measuredAt,
    prqFreshness: freshness,
    prqNote: ageDays === null ? null : freshnessNote(ageDays),
    mastery: mastery.map((m) => ({ mode: m.mode, tier: m.tier, label: masteryLabel(m.tier), best: bestSample(m.samples) })),
    records: recordsByMode(sessions),
    resiliency: profile.history.sessions ? { attempts: profile.resiliency.attempts, retryRate: profile.resiliency.retryRate, returnedAfterLoss: profile.resiliency.returnedAfterLoss } : null,
    movement: profile.movement.latestAt ? { latestAt: new Date(profile.movement.latestAt).toISOString(), delta: profile.movement.delta } : null,
    ladder: ladder[0] ? { mode: ladder[0].season.mode, bestScore: ladder[0].bestScore, weekStart: ladder[0].season.weekStart.toISOString() } : null,
    // the shield needs BOTH: measured, and still current. "Measured" alone left a shield beside a reading
    // from eight months ago, which is the single most misleading thing this card could say.
    verified: measured && freshness === 'fresh',
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
