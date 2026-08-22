'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Users, TrendingUp, Zap, UserPlus } from 'lucide-react';

type Rollup = {
  day: string;
  dau?: number;
  guestDau?: number;
  mau?: number;
  newUsers?: number;
  d1?: number | null;
  d7?: number | null;
  d30?: number | null;
  kFactor?: number;
  guestConversionPct?: number | null;
  signupConversionPct?: number | null;
  events?: Record<string, number>;
};

type ApiShape = { live: Rollup; rollups: Rollup[] };

function pct(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return '—';
  // Rollup stores retention / conversion already as percentages (1 dp).
  return `${n.toFixed(1)}%`;
}
function num(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n}`;
}
function kfmt(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toFixed(3);
}

function StatCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent: string }) {
  return (
    <div className="fel-card rounded-xl p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" style={{ color: accent }} />
        <span className="font-mono text-[11px] uppercase tracking-wide text-white/50">{label}</span>
      </div>
      <div className="mt-2 fel-heading text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

export function MetricsDashboard() {
  const [data, setData] = useState<ApiShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/metrics', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const recompute = useCallback(async () => {
    setRecomputing(true);
    try {
      await fetch('/api/admin/metrics', { method: 'POST' });
      await load();
    } finally {
      setRecomputing(false);
    }
  }, [load]);

  const live = data?.live;

  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono text-xs text-white/40">
          {loading ? 'Loading…' : error ? `Error: ${error}` : 'Live snapshot (today, UTC) + stored daily rollups'}
        </span>
        <button
          onClick={recompute}
          disabled={recomputing}
          className="inline-flex items-center gap-2 rounded-md border border-[#00E5FF]/40 px-3 py-1.5 font-mono text-xs text-[#00E5FF] transition-colors hover:bg-[#00E5FF]/10 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${recomputing ? 'animate-spin' : ''}`} />
          {recomputing ? 'Recomputing…' : 'Recompute (14d)'}
        </button>
      </div>

      {live && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard icon={Users} label="DAU" value={num(live.dau)} accent="#00E5FF" />
          <StatCard icon={Users} label="Guest DAU" value={num(live.guestDau)} accent="#A855F7" />
          <StatCard icon={TrendingUp} label="MAU" value={num(live.mau)} accent="#00FF9D" />
          <StatCard icon={UserPlus} label="New Users" value={num(live.newUsers)} accent="#FFD700" />
          <StatCard icon={TrendingUp} label="D1 Retention" value={pct(live.d1)} accent="#00E5FF" />
          <StatCard icon={TrendingUp} label="D7 Retention" value={pct(live.d7)} accent="#00E5FF" />
          <StatCard icon={TrendingUp} label="D30 Retention" value={pct(live.d30)} accent="#00E5FF" />
          <StatCard icon={Zap} label="K-Factor" value={kfmt(live.kFactor)} accent="#FF3366" />
          <StatCard icon={UserPlus} label="Guest Conv" value={pct(live.guestConversionPct)} accent="#00FF9D" />
          <StatCard icon={UserPlus} label="Signup Conv" value={pct(live.signupConversionPct)} accent="#00FF9D" />
        </div>
      )}

      <div className="mt-8 overflow-x-auto">
        <h2 className="fel-heading mb-3 text-lg font-bold text-white">Daily rollups</h2>
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-wide text-white/40">
              <th className="py-2 pr-3">Day</th>
              <th className="py-2 pr-3">DAU</th>
              <th className="py-2 pr-3">Guest</th>
              <th className="py-2 pr-3">MAU</th>
              <th className="py-2 pr-3">New</th>
              <th className="py-2 pr-3">D1</th>
              <th className="py-2 pr-3">D7</th>
              <th className="py-2 pr-3">D30</th>
              <th className="py-2 pr-3">K</th>
              <th className="py-2 pr-3">Guest Conv</th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs text-white/70">
            {(data?.rollups ?? []).length === 0 && (
              <tr>
                <td colSpan={10} className="py-6 text-center text-white/40">
                  No stored rollups yet. Click “Recompute” to generate them from traffic.
                </td>
              </tr>
            )}
            {(data?.rollups ?? []).map((r) => (
              <tr key={r.day} className="border-b border-white/5">
                <td className="py-2 pr-3 text-white/90">{r.day}</td>
                <td className="py-2 pr-3">{num(r.dau)}</td>
                <td className="py-2 pr-3">{num(r.guestDau)}</td>
                <td className="py-2 pr-3">{num(r.mau)}</td>
                <td className="py-2 pr-3">{num(r.newUsers)}</td>
                <td className="py-2 pr-3">{pct(r.d1)}</td>
                <td className="py-2 pr-3">{pct(r.d7)}</td>
                <td className="py-2 pr-3">{pct(r.d30)}</td>
                <td className="py-2 pr-3">{kfmt(r.kFactor)}</td>
                <td className="py-2 pr-3">{pct(r.guestConversionPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
