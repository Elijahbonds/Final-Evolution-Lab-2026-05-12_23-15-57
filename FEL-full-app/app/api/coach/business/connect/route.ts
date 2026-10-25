// COACH-BUSINESS: Stripe Connect (Express) onboarding.
//   POST → the coach's onboarding link (the Express account is created on first use, once).
//   GET  → the account's status, read from Stripe and kept (charges, payouts, details submitted).
// Closed (409 store_closed) while COACH_CONNECT_PAYMENTS_ENABLED is off, without a key, or with a live key while
// COACH_CONNECT_LIVE is off. Payments are a Pro feature when the Pro gates are on.
import { prisma } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { connectGate, createExpressAccount, onboardingLink, paymentsClosed, readAccountStatus } from '@/lib/coach-business/connect';
import { coachFeatureRefusal } from '@/lib/coach-business/planServer';
import { connectFor, keepConnect, updateConnect } from '@/lib/coach-business/store';
import { bad, connectStripe, isVerifiedAdultUser, json, notReady, planDb, rawDb, currentUserId } from '@/lib/coach-business/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const gate = connectGate();
  if (!gate.ok) return paymentsClosed(gate.reason);
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`coach-business:connect:${userId}`, 10, 60_000).ok) return bad('rate_limited', 429);
  if (!(await isVerifiedAdultUser(userId))) return bad('adults_only', 403);
  const paywall = await coachFeatureRefusal(planDb(), userId, 'payments');
  if (paywall) return paywall;
  const db = rawDb();
  const off = await notReady(db);
  if (off) return off;
  const stripe = connectStripe();
  let row = await connectFor(db, userId);
  if (!row) {
    const [user, instructor] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
      prisma.instructor.findUnique({ where: { userId }, select: { slug: true } }).catch(() => null),
    ]);
    const acct = await createExpressAccount(stripe, { userId, email: user?.email ?? null, profileUrl: instructor?.slug ? `${gate.origin}/coach/${instructor.slug}` : null });
    row = await keepConnect(db, userId, acct.id, acct.livemode);
  }
  if (row.livemode !== gate.live) return bad('connect_mode_mismatch', 409, { message: 'This Stripe account was made in the other mode.' });
  return json({ url: await onboardingLink(stripe, row.stripeAccountId, gate.origin) });
}

export async function GET() {
  const gate = connectGate();
  if (!gate.ok) return paymentsClosed(gate.reason);
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`coach-business:connect-status:${userId}`, 30, 60_000).ok) return bad('rate_limited', 429);
  const db = rawDb();
  const off = await notReady(db);
  if (off) return off;
  const row = await connectFor(db, userId);
  if (!row) return json({ connected: false });
  const status = await readAccountStatus(connectStripe(), row.stripeAccountId);
  await updateConnect(db, row.stripeAccountId, status);
  return json({ connected: true, ...status, livemode: row.livemode });
}
