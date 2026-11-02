// ProductCard — PLAT-P07 (2026-11-02): THE one product card on every storefront: the title, one line and the price
// (≤ 20 words: lib/shop/model.ts cardLine trims the line), then what the product's state allows — its buy entry
// (children), Opens soon, or Yours. `href`: the whole card opens the product's own page instead.
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ShopItem } from '@/lib/shop/model';
import { OpensSoon } from './opens-soon';
import { SHOP_COPY as T } from './shop-copy';
import { SHOP_LOOK as L } from './look';

export function ProductCard({ item, href, titleHref, side, children }: { item: ShopItem; href?: string; titleHref?: string; side?: ReactNode; children?: ReactNode }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className={L.cardTitle}>{titleHref ? <Link href={titleHref} className="underline-offset-4 hover:underline">{item.title}</Link> : item.title}</h3>
        {side ? <span className={L.cardSide}>{side}</span> : null}
      </div>
      {item.oneLine ? <p className={L.cardLine}>{item.oneLine}</p> : null}
      {item.priceLabel ? <p className={L.cardPrice} data-price>{item.priceLabel}</p> : null}
    </>
  );
  return (
    <article data-product-card={item.kind} data-state={item.state} data-id={item.id}>
      {href ? <Link href={href} className={`${L.card} block`}>{body}</Link> : <div className={L.card}>{body}</div>}
      {!href && (item.state === 'buy' ? children : item.state === 'owned' ? <p className={L.owned}>{T.owned}</p> : <OpensSoon />)}
    </article>
  );
}
