// A Stripe Checkout TEST-MODE fake at https://checkout.stripe.com (QG-01, key flow 4). No key, no network.
//
// The flow's server fake creates sessions here the way lib/coach-store/checkout.ts does with the Stripe SDK (an id, a
// hosted URL, success_url with {CHECKOUT_SESSION_ID}). The rig routes the browser's visit to the hosted URL to this fake,
// which shows a "TEST MODE" page with a Pay button: paying marks the session paid and sends the browser to success_url.
// It refuses a LIVE session (cs_live_…) with a page that says so — a checkout the flow reaches must be test mode.
import { randomBytes } from 'node:crypto';
import type { ExternalHandler, ExternalReply } from '../../../scripts/e2e/rig';

export interface FakeCheckoutSession {
  id: string; url: string; livemode: boolean; amountTotal: number; currency: string;
  successUrl: string; cancelUrl: string; metadata: Record<string, string>; paymentStatus: 'unpaid' | 'paid'; paidAt?: number;
}

export class FakeStripe {
  readonly sessions = new Map<string, FakeCheckoutSession>();
  readonly visits: string[] = [];

  createCheckoutSession(o: { amountTotal: number; successUrl: string; cancelUrl: string; metadata?: Record<string, string>; livemode?: boolean }): FakeCheckoutSession {
    const id = `${o.livemode ? 'cs_live_' : 'cs_test_'}${randomBytes(12).toString('hex')}`;
    const s: FakeCheckoutSession = {
      id, url: `https://checkout.stripe.com/c/pay/${id}`, livemode: !!o.livemode, amountTotal: o.amountTotal, currency: 'usd',
      successUrl: o.successUrl.replace('{CHECKOUT_SESSION_ID}', id), cancelUrl: o.cancelUrl, metadata: o.metadata ?? {}, paymentStatus: 'unpaid',
    };
    this.sessions.set(id, s);
    return s;
  }

  readonly external: ExternalHandler = (url, req) => {
    if (url.host !== 'checkout.stripe.com') return undefined;
    this.visits.push(url.pathname);
    const pay = /^\/__fake\/pay\/(cs_[a-z]+_[0-9a-f]+)$/.exec(url.pathname);
    if (pay && req.method() === 'POST') {
      const s = this.sessions.get(pay[1]);
      if (!s || s.livemode) return json(400, { error: 'no such test session' });
      s.paymentStatus = 'paid'; s.paidAt = Date.now();
      return json(200, { ok: true, next: s.successUrl });
    }
    const m = /^\/c\/pay\/(cs_[a-z]+_[0-9a-f]+)$/.exec(url.pathname);
    const s = m ? this.sessions.get(m[1]) : undefined;
    if (!s) return { status: 404, body: '<!doctype html><body data-stripe-fake="unknown">No such Checkout Session</body>' };
    if (s.livemode || !s.id.startsWith('cs_test_')) {
      return { body: '<!doctype html><body data-stripe-fake="live-refused">The rig refuses a LIVE Checkout Session: a test must never reach a live key.</body>' };
    }
    return {
      body: `<!doctype html><html><body data-stripe-fake="checkout" style="font-family:sans-serif;padding:24px;background:#fff;color:#111">
<p style="display:inline-block;background:#ffde92;padding:2px 8px;border-radius:4px;font-weight:700">TEST MODE</p>
<h1>Pay $${(s.amountTotal / 100).toFixed(2)}</h1>
<label>Card number <input value="4242 4242 4242 4242" readonly></label>
<button id="pay" style="display:block;margin-top:16px;padding:12px 24px">Pay</button>
<script>document.getElementById('pay').onclick = async () => {
  const r = await fetch('/__fake/pay/${s.id}', { method: 'POST' }); const j = await r.json(); location.href = j.next;
};</script></body></html>`,
    };
  };
}

function json(status: number, body: unknown): ExternalReply {
  return { status, body: JSON.stringify(body), contentType: 'application/json' };
}
