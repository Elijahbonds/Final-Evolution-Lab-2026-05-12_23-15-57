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
import { decideHeroBody, ownsScan, parseOwnerEmails, type HeroBodyKind } from '@/lib/babylon/core/heroBody';
import { activeLook } from '@/lib/creator/look/slots';
import { paletteOverrides } from '@/lib/creator/look/buildPalette';
import type { PaletteOverrides } from '@/lib/creator/look/palette';

export interface HeroBodyResponse {
  body: HeroBodyKind;
  guest: boolean;
  frame: Record<string, unknown> | null;
  /** IMPROVE (2026-10-06), research item 1: the Athlete Creator's colour picks (AthleteBuild.palette) that differ from
   *  their defaults, as { jersey, shorts, shoes, accent } hexes. Before this they were saved and never reached a mode. */
  palette: PaletteOverrides | null;
  /** IMPROVE (2026-10-06), CREATOR-PLAN phase 4a: whether this account owns a scan body, so the Closet can offer it as a
   *  slot's body. Only ever this account's own yes/no; who the owners are stays here. */
  scanOwned: boolean;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; email?: string | null } | undefined;
  const owners = parseOwnerEmails(process.env.FEL_SCAN_OWNER_EMAILS);
  if (!user?.id) {
    return NextResponse.json({ body: decideHeroBody(null, owners, null), guest: true, frame: null, palette: null, scanOwned: false } satisfies HeroBodyResponse);
  }
  let frame: Record<string, unknown> | null = null;
  let palette: PaletteOverrides | null = null;
  try {
    // AthleteBuild.build is the BuildPayload (lib/creator/schema/saveBuild.ts); the frame and the palette are two of its parts
    const row = await prisma.athleteBuild.findUnique({ where: { userId: user.id }, select: { build: true } });
    const build = row?.build as { frame?: unknown; palette?: unknown } | null | undefined;
    const f = build?.frame;
    frame = f && typeof f === 'object' && !Array.isArray(f) ? (f as Record<string, unknown>) : null;
    // A minor's Finalize stores the default palette (lookPrivacy), which has no overrides, so nothing personal rides here.
    const p = paletteOverrides(build?.palette);
    palette = Object.keys(p).length ? p : null;
  } catch (e) {
    console.warn('[hero-body] creator frame unavailable, using the kit default:', (e as Error)?.message ?? e);
  }
  // IMPROVE (2026-10-06), CREATOR-PLAN phase 4a: the active slot chooses the body (a minor's row holds no slots, so the
  // server never sees theirs; their device look picks it client-side, heroBodyForSlot, within what scanOwned allows).
  let preferred: 'male' | 'female' | 'scan' | null = null;
  try {
    const look = await prisma.avatarLook.findUnique({ where: { userId: user.id }, select: { face: true } });
    preferred = activeLook(look?.face ?? null).body;
  } catch (e) {
    console.warn('[hero-body] look unavailable, using the default body:', (e as Error)?.message ?? e);
  }
  const email = user.email ?? null;
  return NextResponse.json({ body: decideHeroBody(email, owners, frame, preferred), guest: false, frame, palette, scanOwned: ownsScan(email, owners) } satisfies HeroBodyResponse);
}
