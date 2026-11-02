'use client';
// PAYMENTS-READY: the FEL Pro buy screen (/pro). Weekly or monthly at the existing prices, the store-terms tick, and a
// button that POSTs /api/stripe/checkout and goes to Stripe. Every refusal (18+, terms, closed, already Pro) is the route's
// own answer (lib/payments/proBuy.ts).
//
// PLAT-P07 (2026-11-02): the shop front's shape. A hero, what Pro gives in three lines (an owner draft:
// components/pro/pro-copy.ts), the two plans as the one product card, then ONE primary that opens the one buy sheet
// (what you get → the terms tick → pay, components/shop/buy-sheet.tsx). While FEL Pro is not on sale every plan card
// says Opens soon and there is no button: no checkout call can be made.
import { useState } from 'react';
import { PRO_CLOSED_LINE, type ProPlan } from '@/lib/payments/proBuy';
import { proItems } from '@/lib/shop/model';
import { payPro } from '@/lib/shop/checkout';
import { ProductCard } from '@/components/shop/product-card';
import { BuyEntry } from '@/components/shop/buy-sheet';
import { OpensSoon } from '@/components/shop/opens-soon';
import { SHOP_LOOK as L } from '@/components/shop/look';
import { PRO_COPY as T, PRO_LINES } from './pro-copy';

export interface ProBuyProps {
  /** isPurchaseOpen('fel_pro') on the server: VIRTUAL_PURCHASES_ENABLED and PURCHASES_ALLOWLIST. */
  open: boolean;
  plan: ProPlan;
  prices: Record<ProPlan, number>;
  terms: { version: string; href: string };
  /** What Pro does, from the product's own description (lib/stripe.ts): the sheet's "what you get". */
  description: string;
}

export function ProBuy({ open, plan: initial, prices, terms, description }: ProBuyProps) {
  const [plan, setPlan] = useState<ProPlan>(initial);
  const items = proItems(prices, open);
  const chosen = items.find((i) => i.id === plan) ?? items[0];
  return (
    <main className={L.page} data-pro-buy={open ? 'open' : 'closed'}>
      <p className={L.eyebrow}>{T.eyebrow}</p>
      <h1 className={L.title}>{T.title}</h1>
      <ul className={`${L.includes} mt-4`} data-pro-lines>
        {PRO_LINES.map((l) => <li key={l} className="flex gap-2"><span aria-hidden className="text-fel-cyan">✓</span><span>{l}</span></li>)}
      </ul>
      {open ? (
        <section className={L.section} aria-label={T.plans}>
          <ul className={L.grid}>
            {items.map((i) => (
              <li key={i.id} data-plan={i.id}>
                <label className={`block cursor-pointer rounded-2xl ${plan === i.id ? 'ring-2 ring-fel-cyan' : ''}`}>
                  <input type="radio" name="plan" value={i.id} checked={plan === i.id} onChange={() => setPlan(i.id as ProPlan)} className="sr-only" />
                  <ProductCard item={i}>{null}</ProductCard>
                </label>
              </li>
            ))}
          </ul>
          <BuyEntry item={chosen} label={T.get} primary includes={[description]} terms={{ href: terms.href }}
            pay={() => payPro(fetch, { plan: chosen.id as ProPlan, termsVersion: terms.version })} />
        </section>
      ) : (
        // not on sale: one Opens soon, no plan to pick, no button (no checkout call can be made)
        <section className={L.section}><OpensSoon /><p className="sr-only" data-pro-closed>{PRO_CLOSED_LINE}</p></section>
      )}
    </main>
  );
}
