'use client';

/**
 * components/cards-view.tsx — Creator Card storefront + inventory.
 *
 * Everything shown here is derived from SERVER state:
 *   - GET  /api/wallet        -> { balance, owned:[cardId], entitlements }
 *   - GET  /api/profile       -> { profile.cosmeticAssetId } (equipped cosmetic)
 *   - POST /api/wallet/spend  -> buy a catalog card (server owns the price)
 *   - GET  /api/drills/[id]   -> server-gated drill launch descriptor
 *   - POST /api/wallet/equip  -> equip/unequip an owned AvatarCard cosmetic
 *
 * The client never computes balances, ownership, or prices. It only asks.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Coins,
  Check,
  Dumbbell,
  Target,
  UserCircle2,
  BookOpen,
  Loader2,
  Play,
  Sparkles,
} from 'lucide-react';
import { CARD_CATALOG, type Card, type CardType } from '@/lib/card-catalog';
import { WALLET_REFRESH_EVENT } from '@/components/wallet-chip';

const TYPE_META: Record<CardType, { icon: any; label: string; accent: string }> = {
  drill: { icon: Dumbbell, label: 'Drill Card', accent: '#00E5FF' },
  challenge: { icon: Target, label: 'Challenge Card', accent: '#FF3366' },
  avatar: { icon: UserCircle2, label: 'Avatar Card', accent: '#A855F7' },
  course: { icon: BookOpen, label: 'Course Card', accent: '#00FF9D' },
};

const TYPE_ORDER: CardType[] = ['drill', 'challenge', 'avatar', 'course'];

export function CardsView() {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [owned, setOwned] = useState<string[]>([]);
  const [equipped, setEquipped] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [walletRes, profileRes] = await Promise.all([
        fetch('/api/wallet', { cache: 'no-store' }),
        fetch('/api/profile', { cache: 'no-store' }),
      ]);
      if (walletRes.ok) {
        const w = await walletRes.json();
        setBalance(w?.balance ?? 0);
        setOwned(Array.isArray(w?.owned) ? w.owned : []);
      }
      if (profileRes.ok) {
        const p = await profileRes.json();
        setEquipped(p?.profile?.cosmeticAssetId ?? null);
      }
    } catch {
      /* keep last-known state */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ownedSet = useMemo(() => new Set(owned), [owned]);
  const ownedCards = useMemo(
    () => CARD_CATALOG.filter((c) => ownedSet.has(c.id)),
    [ownedSet]
  );

  const buy = async (card: Card) => {
    if (busy) return;
    setBusy(card.id);
    try {
      const res = await fetch('/api/wallet/spend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: card.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j?.error ?? 'Purchase failed');
      } else {
        toast.success(`${card.title} unlocked!`);
        setBalance(j?.balance ?? balance);
        setOwned(Array.isArray(j?.owned) ? j.owned : owned);
        window.dispatchEvent(new Event(WALLET_REFRESH_EVENT));
      }
    } catch {
      toast.error('Purchase failed');
    } finally {
      setBusy(null);
    }
  };

  const launchDrill = async (drillId: string) => {
    if (busy) return;
    setBusy(`launch:${drillId}`);
    try {
      const res = await fetch(`/api/drills/${encodeURIComponent(drillId)}`, {
        cache: 'no-store',
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.launchHref) {
        toast.error(j?.error === 'locked' ? 'Drill is locked' : 'Could not launch drill');
        return;
      }
      router.push(j.launchHref);
    } catch {
      toast.error('Could not launch drill');
    } finally {
      setBusy(null);
    }
  };

  const toggleEquip = async (assetId: string) => {
    if (busy) return;
    const next = equipped === assetId ? null : assetId;
    setBusy(`equip:${assetId}`);
    try {
      const res = await fetch('/api/wallet/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: next }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j?.error ?? 'Equip failed');
      } else {
        setEquipped(j?.cosmeticAssetId ?? null);
        toast.success(next ? 'Cosmetic equipped!' : 'Cosmetic removed');
      }
    } catch {
      toast.error('Equip failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="fel-heading text-3xl font-bold text-white">CREATOR CARDS</h1>
          <p className="text-sm text-white/65">
            Earn Lab Credits by training, then unlock drills, challenges &amp; cosmetics.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-lg border border-[#FFD700]/40 bg-[#FFD700]/10 px-4 py-2 font-mono text-lg font-bold text-[#FFD700]">
          <Coins className="h-5 w-5" />
          {balance ?? '–'} LC
        </span>
      </div>

      {/* ---- Inventory (owned) ---- */}
      {ownedCards.length > 0 && (
        <section className="mt-8">
          <h2 className="fel-heading text-xl font-bold text-white">YOUR INVENTORY</h2>
          <p className="text-xs text-white/60">Unlocked from the catalog. Launch or equip below.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ownedCards.map((card) => {
              const meta = TYPE_META[card.type];
              const Icon = meta.icon;
              const isDrill = card.unlocks.type === 'drill';
              const isAvatar = card.unlocks.type === 'avatar';
              const assetId = isAvatar ? (card.unlocks as any).assetId : null;
              const isEquipped = assetId && equipped === assetId;
              return (
                <motion.div
                  key={card.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="fel-card flex flex-col rounded-xl p-5"
                  style={{ borderTop: `2px solid ${meta.accent}` }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-lg"
                      style={{ background: `${meta.accent}18`, border: `1px solid ${meta.accent}50` }}
                    >
                      <Icon className="h-5 w-5" style={{ color: meta.accent }} />
                    </div>
                    <div>
                      <h3 className="fel-heading text-lg font-bold leading-tight text-white">
                        {card.title}
                      </h3>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-white/60">
                        {meta.label}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 flex-1 text-xs leading-relaxed text-white/70">
                    {card.description}
                  </p>

                  {isDrill ? (
                    <button
                      onClick={() => launchDrill((card.unlocks as any).drillId)}
                      disabled={busy === `launch:${(card.unlocks as any).drillId}`}
                      className="fel-heading mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-[#00E5FF] py-2.5 text-base font-bold text-black transition-all hover:bg-[#00E5FF]/85 hover:shadow-[0_0_18px_rgba(0,229,255,0.4)]"
                    >
                      {busy === `launch:${(card.unlocks as any).drillId}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Play className="h-4 w-4" /> LAUNCH DRILL
                        </>
                      )}
                    </button>
                  ) : isAvatar ? (
                    <button
                      onClick={() => toggleEquip(assetId)}
                      disabled={busy === `equip:${assetId}`}
                      className={`fel-heading mt-4 flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-base font-bold transition-all ${
                        isEquipped
                          ? 'bg-[#A855F7]/15 text-[#A855F7]'
                          : 'bg-[#A855F7] text-white hover:bg-[#A855F7]/85 hover:shadow-[0_0_18px_rgba(168,85,247,0.4)]'
                      }`}
                    >
                      {busy === `equip:${assetId}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isEquipped ? (
                        <>
                          <Check className="h-4 w-4" /> EQUIPPED
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" /> EQUIP
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="fel-heading mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-[#00FF9D]/15 py-2.5 text-base font-bold text-[#00FF9D]">
                      <Check className="h-4 w-4" /> UNLOCKED
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* ---- Storefront (all catalog) ---- */}
      <section className="mt-10">
        <h2 className="fel-heading text-xl font-bold text-white">STOREFRONT</h2>
        <p className="text-xs text-white/60">First-party cards. Server-authoritative wallet.</p>
        <div className="mt-4 space-y-8">
          {TYPE_ORDER.map((type) => {
            const cards = CARD_CATALOG.filter((c) => c.type === type);
            if (cards.length === 0) return null;
            const meta = TYPE_META[type];
            return (
              <div key={type}>
                <div className="mb-3 flex items-center gap-2">
                  <meta.icon className="h-4 w-4" style={{ color: meta.accent }} />
                  <h3 className="font-mono text-xs uppercase tracking-widest text-white/60">
                    {meta.label}s
                  </h3>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {cards.map((card, i) => {
                    const isOwned = ownedSet.has(card.id);
                    const canAfford = (balance ?? 0) >= card.costLC;
                    const Icon = meta.icon;
                    return (
                      <motion.div
                        key={card.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.04 * i }}
                        className="fel-card flex flex-col rounded-xl p-5 transition-all hover:border-white/20"
                        style={{ borderTop: `2px solid ${meta.accent}` }}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-11 w-11 items-center justify-center rounded-lg"
                            style={{
                              background: `${meta.accent}18`,
                              border: `1px solid ${meta.accent}50`,
                            }}
                          >
                            <Icon className="h-5 w-5" style={{ color: meta.accent }} />
                          </div>
                          <div>
                            <h3 className="fel-heading text-lg font-bold leading-tight text-white">
                              {card.title}
                            </h3>
                            <span className="font-mono text-[10px] uppercase tracking-wider text-white/60">
                              {card.heroMode === 'dunking' ? 'Dunking' : 'Karate'}
                            </span>
                          </div>
                        </div>
                        <p className="mt-3 flex-1 text-xs leading-relaxed text-white/70">
                          {card.description}
                        </p>
                        <button
                          onClick={() => buy(card)}
                          disabled={isOwned || !canAfford || busy === card.id}
                          className={`fel-heading mt-4 flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-base font-bold transition-all ${
                            isOwned
                              ? 'cursor-default bg-[#00FF9D]/15 text-[#00FF9D]'
                              : canAfford
                                ? 'bg-[#00E5FF] text-black hover:bg-[#00E5FF]/85 hover:shadow-[0_0_18px_rgba(0,229,255,0.4)]'
                                : 'cursor-not-allowed bg-white/10 text-white/35'
                          }`}
                        >
                          {busy === card.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : isOwned ? (
                            <>
                              <Check className="h-4 w-4" /> OWNED
                            </>
                          ) : (
                            <>
                              <Coins className="h-4 w-4" /> {card.costLC} LC
                            </>
                          )}
                        </button>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}

export default CardsView;
