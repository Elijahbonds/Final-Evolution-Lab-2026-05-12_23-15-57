// OpensSoon — PLAT-P07 (2026-11-02): THE one state a product shows while its payments are off (its storefront's switch is
// on). One line, no button, no "not set up yet", no link to a checkout. A waitlist needs storage, so there is none yet
// (assumption: the brief's — a later phase adds it behind its own table).
import { SHOP_COPY as T } from './shop-copy';
import { SHOP_LOOK as L } from './look';

export function OpensSoon() {
  return <p className={L.soon} data-opens-soon role="status"><span aria-hidden className={L.soonDot} />{T.opensSoon}</p>;
}
