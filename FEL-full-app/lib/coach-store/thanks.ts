// COACH-THANKS (FE PM, Oct 12): what /coach/thanks shows after Stripe sends a buyer back. The server looks the
// Checkout Session up at Stripe itself (never trusting the query string), checks it is this buyer's and this row's,
// and returns the item, the price, the booked slot (live 1:1 only) and the next step. Read-only: fulfilment stays
// with POST /api/stripe/verify-session (the client <ThanksPoll>), so a reload never grants twice.
import type Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { coachStoreSessionMeta } from '@/lib/coach-store/webhook';
import { formatCents } from '@/lib/coach-store/money';

export type ThanksProblem = 'bad_link' | 'not_found' | 'not_yours' | 'stripe_unavailable';

export interface ThanksSummary {
  item: string;
  price: string | null;
  paid: boolean;
  slot: { startsAt: Date; endsAt: Date } | null;
  nextStep: string;
}

export type ThanksResult = { ok: true; summary: ThanksSummary } | { ok: false; problem: ThanksProblem };

const ZONE = 'America/Los_Angeles';

/** The next step a buyer sees, by what they bought. Plain words, no placeholder. */
export function nextStepFor(kind: string | undefined, paid: boolean): string {
  if (!paid) return 'Stripe has not confirmed your payment yet. This page updates on its own; nothing is charged twice if you reload.';
  switch (kind) {
    case 'live_1on1':
      return 'Add the call to your calendar below. Join from your account page at your session time; the link opens a few minutes before.';
    case 'video_review':
      return 'Upload your clip from your account page. Your coach reviews it and replies there.';
    case 'membership':
      return 'Your membership is active. Find your plan and your monthly review on your account page; you can cancel there at any time.';
    case 'program':
    case 'course':
    case 'series':
    case 'bundle':
      return 'Open your program below, or any time from your account page.';
    default:
      return 'Find your purchase on your account page.';
  }
}

/** Formats a booked slot in Pacific time, e.g. "Wed, Oct 14, 5:00 PM – 5:30 PM PT". */
export function slotLabel(slot: { startsAt: Date; endsAt: Date }): string {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, weekday: 'short', month: 'short', day: 'numeric' }).format(slot.startsAt);
  const t = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hour: 'numeric', minute: '2-digit' }).format(d);
  // ICU may put a narrow no-break space before AM/PM; print a plain space so the label reads the same everywhere.
  return `${day}, ${t(slot.startsAt)} – ${t(slot.endsAt)} PT`.replace(/[\u202f\u2009\u00a0]/g, ' ');
}

/** Pure: the summary from an already-retrieved session and the buyer's row. */
export function buildThanksSummary(
  session: Pick<Stripe.Checkout.Session, 'amount_total' | 'currency' | 'payment_status' | 'status'> & { line_items?: { data?: Array<{ description?: string | null }> } | null },
  kind: string | undefined,
  slot: { startsAt: Date; endsAt: Date } | null,
): ThanksSummary {
  const paid = session.status !== 'expired' && (session.payment_status === 'paid' || session.payment_status === 'no_payment_required');
  const item = session.line_items?.data?.[0]?.description?.trim() || 'Your coach store purchase';
  const price = typeof session.amount_total === 'number' && (session.currency ?? 'usd').toLowerCase() === 'usd'
    ? formatCents(session.amount_total)
    : null;
  return { item, price, paid, slot: kind === 'live_1on1' ? slot : null, nextStep: nextStepFor(kind, paid) };
}

/** Server-side: look the session up at Stripe, check it is this buyer's and this row's, then summarise it. */
export async function loadThanks(userId: string, rowId: string | undefined, sessionId: string | undefined): Promise<ThanksResult> {
  const row = (rowId ?? '').trim();
  const sid = (sessionId ?? '').trim();
  if (!row || !sid.startsWith('cs_')) return { ok: false, problem: 'bad_link' };
  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.retrieve(sid, { expand: ['line_items'] });
  } catch (err: any) {
    if (err?.type === 'StripeInvalidRequestError' || err?.statusCode === 404 || err?.code === 'resource_missing') {
      return { ok: false, problem: 'not_found' };
    }
    console.error('[coach-thanks] stripe retrieve failed:', err?.message ?? 'unknown');
    return { ok: false, problem: 'stripe_unavailable' };
  }
  const meta = coachStoreSessionMeta(session);
  const owner = meta?.userId ?? session.client_reference_id ?? null;
  if (!meta || meta.rowId !== row) return { ok: false, problem: 'bad_link' };
  if (!owner || owner !== userId) return { ok: false, problem: 'not_yours' };
  let slot: { startsAt: Date; endsAt: Date } | null = null;
  if (meta.kind === 'live_1on1') {
    const booking = await prisma.booking.findUnique({ where: { id: row } });
    if (booking && booking.clientUserId === userId && booking.startsAt && booking.endsAt) {
      slot = { startsAt: booking.startsAt, endsAt: booking.endsAt };
    }
  }
  return { ok: true, summary: buildThanksSummary(session, meta.kind, slot) };
}

/** The plain error each problem shows. Never a 404 or a crash. */
export function problemMessage(problem: ThanksProblem | 'signed_out'): string {
  switch (problem) {
    case 'signed_out':
      return 'Sign in with the account you paid from to see this order.';
    case 'not_yours':
      return 'This order belongs to a different account. Sign in with the account you paid from.';
    case 'stripe_unavailable':
      return 'We could not reach our payment provider just now. Your payment is safe; reload this page in a minute.';
    case 'not_found':
    case 'bad_link':
    default:
      return 'We could not find an order for this link. If you paid, your receipt email has the details, and we can help.';
  }
}
