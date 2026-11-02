// COACH-BUSINESS: /coaches — find a coach by sport and goal. Filters are plain links (no script needed, crawlable).
import Link from 'next/link';
import { MARKET_GOALS, SPORTS, goalLabel, marketHref, sportLabel, type MarketCard, type MarketQuery } from '@/lib/coach-business/market';

function Chip({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={on ? 'true' : undefined}
      className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-bold ${on ? 'border-cyan-300 bg-cyan-300 text-black' : 'border-white/15 text-white/75'}`}>
      {children}
    </Link>
  );
}

export function MarketplaceView({ q, cards, ready }: { q: MarketQuery; cards: MarketCard[]; ready: boolean }) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 text-white" data-marketplace>
      <p className="text-xs uppercase tracking-widest text-white/50">Final Evolution</p>
      <h1 className="mt-1 text-3xl font-black">Find a coach</h1>
      <p className="mt-2 max-w-2xl text-sm text-white/70">Coaches who train athletes online and in person. Pick a sport and a goal, open a coach, and apply or book.</p>

      <nav className="mt-6 space-y-3" aria-label="Filter coaches">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-white/40">Sport</p>
          <div className="flex flex-wrap gap-2">
            <Chip href={marketHref(q, { sport: null })} on={!q.sport}>Any sport</Chip>
            {SPORTS.map(([k, l]) => <Chip key={k} href={marketHref(q, { sport: k })} on={q.sport === k}>{l}</Chip>)}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-white/40">Goal</p>
          <div className="flex flex-wrap gap-2">
            <Chip href={marketHref(q, { goal: null })} on={!q.goal}>Any goal</Chip>
            {MARKET_GOALS.map(([k, l]) => <Chip key={k} href={marketHref(q, { goal: k })} on={q.goal === k}>{l}</Chip>)}
          </div>
        </div>
      </nav>

      <section className="mt-8" aria-live="polite">
        {!ready ? (
          <p className="text-sm text-white/60">The coach list is not set up yet.</p>
        ) : cards.length === 0 ? (
          <p className="text-sm text-white/60" data-empty>No coach matches that yet. Try another sport or goal.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {cards.map((c) => (
              <li key={c.slug} data-coach-card={c.slug}>
                <Link href={`/coach/${c.slug}`} className="block h-full rounded-2xl border border-white/10 bg-white/[0.03] p-4 hover:border-cyan-300/50">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-lg font-bold">{c.displayName}</h2>
                    {/* COACH-DELIVERY COA-10: client reviews */}
                    {c.rating ? <p className="text-xs text-white/60" data-coach-rating>★ {c.rating.avg} · {c.rating.count} review{c.rating.count === 1 ? '' : 's'}</p> : null}
                    {c.fromPriceCents !== null ? (
                      <p className="shrink-0 text-sm font-bold text-cyan-200">from ${(c.fromPriceCents / 100).toFixed(0)}{c.fromMonthly ? '/mo' : ''}</p>
                    ) : null}
                  </div>
                  {c.headline ? <p className="mt-1 text-sm text-white/70">{c.headline}</p> : null}
                  <p className="mt-2 text-xs text-white/50">{[...c.sports.map(sportLabel), ...c.goals.map(goalLabel)].join(' · ')}</p>
                  {!c.acceptingClients ? <p className="mt-2 text-xs font-bold text-amber-200">Not taking new clients</p> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="mt-8 text-xs text-white/50">Under 18? A parent or guardian contacts the coach, and the coach sends a join code your parent or guardian approves.</p>
      <p className="mt-2 text-xs text-white/50">Coach on Final Evolution? <Link href="/coach/business" className="font-bold text-cyan-300 underline">Set up your page</Link></p>
    </main>
  );
}
