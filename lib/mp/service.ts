/**
 * lib/mp/service.ts — server-only async-multiplayer engine.
 *
 * Async, NOT realtime: a host posts a challenge (their best recorded score for
 * a mode), shares a code, and a guest later beats it on their own time. Scores
 * are ALWAYS derived server-side from the player's own GameSession history —
 * the client never supplies a score here, so a challenge can't be fabricated.
 *
 * Local (pass-and-play) matches settle immediately on one device/account.
 *
 * Settlement grants coins (MP_MATCH_PLAYED) to every participant and shards
 * (MP_MATCH_WON) to the winner, idempotent per (match, player) so a retried
 * settle never double-pays.
 */
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { grantServerReward } from '@/lib/wallet/wallet-service';
import { REASON } from '@/lib/wallet/reward-rules';
import { generateMatchCode, resolveOutcome, winnerIdFor } from '@/lib/mp/match-core';

/** Best recorded score for a user in a mode (server-authoritative). 0 if none. */
export async function bestScoreFor(prisma: PrismaClient, userId: string, mode: string): Promise<number> {
  const row = await prisma.gameSession.findFirst({
    where: { userId, mode },
    orderBy: { score: 'desc' },
    select: { score: true },
  });
  return row?.score ?? 0;
}

async function uniqueCode(prisma: PrismaClient): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = generateMatchCode();
    const clash = await prisma.mpMatch.findUnique({ where: { code } });
    if (!clash) return code;
  }
  // Extremely unlikely; fall back to a longer code.
  return generateMatchCode(9);
}

/** Host creates an async online challenge for a mode, using their best score. */
export async function createOnlineChallenge(
  prisma: PrismaClient,
  args: { hostId: string; hostName: string; mode: string }
) {
  const hostScore = await bestScoreFor(prisma, args.hostId, args.mode);
  const code = await uniqueCode(prisma);
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // TUNE(elijah) 14d
  return prisma.mpMatch.create({
    data: {
      mode: args.mode, kind: 'online', status: 'open', code,
      hostId: args.hostId, hostName: args.hostName, hostScore, hostPlayedAt: new Date(),
      expiresAt,
    },
  });
}

/** Guest joins an open challenge by code, posts their best score, settles it. */
export async function joinAndSettle(
  prisma: PrismaClient,
  args: { code: string; guestId: string; guestName: string }
) {
  const match = await prisma.mpMatch.findUnique({ where: { code: args.code.toUpperCase() } });
  if (!match) return { error: 'not_found' as const };
  if (match.status === 'settled') return { error: 'already_settled' as const, match };
  if (match.hostId === args.guestId) return { error: 'cannot_join_own' as const };
  if (match.guestId && match.guestId !== args.guestId) return { error: 'already_taken' as const };

  const guestScore = await bestScoreFor(prisma, args.guestId, match.mode);
  const updated = await prisma.mpMatch.update({
    where: { id: match.id },
    data: {
      guestId: args.guestId, guestName: args.guestName, guestScore,
      guestPlayedAt: new Date(), status: 'pending',
    },
  });
  const settled = await settleMatch(prisma, updated.id);
  return { match: settled };
}

/** Local pass-and-play: both scores supplied for one device, settle at once. */
export async function createLocalMatch(
  prisma: PrismaClient,
  args: { hostId: string; hostName: string; mode: string; hostScore: number; guestName: string; guestScore: number }
) {
  const code = await uniqueCode(prisma);
  const created = await prisma.mpMatch.create({
    data: {
      mode: args.mode, kind: 'local', status: 'pending', code,
      hostId: args.hostId, hostName: args.hostName,
      hostScore: Math.max(0, Math.round(args.hostScore)), hostPlayedAt: new Date(),
      guestName: args.guestName || 'Player 2',
      guestScore: Math.max(0, Math.round(args.guestScore)), guestPlayedAt: new Date(),
    },
  });
  return settleMatch(prisma, created.id);
}

/**
 * Resolve + reward a match. Idempotent: guarded by rewarded flag AND by
 * per-(match,player) idempotency keys on the wallet grants.
 */
export async function settleMatch(prisma: PrismaClient, matchId: string) {
  const match = await prisma.mpMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error('match not found');
  if (match.status === 'settled') return match;
  if (match.hostScore == null || match.guestScore == null) return match; // not ready

  const outcome = resolveOutcome(match.hostScore, match.guestScore);
  const winnerId = winnerIdFor(outcome, match.hostId, match.guestId ?? null);

  // Coins for playing — host always; guest when a real account (online).
  await grantServerReward(prisma, {
    playerId: match.hostId, reasonCode: REASON.MP_MATCH_PLAYED,
    idempotencyKey: `mp:${match.id}:played:${match.hostId}`,
    metadata: { matchId: match.id, mode: match.mode, role: 'host' },
  }).catch((e) => console.error('mp host played grant failed', e));

  if (match.kind === 'online' && match.guestId) {
    await grantServerReward(prisma, {
      playerId: match.guestId, reasonCode: REASON.MP_MATCH_PLAYED,
      idempotencyKey: `mp:${match.id}:played:${match.guestId}`,
      metadata: { matchId: match.id, mode: match.mode, role: 'guest' },
    }).catch((e) => console.error('mp guest played grant failed', e));
  }

  // Shards for the winner. In a local match only the account holder (host) can
  // bank shards, and only when host actually won.
  if (winnerId && (match.kind === 'online' || winnerId === match.hostId)) {
    await grantServerReward(prisma, {
      playerId: winnerId, reasonCode: REASON.MP_MATCH_WON,
      idempotencyKey: `mp:${match.id}:won:${winnerId}`,
      metadata: { matchId: match.id, mode: match.mode },
    }).catch((e) => console.error('mp win grant failed', e));
  }

  return prisma.mpMatch.update({
    where: { id: match.id },
    data: { status: 'settled', winnerId, rewarded: true },
  });
}
