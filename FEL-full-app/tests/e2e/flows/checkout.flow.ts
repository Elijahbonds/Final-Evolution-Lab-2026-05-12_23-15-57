// KEY FLOW 4 — test-mode checkout. A signed-in adult books a live 1-on-1, pays on Stripe's TEST checkout, and the thanks
// page confirms the booking as PAID.
//
// Only the coach store sells real money at launch (app/api/stripe/checkout B10), so this is the store's path. Stripe is
// the fake in tests/e2e/fakes/stripe.ts: no key, no network, and a LIVE session (cs_live_…) is refused. What it holds:
//   * the slot list comes from GET /api/coach-store/<slug>/slots and the picked slot is what checkout is sent;
//   * the Continue button is disabled until the store terms are ticked, and the POST carries termsAccepted and the
//     CURRENT STORE_TERMS_VERSION (an old version is the 409 terms_required path);
//   * the browser goes to the Checkout Session's own URL, and it is a TEST session;
//   * after paying, success_url brings the buyer to /coach/thanks?row=…&session_id=…, the page asks the server to verify
//     that session (POST /api/stripe/verify-session, SEC-F4: fulfilment without a webhook) and shows "Payment status: PAID".
import { STORE_TERMS_VERSION } from '../../../lib/store-terms';
import { ORIGIN, assert, until } from '../../../scripts/e2e/rig';
import type { Flow } from '../../../scripts/e2e/flow';
import { FakeAuth } from '../fakes/auth';
import { FakeStripe } from '../fakes/stripe';

const BUYER = { id: 'buyer-1', email: 'adult.buyer@example.com', password: 'x', name: 'Adult Buyer' };
const LISTING = { id: 'lst_live30', title: 'Live 1-on-1 jump session', priceUsd: 4900, manifest: JSON.stringify({ kind: 'live_1on1', durationMin: 30 }) };
const SLOTS = [
  { startsAt: '2026-11-02T17:00:00.000Z', label: 'Mon', durationMin: 30 },
  { startsAt: '2026-11-03T18:30:00.000Z', label: 'Tue', durationMin: 30 },
];

export const checkoutFlow: Flow = {
  name: 'checkout',
  title: 'A signed-in adult books a live session, pays on Stripe test checkout and sees the booking confirmed as paid',
  async run(ctx) {
    const auth = new FakeAuth([BUYER], BUYER.email);
    const stripe = new FakeStripe();
    const rows = new Map<string, { id: string; status: 'PENDING' | 'PAID'; startsAt: string; sessionId?: string }>();
    const s = ctx.session({
      pages: {
        '/coach/elijah/book/lst_live30': { entry: 'tests/e2e/entries/coach-book.tsx', rig: { slug: 'elijah', listing: LISTING } },
        '/coach/thanks': { entry: 'tests/e2e/entries/coach-thanks.tsx', rig: { item: LISTING.title, price: '$49.00' } },
      },
      external: stripe.external,
      api: (req) => {
        const a = auth.handle(req);
        if (a) return a;
        const me = auth.signedIn?.id;
        if (req.path === '/api/coach-store/elijah/slots') return { json: { slots: SLOTS } };
        if (req.path === '/api/coach-store/checkout' && req.method === 'POST') {
          if (!me) return { status: 401, json: { error: 'unauthorized' } };
          const b = req.body as { listingId?: string; startsAt?: string; termsAccepted?: boolean; termsVersion?: string; beneficiary?: string };
          if (b.termsAccepted !== true || b.termsVersion !== STORE_TERMS_VERSION) return { status: 409, json: { error: 'terms_required', version: STORE_TERMS_VERSION } };
          if (b.listingId !== LISTING.id || !SLOTS.some((x) => x.startsAt === b.startsAt)) return { status: 400, json: { error: 'bad_request' } };
          const id = `bk_${rows.size + 1}`;
          const cs = stripe.createCheckoutSession({
            amountTotal: LISTING.priceUsd, metadata: { rowId: id, buyer: me },
            successUrl: `${ORIGIN}/coach/thanks?row=${id}&session_id={CHECKOUT_SESSION_ID}`, cancelUrl: `${ORIGIN}/coach/elijah`,
          });
          rows.set(id, { id, status: 'PENDING', startsAt: b.startsAt as string, sessionId: cs.id });
          return { json: { url: cs.url, rowId: id } };
        }
        if (req.path === '/api/stripe/verify-session' && req.method === 'POST') {
          const sid = (req.body as { session_id?: string })?.session_id ?? '';
          const cs = stripe.sessions.get(sid);
          if (!cs || cs.metadata.buyer !== me) return { status: 404, json: { error: 'not_found' } };
          if (cs.paymentStatus !== 'paid') return { json: { status: 'pending', product: 'coach_store' } };
          const row = rows.get(cs.metadata.rowId);
          if (row) row.status = 'PAID';
          return { json: { status: 'fulfilled', product: 'coach_store' } };
        }
        const st = /^\/api\/coach-store\/rows\/([^/]+)\/status$/.exec(req.path);
        if (st) {
          const row = rows.get(st[1]);
          return row ? { json: { status: row.status, kind: 'live_1on1' } } : { status: 404, json: { error: 'not_found' } };
        }
        return undefined;
      },
    });

    const page = await s.open('/coach/elijah/book/lst_live30');
    await page.getByRole('heading', { name: LISTING.title }).waitFor();
    const slotSelect = page.locator('select').first();
    await until('the slot list', () => s.called('/api/coach-store/elijah/slots')[0]);
    await page.waitForFunction(() => document.querySelectorAll('select option').length >= 3);
    await slotSelect.selectOption(SLOTS[1].startsAt);
    const go = page.getByRole('button', { name: /^Book .*\$49\.00$/ });
    assert(await go.isDisabled(), 'the Book button was enabled before the store terms were ticked');
    await page.locator('input[type="checkbox"]').first().check();
    await ctx.shot(page, '1-book');
    await go.click();

    const sent = await until('POST /api/coach-store/checkout', () => s.called('/api/coach-store/checkout', 'POST')[0]);
    const body = sent.body as Record<string, unknown>;
    assert(body.listingId === LISTING.id && body.startsAt === SLOTS[1].startsAt, `checkout was sent ${JSON.stringify(body)}`);
    assert(body.termsAccepted === true && body.termsVersion === STORE_TERMS_VERSION, `checkout carried terms ${JSON.stringify([body.termsAccepted, body.termsVersion])}, current is ${STORE_TERMS_VERSION}`);
    assert(body.beneficiary === 'self', `an adult booking for themselves sent beneficiary ${JSON.stringify(body.beneficiary)}`);

    await page.waitForSelector('[data-stripe-fake="checkout"]', { timeout: 15_000 });
    const at = new URL(page.url());
    assert(at.host === 'checkout.stripe.com' && at.pathname.includes('/cs_test_'), `the buyer was sent to ${page.url()}, not a TEST Checkout Session`);
    await ctx.shot(page, '2-stripe-test');
    await page.locator('#pay').click();

    await page.waitForURL((u) => u.pathname === '/coach/thanks', { timeout: 15_000 });
    await page.getByText('Payment status: PAID.').waitFor({ timeout: 15_000 });
    const verify = s.called('/api/stripe/verify-session', 'POST')[0];
    const row = [...rows.values()][0];
    assert(verify && (verify.body as { session_id?: string }).session_id === row.sessionId, 'the thanks page did not verify the Checkout Session it came back from');
    assert(row.status === 'PAID', 'the booking row is not PAID');
    assert(await page.getByRole('link', { name: 'Download receipt' }).getAttribute('href') === `/api/coach-store/receipt/${row.id}`, 'the receipt link does not point at this booking');
    await ctx.shot(page, '3-thanks-paid');
    ctx.log(`booked ${SLOTS[1].startsAt}, paid on ${row.sessionId?.slice(0, 16)}…, thanks page shows PAID`);
  },
};
