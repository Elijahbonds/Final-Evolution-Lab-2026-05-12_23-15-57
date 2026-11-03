'use client';
// BuySheet — PLAT-P07 (2026-11-02): THE one way to buy on every storefront, the same three steps everywhere:
//   1. what you get   the product's title and price, and what it includes (the source's own words);
//   2. the terms tick the store terms the product's route checks (409 terms_required otherwise);
//   3. pay            ONE button that POSTs the product's existing checkout route (lib/shop/checkout.ts) and goes to the
//                     provider. Never a GET link to a checkout: the route answers, and the sheet says its answer plainly
//                     (sign in, 18+, the terms changed, closed, already yours).
// A product that is not on sale never gets here: its card shows Opens soon instead (components/shop/opens-soon.tsx), so
// with payments off no checkout call is ever made.
import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { PrimaryCta } from '@/components/ui/fel/primary-cta';
import { Layer } from '@/components/session-player/layer';
import type { ShopItem } from '@/lib/shop/model';
import type { ShopOutcome } from '@/lib/shop/checkout';
import { SHOP_COPY as T } from './shop-copy';
import { SHEET_KEYFRAMES, SHOP_LOOK as L } from './look';

export interface BuyEntryProps {
  item: ShopItem;
  /** The card's button ("Book", "Buy audiobook", "Get FEL Pro"). */
  label: string;
  /** What the product includes, in its own words. */
  includes?: readonly string[];
  /** The store terms this product's route checks; null when its route asks none. */
  terms: { href: string } | null;
  pay: () => Promise<ShopOutcome>;
  /** The page's one primary opens the sheet (else the card's outlined button). */
  primary?: boolean;
  /** Something the sheet shows above the pay button (a plan picker). */
  extra?: ReactNode;
  /** The entry button's data-action (a page's tests and probes find "book" by it). */
  action?: string;
}

export function BuyEntry({ item, label, includes = [], terms, pay, primary = false, extra, action }: BuyEntryProps) {
  const [open, setOpen] = useState(false);
  if (item.state !== 'buy') return null;
  return (
    <>
      {primary
        ? <div className="mt-4 [&>[data-fel-primary]]:w-full" data-buy-entry={item.kind}><PrimaryCta onClick={() => setOpen(true)}>{label}</PrimaryCta></div>
        : <button type="button" className={L.buy} onClick={() => setOpen(true)} data-buy-entry={item.kind} data-action={action}>{label}</button>}
      {open && <BuySheet item={item} includes={includes} terms={terms} pay={pay} extra={extra} onClose={() => setOpen(false)} />}
    </>
  );
}

export function BuySheet({ item, includes = [], terms, pay, extra, onClose }: Omit<BuyEntryProps, 'label' | 'primary' | 'action'> & { onClose: () => void }) {
  const [agreed, setAgreed] = useState(!terms);
  const [nudge, setNudge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ line: string; href?: string } | null>(null);
  const go = async () => {
    if (busy) return;
    if (!agreed) { setNudge(true); return; }
    setBusy(true); setNote(null);
    const out = await pay();
    if (out.kind === 'redirect') { window.location.href = out.url; return; }
    if (out.kind === 'sign_in') { window.location.href = out.href; return; }
    setBusy(false);
    if (out.kind === 'terms_changed') { setAgreed(false); setNote({ line: out.line }); return; }
    setNote({ line: out.line, href: out.href });
  };
  return (
    <Layer>
      <style>{SHEET_KEYFRAMES}</style>
      <div className={L.veil} onClick={onClose} aria-hidden />
      <div className={L.sheet} role="dialog" aria-modal="true" aria-label={item.title} data-buy-sheet={item.kind}>
        <div className={L.sheetHead}>
          <div className="min-w-0">
            <p className={L.stepLabelTop}>{T.whatYouGet}</p>
            <h2 className={`${L.cardTitle} mt-1`}>{item.title}</h2>
            {item.priceLabel ? <p className={L.cardPrice}>{item.priceLabel}</p> : null}
          </div>
          <button type="button" aria-label={T.close} className={L.close} onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        {includes.length ? <ul className={L.includes} data-includes>{includes.map((l) => <li key={l} className="flex gap-2"><span aria-hidden className="text-fel-cyan">✓</span><span>{l}</span></li>)}</ul> : null}
        {extra}
        {terms ? (
          <>
            <p className={L.stepLabel}>{T.terms}</p>
            <label className={`${L.terms} ${nudge && !agreed ? L.termsNudge : ''}`} data-buyer-terms>
              <input type="checkbox" className="h-5 w-5 shrink-0" checked={agreed} onChange={(e) => { setAgreed(e.target.checked); setNudge(false); }} />
              <span>{T.agree} <a className="font-semibold text-fel-cyan underline" href={terms.href} target="_blank" rel="noopener noreferrer">{T.storeTerms}</a>.</span>
            </label>
            {nudge && !agreed ? <p className={L.alert} role="alert">{T.tickFirst}</p> : null}
          </>
        ) : null}
        <div className={L.cta} data-buy-pay><PrimaryCta onClick={() => { void go(); }}>{busy ? T.opening : T.pay}</PrimaryCta></div>
        {note ? <p role="alert" className={L.alert}>{note.line}{note.href ? <> <a className="underline" href={note.href}>Open</a></> : null}</p> : null}
      </div>
    </Layer>
  );
}
