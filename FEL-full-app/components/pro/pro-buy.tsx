'use client';
// PAYMENTS-READY: the FEL Pro buy screen (/pro). Weekly or monthly at the existing prices, the store-terms tick, and a
// button that POSTs /api/stripe/checkout and goes to Stripe. While FEL Pro is not on sale it shows one line and no
// button. Every refusal (18+, terms, closed, already Pro) is the route's own answer (lib/payments/proBuy.ts).
import { useState } from 'react';
import { loginPath } from '@/lib/auth/safeNext';
import { buyPro, PRO_CLOSED_LINE, PRO_PLANS, proBuyHref, proPriceLabel, type ProPlan } from '@/lib/payments/proBuy';

export interface ProBuyProps {
  /** isPurchaseOpen('fel_pro') on the server: VIRTUAL_PURCHASES_ENABLED and PURCHASES_ALLOWLIST. */
  open: boolean;
  plan: ProPlan;
  prices: Record<ProPlan, number>;
  terms: { version: string; href: string };
  /** What Pro does, from the product's own description (lib/stripe.ts). */
  description: string;
}

export function ProBuy({ open, plan: initial, prices, terms, description }: ProBuyProps) {
  const [plan, setPlan] = useState<ProPlan>(initial);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const buy = async () => {
    if (!agreed) return;
    setBusy(true);
    setNote(null);
    const out = await buyPro(fetch, plan, terms.version);
    if (out.kind === 'redirect') { window.location.href = out.url; return; }
    if (out.kind === 'sign_in') { window.location.href = loginPath(proBuyHref(plan)); return; }
    if (out.kind === 'terms_changed') setAgreed(false);
    setBusy(false);
    setNote(out.message);
  };

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-8 text-white" data-pro-buy={open ? 'open' : 'closed'}>
      <h1 className="text-2xl font-black">FEL Pro</h1>
      <p className="text-sm text-white/70">{description}</p>
      {!open ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/80" data-pro-closed>{PRO_CLOSED_LINE}</p>
      ) : (
        <>
          <fieldset className="space-y-2">
            <legend className="text-xs font-bold uppercase tracking-wider text-white/50">Choose how to pay</legend>
            {PRO_PLANS.map((p) => (
              <label key={p} className={`flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm ${plan === p ? 'border-cyan-300 bg-cyan-300/10' : 'border-white/15'}`} data-plan={p}>
                <span className="flex items-center gap-2">
                  <input type="radio" name="plan" value={p} checked={plan === p} onChange={() => setPlan(p)} />
                  <span className="font-bold">{p === 'weekly' ? 'Weekly' : 'Monthly'}</span>
                </span>
                <span>{proPriceLabel(prices[p], p)}</span>
              </label>
            ))}
          </fieldset>
          <label className="flex items-start gap-2 text-sm text-white/80" data-buyer-terms>
            <input type="checkbox" className="mt-1" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>I agree to the <a className="font-bold text-cyan-300 underline" href={terms.href} target="_blank" rel="noopener noreferrer">store terms</a>.</span>
          </label>
          <button type="button" onClick={buy} disabled={!agreed || busy} data-action="buy-pro"
            className="min-h-11 w-full rounded-xl bg-cyan-300 px-4 text-sm font-bold text-black disabled:opacity-60">
            {busy ? 'Opening checkout…' : `Get FEL Pro · ${proPriceLabel(prices[plan], plan)}`}
          </button>
        </>
      )}
      {note ? <p role="alert" className="text-sm text-amber-200">{note}</p> : null}
    </main>
  );
}
