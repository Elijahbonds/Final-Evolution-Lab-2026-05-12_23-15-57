export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getStripe } from '@/lib/stripe';
import { isAllowlistedCoach } from '@/lib/coach-store/coaches';
import { reconcileCoachStore, verifyReconcileSecret, RECONCILE_SECRET_HEADER } from '@/lib/coach-store/reconcile';

/**
 * POST /api/coach-store/reconcile — STORE-READY B8. The scheduled "sync with Stripe" run, behind an authed coach
 * OR a shared secret — never the public store flag (it must clean up while the store is off), so there is no
 * assertCoachStoreOn here. Auth, in order:
 *   (1) a signed-in allowlisted coach -> run;
 *   (2) else COACH_STORE_RECONCILE_SECRET unset -> 404 (the route does not exist on a deploy that has not opted in);
 *   (3) else a signed-in non-coach WITHOUT the header -> 404;
 *   (4) else the x-coach-store-reconcile-secret header, compared in constant time — missing/wrong -> 401, right -> run.
 * No usable Stripe key AFTER auth -> 200 { ok: true, skipped: 'payments_not_set_up' } with zero counts, no Stripe call.
 *
 * The scheduled call (AM wires it; this PR ships no scheduler): every 10 minutes,
 *   POST https://<NEXTAUTH_URL host>/api/coach-store/reconcile   with header  x-coach-store-reconcile-secret: <secret>.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const coach = userId ? isAllowlistedCoach(userId) : false;

  if (!coach) {
    const secret = process.env.COACH_STORE_RECONCILE_SECRET;
    if (!secret) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const header = req.headers.get(RECONCILE_SECRET_HEADER);
    if (userId && !header) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (!verifyReconcileSecret(header, secret)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  // No key after auth -> a clean 200 skip; nothing is read from Stripe and nothing is written.
  const key = (process.env.STRIPE_SECRET_KEY ?? '').trim();
  if (!key) {
    return NextResponse.json({ ok: true, skipped: 'payments_not_set_up', checked: 0, fulfilled: 0, refundDue: 0, expired: 0, refunded: 0, disputed: 0, restored: 0, errors: 0 });
  }

  try {
    const counts = await reconcileCoachStore({ now: new Date(), stripe: getStripe() });
    return NextResponse.json(counts);
  } catch (err) {
    console.error('[coach-store] reconcile run failed');
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}
