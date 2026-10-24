/**
 * app/api/guest/route.ts
 * ======================
 * M13 Step 1 — issue an anonymous guest session ("60 seconds to a dunk").
 *
 * A guest gets an opaque rotating token in an httpOnly cookie and a matching
 * GuestSession row. NO PII is ever collected (M13 FIREWALL). The taste-run
 * state lives in GuestSession.data and migrates into the account on signup.
 *
 * TIP-GUEST-TOKEN-HASH (2026-10-19): the row and the guest_start event carry
 * hashGuestToken(token), never the token (lib/guestSession.ts). A browser that
 * carries the AGE-SCREEN block flag gets no row and no cookie (403), the same
 * backstop signup has; /try only calls this after an adult answer.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { recordServerEvent } from '@/lib/analytics-server';
import { hashGuestToken, mintGuestToken } from '@/lib/guest';
import { createGuestSession, findGuestSession, guestTokenFrom, setGuestCookie } from '@/lib/guestSession';
import { AGE_BLOCK_COOKIE } from '@/lib/privacy/ageScreen';

export const dynamic = 'force-dynamic';

export async function POST() {
  const jar = cookies();
  if (jar.get(AGE_BLOCK_COOKIE)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  // Reuse an existing valid guest token if present; otherwise mint a new one.
  let token = guestTokenFrom(jar)?.token ?? null;
  const existing = token ? await findGuestSession(prisma, hashGuestToken(token)) : null;
  if (!existing) {
    token = mintGuestToken();
    const hash = hashGuestToken(token);
    await createGuestSession(prisma, hash);
    await recordServerEvent({ name: 'guest_start', guestId: hash, props: {} });
  } else {
    await prisma.guestSession.update({ where: { id: existing.id }, data: { lastSeenAt: new Date() } });
  }

  setGuestCookie(jar, token!);

  return NextResponse.json({ ok: true, guest: true });
}
