'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Activity, Sparkles, ShieldCheck, Trash2, ChevronRight, Info, Gift } from 'lucide-react';
import { PILLAR_LABELS, analyzeMovement, defaultMetrics, type Pillar } from '@/lib/workout/movement-screen';
import { buildAvatarSpec } from '@/lib/workout/avatar-builder';
import {
  DAY_CHOICES, WORKOUT_AGE_NEEDED_LINE, WORKOUT_AGE_UNREAD, WORKOUT_CHECK_FAILED, WORKOUT_FREE_LINE, WORKOUT_INTRO, WORKOUT_JUMP_LINE,
  WORKOUT_TEMPLATE_CHANGED, WORKOUT_YOUTH_LINE, productFor, unfinishedLine,
  type WorkoutAnswers,
} from '@/lib/workout/plan-sale';
import { HELD_FOR_PROTOCOL, HELD_LINE } from '@/lib/workout/plan-revision';
import { OFF_DAY_WEEK_LINE, fullWeek } from '@/lib/coach/offDay';
import { dailyTargetLine, templateFor, templateShapeLine } from '@/lib/coach/templates/list';
import { WAVE_LINE } from '@/lib/coach/templates/waves';
import { newIdempotencyKey } from '@/lib/wallet/client';
import { GateHeldList, GateSwapLine } from '@/components/coach/protocol-gate-line';
import type { OfferProduct, TemplatePlanView, WorkoutOffer } from '@/lib/workout/relaunchServer';

type Analysis = { pillars: Record<Pillar, number>; weakest: Pillar; overall: number; flags: string[] };
type AvatarSpec = { heightScale: number; buildScale: number; reachScale: number; palette: { skin: string; primary: string; accent: string }; stance: string };

/** A plan the old generator wrote, as GET /api/v1/workout/plan returns it (revised on read, lib/workout/plan-revision.ts). */
export interface LegacyPlan {
  id: string;
  kind?: 'legacy';
  tier: string;
  focus: string;
  weeks: unknown;
  createdAt?: string;
  revisionNote?: string | null;
}
/** A plan this account holds: an old one, or (MIRROR-COACH P8) a FEL template plan, gated for the reader today. */
export type SavedPlan = LegacyPlan | (Omit<TemplatePlanView, 'createdAt'> & { createdAt?: string | Date });

const isTemplateView = (p: SavedPlan): p is Extract<SavedPlan, { kind: 'template' }> => p.kind === 'template';

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
// MIRROR-COACH P8 (2026-09-29): and it has nothing to do with a plan — a plan is picked by the answers above it.
export function demoScan(): { analysis: Analysis; avatarSpec: AvatarSpec } {
  const m = defaultMetrics();
  return { analysis: analyzeMovement(m), avatarSpec: buildAvatarSpec(m) };
}

/** What GET /api/v1/workout/plan answers (lib/workout/relaunchServer.ts loadWorkoutPage). */
export interface PageData { plans: SavedPlan[]; offer: WorkoutOffer | null }

async function fetchPage(): Promise<PageData | 'error'> {
  try {
    const res = await fetch('/api/v1/workout/plan', { cache: 'no-store' });
    const j = res.ok ? await res.json() : null;
    return Array.isArray(j?.plans) ? { plans: j.plans, offer: j.offer ?? null } : 'error';
  } catch {
    return 'error';
  }
}

/** `initialData` (tests, a harness): the GET's answer already in hand — the page starts from it and does not fetch. */
export function WorkoutView({ initialData = null }: { initialData?: PageData | null } = {}) {
  const [consent, setConsent] = useState(false);
  const [ageOk, setAgeOk] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [spec, setSpec] = useState<AvatarSpec | null>(null);
  // MIRROR-COACH P1 (2026-09-25): buyers keep their plans; this reads them from the plan route, which revises each one
  // on read. MIRROR-COACH P8 (2026-09-29): the same read brings `offer` — the reader's audience (the server's age
  // truth), both products at the catalog's price, and which are free for a past buyer.
  const [data, setData] = useState<PageData | null | 'error'>(initialData);
  const [answers, setAnswers] = useState<WorkoutAnswers>({ daysPerWeek: 3, equipment: 'bodyweight' });
  // One browser key per product until the server gives a definite answer, so a retry — after a dropped connection, or
  // a charge whose plan did not save — finishes the same purchase instead of making a second one (relaunchServer.ts).
  const pendingKey = useRef<Partial<Record<string, string>>>({});

  const load = useCallback(async () => setData(await fetchPage()), []);
  useEffect(() => {
    if (initialData) return;
    let live = true;
    void fetchPage().then((d) => { if (live) setData(d); });
    return () => { live = false; };
  }, [initialData]);

  const offer = data && data !== 'error' ? data.offer : null;
  const youth = offer?.audience === 'youth';
  // MIRROR-COACH P8 FIX (2026-09-30): no birth year on file — nothing to preview or buy until it is answered
  const ageNeeded = offer?.blockedBy === 'age_needed';
  const dayChoices: readonly number[] = youth ? DAY_CHOICES.youth : DAY_CHOICES.adult;
  // what the answers pick, shown before anyone buys (the server picks again, with the account's own age)
  const days = (dayChoices.includes(answers.daysPerWeek) ? answers.daysPerWeek : dayChoices[dayChoices.length - 1]) as WorkoutAnswers['daysPerWeek'];
  const sent: WorkoutAnswers = { daysPerWeek: days, equipment: youth ? 'bodyweight' : answers.equipment };
  const preview = offer && !ageNeeded ? templateFor({ daysPerWeek: sent.daysPerWeek, equipment: sent.equipment, youth }) : null;

  const buy = async (p: OfferProduct) => {
    if (busy) return;
    // a paid product with no plan on file is finished uncharged (MIRROR-COACH P8 FIX), so there is nothing to confirm
    if (!p.free && !p.unfinished && typeof window !== 'undefined' && !window.confirm(`Buy the ${p.name} for ${p.price} shards?`)) return;
    const key = pendingKey.current[p.tier] ?? newIdempotencyKey();
    pendingKey.current[p.tier] = key;
    setBusy(p.tier);
    let res: Response | null = null;
    let j: Record<string, unknown> | null = null;
    // one quiet retry with the SAME key after a dropped connection or a server error: it can only finish this purchase
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        res = await fetch('/api/v1/workout/plan', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          // `template`: the one previewed here — the server refuses to sell another (MIRROR-COACH P8 FIX)
          body: JSON.stringify({ tier: p.tier, answers: sent, idempotency_key: key, ...(preview ? { template: preview.id } : {}), ...(p.free && !p.unfinished ? { free: true } : {}) }),
        });
        j = await res.json().catch(() => null);
        if (res.status < 500) break;
      } catch { res = null; }
    }
    setBusy(null);
    if (res?.ok) {
      delete pendingKey.current[p.tier];
      toast.success(j?.recovered ? `Your ${p.name} is below: the payment you made covers it.` : j?.free ? `Your free ${p.name} is below.` : `Bought: your ${p.name} is below.`);
      void load();
      return;
    }
    if (!res) { toast.error('No answer from the server. Press it again: it finishes this same purchase.'); return; }
    if (j?.error === 'plan_not_saved') { toast.error(String(j.message ?? 'The plan did not save. Press it again.')); return; }
    delete pendingKey.current[p.tier];
    if (j?.error === 'insufficient_funds') toast.error(`Not enough shards: the ${p.name} is ${p.price} shards.`);
    else if (j?.error === 'template_changed') { toast.error(WORKOUT_TEMPLATE_CHANGED); void load(); }
    else if (j?.error === 'age_needed') { toast.error(WORKOUT_AGE_NEEDED_LINE); void load(); }
    else { toast.error('Nothing was bought. The page has been reloaded; try again.'); void load(); }
  };

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
    setAnalysis(null); setSpec(null); setData((d) => (d && d !== 'error' ? { ...d, plans: [] } : d));
    toast.success('Deleted your saved scans, Mirror history and workout plans.');
  };

  const plans = data && data !== 'error' ? data.plans : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center gap-2 mb-1">
        <Activity className="h-6 w-6 text-[#00E5FF]" />
        <h1 className="text-2xl font-bold text-white">Training plans</h1>
      </div>
      <p className="text-white/60 text-sm mb-2">{WORKOUT_INTRO}</p>
      <p className="text-white/40 text-xs mb-5">{WAVE_LINE}</p>

      {/* MIRROR-COACH P8: the relaunch. The answers pick a FEL template; the server picks again with the account's age. */}
      <section aria-label="Pick your plan" className="rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-4 space-y-3">
        {ageNeeded && (
          <p role="status" className="text-xs text-[#FFD700]" data-age-needed>
            {WORKOUT_AGE_NEEDED_LINE}{' '}
            {offer?.ageHref && <Link href={offer.ageHref} className="text-[#00E5FF] underline-offset-2 hover:underline">Open your health answers</Link>}
          </p>
        )}
        {offer && !ageNeeded && youth && <p className="text-xs text-[#FFD700]/90">{WORKOUT_YOUTH_LINE}</p>}
        {offer && !ageNeeded && !youth && <p className="text-xs text-white/50">{WORKOUT_JUMP_LINE}</p>}
        {!ageNeeded && <>
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="mb-1 text-xs font-semibold text-white/70">Days a week you train</legend>
          {dayChoices.map((d) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => setAnswers((a) => ({ ...a, daysPerWeek: d as WorkoutAnswers['daysPerWeek'] }))}
              className={`rounded-lg border px-3 py-1.5 text-sm ${days === d ? 'border-[#00E5FF] text-[#00E5FF]' : 'border-white/15 text-white/70'}`}>{d} days</button>
          ))}
        </fieldset>
        {!youth && (
          <fieldset className="flex flex-wrap items-center gap-2">
            <legend className="mb-1 text-xs font-semibold text-white/70">Equipment</legend>
            {(['bodyweight', 'gym'] as const).map((e) => (
              <button key={e} type="button" aria-pressed={answers.equipment === e} onClick={() => setAnswers((a) => ({ ...a, equipment: e }))}
                className={`rounded-lg border px-3 py-1.5 text-sm ${answers.equipment === e ? 'border-[#00E5FF] text-[#00E5FF]' : 'border-white/15 text-white/70'}`}>{e === 'gym' ? 'Full gym' : 'Bodyweight (home)'}</button>
            ))}
          </fieldset>
        )}
        </>}
        {preview && (
          <div className="rounded-lg border border-white/10 p-3" data-template={preview.id}>
            <p className="text-sm font-semibold text-white">Your template: {preview.name}</p>
            <p className="text-xs text-white/60">{preview.summary}</p>
            <p className="mt-1 text-[11px] text-white/40">{templateShapeLine(preview)} · You need: {preview.equipmentLine}</p>
            {preview.dailyTargetMinutes ? <p className="mt-1 text-[11px] text-white/40">{dailyTargetLine(preview.dailyTargetMinutes)}</p> : null}
          </div>
        )}
        {/* MIRROR-COACH P8 FIX: the line that matches what could not be read (it always blamed the past purchases) */}
        {offer && !offer.purchasable && offer.blockedBy !== 'age_needed' && (
          <p role="status" className="text-xs text-[#FFD700]" data-blocked={offer.blockedBy ?? 'purchases'}>{offer.blockedBy === 'age_unread' ? WORKOUT_AGE_UNREAD : WORKOUT_CHECK_FAILED}</p>
        )}
        {offer && offer.purchasable && (
          <div className="grid gap-3 sm:grid-cols-2">
            {offer.products.filter((p) => p.onSale).map((p) => (
              <div key={p.tier} className="rounded-lg border border-white/10 p-3 flex flex-col gap-1" data-product={p.tier}>
                <p className="text-sm font-semibold text-white">{p.name}</p>
                <p className="text-[11px] text-white/50">{p.line}</p>
                {p.unfinished
                  ? <p className="text-[11px] text-[#FFD700]" data-unfinished>{unfinishedLine(p.name)}</p>
                  : p.free
                    ? <p className="text-[11px] text-[#00FF9D] flex items-center gap-1"><Gift className="h-3 w-3" />{WORKOUT_FREE_LINE}</p>
                    : <p className="text-[11px] text-white/70">{p.price} shards</p>}
                <button type="button" onClick={() => void buy(p)} disabled={busy !== null}
                  className="mt-1 rounded-lg bg-[#00E5FF] py-2 text-sm font-semibold text-black disabled:opacity-50">
                  {busy === p.tier ? 'Working…' : p.unfinished ? `Get your ${p.name}` : p.free ? `Get the ${p.name} free` : `Buy for ${p.price} shards`}
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-white/30">A plan is a list of sessions to follow at your own pace. Not medical advice.</p>
      </section>

      <SavedPlans saved={data === null ? null : data === 'error' ? 'error' : data.plans} />

      <p className="text-white/40 text-xs mb-2">A real movement screen is measured in <Link href="/play/mirror" className="text-[#00E5FF] hover:underline">the Mirror</Link>. The demo below uses sample numbers and does not change your plan.</p>

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
        <button onClick={runScan} disabled={!consent || !ageOk} title={!consent || !ageOk ? 'Tick both boxes above to enable' : undefined} className="mt-2 w-full flex items-center justify-center gap-2 rounded-lg bg-white/10 text-white font-semibold py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
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

/** The plans this account holds, each with its note or its gate lines. Nothing at all while loading. */
export function SavedPlans({ saved }: { saved: SavedPlan[] | null | 'error' }) {
  if (saved === null) return null;
  if (saved === 'error') {
    return <p className="mb-4 text-xs text-white/40">Your saved plans could not be loaded just now. Reload the page to try again.</p>;
  }
  if (!saved.length) return null;
  return (
    <div className="mb-4 space-y-3">
      <h2 className="text-white font-semibold text-sm">Your plans</h2>
      {saved.map((p) => (isTemplateView(p) ? <TemplatePlanViewer key={p.id} plan={p} /> : <PlanViewer key={p.id} plan={p} />))}
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

// MIRROR-COACH P8 (2026-09-29): a FEL template plan, as the server gated it for this reader today
// (lib/workout/relaunch.ts gatedPlanView). Nothing is decided here: a swapped jump arrives already swapped, with the
// gate's one line; a held one arrives in `held`. The week is laid out Mon → Sun like the old plans' (P6's fullWeek).
function TemplatePlanViewer({ plan }: { plan: Extract<SavedPlan, { kind: 'template' }> }) {
  const product = productFor(plan.tier);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-white/10 bg-white/[0.03] p-4" data-plan-kind="template" data-plan-template={plan.template?.id ?? ''}>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <Sparkles className="h-4 w-4 text-[#FFD700]" />
        <h3 className="text-white font-semibold">{product?.name ?? 'Plan'} · {plan.template?.name ?? plan.focus}</h3>
        {plan.free && <span className="text-[10px] rounded-full bg-[#00FF9D]/10 px-2 py-0.5 text-[#00FF9D]">Free: you bought a plan here before</span>}
      </div>
      {plan.template && <p className="mb-1 text-xs text-white/50">{plan.template.summary}</p>}
      {plan.template?.dailyTargetLine && <p className="mb-2 text-[11px] text-white/40">{plan.template.dailyTargetLine}</p>}
      <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
        {plan.weeks.map((wk) => {
          const week = fullWeek(wk.sessions);
          const session = (s: (typeof wk.sessions)[number], i: number) => (
            <div key={i} className="mb-2">
              <div className="text-white/70 text-[11px] font-semibold">{s.day} — {s.label}</div>
              {s.items.map((it) => (
                <div key={it.id} className="pl-1 text-[11px] text-white/50" data-plan-item={it.exercise}>
                  <div className="flex flex-wrap items-center gap-1">
                    <ChevronRight className="h-3 w-3 text-[#00FF9D]" />{it.name} · {it.dose}
                    {it.cue && <span className="text-white/30">({it.cue})</span>}
                  </div>
                  {it.gate && <div className="pl-4 mt-0.5"><GateSwapLine note={it.gate} /></div>}
                </div>
              ))}
              {s.held.length > 0 && <div className="pl-4 mt-1"><GateHeldList items={s.held} /></div>}
            </div>
          );
          return (
            <div key={wk.week} className={`rounded-lg border p-3 ${wk.easier ? 'border-[#7BD389]/30' : 'border-white/10'}`} data-plan-week={wk.week}>
              <div className="text-[#00E5FF] text-xs font-bold mb-2">Week {wk.week} · {wk.label}</div>
              {week ? week.map((slot) => slot.kind === 'training'
                ? <div key={slot.day} data-plan-day={slot.day} data-kind="training">{slot.entries.map(session)}</div>
                : (
                  <div key={slot.day} className="mb-2" data-plan-day={slot.day} data-kind="off">
                    <div className="text-[#7BD389]/80 text-[11px] font-semibold">{slot.day} — Off day</div>
                    <div className="pl-4 text-[11px] text-white/40">{OFF_DAY_WEEK_LINE}</div>
                  </div>
                )) : wk.sessions.map(session)}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] text-white/30">Not medical advice.</p>
    </motion.div>
  );
}

// MIRROR-COACH P1 (2026-09-25): its footer said "Exercise movies render on-device using your mini-avatar rig.
// AI-generated", and the page intro promised a plan "animated with it performing every rep". Nothing renders a movie
// (this is a list of names and doses), and nothing about a plan is AI-generated (generatePlan picks from fixed pools).
function PlanViewer({ plan }: { plan: LegacyPlan }) {
  const weeks: any[] = Array.isArray(plan.weeks) ? plan.weeks : [];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-white/10 bg-white/[0.03] p-4" data-plan-kind="legacy">
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
        {weeks.map((wk: any, wi: number) => {
          const days: any[] = Array.isArray(wk?.days) ? wk.days : [];
          // MIRROR-COACH P6 (2026-09-29): THE WHOLE WEEK. This listed Mon, Wed and Fri and nothing else, so four days of
          // every week were blanks. The plan's named days now sit in a Mon → Sun week and every other day is an off day
          // that says what one is (lib/coach/offDay.ts fullWeek / OFF_DAY_WEEK_LINE). A plan whose days aren't named as
          // days of the week can't be placed honestly, so it shows as it always did.
          const week = fullWeek(days);
          const dayBlock = (d: any, i: number) => (
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
          );
          return (
            <div key={wk?.week ?? wi} className="rounded-lg border border-white/10 p-3">
              <div className="text-[#00E5FF] text-xs font-bold mb-2">Week {wk?.week ?? wi + 1}{wk?.theme ? ` · ${wk.theme}` : ''}</div>
              {week ? week.map((slot) => slot.kind === 'training'
                ? <div key={slot.day} data-plan-day={slot.day} data-kind="training">{slot.entries.map(dayBlock)}</div>
                : (
                  <div key={slot.day} className="mb-2" data-plan-day={slot.day} data-kind="off">
                    <div className="text-[#7BD389]/80 text-[11px] font-semibold">{slot.day} — Off day</div>
                    <div className="pl-4 text-[11px] text-white/40">{OFF_DAY_WEEK_LINE}</div>
                  </div>
                )) : days.map(dayBlock)}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] text-white/30">Not medical advice.</p>
    </motion.div>
  );
}
