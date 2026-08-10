'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Coins, Check, Dumbbell, UserCircle2, BookOpen, Loader2 } from 'lucide-react';
import { SHOP_CARDS } from '@/lib/game-data';

const TYPE_META: Record<string, { icon: any; label: string }> = {
  DRILL: { icon: Dumbbell, label: 'Drill Card' },
  AVATAR: { icon: UserCircle2, label: 'Avatar Card' },
  COURSE: { icon: BookOpen, label: 'Course Card' },
};

export function ShopView() {
  const [credits, setCredits] = useState<number | null>(null);
  const [owned, setOwned] = useState<string[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    fetch('/api/shop')
      .then((r) => (r?.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        setCredits(j?.labCredits ?? 0);
        setOwned(j?.owned ?? []);
        setLedger(j?.ledger ?? []);
      })
      .catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const buy = async (cardKey: string) => {
    if (busy) return;
    setBusy(cardKey);
    try {
      const res = await fetch('/api/shop/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardKey }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j?.error ?? 'Purchase failed');
      } else {
        toast.success('Card acquired!');
        load();
      }
    } catch {
      toast.error('Purchase failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="fel-heading text-3xl font-bold text-white">CREATOR CARD SHOP</h1>
          <p className="text-sm text-white/50">First-party cards. Server-authoritative wallet.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-lg border border-[#FFD700]/40 bg-[#FFD700]/10 px-4 py-2 font-mono text-lg font-bold text-[#FFD700]">
          <Coins className="h-5 w-5" />
          {credits ?? '–'} LC
        </span>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SHOP_CARDS.map((card, i) => {
          const meta = TYPE_META?.[card.type];
          const Icon = meta?.icon ?? BookOpen;
          const isOwned = owned?.includes?.(card.key);
          const canAfford = (credits ?? 0) >= card.price;
          return (
            <motion.div
              key={card.key}
              initial={{ y: 16 }}
              animate={{ y: 0 }}
              transition={{ delay: Math.min(0.03 * i, 0.24) }}
              className="fel-card flex flex-col rounded-xl p-5 transition-all hover:border-white/20"
              style={{ borderTop: `2px solid ${card.accent}` }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-lg"
                  style={{ background: `${card.accent}18`, border: `1px solid ${card.accent}50` }}
                >
                  <Icon className="h-5 w-5" style={{ color: card.accent }} />
                </div>
                <div>
                  <h3 className="fel-heading text-lg font-bold leading-tight text-white">{card.name}</h3>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">{meta?.label}</span>
                </div>
              </div>
              <p className="mt-3 flex-1 text-xs leading-relaxed text-white/55">{card.description}</p>
              <button
                onClick={() => buy(card.key)}
                disabled={isOwned || !canAfford || busy === card.key}
                className={`fel-heading mt-4 flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-base font-bold transition-all ${
                  isOwned
                    ? 'cursor-default bg-[#00FF9D]/15 text-[#00FF9D]'
                    : canAfford
                      ? 'bg-[#00E5FF] text-black hover:bg-[#00E5FF]/85 hover:shadow-[0_0_18px_rgba(0,229,255,0.4)]'
                      : 'cursor-not-allowed bg-white/10 text-white/35'
                }`}
              >
                {busy === card.key ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isOwned ? (
                  <>
                    <Check className="h-4 w-4" /> OWNED
                  </>
                ) : (
                  <>
                    <Coins className="h-4 w-4" /> {card.price} LC
                  </>
                )}
              </button>
            </motion.div>
          );
        })}
      </div>

      {(ledger?.length ?? 0) > 0 && (
        <div className="mt-10">
          <h2 className="fel-heading text-xl font-bold text-white">RECENT LEDGER</h2>
          <div className="fel-panel mt-3 divide-y divide-white/5 rounded-xl">
            {ledger.map((row: any) => (
              <div key={row?.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-white/70">{row?.reason}</span>
                <span className={`font-mono font-bold ${(row?.amount ?? 0) >= 0 ? 'text-[#00FF9D]' : 'text-[#FF3366]'}`}>
                  {(row?.amount ?? 0) >= 0 ? '+' : ''}
                  {row?.amount} LC
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
