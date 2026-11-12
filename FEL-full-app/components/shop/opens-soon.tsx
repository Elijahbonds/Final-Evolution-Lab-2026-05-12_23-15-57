// OpensSoon — PLAT-P07 (2026-11-02): THE one state a product shows while its payments are off (its storefront's switch is
// on). One line, no button, no "not set up yet", no link to a checkout. A waitlist needs storage, so there is none yet
// (assumption: the brief's — a later phase adds it behind its own table).
//
// EVERY-SCREEN P1 (2026-11-10): a whole SCREEN that is switched off is a different case from a product whose payments are
// off. The plan's gate: "every switched-off feature says why and what to do instead". So a screen may pass `why` (one
// plain line: what is not open yet) and `instead` (one link to something that works today). With neither, this draws
// exactly what it always did: the shop's product cards are unchanged.
import Link from 'next/link';
import { SHOP_COPY as T } from './shop-copy';
import { SHOP_LOOK as L } from './look';

export interface OpensSoonInstead { href: string; label: string }

export function OpensSoon({ why, instead }: { why?: string; instead?: OpensSoonInstead } = {}) {
  const line = <p className={L.soon} data-opens-soon role="status"><span aria-hidden className={L.soonDot} />{T.opensSoon}</p>;
  if (!why && !instead) return line;
  return (
    <div data-opens-soon-screen>
      {line}
      {why ? <p className={L.lede} data-opens-soon-why>{why}</p> : null}
      {instead ? <div><Link href={instead.href} className={L.buy} data-opens-soon-instead>{instead.label}</Link></div> : null}
    </div>
  );
}
