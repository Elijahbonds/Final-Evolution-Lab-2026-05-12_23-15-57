// COACH-BUSINESS: /coaches — find a coach by sport and goal. Filters are plain links (no script needed, crawlable).
// PLAT-P07 (2026-11-02): the shop front's shape — a short hero, the sport and goal chips as one swipeable row each, then
// the coaches as the one product card (components/shop/product-card.tsx: name, headline, "from" price, rating). A list
// that cannot be read says Opens soon, never "not set up yet".
import Link from 'next/link';
import { MARKET_GOALS, SPORTS, goalLabel, marketHref, sportLabel, type MarketCard, type MarketQuery } from '@/lib/coach-business/market';
import { coachCardItem } from '@/lib/shop/model';
import { ProductCard } from '@/components/shop/product-card';
import { OpensSoon } from '@/components/shop/opens-soon';
import { SHOP_LOOK as L } from '@/components/shop/look';

function Chip({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={on ? 'true' : undefined} className={`${L.chip} ${on ? L.chipOn : ''}`}>
      {children}
    </Link>
  );
}

function Filter({ label, on, children }: { label: string; on: boolean; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className={`${L.chip} ${on ? L.chipOn : 'border border-white/15'} cursor-pointer list-none`}>{label} <span aria-hidden className="ml-1 transition-transform group-open:rotate-180">▾</span></summary>
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </details>
  );
}

export function MarketplaceView({ q, cards, ready }: { q: MarketQuery; cards: MarketCard[]; ready: boolean }) {
  return (
    <main className={L.page} data-marketplace>
      <p className={L.eyebrow}>Coaches</p>
      <h1 className={L.title}>Find a coach</h1>

      {/* PLAT-P07: two filter chips, each opening its list (a <details>: no script, every link stays crawlable). The lists
          stay closed on the first screen, so a phone sees the coaches, not sixteen labels. */}
      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Filter coaches">
        <Filter label={q.sport ? sportLabel(q.sport) : 'Any sport'} on={!!q.sport}>
          <Chip href={marketHref(q, { sport: null })} on={!q.sport}>Any sport</Chip>
          {SPORTS.map(([k, l]) => <Chip key={k} href={marketHref(q, { sport: k })} on={q.sport === k}>{l}</Chip>)}
        </Filter>
        <Filter label={q.goal ? goalLabel(q.goal) : 'Any goal'} on={!!q.goal}>
          <Chip href={marketHref(q, { goal: null })} on={!q.goal}>Any goal</Chip>
          {MARKET_GOALS.map(([k, l]) => <Chip key={k} href={marketHref(q, { goal: k })} on={q.goal === k}>{l}</Chip>)}
        </Filter>
      </nav>

      <section className="mt-6" aria-live="polite">
        {!ready ? (
          <OpensSoon />
        ) : cards.length === 0 ? (
          <p className={L.lede} data-empty>No coach matches that yet. Try another sport or goal.</p>
        ) : (
          <ul className={L.grid}>
            {cards.map((c) => (
              <li key={c.slug} data-coach-card={c.slug}>
                {/* COACH-DELIVERY COA-10: client reviews, beside the name */}
                <ProductCard item={coachCardItem(c)} href={`/coach/${c.slug}`}
                  side={c.rating ? <span data-coach-rating>★ {c.rating.avg} · {c.rating.count}</span> : !c.acceptingClients ? 'Full' : null} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className={`${L.lede} mt-8`}>Under 18? A parent or guardian contacts the coach, and the coach sends a join code your parent or guardian approves.</p>
      <p className={`${L.lede} mt-2`}>Coach on Final Evolution? <Link href="/coach/business" className="font-semibold text-fel-cyan underline">Set up your page</Link></p>
    </main>
  );
}
