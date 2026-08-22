'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Swords,
  Coins,
  Loader2,
  Trophy,
  Clock,
  Users,
  X,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { WALLET_REFRESH_EVENT } from '@/components/wallet-chip';

// ---------------------------------------------------------------------------
// Types mirroring the /api/arena/* responses.
// ---------------------------------------------------------------------------
interface ArenaMode {
  key: string;
  name: string;
  venue: string;
  href: string;
}
interface ArenaConfig {
  rakePercent: number;
  feeTiers: number[];
  modes: ArenaMode[];
  balance: number;
  authenticated: boolean;
}
interface OpenDuel {
  id: string;
  mode: string;
  name: string;
  href: string;
  feeLc: number;
  rakePercent: number;
  creator: string | null;
  createdAt: string;
}
interface MyDuel {
  id: string;
  mode: string;
  name: string;
  href: string;
  feeLc: number;
  rakePercent: number;
  status: string;
  role: 'p1' | 'p2';
  opponent: string | null;
  myScore: number | null;
  oppScore: number | null;
  mySubmitted: boolean;
  winnerId: string | null;
  iWon: boolean | null;
  seed: string | null;
  updatedAt: string;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  WAITING: { label: 'Waiting for opponent', color: '#FFD700' },
  ACTIVE: { label: 'Live — play your round', color: '#00E5FF' },
  SETTLED: { label: 'Settled', color: '#00FF9D' },
  VOIDED: { label: 'Refunded', color: '#A855F7' },
  EXPIRED: { label: 'Expired', color: '#888' },
};

function potPreview(feeLc: number, rakePercent: number) {
  const pot = feeLc * 2;
  const rake = Math.floor((pot * rakePercent) / 100);
  return { pot, payout: pot - rake, rake };
}

export function ArenaView() {
  const [config, setConfig] = useState<ArenaConfig | null>(null);
  const [open, setOpen] = useState<OpenDuel[]>([]);
  const [mine, setMine] = useState<MyDuel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null);

  // Create-duel form state
  const [pickMode, setPickMode] = useState<string>('');
  const [pickFee, setPickFee] = useState<number>(0);
  const [creating, setCreating] = useState(false);

  const flash = useCallback((kind: 'err' | 'ok', text: string) => {
    setNotice({ kind, text });
    window.setTimeout(() => setNotice(null), 4000);
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const r = await fetch('/api/arena/config');
      if (!r.ok) return;
      const j: ArenaConfig = await r.json();
      setConfig(j);
      setPickMode((prev) => prev || j.modes[0]?.key || '');
      setPickFee((prev) => prev || j.feeTiers[0] || 0);
    } catch {
      /* best effort */
    }
  }, []);

  const loadList = useCallback(async () => {
    try {
      const r = await fetch('/api/arena/list');
      if (!r.ok) return;
      const j = await r.json();
      setOpen(j.open ?? []);
      setMine(j.mine ?? []);
    } catch {
      /* best effort */
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadConfig(), loadList()]);
    setRefreshing(false);
  }, [loadConfig, loadList]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadConfig(), loadList()]);
      setLoading(false);
    })();
  }, [loadConfig, loadList]);

  const balance = config?.balance ?? 0;
  const rakePercent = config?.rakePercent ?? 10;

  const modeName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const mode of config?.modes ?? []) m[mode.key] = mode.name;
    return m;
  }, [config]);

  const preview = pickFee > 0 ? potPreview(pickFee, rakePercent) : null;
  const canAfford = pickFee > 0 && balance >= pickFee;

  async function createDuel() {
    if (!pickMode || pickFee <= 0) return;
    if (!canAfford) {
      flash('err', 'Not enough Lab Credits for that stake.');
      return;
    }
    setCreating(true);
    try {
      const r = await fetch('/api/arena/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: pickMode, feeLc: pickFee }),
      });
      const j = await r.json();
      if (!r.ok) {
        flash('err', j?.detail || j?.error || 'Could not open the duel.');
      } else {
        flash('ok', `Duel posted — ${pickFee} LC staked. Waiting for a challenger.`);
        window.dispatchEvent(new Event(WALLET_REFRESH_EVENT));
        await refreshAll();
      }
    } catch {
      flash('err', 'Network error opening the duel.');
    } finally {
      setCreating(false);
    }
  }

  async function joinDuel(d: OpenDuel) {
    if (balance < d.feeLc) {
      flash('err', 'Not enough Lab Credits to join that duel.');
      return;
    }
    setBusyId(d.id);
    try {
      const r = await fetch('/api/arena/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: d.id }),
      });
      const j = await r.json();
      if (!r.ok) {
        flash('err', j?.detail || j?.error || 'Could not join the duel.');
      } else {
        flash('ok', 'Joined! Head to the venue and play your round.');
        window.dispatchEvent(new Event(WALLET_REFRESH_EVENT));
        await refreshAll();
      }
    } catch {
      flash('err', 'Network error joining the duel.');
    } finally {
      setBusyId(null);
    }
  }

  async function cancelDuel(d: MyDuel) {
    setBusyId(d.id);
    try {
      const r = await fetch('/api/arena/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: d.id }),
      });
      const j = await r.json();
      if (!r.ok) {
        flash('err', j?.detail || j?.error || 'Could not cancel the duel.');
      } else {
        flash('ok', 'Duel cancelled — your stake was refunded.');
        window.dispatchEvent(new Event(WALLET_REFRESH_EVENT));
        await refreshAll();
      }
    } catch {
      flash('err', 'Network error cancelling the duel.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="mt-10 flex items-center justify-center gap-2 font-mono text-sm text-white/40">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading the Arena…
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-8">
      {/* Balance + rake banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#FF3366]/25 bg-gradient-to-r from-[#FF3366]/10 to-transparent px-5 py-4">
        <div className="flex items-center gap-3">
          <Swords className="h-6 w-6 text-[#FF3366]" />
          <div>
            <div className="fel-heading text-base font-bold text-white">Your War Chest</div>
            <div className="font-mono text-[11px] text-white/50">
              House rake {rakePercent}% per settled pot &middot; ties fully refunded
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[#FFD700]/40 px-3 py-1.5 font-mono text-sm text-[#FFD700]">
          <Coins className="h-4 w-4" />
          {balance.toLocaleString('en-US')} LC
        </div>
      </div>

      {notice && (
        <div
          className={`rounded-lg border px-4 py-2.5 font-mono text-xs ${
            notice.kind === 'err'
              ? 'border-[#FF3366]/40 bg-[#FF3366]/10 text-[#FF3366]'
              : 'border-[#00FF9D]/40 bg-[#00FF9D]/10 text-[#00FF9D]'
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Create a duel */}
      <section className="fel-card rounded-xl border border-white/10 bg-[#0B0B0F] p-5">
        <div className="flex items-center gap-2">
          <Plus className="h-5 w-5 text-[#00E5FF]" />
          <h2 className="fel-heading text-xl font-bold text-white">POST A DUEL</h2>
        </div>

        <div className="mt-4">
          <div className="font-mono text-[11px] uppercase tracking-wider text-white/40">Choose your arena</div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {config?.modes.map((m) => (
              <button
                key={m.key}
                onClick={() => setPickMode(m.key)}
                className={`rounded-lg border px-3 py-2 text-left transition-all ${
                  pickMode === m.key
                    ? 'border-[#00E5FF] bg-[#00E5FF]/10 text-white'
                    : 'border-white/10 bg-white/[0.02] text-white/60 hover:border-white/25'
                }`}
              >
                <div className="font-mono text-xs font-bold">{m.name}</div>
                <div className="truncate font-mono text-[10px] text-white/35">{m.venue}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <div className="font-mono text-[11px] uppercase tracking-wider text-white/40">Stake (Lab Credits)</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {config?.feeTiers.map((fee) => {
              const affordable = balance >= fee;
              return (
                <button
                  key={fee}
                  onClick={() => setPickFee(fee)}
                  disabled={!affordable}
                  className={`rounded-lg border px-4 py-2 font-mono text-sm transition-all ${
                    pickFee === fee
                      ? 'border-[#FFD700] bg-[#FFD700]/10 text-[#FFD700]'
                      : affordable
                        ? 'border-white/10 bg-white/[0.02] text-white/70 hover:border-[#FFD700]/40'
                        : 'cursor-not-allowed border-white/5 bg-white/[0.01] text-white/20'
                  }`}
                >
                  {fee} LC
                </button>
              );
            })}
          </div>
        </div>

        {preview && (
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3 font-mono text-xs">
            <span className="text-white/40">
              Total pot <span className="text-white">{preview.pot} LC</span>
            </span>
            <span className="text-white/40">
              Winner takes <span className="text-[#00FF9D]">{preview.payout} LC</span>
            </span>
            <span className="text-white/40">
              Rake <span className="text-white/60">{preview.rake} LC</span>
            </span>
          </div>
        )}

        <button
          onClick={createDuel}
          disabled={creating || !pickMode || pickFee <= 0 || !canAfford}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#FF3366] px-5 py-2.5 font-mono text-sm font-bold text-white transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
          {canAfford || pickFee <= 0 ? 'STAKE & POST DUEL' : 'INSUFFICIENT LC'}
        </button>
      </section>

      {/* Open duels */}
      <section>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[#00E5FF]" />
            <h2 className="fel-heading text-xl font-bold text-white">OPEN CHALLENGES</h2>
            <span className="font-mono text-xs text-white/40">{open.length}</span>
          </div>
          <button
            onClick={refreshAll}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 font-mono text-[11px] text-white/50 transition-colors hover:border-[#00E5FF]/40 hover:text-[#00E5FF]"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
            REFRESH
          </button>
        </div>

        {open.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-white/10 px-5 py-8 text-center font-mono text-xs text-white/30">
            No open duels right now. Post one above and be the first on the board.
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {open.map((d) => {
              const pv = potPreview(d.feeLc, d.rakePercent);
              return (
                <motion.div
                  key={d.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="fel-card flex items-center justify-between rounded-xl border border-white/10 bg-[#0B0B0F] px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="fel-heading text-sm font-bold text-white">{d.name}</div>
                    <div className="truncate font-mono text-[11px] text-white/40">
                      by {d.creator ?? 'Athlete'} &middot; winner takes{' '}
                      <span className="text-[#00FF9D]">{pv.payout} LC</span>
                    </div>
                  </div>
                  <div className="ml-3 flex flex-col items-end gap-1.5">
                    <span className="font-mono text-xs text-[#FFD700]">{d.feeLc} LC</span>
                    <button
                      onClick={() => joinDuel(d)}
                      disabled={busyId === d.id || balance < d.feeLc}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#00E5FF] px-3 py-1.5 font-mono text-[11px] font-bold text-black transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busyId === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Swords className="h-3 w-3" />}
                      {balance < d.feeLc ? 'NEED LC' : 'ACCEPT'}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      {/* My duels */}
      <section>
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-[#FFD700]" />
          <h2 className="fel-heading text-xl font-bold text-white">MY DUELS</h2>
          <span className="font-mono text-xs text-white/40">{mine.length}</span>
        </div>

        {mine.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-white/10 px-5 py-8 text-center font-mono text-xs text-white/30">
            You haven&rsquo;t entered any duels yet.
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {mine.map((d) => {
              const meta = STATUS_META[d.status] ?? { label: d.status, color: '#888' };
              const playable = d.status === 'ACTIVE' && !d.mySubmitted;
              const settled = d.status === 'SETTLED';
              const pv = potPreview(d.feeLc, d.rakePercent);
              return (
                <div
                  key={d.id}
                  className="fel-card rounded-xl border border-white/10 bg-[#0B0B0F] px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="fel-heading text-sm font-bold text-white">{d.name}</span>
                        <span
                          className="rounded px-1.5 py-0.5 font-mono text-[10px]"
                          style={{ color: meta.color, backgroundColor: `${meta.color}18` }}
                        >
                          {meta.label}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[11px] text-white/40">
                        vs {d.opponent ?? 'awaiting challenger'} &middot; {d.feeLc} LC stake
                        {settled && (
                          <>
                            {' '}
                            &middot;{' '}
                            {d.iWon ? (
                              <span className="text-[#00FF9D]">you won +{pv.payout} LC</span>
                            ) : (
                              <span className="text-[#FF3366]">you lost</span>
                            )}
                          </>
                        )}
                        {d.status === 'VOIDED' && <span className="text-[#A855F7]"> &middot; refunded</span>}
                      </div>
                      {(d.myScore !== null || d.oppScore !== null) && (
                        <div className="mt-1 font-mono text-[11px] text-white/55">
                          You{' '}
                          <span className="text-white">{d.myScore ?? '—'}</span> &middot; Opponent{' '}
                          <span className="text-white">{d.oppScore ?? '—'}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {playable && (
                        <Link
                          href={`${d.href}?arena=${d.id}`}
                          className="inline-flex items-center gap-1.5 rounded-md bg-[#00FF9D] px-3 py-1.5 font-mono text-[11px] font-bold text-black transition-transform active:scale-95"
                        >
                          <Play className="h-3 w-3" />
                          PLAY
                        </Link>
                      )}
                      {d.status === 'ACTIVE' && d.mySubmitted && (
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-white/40">
                          <Clock className="h-3 w-3" />
                          awaiting opponent
                        </span>
                      )}
                      {d.status === 'WAITING' && d.role === 'p1' && (
                        <button
                          onClick={() => cancelDuel(d)}
                          disabled={busyId === d.id}
                          className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1.5 font-mono text-[11px] text-white/50 transition-colors hover:border-[#FF3366]/50 hover:text-[#FF3366] disabled:opacity-40"
                        >
                          {busyId === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                          CANCEL
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Fair-play footnote */}
      <div className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3 font-mono text-[11px] text-white/35">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#00FF9D]" />
        <span>
          Lab Credits are an in-app skill currency with no cash value and cannot be
          purchased. The Arena is a game of skill &mdash; both athletes play the
          identical seeded challenge and the higher score wins.
        </span>
      </div>
    </div>
  );
}
