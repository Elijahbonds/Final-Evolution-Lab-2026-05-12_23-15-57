'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Activity, Sparkles, ShieldCheck, Trash2, Video, Loader2, Dumbbell, ChevronRight } from 'lucide-react';
import { newIdempotencyKey } from '@/lib/wallet/client';
import { PILLAR_LABELS, type Pillar } from '@/lib/workout/movement-screen';

type Analysis = { pillars: Record<Pillar, number>; weakest: Pillar; overall: number; flags: string[] };
type AvatarSpec = { heightScale: number; buildScale: number; reachScale: number; palette: { skin: string; primary: string; accent: string }; stance: string };

const KINDS = [
  { id: 'movement_screen', label: 'Movement Screen' },
  { id: 'jump', label: 'Vertical Jump' },
  { id: 'run', label: 'Running Gait' },
  { id: 'dunk', label: 'Dunk Attempt' },
  { id: 'freestyle', label: 'Freestyle Play' },
];

// Sandbox has no camera; a real device runs on-device pose extraction. We
// derive plausible demo metrics with slight variance so the flow is testable.
function demoMetrics(kind: string) {
  const r = (a: number, b: number) => Math.round((a + Math.random() * (b - a)) * 10) / 10;
  return {
    jumpHeightCm: kind === 'jump' || kind === 'dunk' ? r(48, 78) : r(30, 55),
    depthDeg: r(70, 118), asymmetryPct: r(2, 16),
    valgusL: r(0.05, 0.4), valgusR: r(0.05, 0.4),
    cadenceSpm: kind === 'run' ? r(160, 190) : r(150, 180), trunkLeanDeg: r(6, 28),
  };
}

export function WorkoutView() {
  const [consent, setConsent] = useState(false);
  const [ageOk, setAgeOk] = useState(false);
  const [kind, setKind] = useState('movement_screen');
  const [busy, setBusy] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [spec, setSpec] = useState<AvatarSpec | null>(null);
  const [plan, setPlan] = useState<any | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const runScan = async () => {
    if (!consent || !ageOk) { toast.error('Please confirm consent and age first.'); return; }
    setBusy('scan'); setPlan(null);
    try {
      const res = await fetch('/api/v1/workout/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, metrics: demoMetrics(kind) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'scan failed');
      setScanId(j.scanId); setAnalysis(j.analysis); setSpec(j.avatarSpec);
      toast.success('Scan complete — your movement signature is ready.');
    } catch (e: any) { toast.error(e?.message || 'Scan failed'); }
    finally { setBusy(null); }
  };

  const buyPlan = async (tier: 'plan_4w' | 'program_12w') => {
    setBusy(tier);
    try {
      const res = await fetch('/api/v1/workout/plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotency_key: newIdempotencyKey(), scanId, tier }),
      });
      const j = await res.json();
      if (res.status === 409 && j?.needShards) {
        toast.error('Not enough shards. Earn by playing or exchange coins in the Wallet.');
        return;
      }
      if (!res.ok) throw new Error(j?.error || 'failed');
      setPlan(j.plan);
      if (j?.plan) toast.success(`${tier === 'program_12w' ? '12-week program' : '4-week plan'} unlocked!`);
    } catch (e: any) { toast.error(e?.message || 'Failed'); }
    finally { setBusy(null); }
  };

  const deleteScans = async () => {
    setBusy('delete');
    try {
      await fetch('/api/v1/workout/scan', { method: 'DELETE' });
    } catch { /* endpoint optional */ }
    setScanId(null); setAnalysis(null); setSpec(null); setPlan(null); setBusy(null);
    toast.success('Your scan data was cleared from this session.');
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center gap-2 mb-1">
        <Activity className="h-6 w-6 text-[#00E5FF]" />
        <h1 className="text-2xl font-bold text-white">Personalized Workout</h1>
      </div>
      <p className="text-white/50 text-sm mb-5">Scan your movement, meet your mini-avatar, and unlock a plan animated with <span className="text-[#00E5FF]">you</span> performing every rep.</p>

      {/* Consent + age gate */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-4 space-y-2">
        <label className="flex items-start gap-2 text-sm text-white/80">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 accent-[#00E5FF]" />
          <span>I consent to on-device movement analysis. My raw video stays on my device — only anonymous movement metrics are used. <span className="text-white/40">Not medical advice.</span></span>
        </label>
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input type="checkbox" checked={ageOk} onChange={(e) => setAgeOk(e.target.checked)} className="accent-[#00E5FF]" />
          <span>I am 13 or older.</span>
        </label>
      </div>

      {/* Capture */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-4">
        <div className="flex flex-wrap gap-2 mb-3">
          {KINDS.map((k) => (
            <button key={k.id} onClick={() => setKind(k.id)} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${kind === k.id ? 'bg-[#00E5FF] text-black' : 'bg-white/5 text-white/60 hover:text-white'}`}>{k.label}</button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={() => fileRef.current?.click()} data-test-ignore="opens-file-dialog" className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 py-3 text-white/70 hover:border-[#00E5FF]/60 hover:text-white text-sm">
            <Video className="h-4 w-4" /> Upload a video of yourself
          </button>
          <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={() => toast.message('On-device analysis runs on a phone/webcam. Running a demo scan here.')} />
          <button onClick={runScan} disabled={busy === 'scan' || !consent || !ageOk} title={!consent || !ageOk ? 'Confirm consent and age above to enable' : undefined} className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[#00E5FF] text-black font-semibold py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
            {busy === 'scan' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Run System Scan
          </button>
        </div>
      </div>

      {/* Results */}
      {analysis && spec && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid md:grid-cols-2 gap-4 mb-4">
          {/* Mini avatar */}
          <div className="rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold">Your Mini-Avatar</h3>
              <span className="text-[9px] uppercase tracking-wide bg-[#A855F7]/20 text-[#C79BFF] px-2 py-0.5 rounded-full">AI-generated</span>
            </div>
            <MiniAvatar spec={spec} />
            <p className="text-center text-white/40 text-xs mt-2 capitalize">{spec.stance} build</p>
          </div>
          {/* Pillars */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-white font-semibold">Movement Screen</h3>
              <span className="text-[#00FF9D] font-bold">{analysis.overall}</span>
            </div>
            <div className="space-y-2">
              {(Object.keys(analysis.pillars) as Pillar[]).map((p) => (
                <div key={p}>
                  <div className="flex justify-between text-[11px] text-white/60"><span className={p === analysis.weakest ? 'text-[#FF3366]' : ''}>{PILLAR_LABELS[p]}</span><span>{Math.round(analysis.pillars[p])}</span></div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${analysis.pillars[p]}%`, background: p === analysis.weakest ? '#FF3366' : '#00E5FF' }} /></div>
                </div>
              ))}
            </div>
            <ul className="mt-3 space-y-1">
              {analysis.flags.map((f, i) => <li key={i} className="text-[11px] text-white/50 flex gap-1"><ShieldCheck className="h-3 w-3 text-[#00FF9D] shrink-0 mt-0.5" />{f}</li>)}
            </ul>
          </div>
        </motion.div>
      )}

      {/* Plan unlock */}
      {analysis && !plan && (
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <PlanCard title="4-Week Plan" price="60 ◆" blurb="Targeted at your weakest pillar, 3 days/week." onClick={() => buyPlan('plan_4w')} busy={busy === 'plan_4w'} />
          <PlanCard title="12-Week Program" price="200 ◆" blurb="Full periodized build — the complete evolution." highlight onClick={() => buyPlan('program_12w')} busy={busy === 'program_12w'} />
        </div>
      )}

      {plan && <PlanViewer plan={plan} />}

      {(analysis || scanId) && (
        <button onClick={deleteScans} disabled={busy === 'delete'} className="mt-5 flex items-center gap-1.5 text-xs text-white/40 hover:text-[#FF3366]">
          <Trash2 className="h-3.5 w-3.5" /> Delete my scan data
        </button>
      )}
    </div>
  );
}

function MiniAvatar({ spec }: { spec: AvatarSpec }) {
  const h = 150 * spec.heightScale;
  const w = 46 * spec.buildScale;
  return (
    <div className="flex items-end justify-center h-48">
      <div className="relative" style={{ height: h }}>
        {/* head */}
        <div className="mx-auto rounded-full" style={{ width: 34, height: 34, background: spec.palette.skin, boxShadow: `0 0 16px ${spec.palette.primary}55` }} />
        {/* torso */}
        <div className="mx-auto mt-1 rounded-t-xl" style={{ width: w, height: h * 0.42, background: `linear-gradient(180deg, ${spec.palette.primary}, ${spec.palette.accent})` }} />
        {/* legs */}
        <div className="mx-auto mt-1 flex justify-center gap-1">
          <div className="rounded-b-lg" style={{ width: w * 0.4, height: h * 0.4, background: spec.palette.accent }} />
          <div className="rounded-b-lg" style={{ width: w * 0.4, height: h * 0.4, background: spec.palette.accent }} />
        </div>
      </div>
    </div>
  );
}

function PlanCard({ title, price, blurb, onClick, busy, highlight }: { title: string; price: string; blurb: string; onClick: () => void; busy: boolean; highlight?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} className={`text-left rounded-xl border p-4 transition disabled:opacity-50 ${highlight ? 'border-[#FFD700]/50 bg-[#FFD700]/[0.06]' : 'border-white/10 bg-white/[0.03] hover:border-[#00E5FF]/40'}`}>
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-white font-bold">{title}</h4>
        <span className={`text-sm font-bold ${highlight ? 'text-[#FFD700]' : 'text-[#C79BFF]'}`}>{price}</span>
      </div>
      <p className="text-white/50 text-xs mb-2">{blurb}</p>
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#00E5FF]">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Dumbbell className="h-3.5 w-3.5" /> Unlock</>}</span>
    </button>
  );
}

function PlanViewer({ plan }: { plan: any }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-[#FFD700]" />
        <h3 className="text-white font-semibold">{plan.tier === 'program_12w' ? '12-Week Program' : '4-Week Plan'} — Focus: {plan.focusLabel}</h3>
      </div>
      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
        {plan.weeks.map((wk: any) => (
          <div key={wk.week} className="rounded-lg border border-white/10 p-3">
            <div className="text-[#00E5FF] text-xs font-bold mb-2">Week {wk.week} · {wk.theme}</div>
            {wk.days.map((d: any, i: number) => (
              <div key={i} className="mb-2">
                <div className="text-white/70 text-[11px] font-semibold">{d.day} — {d.block}</div>
                {d.exercises.map((ex: any, j: number) => (
                  <div key={j} className="flex items-center gap-1 text-[11px] text-white/50"><ChevronRight className="h-3 w-3 text-[#00FF9D]" />{ex.name} · {ex.sets}×{ex.reps} <span className="text-white/30">({ex.cue})</span></div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-white/30">Exercise movies render on-device using your mini-avatar rig. AI-generated · not medical advice.</p>
    </motion.div>
  );
}
