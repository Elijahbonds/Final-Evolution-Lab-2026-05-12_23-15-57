/**
 * app/api/guest/route.ts
 * ======================
 * M13 Step 1 — issue an anonymous guest session ("60 seconds to a dunk").
 *
 * A guest gets an opaque rotating token in an httpOnly cookie and a matching
 * GuestSession row. NO PII is ever collected (M13 FIREWALL). The taste-run
 * state lives in GuestSession.data and migrates into the account on signup.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import { prisma } from '@/lib/db';
import { recordServerEvent } from '@/lib/analytics-server';
import { GUEST_COOKIE, GUEST_COOKIE_MAX_AGE } from '@/lib/guest';

export const dynamic = 'force-dynamic';

export async function POST() {
  const jar = cookies();
  let token = jar.get(GUEST_COOKIE)?.value ?? null;

  // Reuse an existing valid guest token if present; otherwise mint a new one.
  let existing = token ? await prisma.guestSession.findUnique({ where: { token } }) : null;
  if (!existing) {
    token = crypto.randomBytes(24).toString('base64url');
    existing = await prisma.guestSession.create({ data: { token, data: {} } });
    await recordServerEvent({ name: 'guest_start', guestId: token, props: {} });
  } else {
    await prisma.guestSession.update({ where: { token: token! }, data: { lastSeenAt: new Date() } });
  }

  jar.set(GUEST_COOKIE, token!, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: GUEST_COOKIE_MAX_AGE,
  });

  return NextResponse.json({ ok: true, guest: true });
}
