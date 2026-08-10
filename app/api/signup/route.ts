import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { rateLimit, clientKeyFromHeaders } from '@/lib/rate-limit';
import { postLc } from '@/lib/ledger';
import { recordServerEvent } from '@/lib/analytics-server';
import { GUEST_COOKIE } from '@/lib/guest';
import { convertReferralOnSignup } from '@/lib/marketing/referral';
import { sendWelcomeEmail } from '@/lib/marketing/email';

export const dynamic = 'force-dynamic';

const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email('Valid email required'),
  password: z.string().min(6, 'Password must be 6+ characters').max(128),
  name: z.string().trim().min(1).max(60).optional().default('Athlete'),
  policyVersion: z.string().max(60).optional(),
  ref: z.string().trim().max(16).optional(),
});

function randAttr() {
  return Math.round((40 + Math.random() * 30) * 10) / 10;
}

export async function POST(req: Request) {
  try {
    // Rate limit: 5 signups per IP per 15 min
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
    const { email, password, name, policyVersion, ref } = parsed.data;

    const hashed = await bcrypt.hash(password, 12);

    let user;
    try {
      user = await prisma.user.create({
        data: {
          email,
          password: hashed,
          name,
          ...(policyVersion ? { policyVersion, policyAcceptedAt: new Date() } : {}),
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
      }
      throw e;
    }

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
    await postLc(prisma, { userId: user.id, amount: 500, reason: 'Welcome grant', balanceAfter: 500, dedupeKey: `welcome:${user.id}` });

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
    return NextResponse.json({ error: 'Signup failed. Please try again.' }, { status: 500 });
  }
}
