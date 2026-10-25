// E2E entry: /coach/thanks?row=<id>&session_id=<cs_...> — Stripe's success_url (lib/coach-store/checkout.ts). The page's
// server half (loadThanks: the order summary) arrives as window.__RIG; ThanksPoll is the real client half, which asks the
// server to verify the Checkout Session (SEC-F4) and then polls the row until it says PAID.
import { createRoot } from 'react-dom/client';
import { ThanksPoll } from '@/components/coach-store/thanks-poll';

const q = new URLSearchParams(window.location.search);
const rig = (window as unknown as { __RIG: { item: string; price: string } }).__RIG;

createRoot(document.getElementById('root')!).render(
  <main className="mx-auto max-w-xl px-4 py-8 text-white">
    <section className="mb-6 rounded-xl border border-white/15 p-4 text-sm" aria-label="Your order">
      <p className="mt-2">Item: {rig.item}</p>
      <p>Price: {rig.price}</p>
    </section>
    <ThanksPoll rowId={q.get('row') ?? ''} sessionId={q.get('session_id')} />
  </main>,
);
