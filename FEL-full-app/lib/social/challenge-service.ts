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
import { ChallengeLinkCore, type ChallengeExtra, type ChallengeKeyMoment, type ChallengePayload } from './challenge-link-core';
import { signPayload, verifyChallenge } from './challenge-sign';
import { challengeExpiresAt, isChallengeExpired, outcomeOf, termsOf, extraFor, type ChallengeOutcome, type ChallengeTerms } from './challenge-terms';
import { signReceipt, whoKey } from './challenge-receipt';

export interface MintChallengeInput {
  ownerUserId?: string | null;
  modeKey: string;
  score: number;
  display?: string;
  keyMoments?: ChallengeKeyMoment[];
  athleteTag?: string;
  /** CHALLENGES-2: a rep challenge's metric and/or the challenge this one answers (signed into the payload's `x`). */
  extra?: ChallengeExtra;
}

export interface MintedChallenge {
  code: string;
  path: string;
  modeKey: string;
  score: number;
  /** CHALLENGES-2: when it closes (48 h), epoch ms. */
  expiresAt?: number | null;
}

/** Mint + sign + store a challenge from a finished run. Server stamps time. */
export async function mintChallenge(input: MintChallengeInput): Promise<MintedChallenge> {
  const { payload } = ChallengeLinkCore.mint({
    modeKey: input.modeKey,
    score: input.score,
    display: input.display,
    keyMoments: input.keyMoments ?? [],
    athleteTag: input.athleteTag ?? 'ATHLETE',
    extra: input.extra,
  });
  const signed = signPayload(payload);

  // CHALLENGES-2: the code is a hash of the signature over the whole payload, so the same code IS the same challenge
  // (the same player, score, terms and millisecond: a double tap). Answer with it instead of a 500.
  const minted: MintedChallenge = { code: signed.code, path: `/c/${signed.code}`, modeKey: input.modeKey, score: input.score, expiresAt: challengeExpiresAt(signed.payload) };
  if (await prisma.challengeLink.findUnique({ where: { code: signed.code } })) return minted;

  try {
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
  } catch (e) {
    if ((e as { code?: string } | null)?.code === 'P2002') return minted; // the same double tap, at the same moment
    throw e;
  }

  await recordServerEvent({
    name: 'challenge_created',
    userId: input.ownerUserId ?? null,
    props: { code: signed.code, modeKey: input.modeKey, score: input.score, ...(input.extra?.kind ? { kind: input.extra.kind } : {}), ...(input.extra?.re ? { rematchOf: input.extra.re } : {}) },
  });

  return minted;
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
  /** CHALLENGES-2: the clock (tests). */
  now?: number;
}

export interface ResolveAttemptResult {
  beat: boolean;
  margin: number;
  targetScore: number;
  vs: string;
  rematch: MintedChallenge | null;
  convertToSignup: boolean;
  /** CHALLENGES-2: won / lost / tie (equal is a tie; `beat` stays strictly higher). */
  outcome: ChallengeOutcome;
  attemptScore: number;
  modeKey: string;
  terms: ChallengeTerms;
  expiresAt: number | null;
  /** The signed result (lib/social/challenge-receipt.ts): the result card and the one-tap rematch read it. */
  receipt: string;
}

/** CHALLENGES-2: the attempt came after the challenge's 48 hours. */
export const CHALLENGE_EXPIRED = 'expired' as const;

/** The stored row's payload, verified and matching its columns, or null (forged / corrupt / v1 past the sunset). */
export async function verifiedChallenge(code: string) {
  const link = await prisma.challengeLink.findUnique({ where: { code } });
  if (!link) return null;
  const payload = verifyChallenge(link.payload as unknown as ChallengePayload, link.sig);
  if (!payload) return null;
  if (
    link.score !== payload.score ||
    link.modeKey !== payload.modeKey ||
    link.tag !== payload.tag ||
    (link.display ?? undefined) !== payload.display
  ) return null;
  return { link, payload };
}

/**
 * Resolve a finished attempt against a challenge. Verifies the signature so a
 * tampered target score can't poison the funnel, bumps attempted/beaten, emits
 * funnel telemetry, and (on a win) mints a rematch link = the loop.
 */
export async function resolveAttempt(input: ResolveAttemptInput): Promise<ResolveAttemptResult | typeof CHALLENGE_EXPIRED | null> {
  // CHALLENGE-SIGN-V2: `payload` is only what the signature covers (a v1 row's ghost is reduced to {t}), and the
  // columns the pages show must match it, else the row is treated as forged.
  const found = await verifiedChallenge(input.code);
  if (!found) return null; // missing / forged / corrupt / v1 past the sunset
  const { link, payload } = found;
  const now = input.now ?? Date.now();
  // CHALLENGES-2: a challenge lives 48 hours from its signed time (challenge-terms.ts); after that nothing counts
  if (isChallengeExpired(payload, now)) return CHALLENGE_EXPIRED;
  const terms = termsOf(payload);

  await prisma.challengeLink.update({ where: { code: input.code }, data: { attempted: { increment: 1 } } });
  await recordServerEvent({
    name: 'challenge_attempted',
    userId: input.userId ?? null,
    guestId: input.guestId ?? null,
    props: { code: input.code, modeKey: link.modeKey, attemptScore: input.attemptScore },
  });

  const res = ChallengeLinkCore.resolve(payload, input.attemptScore);

  let rematch: MintedChallenge | null = null;
  // CHALLENGES-2 (owner: a guest signs up to save or to rematch): only a signed-in winner gets the rematch link minted
  // here, owned by them. A guest's win no longer mints an ownerless link; the result card offers the rematch.
  if (res.beat) {
    await prisma.challengeLink.update({ where: { code: input.code }, data: { beaten: { increment: 1 } } });
    await recordServerEvent({
      name: 'challenge_beat',
      userId: input.userId ?? null,
      guestId: input.guestId ?? null,
      props: { code: input.code, modeKey: link.modeKey, margin: res.margin },
    });
    // Winner mints back = the K-factor loop.
    if (input.userId) {
      rematch = await mintChallenge({
        ownerUserId: input.userId,
        modeKey: link.modeKey,
        score: input.attemptScore,
        athleteTag: input.attemptTag ?? 'CHALLENGER',
        extra: extraFor({ metric: terms.metric, re: { code: input.code, score: payload.score, tag: payload.tag } }),
      });
    }
  }

  const who = input.userId ? whoKey('u', input.userId) : whoKey('g', input.guestId ?? 'anon');
  return {
    beat: res.beat,
    margin: res.margin,
    targetScore: payload.score,
    vs: payload.tag,
    rematch,
    convertToSignup: res.funnel.convertToSignup,
    outcome: outcomeOf(payload.score, input.attemptScore),
    attemptScore: input.attemptScore,
    modeKey: link.modeKey,
    terms,
    expiresAt: challengeExpiresAt(payload),
    receipt: signReceipt({ c: input.code, s: input.attemptScore, ts: payload.score, at: now, w: who }),
  };
}

/**
 * CHALLENGES-2: the one-tap rematch. A new challenge from the player who answered `code`, on their score, aimed back:
 * same game (or the same Mirror number), and it names the challenge it answers so its page can show both scores. The
 * score comes from the caller's verified result (a receipt, or a guest result carried into the account), never from a
 * number the client sends. Null when the challenge it answers is missing or forged.
 */
export async function mintRematch(input: { userId: string; code: string; myScore: number; athleteTag: string }): Promise<MintedChallenge | null> {
  const found = await verifiedChallenge(input.code);
  if (!found) return null;
  const { link, payload } = found;
  const terms = termsOf(payload);
  const minted = await mintChallenge({
    ownerUserId: input.userId,
    modeKey: link.modeKey,
    score: input.myScore,
    athleteTag: input.athleteTag,
    extra: extraFor({ metric: terms.metric, re: { code: input.code, score: payload.score, tag: payload.tag } }),
  });
  await recordServerEvent({ name: 'challenge_rematch', userId: input.userId, props: { code: input.code, rematch: minted.code, modeKey: link.modeKey } });
  return minted;
}
