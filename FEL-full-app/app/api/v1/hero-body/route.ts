export const dynamic = 'force-dynamic';

// GET /api/v1/hero-body — which body this player wears (EVERYONE-BODY-MOCAP-OPPONENTS, 2026-09-14).
//
// The scan is the owner's body only, and WHO the owner is stays on the server: `FEL_SCAN_OWNER_EMAILS` is read
// here and nowhere else, and the response carries only the decision. A guest gets 200 with the neutral kit body
// rather than a 401 — every mode spawns through this, and a guest is a normal case, not an error.
//
// The creator frame (height / build / reach / body type) rides along so a kit-body player with no body scan still
// plays the proportions they built. A database that is missing or unreachable degrades to the kit default: a spawn
// must never fail because a profile row could not be read.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { decideHeroBody, parseOwnerEmails, type HeroBodyKind } from '@/lib/babylon/core/heroBody';

export interface HeroBodyResponse {
  body: HeroBodyKind;
  guest: boolean;
  frame: Record<string, unknown> | null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; email?: string | null } | undefined;
  const owners = parseOwnerEmails(process.env.FEL_SCAN_OWNER_EMAILS);
  if (!user?.id) {
    return NextResponse.json({ body: decideHeroBody(null, owners, null), guest: true, frame: null } satisfies HeroBodyResponse);
  }
  let frame: Record<string, unknown> | null = null;
  try {
    // AthleteBuild.build is the BuildPayload (lib/creator/schema/saveBuild.ts); the frame is one of its halves
    const row = await prisma.athleteBuild.findUnique({ where: { userId: user.id }, select: { build: true } });
    const f = (row?.build as { frame?: unknown } | null | undefined)?.frame;
    frame = f && typeof f === 'object' && !Array.isArray(f) ? (f as Record<string, unknown>) : null;
  } catch (e) {
    console.warn('[hero-body] creator frame unavailable, using the kit default:', (e as Error)?.message ?? e);
  }
  return NextResponse.json({ body: decideHeroBody(user.email ?? null, owners, frame), guest: false, frame } satisfies HeroBodyResponse);
}
