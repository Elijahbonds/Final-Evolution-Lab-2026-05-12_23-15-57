// The invite rows' server side (coach-loop P1): the coded token every new invite gets, and the one create both the
// single invite and the bulk import go through. lib/coach/invite.ts and inviteCode.ts stay pure.
import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@/lib/generated/prisma';
import { INVITE_TTL_MS, type InviteUse } from './invite';
import { codeFromBytes, codeTokenPrefix, tokenWithCode } from './inviteCode';

type Db = Pick<PrismaClient, 'coachInvite'>;

export const INVITE_SELECT = { token: true, use: true, expiresAt: true, joined: true, createdAt: true } as const;

/** A token that carries a fresh code: `CODE~` + 192 random bits, the link's strength unchanged. */
export function newCodedToken(): { code: string; token: string } {
  const code = codeFromBytes(randomBytes(5));
  return { code, token: tokenWithCode(code, randomBytes(24).toString('base64url')) };
}

/**
 * Create one invite with a code no other invite holds. 40 bits make a clash vanishingly rare; the check makes it
 * impossible, so a typed code can never land on two rosters.
 */
export async function createCodedInvite(db: Db, coachId: string, use: InviteUse, now: Date = new Date()) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { code, token } = newCodedToken();
    const clash = await db.coachInvite.findFirst({ where: { token: { startsWith: codeTokenPrefix(code) } }, select: { token: true } });
    if (clash) continue;
    const invite = await db.coachInvite.create({
      data: { token, coachId, use, expiresAt: new Date(now.getTime() + INVITE_TTL_MS[use]) },
      select: INVITE_SELECT,
    });
    return { ...invite, code };
  }
  throw new Error('invite code space exhausted on four tries');
}
