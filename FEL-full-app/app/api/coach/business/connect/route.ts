// COACH-BUSINESS: Stripe Connect (Express) onboarding.
//   POST → the coach's onboarding link (the Express account is created on first use, once).
//   GET  → the account's status, read from Stripe and kept (charges, payouts, details submitted).
// Closed (409 store_closed) while COACH_CONNECT_PAYMENTS_ENABLED is off, without a key, or with a live key while
// COACH_CONNECT_LIVE is off. Payments are a Pro feature when the Pro gates are on.
// PAYMENTS-READY: POST needs the coach's tick on the coach terms ({ termsAccepted: true, termsVersion }), checked before
// any Stripe call (409 terms_required names the version and the link); the acceptance is kept on the Express account's
// metadata (version + time). While the coach terms are unsigned, test mode records a placeholder version and live mode
// never opens (connectGate: coach_terms_unsigned). GET also keeps whether Stripe is asking the coach for something.
import { prisma } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { connectGate, createExpressAccount, onboardingLink, paymentsClosed, readAccountStatus, recordCoachTerms } from '@/lib/coach-business/connect';
import { checkTerms, coachTermsView } from '@/lib/payments/terms';
import { coachFeatureRefusal } from '@/lib/coach-business/planServer';
import { connectFor, keepConnect, updateConnect } from '@/lib/coach-business/store';
import { bad, connectStripe, isVerifiedAdultUser, json, notReady, planDb, rawDb, readJson, currentUserId } from '@/lib/coach-business/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
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
  const terms = coachTermsView(gate.live);
  const tick = checkTerms((await readJson(req)) as never, terms.version);
  if (!tick.ok) return bad('terms_required', 409, { version: terms.version, href: terms.href });
  const stripe = connectStripe();
  let row = await connectFor(db, userId);
  if (row && row.livemode !== gate.live) return bad('connect_mode_mismatch', 409, { message: 'This Stripe account was made in the other mode.' });
  if (row) {
    await recordCoachTerms(stripe, row.stripeAccountId, tick.accepted);
  } else {
    const [user, instructor] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
      prisma.instructor.findUnique({ where: { userId }, select: { slug: true } }).catch(() => null),
    ]);
    const acct = await createExpressAccount(stripe, { userId, email: user?.email ?? null, profileUrl: instructor?.slug ? `${gate.origin}/coach/${instructor.slug}` : null, terms: tick.accepted });
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
