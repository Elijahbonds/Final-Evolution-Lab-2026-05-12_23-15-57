/**
 * lib/social/challenge-service.ts
 * ===============================
 * M13 Step 4 — Challenge links (K-factor engine), persistence layer.
 *
 * The pure shape + resolution lives in challenge-link-core.ts (verified port);
 * signing lives in challenge-sign.ts. This service mints a signed link from a
 * finished run, stores it under a short public code, and resolves guest/authed
 * attempts while incrementing the viral funnel counters and emitting the
 * funnel telemetry (created -> opened -> attempted -> beat -> signup).
 *
 * Guests can attempt with NO account and NO PII: only the athlete's short tag
 * and metadata-only ghost travel in the payload (M13 FIREWALL).
 */

import { prisma } from '@/lib/db';
import { recordServerEvent } from '@/lib/analytics-server';
import { ChallengeLinkCore, type ChallengeKeyMoment, type ChallengePayload } from './challenge-link-core';
import { signPayload, verifyPayload } from './challenge-sign';

export interface MintChallengeInput {
  ownerUserId?: string | null;
  modeKey: string;
  score: number;
  display?: string;
  keyMoments?: ChallengeKeyMoment[];
  athleteTag?: string;
}

export interface MintedChallenge {
  code: string;
  path: string;
  modeKey: string;
  score: number;
}

/** Mint + sign + store a challenge from a finished run. Server stamps time. */
export async function mintChallenge(input: MintChallengeInput): Promise<MintedChallenge> {
  const { payload } = ChallengeLinkCore.mint({
    modeKey: input.modeKey,
    score: input.score,
    display: input.display,
    keyMoments: input.keyMoments ?? [],
    athleteTag: input.athleteTag ?? 'ATHLETE',
  });
  const signed = signPayload(payload);

  await prisma.challengeLink.create({
    data: {
      code: signed.code,
      ownerUserId: input.ownerUserId ?? null,
      modeKey: input.modeKey,
      score: input.score,
      display: input.display ?? null,
      tag: signed.payload.tag,
      payload: signed.payload as any,
      sig: signed.sig,
    },
  });

  await recordServerEvent({
    name: 'challenge_created',
    userId: input.ownerUserId ?? null,
    props: { code: signed.code, modeKey: input.modeKey, score: input.score },
  });

  return { code: signed.code, path: `/c/${signed.code}`, modeKey: input.modeKey, score: input.score };
}

export async function getChallenge(code: string) {
  return prisma.challengeLink.findUnique({ where: { code } });
}

/** Record that a link was opened (viral top of funnel). Idempotent-ish. */
export async function markOpened(code: string, guestId?: string | null, userId?: string | null) {
  const link = await prisma.challengeLink.findUnique({ where: { code } });
  if (!link) return null;
  await prisma.challengeLink.update({ where: { code }, data: { opened: { increment: 1 } } });
  await recordServerEvent({
    name: 'challenge_opened',
    userId: userId ?? null,
    guestId: guestId ?? null,
    props: { code, modeKey: link.modeKey },
  });
  return link;
}

export interface ResolveAttemptInput {
  code: string;
  attemptScore: number;
  attemptTag?: string;
  guestId?: string | null;
  userId?: string | null;
}

export interface ResolveAttemptResult {
  beat: boolean;
  margin: number;
  targetScore: number;
  vs: string;
  rematch: MintedChallenge | null;
  convertToSignup: boolean;
}

/**
 * Resolve a finished attempt against a challenge. Verifies the signature so a
 * tampered target score can't poison the funnel, bumps attempted/beaten, emits
 * funnel telemetry, and (on a win) mints a rematch link = the loop.
 */
export async function resolveAttempt(input: ResolveAttemptInput): Promise<ResolveAttemptResult | null> {
  const link = await prisma.challengeLink.findUnique({ where: { code: input.code } });
  if (!link) return null;

  const payload = link.payload as unknown as ChallengePayload;
  if (!verifyPayload(payload, link.sig)) return null; // forged / corrupt

  await prisma.challengeLink.update({ where: { code: input.code }, data: { attempted: { increment: 1 } } });
  await recordServerEvent({
    name: 'challenge_attempted',
    userId: input.userId ?? null,
    guestId: input.guestId ?? null,
    props: { code: input.code, modeKey: link.modeKey, attemptScore: input.attemptScore },
  });

  const res = ChallengeLinkCore.resolve(payload, input.attemptScore);

  let rematch: MintedChallenge | null = null;
  if (res.beat) {
    await prisma.challengeLink.update({ where: { code: input.code }, data: { beaten: { increment: 1 } } });
    await recordServerEvent({
      name: 'challenge_beat',
      userId: input.userId ?? null,
      guestId: input.guestId ?? null,
      props: { code: input.code, modeKey: link.modeKey, margin: res.margin },
    });
    // Winner mints back = the K-factor loop.
    rematch = await mintChallenge({
      ownerUserId: input.userId ?? null,
      modeKey: link.modeKey,
      score: input.attemptScore,
      athleteTag: input.attemptTag ?? 'CHALLENGER',
    });
  }

  return {
    beat: res.beat,
    margin: res.margin,
    targetScore: link.score,
    vs: payload.tag,
    rematch,
    convertToSignup: res.funnel.convertToSignup,
  };
}
