'use client';

/**
 * components/season-pass-track.tsx
 * ===============================
 * M13 Step 2 — HUB season pass track. Shows the active season, the athlete's
 * tier progress, and the FREE / PRO lanes. The PRO lane is cosmetic-only and
 * gated behind the SEASON_PASS_PURCHASE flag (proPurchasable) — when dark it
 * shows a "coming soon" state instead of a buy button (owner owns pricing).
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Crown, Lock, Gift, Star } from 'lucide-react';

interface Grant { tier: number; lane: string; reward: any }
interface PassState {
  active: boolean;
  proPurchasable?: boolean;
  season?: { name: string; theme?: string | null; tiers: number; endsAt: string };
  tier?: number;
  into?: number;
  need?: number;
  hasPro?: boolean;
  grants?: Grant[];
  claimable?: { free: number[]; pro: number[] };
}

function daysLeft(iso?: string): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 86400000) : 0;
}

export function SeasonPassTrack() {
  const [state, setState] = useState<PassState | null>(null);
  const [busy, setBusy] = useState<null | 'claim' | 'buy'>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/season')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live) setState(j); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  /** Collect every earned reward, then refresh from the server (it owns truth). */
  async function claimAll() {
    if (busy) return;
    setBusy('claim');
    try {
      await fetch('/api/season/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const fresh = await fetch('/api/season').then((r) => (r.ok ? r.json() : null));
      if (fresh) setState(fresh);
    } catch {
      // Non-fatal: the rewards are already banked server-side, so a failed
      // collect just leaves the badge up for the next try.
    } finally {
      setBusy(null);
    }
  }

  /** Start Stripe Checkout for the PRO lane and hand off to the hosted page. */
  async function buyPro() {
    if (busy) return;
    setBusy('buy');
    try {
      const res = await fetch('/api/season/checkout', { method: 'POST' });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.url) {
        window.location.href = json.url as string;
        return; // navigating away; keep the button disabled
      }
      console.warn('[season] pro checkout unavailable:', json?.error ?? res.status);
    } catch {
      // swallow — the button re-enables below and the lane stays closed
    }
    setBusy(null);
  }

  if (!state || !state.active || !state.season) return null;

  const pct = Math.min(100, Math.round(((state.into ?? 0) / Math.max(1, state.need ?? 1)) * 100));
  const dleft = daysLeft(state.season.endsAt);
  const freeCount = (state.grants ?? []).filter((g) => g.lane === 'free').length;
  const proCount = (state.grants ?? []).filter((g) => g.lane === 'pro').length;
  const readyCount = (state.claimable?.free.length ?? 0) + (state.claimable?.pro.length ?? 0);

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="fel-panel mt-8 overflow-hidden rounded-xl p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Crown className="h-5 w-5 text-[#FFD700]" />
        <h3 className="fel-heading text-2xl font-bold text-white">SEASON PASS</h3>
        <span className="font-mono text-xs text-[#FFD700]">{state.season.name}</span>
        {dleft != null && (
          <span className="ml-auto font-mono text-[11px] text-white/40">{dleft} days left</span>
        )}
      </div>

      {readyCount > 0 && (
        <button
          onClick={claimAll}
          disabled={busy !== null}
          className="fel-heading mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-[#FFD700] to-[#FF3366] py-2.5 text-sm font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Gift className="h-4 w-4" />
          {busy === 'claim'
            ? 'COLLECTING…'
            : `COLLECT ${readyCount} REWARD${readyCount === 1 ? '' : 'S'}`}
        </button>
      )}

      <div className="mt-4 flex items-center gap-3">
        <span className="fel-heading text-lg font-bold text-[#FFD700]">T{state.tier ?? 0}</span>
        <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-[#FFD700] to-[#FF3366]" style={{ width: `${pct}%` }} />
        </div>
        <span className="font-mono text-[11px] text-white/50">{state.into ?? 0}/{state.need ?? 0} XP</span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* FREE lane */}
        <div className="fel-card rounded-lg border border-[#00FF9D]/25 p-4">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-[#00FF9D]" />
            <span className="fel-heading text-sm font-bold text-[#00FF9D]">FREE LANE</span>
            <span className="ml-auto font-mono text-[11px] text-white/50">{freeCount} unlocked</span>
          </div>
          <p className="mt-2 text-xs text-white/50">
            LC drops + common cosmetics as you climb tiers. Earn season XP from every mode.
          </p>
        </div>

        {/* PRO lane */}
        <div className="fel-card relative rounded-lg border border-[#A855F7]/30 p-4">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-[#A855F7]" />
            <span className="fel-heading text-sm font-bold text-[#A855F7]">PRO LANE</span>
            <span className="ml-auto font-mono text-[11px] text-white/50">
              {state.hasPro ? `${proCount} unlocked` : 'locked'}
            </span>
          </div>
          <p className="mt-2 text-xs text-white/50">
            Rare + legendary cosmetics each tier. Purely cosmetic — never pay-to-win.
            {!state.hasPro && ' Unlocking back-fills every tier you have already climbed.'}
          </p>
          {!state.hasPro && (
            <div className="mt-3">
              {state.proPurchasable ? (
                <button
                  onClick={buyPro}
                  disabled={busy !== null}
                  className="fel-heading w-full rounded-md bg-[#A855F7] py-2 text-xs font-bold text-white transition-colors hover:bg-[#A855F7]/85 disabled:opacity-60"
                >
                  {busy === 'buy' ? 'OPENING CHECKOUT…' : 'UNLOCK PRO LANE'}
                </button>
              ) : (
                <span className="flex items-center justify-center gap-1.5 rounded-md border border-white/15 py-2 text-xs font-bold text-white/50">
                  <Lock className="h-3.5 w-3.5" /> COMING SOON
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}
