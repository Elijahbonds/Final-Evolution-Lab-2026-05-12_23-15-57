export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { rateLimit, clientKeyFromHeaders } from '@/lib/rate-limit';
import { recordServerEvent } from '@/lib/analytics-server';
import { isValidEmail, normalizeEmail, hashIp } from '@/lib/marketing/funnel';
import { sendWelcomeEmail, notifyAdminNewLead } from '@/lib/marketing/email';

/**
 * POST /api/marketing/subscribe  (PUBLIC)
 * Body: { email, name?, source?, ref? }
 *
 * Captures a marketing lead (funnel stage 'lead' -> 'welcomed' once the welcome
 * email is sent). Idempotent per email (upsert). Best-effort welcome + admin
 * emails. A referral code (?ref) is recorded for the referral loop (Phase 5).
 */
export async function POST(req: Request) {
  const ip = clientKeyFromHeaders(req.headers);
  const rl = rateLimit(`subscribe:${ip}`, 8, 15 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
  }

  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(String(body?.email ?? ''));
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 400 });
  }
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 60) : null;
  const source = typeof body?.source === 'string' ? body.source.slice(0, 40) : 'landing';
  const ref = typeof body?.ref === 'string' ? body.ref.trim().slice(0, 40) : null;

  // Already a full account? Nudge to log in instead of creating a lead.
  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  const existingLead = await prisma.marketingLead.findUnique({ where: { email } });
  const alreadyWelcomed = Boolean(existingLead?.welcomeEmailAt);

  const lead = await prisma.marketingLead.upsert({
    where: { email },
    update: { name: name ?? undefined, lastSeenAt: new Date(), ...(ref ? { referredByCode: ref } : {}) },
    create: { email, name, source, referredByCode: ref, ipHash: hashIp(ip) },
  });

  // Best-effort emails (never block the response on failure).
  let welcomed = alreadyWelcomed;
  if (!alreadyWelcomed) {
    const ok = await sendWelcomeEmail(email, name);
    if (ok) {
      welcomed = true;
      await prisma.marketingLead.update({ where: { id: lead.id }, data: { welcomeEmailAt: new Date(), stage: 'welcomed' } });
    }
    void notifyAdminNewLead(email, source);
    // Count a referral click-through signup on the referrer's code.
    if (ref) {
      await prisma.referralCode.updateMany({ where: { code: ref }, data: { clicks: { increment: 1 } } });
    }
  }

  try {
    await recordServerEvent({ name: 'lead_captured', props: { source, hadAccount: Boolean(existingUser), ref: ref ?? null } });
  } catch { /* telemetry is non-fatal */ }

  return NextResponse.json({ ok: true, welcomed, alreadyMember: Boolean(existingUser) });
}
