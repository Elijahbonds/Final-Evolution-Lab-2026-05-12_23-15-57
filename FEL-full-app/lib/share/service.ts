// PERSISTING A SHARE, AND REVOKING ONE FOR REAL (2026-09-13).
//
// The server side of lib/share/. Everything interesting is decided in the pure modules; what happens here is
// the part that touches a database, and it has exactly three jobs worth arguing about.
//
//   1. THE LEAK GUARD RUNS AT THE WRITE, not only at the build. `assertNoAthleteData` already runs inside
//      every `share*()` builder, and it runs again here, because this is the last line before something is
//      written to a forever-readable address and the builders are not the only way to construct an object.
//      A duplicated check on the way to publishing somebody's body measurements is a cheap duplicate.
//
//   2. REVOKING NULLS THE PAYLOAD. Not `active: false` — the content is genuinely deleted, so a render path
//      that forgets to check a flag has nothing to render. The row survives for the trainer's own history:
//      they can see they sent something and that it is dead, which is what "revoke" should feel like.
//
//   3. AN EXPIRED OR REVOKED LINK LOOKS IDENTICAL TO ONE THAT NEVER EXISTED. Same null, same 404. A
//      capability URL that answers "this used to be something" tells a stranger their forwarded link is
//      worth trying again later, and tells a scanner which tokens are real.
//
// Free, always: nothing in this file consults a plan, a subscription or an entitlement. Sharing between a
// trainer and their clients is the thing that gets trainers onto the platform, and the store earns instead.

import 'server-only';
import { randomBytes } from 'crypto';
import { Prisma, type PrismaClient } from '@/public/_prisma/client';
import { assertNoAthleteData, isShareToken, shareIsPublishable, type Share } from './shareable';

/**
 * 192 bits, base64url.
 *
 * The URL is the entire access control, so this is sized against being guessed rather than against looking
 * tidy. Never derived from the title, the coach or the date — a token you can construct is not a token.
 *
 * It lives here rather than beside the other share helpers because it is the only one needing node's crypto,
 * and ./shareable.ts is imported by the trainer's compose screen, which is a client component.
 */
export function newShareToken(): string {
  return randomBytes(24).toString('base64url');
}

type Db = PrismaClient;

/** How many links one coach may hold live at once. A bound on abuse, not on legitimate coaching. */
export const MAX_LIVE_SHARES_PER_COACH = 500;

export interface CreatedShare {
  token: string;
  kind: string;
  title: string;
  createdAt: Date;
}

export class ShareRefused extends Error {}

/**
 * Write a share and mint its URL.
 *
 * `expiresAt` is the caller's choice and defaults to never, because a trainer's programming should not stop
 * working while a client is halfway through it. It exists for the cases where a trainer wants it.
 */
export async function createShare(
  db: Db, coachId: string, share: Share, opts: { expiresAt?: Date | null } = {},
): Promise<CreatedShare> {
  if (share.by.coachId !== coachId) {
    throw new ShareRefused('A share can only be created by the coach it is from.');
  }
  // the screen already ran in the builder; this refuses anything assembled another way
  if (!shareIsPublishable(share)) {
    throw new ShareRefused('This contains language that cannot go on a public link.');
  }
  // last line before a forever-readable address
  assertNoAthleteData(share);

  const live = await db.shareLink.count({ where: { coachId, revokedAt: null } });
  if (live >= MAX_LIVE_SHARES_PER_COACH) {
    throw new ShareRefused(`You have ${MAX_LIVE_SHARES_PER_COACH} live links. Revoke some before creating more.`);
  }

  const row = await db.shareLink.create({
    data: {
      token: newShareToken(),
      coachId,
      kind: share.kind,
      title: share.title,
      forName: share.forName ?? null,
      payload: share as unknown as object,
      expiresAt: opts.expiresAt ?? null,
    },
    select: { token: true, kind: true, title: true, createdAt: true },
  });
  return row;
}

/**
 * Read a share by its token, for the public page.
 *
 * Returns null for missing, revoked and expired alike — see rule 3. The view count is bumped best-effort and
 * never blocks the render.
 */
export async function readShare(db: Db, token: string, now: Date = new Date()): Promise<Share | null> {
  if (!isShareToken(token)) return null;             // reject junk before it reaches the database

  const row = await db.shareLink.findUnique({
    where: { token },
    select: { id: true, payload: true, revokedAt: true, expiresAt: true },
  });
  if (!row || row.revokedAt || !row.payload) return null;
  if (row.expiresAt && row.expiresAt <= now) return null;

  db.shareLink.update({ where: { id: row.id }, data: { views: { increment: 1 } } }).catch(() => {});
  return row.payload as unknown as Share;
}

/**
 * Revoke: delete the content, keep the receipt.
 *
 * Idempotent — revoking twice is not an error, because the trainer's intent is satisfied either way and an
 * error here would be a confusing thing to show somebody trying to un-send something.
 */
export async function revokeShare(db: Db, coachId: string, token: string): Promise<boolean> {
  if (!isShareToken(token)) return false;
  const row = await db.shareLink.findUnique({ where: { token }, select: { id: true, coachId: true, revokedAt: true } });
  if (!row || row.coachId !== coachId) return false;         // not yours: indistinguishable from not found
  if (row.revokedAt) return true;

  await db.shareLink.update({
    where: { id: row.id },
    // Prisma.DbNull clears the column rather than storing the JSON value `null` — the distinction matters
    // here, because "the content is gone" and "the content is the null literal" are different rows
    data: { revokedAt: new Date(), payload: Prisma.DbNull },
  });
  return true;
}

/** The trainer's own list. Content is not returned — this is an index, not a re-read of what they sent. */
export async function listShares(db: Db, coachId: string, limit = 50) {
  return db.shareLink.findMany({
    where: { coachId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
    select: {
      token: true, kind: true, title: true, forName: true,
      views: true, createdAt: true, revokedAt: true, expiresAt: true,
    },
  });
}
