// PROFILE V2 — every row the profile shows, in ONE batch of parallel reads (owner 2026-10-24: "slow and laggy on
// iPhone"). Before this, /profile drew an empty shell and then made eight client requests (two of them the same
// /api/profile), each re-reading the session and its own rows: ~49 database calls behind a hydrate-then-fetch waterfall
// (docs/PROFILE-V2.md has the measurement). Now the server reads once and the page arrives with its numbers.
//
// The age and opt-in gates run INSIDE the reads that need them (lib/profile-v2/gate.ts), so there is no
// read-the-age-first round trip and no minor's rows are fetched to be dropped. Every read fails soft to its empty value:
// one missing table (an unapplied pending SQL file) costs its block, never the page.

import type { Prisma } from '@/lib/generated/prisma';
import { RIVAL_HISTORY_SINCE } from '@/lib/rival-history';
import { SAVED_NUMBER_KINDS } from '@/lib/privacy/scanSaveConsent';
import { assembleProfile, type ProfileRows, type ProfileV2Data } from './assemble';
import { scanSaveUserWhere, verifiedAdultUserWhere } from './gate';
import { HISTORY_MS, WEEK_MS } from './week';

/** The WorkoutScan kinds that carry a jump height (the Mirror's saved numbers, plus the games' camera jumps). */
export const JUMP_SCAN_KINDS: readonly string[] = [...SAVED_NUMBER_KINDS, 'jump'];
/** Rows a block reads at most: a profile is a summary, not an archive. */
export const READ_CAP = { scans: 300, mirror: 300, scores: 1500, played: 400, matches: 200, prq: 400 } as const;

/** Structural, so a test's fake fits. Only the calls this file makes. */
export interface ProfileDb {
  user: { findUnique(a: unknown): Promise<any> };
  playerProfile: { findUnique(a: unknown): Promise<any> };
  scanSaveOptIn: { findUnique(a: unknown): Promise<any> };
  prqEntry: { findMany(a: unknown): Promise<any[]> };
  modeMastery: { findMany(a: unknown): Promise<any[]> };
  workoutScan: { findMany(a: unknown): Promise<any[]> };
  mirrorSession: { findMany(a: unknown): Promise<any[]> };
  gameSession: { groupBy(a: unknown): Promise<any[]>; aggregate(a: unknown): Promise<any>; findMany(a: unknown): Promise<any[]> };
  mpMatch: { findMany(a: unknown): Promise<any[]> };
  challengeLink: { aggregate(a: unknown): Promise<any> };
  creatorCard: { findFirst(a: unknown): Promise<any> };
  coachClient: { findMany(a: unknown): Promise<any[]> };
  credential: { findMany(a: unknown): Promise<any[]> };
  mirrorTriumph: { findMany(a: unknown): Promise<any[]> };
}

const soft = <T>(p: Promise<T>, empty: T): Promise<T> => p.catch(() => empty);

/** The reads, all started at once. Exported for the query-count probe. */
export async function readProfileRows(db: ProfileDb, userId: string, now: Date = new Date()): Promise<ProfileRows> {
  const since = new Date(now.getTime() - HISTORY_MS);
  const twoWeeks = new Date(now.getTime() - 2 * WEEK_MS);
  const adult = verifiedAdultUserWhere(now);
  const canSave = scanSaveUserWhere(now);
  // DERBY-KEY (lib/rival-history): a key whose older rows are another game's scale counts only from its cut-over
  const splitKeys = Object.keys(RIVAL_HISTORY_SINCE);
  // typed against the generated client, so a gate that Prisma would reject fails tsc rather than production
  const jumpWhere: Prisma.WorkoutScanWhereInput = { userId, kind: { in: [...JUMP_SCAN_KINDS] }, createdAt: { gte: since }, user: { is: canSave } };
  const mirrorWhere: Prisma.MirrorSessionWhereInput = { userId, patternId: { in: ['squat', 'lunge'] }, createdAt: { gte: since }, user: { is: canSave } };
  const bestsWhere: Prisma.GameSessionWhereInput = { userId, mode: { notIn: splitKeys }, user: { is: adult } };
  const splitWhere = (mode: string): Prisma.GameSessionWhereInput => ({ userId, mode, createdAt: { gte: new Date(RIVAL_HISTORY_SINCE[mode]) }, user: { is: adult } });
  const scoresWhere: Prisma.GameSessionWhereInput = { userId, createdAt: { gte: since }, user: { is: adult } };
  const matchWhere: Prisma.MpMatchWhereInput = { status: 'settled', kind: 'online', OR: [{ hostId: userId }, { guestId: userId }] };

  const [user, profile, optIn, prqEntries, mastery, jumpScans, mirrorSessions, grouped, splitBests, recentScores, played, matches, links, card, coaches, credentials, triumphs] = await Promise.all([
    soft(db.user.findUnique({ where: { id: userId }, select: { name: true, dobYear: true, createdAt: true } }), null),
    soft(db.playerProfile.findUnique({ where: { userId }, select: { xp: true, streakDays: true, avatarKey: true, cosmeticAssetId: true } }), null),
    soft(db.scanSaveOptIn.findUnique({ where: { userId }, select: { scope: true, granted: true, revokedAt: true } }), null),
    soft(db.prqEntry.findMany({ where: { userId }, orderBy: { measuredAt: 'desc' }, take: READ_CAP.prq, select: { id: true, attribute: true, value: true, unit: true, source: true, measuredAt: true } }), []),
    soft(db.modeMastery.findMany({ where: { userId }, select: { mode: true, tier: true } }), []),
    soft(db.workoutScan.findMany({
      where: jumpWhere,
      orderBy: { createdAt: 'desc' }, take: READ_CAP.scans, select: { kind: true, metrics: true, createdAt: true },
    }), []),
    soft(db.mirrorSession.findMany({
      where: mirrorWhere,
      orderBy: { createdAt: 'desc' }, take: READ_CAP.mirror, select: { patternId: true, reps: true, faultCounts: true, createdAt: true },
    }), []),
    soft(db.gameSession.groupBy({
      by: ['mode'], where: bestsWhere, _max: { score: true }, _count: { _all: true },
    }), []),
    Promise.all(splitKeys.map((mode) => soft(db.gameSession.aggregate({
      where: splitWhere(mode), _max: { score: true }, _count: { _all: true },
    }).then((a: any) => ({ mode, best: a?._max?.score ?? null, runs: a?._count?._all ?? 0 })), { mode, best: null, runs: 0 }))),
    soft(db.gameSession.findMany({
      where: scoresWhere, orderBy: { createdAt: 'desc' }, take: READ_CAP.scores, select: { mode: true, score: true, createdAt: true },
    }), []),
    soft(db.gameSession.findMany({ where: { userId, createdAt: { gte: twoWeeks } }, orderBy: { createdAt: 'desc' }, take: READ_CAP.played, select: { createdAt: true } }), []),
    soft(db.mpMatch.findMany({
      where: matchWhere, orderBy: { updatedAt: 'desc' }, take: READ_CAP.matches,
      select: { kind: true, status: true, hostId: true, hostName: true, guestId: true, guestName: true, winnerId: true, mode: true, updatedAt: true },
    }), []),
    soft(db.challengeLink.aggregate({ where: { ownerUserId: userId }, _count: { _all: true }, _sum: { opened: true, attempted: true, beaten: true } }), null),
    soft(db.creatorCard.findFirst({ where: { ownerId: userId }, select: { slug: true, published: true, displayName: true, highlights: true } }), null),
    soft(db.coachClient.findMany({ where: { clientId: userId, endedAt: null }, select: { coach: { select: { name: true } } } }), []),
    soft(db.credential.findMany({ where: { userId, passed: true }, select: { trackKey: true, moduleKey: true, earnedAt: true } }), []),
    soft(db.mirrorTriumph.findMany({ where: { userId }, select: { mode: true, totalBeats: true, longestStreak: true } }), []),
  ]);

  const bests = [
    ...grouped.map((g: any) => ({ mode: String(g.mode), best: g?._max?.score ?? null, runs: g?._count?._all ?? 0 })),
    ...splitBests,
  ];
  return {
    user, profile, optIn, prqEntries, mastery, jumpScans, mirrorSessions, bests, recentScores,
    playedAt: played.map((p: any) => p.createdAt),
    matches,
    links: { count: links?._count?._all ?? 0, opened: links?._sum?.opened ?? 0, attempted: links?._sum?.attempted ?? 0, beaten: links?._sum?.beaten ?? 0 },
    card,
    coaches: coaches.map((c: any) => ({ name: c?.coach?.name ?? null })),
    credentials, triumphs,
  };
}

export async function loadProfile(db: ProfileDb, userId: string, now: Date = new Date()): Promise<ProfileV2Data> {
  return assembleProfile(userId, await readProfileRows(db, userId, now), now);
}
