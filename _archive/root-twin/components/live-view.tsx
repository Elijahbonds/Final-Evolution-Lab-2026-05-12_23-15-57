'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Radio, Loader2, Play, Sparkles, Ticket, Calendar, ShieldQuestion } from 'lucide-react';
import { newIdempotencyKey } from '@/lib/wallet/client';
import { PROGRAMS, AD_SLOTS, pickAd, type StreamProgram } from '@/lib/stream/program-guide';

const CAT_ACCENT: Record<string, string> = {
  HIIT: '#FF3366', Plyometrics: '#00E5FF', Isometrics: '#00FF9D',
  Corrective: '#A855F7', Education: '#FFD700', Pilates: '#00FF9D', Dance: '#FF3366',
};

export function LiveView() {
  const router = useRouter();
  const [buying, setBuying] = useState<string | null>(null);
  // Deterministic per-day house ad so SSR/CSR agree within a session.
  const ad = useMemo(() => {
    const d = new Date();
    const seed = d.getFullYear() * 1000 + d.getMonth() * 40 + d.getDate();
    return pickAd(AD_SLOTS, seed);
  }, []);

  const live = PROGRAMS.filter((p) => p.live);
  const onDemand = PROGRAMS.filter((p) => !p.live);

  const buyPass = async (sku: 'class_pass_single' | 'class_monthly') => {
    setBuying(sku);
    try {
      const res = await fetch('/api/v1/wallet/spend', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotency_key: newIdempotencyKey(), sku_id: sku, quantity: 1 }),
      });
      const j = await res.json();
      if (res.status === 409) { toast.error('Not enough shards. Earn by playing or exchange coins in the Wallet.'); return; }
      if (!res.ok) throw new Error(j?.error || 'purchase failed');
      toast.success(sku === 'class_monthly' ? 'Monthly class pass active!' : 'Single class pass added!');
    } catch (e: any) { toast.error(e?.message || 'Purchase failed'); }
    finally { setBuying(null); }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white"><Radio className="h-6 w-6 text-red-400" /> Live</h1>
        <p className="text-sm text-white/50">Classes, creator highlights, and live training with Elijah Bonds and the FEL studio.</p>
      </div>

      {/* House ad banner */}
      {ad && (
        <button onClick={() => router.push(ad.href)} className="mb-6 flex w-full items-center justify-between gap-4 rounded-2xl border border-cyan-400/30 bg-gradient-to-r from-cyan-400/10 to-transparent px-5 py-4 text-left transition hover:border-cyan-400/60">
          <div>
            <span className="mb-1 inline-block rounded bg-cyan-400/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-cyan-300">{ad.label}</span>
            <div className="text-base font-bold text-white">{ad.headline}</div>
          </div>
          <span className="shrink-0 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-bold text-black">{ad.cta}</span>
        </button>
      )}

      {/* Class passes */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white"><Ticket className="h-4 w-4 text-cyan-400" /> Single Class Pass</div>
          <p className="mt-1 text-xs text-white/50">Drop into any one live class.</p>
          <button onClick={() => buyPass('class_pass_single')} disabled={buying === 'class_pass_single'} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2 text-sm font-bold text-white transition hover:bg-white/20 disabled:opacity-60">
            {buying === 'class_pass_single' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-purple-300" />} 40 shards
          </button>
        </div>
        <div className="rounded-2xl border border-purple-400/30 bg-purple-400/[0.06] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white"><Ticket className="h-4 w-4 text-purple-300" /> Monthly All-Access</div>
          <p className="mt-1 text-xs text-white/50">Unlimited live classes for a month.</p>
          <button onClick={() => buyPass('class_monthly')} disabled={buying === 'class_monthly'} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-purple-500 py-2 text-sm font-bold text-white transition hover:bg-purple-400 disabled:opacity-60">
            {buying === 'class_monthly' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} 300 shards
          </button>
        </div>
      </div>

      {/* Live now */}
      {live.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-red-400"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" /></span> Live now</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {live.map((p) => <ProgramCard key={p.id} p={p} live />)}
          </div>
        </section>
      )}

      {/* On demand / scheduled */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-white/60">Classes &amp; on-demand</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {onDemand.map((p) => <ProgramCard key={p.id} p={p} />)}
        </div>
      </section>

      {/* Provider note (honest) */}
      <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-xs text-white/50">
        <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-white/40" />
        <p>Live video streams connect to a licensed streaming provider when configured. Passes, schedule, and watch-rewards are fully active now; the video player activates once a stream URL is provided by the studio. Chat is disabled for members under 18.</p>
      </div>
    </div>
  );
}

function ProgramCard({ p, live }: { p: StreamProgram; live?: boolean }) {
  const accent = CAT_ACCENT[p.category] || p.accent;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <div className="relative h-28" style={{ background: `linear-gradient(135deg, ${accent}, transparent)` }}>
        <span className="absolute left-3 top-3 rounded bg-black/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">{p.category}</span>
        {live && <span className="absolute right-3 top-3 rounded bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">LIVE</span>}
        <button className="absolute inset-0 flex items-center justify-center" onClick={() => toast('Stream player activates when the studio provides a live URL.', { icon: '📺' })} aria-label={`Play ${p.title}`}>
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 backdrop-blur transition hover:scale-110"><Play className="h-5 w-5 text-white" /></span>
        </button>
      </div>
      <div className="p-4">
        <div className="text-sm font-bold text-white">{p.title}</div>
        <div className="text-xs text-white/40">{p.host}</div>
        <p className="mt-1.5 text-xs text-white/55">{p.blurb}</p>
      </div>
    </motion.div>
  );
}
