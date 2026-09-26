'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Activity, Sparkles, ShieldCheck, Trash2, ChevronRight, Info } from 'lucide-react';
import { PILLAR_LABELS, analyzeMovement, defaultMetrics, type Pillar } from '@/lib/workout/movement-screen';
import { buildAvatarSpec } from '@/lib/workout/avatar-builder';
import { PLAN_SALE_PAUSED } from '@/lib/workout/plan-sale';
import { HELD_FOR_PROTOCOL, HELD_LINE } from '@/lib/workout/plan-revision';

type Analysis = { pillars: Record<Pillar, number>; weakest: Pillar; overall: number; flags: string[] };
type AvatarSpec = { heightScale: number; buildScale: number; reachScale: number; palette: { skin: string; primary: string; accent: string }; stance: string };

/** A plan this account bought, as GET /api/v1/workout/plan returns it (revised on read, lib/workout/plan-revision.ts). */
export interface SavedPlan {
  id: string;
  tier: string;
  focus: string;
  weeks: unknown;
  createdAt?: string;
  revisionNote?: string | null;
}

// MIRROR-COACH P1 (2026-09-25): what the consent box says, word for word. It used to read "I consent to on-device
// movement analysis. My raw video stays on my device — only anonymous movement metrics are used." This page analyses
// nobody: the scan below is a demo worked out from sample numbers, it opens no camera and takes no video, and it sends
// and saves nothing (demoScan). So the box now says what happens, and what you agree to is seeing a demo.
export const DEMO_CONSENT =
  'I understand the scan on this page is a demo: it uses no camera and no video, it shows sample numbers rather than mine, and nothing is sent or saved.';

// This page has no camera capture, so its scan is a DEMO: the sample baseline (defaultMetrics, the numbers the plan
// route used to plan from when it was sent no scan) analysed right here and never sent. It used to post random numbers
// to /api/v1/workout/scan, which stored them as a real WorkoutScan, and playerIdentity reads the newest scan's
// avatarSpec as a measured body. A real movement screen is the Mirror's, which measures with the camera.
export function demoScan(): { analysis: Analysis; avatarSpec: AvatarSpec } {
  const m = defaultMetrics();
  return { analysis: analyzeMovement(m), avatarSpec: buildAvatarSpec(m) };
}

export function WorkoutView() {
  const [consent, setConsent] = useState(false);
  const [ageOk, setAgeOk] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [spec, setSpec] = useState<AvatarSpec | null>(null);
  // MIRROR-COACH P1 (2026-09-25): buyers keep their plans. This page never showed a bought plan again once it was
  // reloaded (only the purchase's own response did), so with the sale pulled a buyer would have had no way back to
  // what they paid for. It reads them from the plan route, which revises each one on read and hands back its note.
  const [saved, setSaved] = useState<SavedPlan[] | null | 'error'>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch('/api/v1/workout/plan', { cache: 'no-store' });
        const j = res.ok ? await res.json() : null;
        if (live) setSaved(Array.isArray(j?.plans) ? j.plans : 'error');
      } catch {
        if (live) setSaved('error');
      }
    })();
    return () => { live = false; };
  }, []);

  const runScan = () => {
    if (!consent || !ageOk) { toast.error('Please tick both boxes first.'); return; }
    const d = demoScan();   // nothing is posted: a demo is not a measurement
    setAnalysis(d.analysis); setSpec(d.avatarSpec);
    toast.message('Demo scan: sample numbers, not a measurement of you. Nothing was saved.');
  };

  // The route deletes EVERY saved WorkoutScan and WorkoutPlan of this account: the Mirror's dunk history and movement
  // screens and plans bought with shards, not just this page's demo (which saved nothing). So it says that, asks
  // first, and only reports success when the route did delete.
  const deleteScans = async () => {
    if (typeof window !== 'undefined' && !window.confirm(
      'Delete everything saved from your movement scans? This removes your Mirror dunk history, your Mirror movement screens and any workout plans you bought. It cannot be undone.',
    )) return;
    setBusy('delete');
    let deleted = false;
    try {
      const res = await fetch('/api/v1/workout/scan', { method: 'DELETE' });
      deleted = res.ok;
    } catch { /* offline: reported below */ }
    setBusy(null);
    if (!deleted) { toast.error('Nothing was deleted. Sign in and try again.'); return; }
    setAnalysis(null); setSpec(null); setSaved([]);
    toast.success('Deleted your saved scans, Mirror history and workout plans.');
  };

  const plans = Array.isArray(saved) ? saved : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center gap-2 mb-1">
        <Activity className="h-6 w-6 text-[#00E5FF]" />
        <h1 className="text-2xl font-bold text-white">Workout plans</h1>
      </div>
      <p className="text-white/50 text-sm mb-5">Plans you bought here stay on this page. A real movement screen is measured in <Link href="/play/mirror" className="text-[#00E5FF] hover:underline">the Mirror</Link>.</p>

      {/* MIRROR-COACH P1: not on sale. The server refuses the purchase (app/api/v1/workout/plan/route.ts); this says so. */}
      <div role="status" className="rounded-xl border border-[#FFD700]/30 bg-[#FFD700]/[0.05] p-4 mb-4">
        <p className="text-sm font-semibold text-[#FFD700]">{PLAN_SALE_PAUSED}</p>
        <p className="mt-1 text-xs text-white/50">New plans are not on sale. A plan you already bought is yours and stays below.</p>
      </div>

      <SavedPlans saved={saved} />

      {/* The demo scan: sample numbers, worked out on this page */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-4 space-y-2">
        <label className="flex items-start gap-2 text-sm text-white/80">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 accent-[#00E5FF]" />
          <span>{DEMO_CONSENT} <span className="text-white/40">Not medical advice.</span></span>
        </label>
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input type="checkbox" checked={ageOk} onChange={(e) => setAgeOk(e.target.checked)} className="accent-[#00E5FF]" />
          <span>I am 13 or older.</span>
        </label>
        <button onClick={runScan} disabled={!consent || !ageOk} title={!consent || !ageOk ? 'Tick both boxes above to enable' : undefined} className="mt-2 w-full flex items-center justify-center gap-2 rounded-lg bg-[#00E5FF] text-black font-semibold py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
          <Sparkles className="h-4 w-4" /> Run Demo Scan
        </button>
      </div>

      {/* Results: always the demo, so say so where the numbers are */}
      {analysis && spec && (
        <p className="mb-2 text-xs text-[#FFD700]">
          DEMO · sample numbers, not a measurement of you. Nothing was saved. For a real movement screen, use{' '}
          <Link href="/play/mirror" className="underline hover:text-white">the Mirror</Link>.
        </p>
      )}
      {analysis && spec && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid md:grid-cols-2 gap-4 mb-4">
          {/* Mini avatar: drawn from the same sample numbers */}
          <div className="rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold">Sample Mini-Avatar</h3>
              <span className="text-[9px] uppercase tracking-wide bg-white/10 text-white/60 px-2 py-0.5 rounded-full">Sample</span>
            </div>
            <MiniAvatar spec={spec} />
            <p className="text-center text-white/40 text-xs mt-2 capitalize">{spec.stance} build</p>
          </div>
          {/* Pillars */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-white font-semibold">Demo Screen</h3>
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

      {(analysis || plans.length > 0) && (
        <button onClick={deleteScans} disabled={busy === 'delete'} className="mt-5 flex items-center gap-1.5 text-xs text-white/40 hover:text-[#FF3366]">
          <Trash2 className="h-3.5 w-3.5" /> Delete all my saved scans and plans
        </button>
      )}
    </div>
  );
}

/** The plans this account bought, each with its revision note when it has one. Nothing at all while loading. */
export function SavedPlans({ saved }: { saved: SavedPlan[] | null | 'error' }) {
  if (saved === null) return null;
  if (saved === 'error') {
    return <p className="mb-4 text-xs text-white/40">Your saved plans could not be loaded just now. Reload the page to try again.</p>;
  }
  if (!saved.length) return null;
  return (
    <div className="mb-4 space-y-3">
      <h2 className="text-white font-semibold text-sm">Your plans</h2>
      {saved.map((p) => <PlanViewer key={p.id} plan={p} />)}
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

// MIRROR-COACH P1 (2026-09-25): its footer said "Exercise movies render on-device using your mini-avatar rig.
// AI-generated", and the page intro promised a plan "animated with it performing every rep". Nothing renders a movie
// (this is a list of names and doses), and nothing about a plan is AI-generated (generatePlan picks from fixed pools).
function PlanViewer({ plan }: { plan: SavedPlan }) {
  const weeks: any[] = Array.isArray(plan.weeks) ? plan.weeks : [];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-[#FFD700]" />
        <h3 className="text-white font-semibold">{plan.tier === 'program_12w' ? '12-Week Program' : '4-Week Plan'}{plan.focus ? ` — Focus: ${plan.focus}` : ''}</h3>
      </div>
      {/* the in-app note on a plan the revision changed (lib/workout/plan-revision.ts) */}
      {plan.revisionNote && (
        <p role="note" className="mb-3 flex items-start gap-1.5 rounded-lg border border-[#00E5FF]/25 bg-[#00E5FF]/[0.06] px-3 py-2 text-xs text-white/80">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[#00E5FF]" />{plan.revisionNote}
        </p>
      )}
      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
        {weeks.map((wk: any, wi: number) => (
          <div key={wk?.week ?? wi} className="rounded-lg border border-white/10 p-3">
            <div className="text-[#00E5FF] text-xs font-bold mb-2">Week {wk?.week ?? wi + 1}{wk?.theme ? ` · ${wk.theme}` : ''}</div>
            {(Array.isArray(wk?.days) ? wk.days : []).map((d: any, i: number) => (
              <div key={i} className="mb-2">
                <div className="text-white/70 text-[11px] font-semibold">{d?.day}{d?.block ? ` — ${d.block}` : ''}</div>
                {(Array.isArray(d?.exercises) ? d.exercises : []).map((ex: any, j: number) => (
                  <div key={j} className="flex flex-wrap items-center gap-1 text-[11px] text-white/50">
                    <ChevronRight className="h-3 w-3 text-[#00FF9D]" />{ex?.name} · {ex?.sets}×{ex?.reps}
                    {ex?.cue && <span className="text-white/30">({ex.cue})</span>}
                    {ex?.replaced && <span className="basis-full pl-4 text-[#00E5FF]/70">in place of {ex.replaced}</span>}
                    {/* an adult's depth drop after week 4 (lib/workout/plan-revision.ts holdLateDepthDrops) */}
                    {ex?.held === HELD_FOR_PROTOCOL && <span className="basis-full pl-4 text-[#FFD700]/80">{HELD_LINE}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-white/30">Not medical advice.</p>
    </motion.div>
  );
}
