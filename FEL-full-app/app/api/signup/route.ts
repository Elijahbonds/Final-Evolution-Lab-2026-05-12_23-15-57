import { NextResponse } from 'next/server';
import { applyLc } from '@/lib/wallet/wallet-service';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { rateLimit, clientKeyFromHeaders } from '@/lib/rate-limit';
import { trustedClientIp } from '@/lib/rate-limits/clientIp';
import { checkRateLimits, retryAfterHeaders } from '@/lib/rate-limits/policy';
import { recordServerEvent } from '@/lib/analytics-server';
import { GUEST_COOKIE } from '@/lib/guest';
import { convertReferralOnSignup } from '@/lib/marketing/referral';
import { sendWelcomeEmail } from '@/lib/marketing/email';
import { isUnreachable } from '@/lib/db/errors';
import { AGE_BLOCK_COOKIE, AGE_INVALID, ageBlockCookieHeader, ageScreenOutcome, postedBirthDate } from '@/lib/privacy/ageScreen';
import { writeUserDob } from '@/lib/age/userDob';
import type { RawDb } from '@/lib/coach/pendingSchema';
import { logU13Lock } from '@/lib/privacy/u13LockLog';

export const dynamic = 'force-dynamic';

const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email('Valid email required'),
  password: z.string().min(6, 'Password must be 6+ characters').max(128),
  name: z.string().trim().min(1).max(60).optional().default('Athlete'),
  policyVersion: z.string().max(60).optional(),
  ref: z.string().trim().max(16).optional(),
  birthYear: z.number({ required_error: AGE_INVALID, invalid_type_error: AGE_INVALID }).int(AGE_INVALID),
  // FN-BOX-1b: the full date beside the year, 'YYYY-MM-DD'. Optional (an older client sends the year alone); when sent it
  // must be a real, past date in birthYear's year.
  birthDate: z.string({ invalid_type_error: AGE_INVALID }).max(10, AGE_INVALID).optional(),
});

function randAttr() {
  return Math.round((40 + Math.random() * 30) * 10) / 10;
}

export async function POST(req: Request) {
  try {
    // Rate limit: 5 signups per IP per 15 min
    // (RATE-LIMIT-WIRE keeps this per-instance window as it was: the shared-table limit below fails open until its SQL
    // is applied, so this stays the floor it has always been. Its key is the first X-Forwarded-For entry, which the
    // client writes; the shared limit below never keys on it.)
    const ip = clientKeyFromHeaders(req.headers);
    const rl = rateLimit(`signup:${ip}`, 5, 15 * 60 * 1000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many signup attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }
    const { email, password, name, policyVersion, ref, birthYear, birthDate } = parsed.data;

    // AGE-SCREEN, before bcrypt or any prisma call. assumption: (FE PM can reverse) a cookie-present retry logs nothing.
    if (cookies().get(AGE_BLOCK_COOKIE)) {
      return NextResponse.json({ error: 'age_screen_blocked' }, { status: 403 });
    }
    const age = ageScreenOutcome(birthYear);
    if (age === 'invalid') {
      return NextResponse.json({ error: AGE_INVALID }, { status: 400 });
    }
    if (age === 'blocked') {
      logU13Lock('/api/signup');
      return NextResponse.json(
        { error: 'age_screen_blocked' },
        { status: 403, headers: { 'Set-Cookie': ageBlockCookieHeader() } },
      );
    }
    // FN-BOX-1b: checked after the block, so an under-13 year is turned away whatever date came with it.
    const dob = birthDate === undefined ? null : postedBirthDate(birthYear, birthDate);
    if (birthDate !== undefined && dob === null) {
      return NextResponse.json({ error: AGE_INVALID }, { status: 400 });
    }

    // RATE-LIMIT-WIRE (PR #289 QA rework): counted per email and per the address the TRUSTED proxy set, in the shared
    // rate_limits table (lib/rate-limits). The window above keys on the first X-Forwarded-For entry, which the client
    // writes, so a new fake address per request is a new allowance there; this one never keys on it. Counted here, after the age screen and before bcrypt or any
    // write: an under-13 lock stores nothing, not even a counter (AGE-SCREEN D5).
    const limited = await checkRateLimits(prisma, 'signup', [
      { kind: 'email', value: email },
      { kind: 'ip', value: trustedClientIp(req.headers) },
    ]);
    if (!limited.ok) {
      return NextResponse.json(
        { error: 'Too many signup attempts. Please try again later.' },
        { status: 429, headers: retryAfterHeaders(limited) }
      );
    }

    const hashed = await bcrypt.hash(password, 12);

    let user;
    try {
      user = await prisma.user.create({
        data: {
          email,
          password: hashed,
          name,
          dobYear: birthYear,
          ...(policyVersion ? { policyVersion, policyAcceptedAt: new Date() } : {}),
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
      }
      throw e;
    }

    // FN-BOX-1b: User.dob, beside dobYear. Raw SQL behind a column probe (lib/age/userDob.ts): skipped until the owner
    // applies prisma/pending/2026-10-19-user-dob.sql, and never a reason to fail the signup.
    if (dob) await writeUserDob(prisma as unknown as RawDb, user.id, dob);

    await prisma.playerProfile.create({
      data: {
        userId: user.id,
        strength: randAttr(),
        speed: randAttr(),
        endurance: randAttr(),
        agility: randAttr(),
        power: randAttr(),
        flexibility: randAttr(),
        recovery: randAttr(),
        mental: randAttr(),
        labCredits: 500,
      },
    });
    // LC lives in the wallet (2026-09-04): the welcome grant lands in Wallet.lc; the profile's 500 default is the mirror.
    await applyLc(prisma, { playerId: user.id, delta: 500, reasonCode: 'WELCOME_GRANT', source: 'milestone', idempotencyKey: `welcome:${user.id}` });

    // M13 Step 1 — migrate any anonymous guest state into the new account and
    // close out the growth funnel (guest_claim + signup_complete). Best-effort:
    // a telemetry hiccup must never fail a signup.
    const guestToken = cookies().get(GUEST_COOKIE)?.value ?? null;
    try {
      if (guestToken) {
        const guest = await prisma.guestSession.findUnique({ where: { token: guestToken } });
        if (guest && !guest.migratedUserId) {
          await prisma.guestSession.update({
            where: { token: guestToken },
            data: { migratedUserId: user.id },
          });
          await recordServerEvent({
            name: 'guest_claim',
            userId: user.id,
            guestId: guestToken,
            props: { migrated: true },
          });
        }
      }
      await recordServerEvent({
        name: 'signup_complete',
        userId: user.id,
        guestId: guestToken,
        props: { fromGuest: Boolean(guestToken) },
      });
    } catch (err) {
      console.error('signup funnel telemetry failed', err);
    }

    // Phase 5 — referral conversion + welcome email. Both best-effort: a
    // marketing hiccup must never fail a signup.
    try {
      await convertReferralOnSignup(prisma, { referredUserId: user.id, email, refCode: ref ?? null });
    } catch (err) {
      console.error('referral conversion failed', err);
    }
    void sendWelcomeEmail(email, name);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('signup error', e);
    // Separate "the server is misconfigured" from "something went wrong", so a
    // dead DATABASE_URL is visible instead of reading as a transient glitch
    // the athlete should retry. 503 + Retry-After, never the raw Prisma text:
    // it names the database host and port.
    if (isUnreachable(e)) {
      return NextResponse.json(
        { error: "Account service is temporarily unavailable — the server can't reach its database. Please try again shortly." },
        { status: 503, headers: { 'Retry-After': '60' } }
      );
    }
    return NextResponse.json({ error: 'Signup failed. Please try again.' }, { status: 500 });
  }
}
