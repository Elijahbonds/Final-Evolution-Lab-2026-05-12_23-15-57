'use client';

/**
 * components/marketing/referral-card.tsx — the athlete's viral share card.
 * Fetches /api/marketing/referral (lazily mints the code), shows the share
 * link + live stats, and copies the link to the clipboard. Shards are earned
 * when a referred friend registers.
 */

import { useEffect, useState } from 'react';
import { Copy, Check, Gift, Users, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface Stats {
  code: string | null;
  clicks: number;
  signups: number;
  conversions: number;
  shardsEarned: number;
}

export function ReferralCard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(typeof window !== 'undefined' ? window.location.origin : '');
    let alive = true;
    fetch('/api/marketing/referral')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setStats(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const link = stats?.code ? `${origin}/?ref=${stats.code}` : '';

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success('Share link copied — send it to a friend!');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Could not copy. Long-press the link to copy it.');
    }
  };

  return (
    <div className="mx-auto mt-6 max-w-[680px] rounded-2xl border border-[#A855F7]/25 bg-[#A855F7]/[0.06] p-5">
      <div className="flex items-center gap-2">
        <Gift className="h-5 w-5 text-[#A855F7]" />
        <h3 className="fel-heading text-lg font-bold text-white">Invite &amp; earn shards</h3>
      </div>
      <p className="mt-1 text-sm text-white/60">
        Share your link. When a friend creates an athlete, you earn{' '}
        <span className="font-semibold text-[#C79BFF]">shards</span> — the currency you can’t buy.
      </p>

      <div className="mt-4 flex items-stretch gap-2">
        <div className="flex-1 truncate rounded-xl border border-white/10 bg-black/40 px-4 py-3 font-mono text-sm text-white/80">
          {link || 'Generating your link…'}
        </div>
        <button
          onClick={copy}
          disabled={!link}
          className="inline-flex items-center gap-2 rounded-xl bg-[#A855F7] px-4 py-3 font-semibold text-white transition-transform hover:scale-[1.03] disabled:opacity-40"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat icon={<Users className="h-4 w-4" />} label="Signups" value={stats?.signups ?? 0} color="#00E5FF" />
        <Stat icon={<Check className="h-4 w-4" />} label="Converted" value={stats?.conversions ?? 0} color="#00FF9D" />
        <Stat icon={<Sparkles className="h-4 w-4" />} label="Shards earned" value={stats?.shardsEarned ?? 0} color="#C79BFF" />
      </div>
    </div>
  );
}

function Stat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-center">
      <div className="flex items-center justify-center gap-1" style={{ color }}>
        {icon}
        <span className="text-xl font-black">{value}</span>
      </div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-white/50">{label}</div>
    </div>
  );
}
