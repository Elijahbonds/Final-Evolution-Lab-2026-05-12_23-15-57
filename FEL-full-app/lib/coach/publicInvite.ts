// publicInvite — the one reusable invite a coach shares with the world.
//
// TYING THE TWO HALVES TOGETHER (owner, 2026-09-19: "make sure to tie it all together"). Two things existed and did
// not know about each other: a coach can share a program to a public page that anyone can open without an account
// (lib/share, app/p/[token]), and a coach can invite an athlete onto their roster (lib/coach/invite). So a stranger
// could read a coach's whole programming block, like it, and have no way to become that coach's client — the share
// page offered nothing at all, not even the coach's name.
//
// A coach gets ONE long-lived reusable invite for this, created the first time they need it, the same lazy pattern
// ensureReferralCode uses. Not a fresh invite per share, per view or per reader: that would fill the table with
// capability URLs nobody asked for, and it would make "revoke my public invite" impossible to reason about. One
// public link, the coach can revoke it, and every share they have ever sent starts pointing at a new one.

import type { PrismaClient } from '@/public/_prisma/client';
import { INVITE_TTL_MS } from './invite';

/** How long a public invite lives before it is quietly rolled over. A year: it is on flyers and old messages. */
export const PUBLIC_INVITE_TTL_MS = 365 * 24 * 60 * 60 * 1000;

type Db = Pick<PrismaClient, 'coachInvite'>;

/**
 * The coach's public invite token, made on first use and reused after that.
 *
 * `use: 'many'` always — a public invite that died on its first taker would be a bug on a flyer. Expiry is long and
 * refreshed on read, so a link printed a year ago keeps working as long as the coach is still active.
 */
export async function ensurePublicInvite(db: Db, coachId: string, newToken: () => string): Promise<string> {
  const now = new Date();
  const live = await db.coachInvite.findFirst({
    where: { coachId, use: 'many', closedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
    select: { token: true, expiresAt: true },
  });
  if (live) {
    // keep a long-lived public link from ageing out while the coach is still sharing
    const soon = new Date(now.getTime() + INVITE_TTL_MS.many);
    if (live.expiresAt < soon) {
      await db.coachInvite.update({
        where: { token: live.token },
        data: { expiresAt: new Date(now.getTime() + PUBLIC_INVITE_TTL_MS) },
      }).catch(() => {});
    }
    return live.token;
  }
  const created = await db.coachInvite.create({
    data: {
      token: newToken(), coachId, use: 'many',
      expiresAt: new Date(now.getTime() + PUBLIC_INVITE_TTL_MS),
    },
    select: { token: true },
  });
  return created.token;
}
