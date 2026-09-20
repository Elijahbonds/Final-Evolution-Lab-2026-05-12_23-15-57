'use client';

// BoostShelf — the six creator cards, on the Profile tab, buyable with shards.
//
// The visual idea is that a card you own is lit in its creator's colour and a card you do not is the same card with
// the lights off. Not a grey placeholder, not a lock icon over a blur: the card itself, legible, with its price.
// You can read exactly what you would be getting before you spend, which is the difference between a shop and a
// slot machine.

import { useState } from 'react';
import { Check, Gem, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { BOOST_CARDS, BOOST_PRQ_CAP, purchaseCheck, type BoostCard } from '@/lib/cards/boosts';

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-baseline gap-1 rounded-md px-1.5 py-0.5" style={{ background: `${accent}10` }}>
      <span className="font-mono text-[11px] font-bold" style={{ color: accent }}>+{value}</span>
      <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/35">{label}</span>
    </span>
  );
}

export function BoostShelf({ shards, owned }: { shards: number; owned: string[] }) {
  const [have, setHave] = useState<string[]>(owned);
  const [purse, setPurse] = useState(shards);
  const [busy, setBusy] = useState<string | null>(null);

  const buy = async (card: BoostCard) => {
    const check = purchaseCheck(card, purse, have);
    if (!check.ok || busy) return;
    setBusy(card.id);
    try {
      // The route composes the idempotency key from the session's player id, so a double tap buys this once.
      const res = await fetch('/api/cards/boosts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ card_id: card.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (typeof body?.shards === 'number') setPurse(body.shards);
      if (!res.ok) {
        toast.error(body?.error === 'insufficient_shards' ? 'Not enough shards yet.' : 'That did not go through.');
        return;
      }
      setHave(Array.isArray(body?.owned) ? body.owned : (h) => [...h, card.id]);
      toast.success(`${card.title} is yours.`);
    } catch {
      toast.error('That did not go through.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mt-10">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="fel-heading text-[19px] font-bold text-white">Creator cards</h2>
          <p className="mt-1 text-[12.5px] text-white/40">
            Earned with shards, never sold for money. They lift what you bring into a game — never what a screen
            measures or what you are told to eat.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
          <Gem className="h-3.5 w-3.5 text-[#A855F7]" />
          <span className="font-mono text-[12px] font-bold text-white">{purse.toLocaleString()}</span>
        </span>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {BOOST_CARDS.map((c) => {
          const mine = have.includes(c.id);
          const check = purchaseCheck(c, purse, have);
          const working = busy === c.id;
          return (
            <li
              key={c.id}
              className="relative flex flex-col overflow-hidden rounded-2xl border p-4 transition-colors duration-300"
              style={{
                borderColor: mine ? `${c.accent}40` : 'rgba(255,255,255,0.08)',
                background: mine
                  ? `linear-gradient(160deg, ${c.accent}14 0%, rgba(255,255,255,0.02) 55%)`
                  : 'rgba(255,255,255,0.02)',
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p
                    className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em]"
                    style={{ color: mine ? c.accent : 'rgba(255,255,255,0.35)' }}
                  >
                    {c.creator}
                  </p>
                  <h3 className="fel-heading mt-1 text-[15.5px] font-bold leading-tight text-white">{c.title}</h3>
                </div>
                {mine && (
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full"
                    style={{ background: `${c.accent}1F` }}
                    aria-label="Owned"
                  >
                    <Check className="h-3.5 w-3.5" style={{ color: c.accent }} strokeWidth={3} />
                  </span>
                )}
              </div>

              <p className="mt-2 text-[12.5px] italic leading-relaxed text-white/45">“{c.tagline}”</p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <Stat label="PRQ" value={c.boost.prq} accent={c.accent} />
                <Stat label="Vert" value={c.boost.vertical} accent={c.accent} />
                <Stat label="Eff" value={c.boost.efficiency} accent={c.accent} />
                <Stat label="Neural" value={c.boost.neural} accent={c.accent} />
                <Stat label="Ready" value={c.boost.readiness} accent={c.accent} />
              </div>

              <div className="mt-auto pt-4">
                {mine ? (
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: c.accent }}>
                    In your deck
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => buy(c)}
                    disabled={!check.ok || working}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[13px]
                               font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ borderColor: `${c.accent}35`, background: `${c.accent}0D` }}
                  >
                    {working ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Gem className="h-3.5 w-3.5" style={{ color: c.accent }} />
                        {c.costShards.toLocaleString()}
                        {check.reason === 'insufficient_shards' && (
                          <span className="font-mono text-[10px] font-normal text-white/40">
                            · {(c.costShards - purse).toLocaleString()} short
                          </span>
                        )}
                      </>
                    )}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/25">
        Game lift caps at +{BOOST_PRQ_CAP} PRQ, however many you own
      </p>
    </section>
  );
}
