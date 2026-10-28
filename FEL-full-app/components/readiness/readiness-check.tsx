'use client';

// ReadinessCheck — the 30-second daily jump check, one screen (COACH-READINESS, 2026-10-25).
//
//   1. Optional tap: "How do you feel? 1–5".
//   2. Start: the phone's camera through the pose pipeline the Mirror uses (lib/pose/PoseService.ts), SHOWN ONLY THROUGH
//      SelfView (components/games/body-play.tsx — the app's one self-view; Z-P4-4). Hold still two seconds, then three
//      jumps, hands on hips: lib/coach/readiness/capture.ts reads them with the jump check's own code.
//   3. The day: Ready / Normal / Low, with the reason, against the athlete's own normal. Kept on the server for a verified
//      adult who opted in (POST /api/readiness/check: the numbers only); otherwise on this phone (deviceHistory.ts).
//   4. What happens next: a coached athlete reads whether today's session eased and whether their coach was told; a solo
//      athlete gets a suggestion and nothing is changed.
// The page (app/train/readiness/page.tsx) only mounts this for a verified adult; the server refuses everyone else anyway.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, CheckCircle2, Loader2, Square } from 'lucide-react';
import { poseService } from '@/lib/pose/PoseService';
import { MirrorWakeLock, type WakeLockApiLike } from '@/lib/mirror/liveCamera';
import { localDayKey } from '@/lib/health/readiness';
import { ReadinessCapture, type CaptureView } from '@/lib/coach/readiness/capture';
import { HOW_LINE, NOT_A_DIAGNOSIS, NOT_SAVED_LINE, ONE_A_DAY_LINE, BAND_LABEL } from '@/lib/coach/readiness/copy';
import { deviceStorage, keepDeviceCheck, readDeviceHistory } from '@/lib/coach/readiness/deviceHistory';
import { JUMPS_ASKED } from '@/lib/coach/readiness/thresholds';
import type { PriorCheck, ReadinessBand } from '@/lib/coach/readiness/types';
import { readDay, viewOf, type CoachRuleCtx, type ReadinessView, type TrendPoint } from '@/lib/coach/readiness/view';
import { SelfView } from '@/components/games/body-play';
import { ReadinessTrend } from './readiness-trend';
import { BAND_STYLE } from './band';
import { readinessView } from '@/lib/results/readiness';
import { RESULT_COPY } from '@/lib/results/copy';
import { ResultCard } from '@/components/result-card/result-card';
import { LOOK } from '@/components/result-card/look';

export const READINESS_API = '/api/readiness/check';

interface Ctx {
  ok: boolean; canSave: boolean; ready: boolean; kept: 'server' | 'device';
  coaches: (CoachRuleCtx & { ruleLine: string })[]; history: PriorCheck[] | null; trend: TrendPoint[] | null;
  today: { day: string; band: ReadinessBand; bestCm: number; dropPct: number | null } | null;
}
type Phase = 'intro' | 'starting' | 'live' | 'reading' | 'result';

const cmIn = (cm: number) => `${(cm / 2.54).toFixed(1)} in`;

export function ReadinessCheck({ api = READINESS_API }: { api?: string }) {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [feel, setFeel] = useState<number | null>(null);
  const [live, setLive] = useState<CaptureView>({ step: 'stand', jumps: 0, why: null });
  const [why, setWhy] = useState<string | null>(null);
  const [view, setView] = useState<ReadinessView | null>(null);
  const [kept, setKept] = useState<'server' | 'device' | 'none' | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const cap = useRef<ReadinessCapture | null>(null);
  const off = useRef<(() => void)[]>([]);
  const wake = useRef<MirrorWakeLock | null>(null);
  const feelRef = useRef<number | null>(null);
  feelRef.current = feel;
  const today = localDayKey(new Date());

  useEffect(() => {
    fetch(`${api}?day=${today}`).then((r) => r.json()).then((j: Ctx) => {
      setCtx(j);
      const device = readDeviceHistory(deviceStorage());
      setTrend(j.trend ?? device.slice().reverse().map((c) => ({ day: c.day, bestCm: c.bestCm, band: c.band })));
    }).catch(() => setCtx({ ok: true, canSave: false, ready: false, kept: 'device', coaches: [], history: null, trend: null, today: null }));
  }, [api, today]);

  const release = useCallback(() => {
    for (const f of off.current.splice(0)) f();
    void wake.current?.release();
    const svc = poseService();
    svc.endHighRate();
    if (svc.status.source === 'camera') svc.stop();
  }, []);
  useEffect(() => () => { release(); wake.current?.dispose(); }, [release]);

  const finish = useCallback(async () => {
    const c = cap.current;
    release();
    if (!c) return;
    setPhase('reading');
    const r = c.finish();
    if (!r.ok) { setWhy(r.why); setPhase('intro'); return; }
    const jumps = { day: today, ...r.jumps };
    const f = feelRef.current;
    if (ctx?.kept === 'server') {
      const res = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...jumps, feel: f }) }).catch(() => null);
      const j = res ? await res.json().catch(() => null) : null;
      if (res?.ok && j?.view) { setView(j.view); setKept('server'); setTrend(j.trend ?? []); setPhase('result'); return; }
    }
    // kept on this phone: the same read, the coaches' rules from the context, nobody told and nothing eased
    const store = deviceStorage();
    const prior = ctx?.history ?? readDeviceHistory(store);
    const coaches = (ctx?.coaches ?? []).map((x) => ({ ...x, shared: false }));
    const { facts, read } = readDay(jumps, prior, f, coaches);
    const v = viewOf({ today: jumps, facts, read, priorChecks: prior.filter((p) => p.day < today).length, coaches, told: [], saved: false });
    const ok = keepDeviceCheck(store, { ...jumps, belowReal: facts.belowReal, band: read.band });
    setView(v); setKept(ok ? 'device' : 'none');
    setTrend(readDeviceHistory(store).slice().reverse().map((x) => ({ day: x.day, bestCm: x.bestCm, band: x.band })));
    setPhase('result');
  }, [api, ctx, release, today]);

  const start = useCallback(async () => {
    setWhy(null); setView(null);
    setPhase('starting');
    const svc = poseService();
    const ok = await svc.start();
    if (!ok) { setWhy(svc.why ?? 'The camera did not start.'); setPhase('intro'); return; }
    void svc.requestHighRate();   // the jump check's own ask: 60 Hz where the phone holds it
    wake.current ??= new MirrorWakeLock((navigator as Navigator & { wakeLock?: WakeLockApiLike }).wakeLock ?? null, document);
    void wake.current.hold();
    const cam = svc.status.camera;
    const c = new ReadinessCapture({ aspect: cam && cam.height ? cam.width / cam.height : 4 / 3, cameraFps: cam?.frameRate ?? null });
    cap.current = c;
    let done = false;
    off.current.push(svc.onFrame((fr) => {
      if (done) return;
      const v = c.push({ t: fr.t, present: fr.present, image: fr.present ? fr.image.map((l) => ({ x: l.x, y: l.y, z: l.z, v: l.v })) : [], ...(fr.world ? { world: fr.world } : {}) });
      setLive(v);
      if (v.step === 'done') { done = true; void finish(); }
    }));
    setLive({ step: 'stand', jumps: 0, why: null });
    setPhase('live');
  }, [finish]);

  const doneToday = !!ctx?.today && phase === 'intro' && !view;
  const caption = live.step === 'stand' ? (live.why ?? 'Hold still, hands on hips…') : live.step === 'jump' ? `Jump ${Math.min(live.jumps + 1, JUMPS_ASKED)} of ${JUMPS_ASKED}` : 'Reading your jumps…';

  if (ctx && !ctx.ok) return null;
  return (
    <div className="space-y-4" data-readiness-check>
      <div className={`fel-card space-y-2 rounded-xl p-4 ${phase === 'live' || phase === 'starting' || phase === 'result' ? 'hidden' : ''}`}>
        <div className="text-[11px] uppercase tracking-wider text-white/40">Daily readiness · 30 seconds</div>
        <p className="text-sm text-white/75">{HOW_LINE}</p>
        <p className="text-xs text-white/45">{NOT_A_DIAGNOSIS}</p>
        {ctx && ctx.coaches.length > 0 && (
          <ul className="space-y-0.5 text-xs text-white/55" data-readiness-rules>
            {ctx.coaches.map((c) => <li key={c.coachId}>{c.ruleLine}</li>)}
          </ul>
        )}
      </div>

      {doneToday && ctx?.today && (
        <div className="fel-card space-y-2 rounded-xl p-4" data-readiness-today>
          <span className={`inline-block rounded-lg border px-2.5 py-1 text-sm font-bold ${BAND_STYLE[ctx.today.band]}`}>{BAND_LABEL[ctx.today.band]}</span>
          <p className="text-sm text-white/75">{ONE_A_DAY_LINE}</p>
        </div>
      )}

      {phase !== 'result' && phase !== 'live' && phase !== 'starting' && !doneToday && (
        <div className="fel-card space-y-2 rounded-xl p-4" data-readiness-feel>
          <div className="text-sm font-semibold text-white">How do you feel? <span className="font-normal text-white/45">(optional)</span></div>
          <div className="flex gap-2" role="radiogroup" aria-label="How do you feel, 1 to 5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={feel === n} onClick={() => setFeel(feel === n ? null : n)} data-feel={n}
                className={`min-h-11 flex-1 rounded-lg border text-base font-bold ${feel === n ? 'border-[#00E5FF] bg-[#00E5FF]/15 text-[#00E5FF]' : 'border-white/15 text-white/70'}`}>{n}</button>
            ))}
          </div>
          <div className="flex justify-between text-[11px] text-white/40"><span>Drained</span><span>Great</span></div>
        </div>
      )}

      {/* collapsed (not unmounted) outside the check: the camera attaches to it on Start (record-set.tsx's pattern) */}
      <div className={`relative overflow-hidden rounded-xl border border-white/10 bg-black ${phase === 'live' || phase === 'starting' ? '' : 'hidden'}`} style={{ aspectRatio: '3 / 4' }} data-camera-box>
        {/* Z-P4-4: the camera picture is shown in one place only, SelfView */}
        <SelfView className="absolute inset-0 h-full w-full rounded-none" style={{ aspectRatio: 'auto' }} />
        {phase === 'live' && (
          <div className="absolute inset-x-3 top-3 rounded-lg bg-black/65 px-3 py-2 text-center text-white" aria-live="polite" data-readiness-caption>
            <div className="text-lg font-black">{caption}</div>
            <div className="mt-1 flex justify-center gap-1.5" aria-hidden>
              {Array.from({ length: JUMPS_ASKED }, (_, i) => <span key={i} className={`h-2 w-6 rounded-full ${i < live.jumps ? 'bg-[#00FF9D]' : 'bg-white/25'}`} />)}
            </div>
          </div>
        )}
      </div>

      {why && <p role="alert" className="text-sm text-[#FFB020]" data-readiness-why>{why}</p>}

      {phase !== 'result' && !doneToday && (
        phase === 'live' ? (
          <button type="button" onClick={() => void finish()} data-readiness-stop className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 font-bold text-black">
            <Square className="h-4 w-4" /> Stop and read what I did
          </button>
        ) : (
          <button type="button" onClick={() => void start()} disabled={!ctx || phase === 'starting' || phase === 'reading'} data-readiness-start
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#00E5FF] px-4 font-bold text-black disabled:opacity-50">
            {phase === 'starting' || phase === 'reading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {phase === 'reading' ? 'Reading…' : 'Start the jump check'}
          </button>
        )
      )}

      {view && phase === 'result' && (
        // PLAT-P03 (2026-10-28): the day is ONE result card — today's best jump, the arrow against your normal (the read's
        // own band: lib/results/readiness.ts), the band's next line, and "Done". The band, the reason, best / average /
        // normal, how you said you feel and where it is kept are under Details, unchanged.
        <div data-readiness-result data-band={view.band}>
          <ResultCard view={readinessView(view, { label: RESULT_COPY.done, href: '/train' })} details={(
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className={`rounded-lg border px-3 py-1.5 text-lg font-black ${BAND_STYLE[view.band]}`} data-readiness-band>{view.label}</span>
                {view.band !== 'building' && view.dropPct != null && <span className={LOOK.detail}>{view.dropPct > 0 ? '−' : '+'}{Math.abs(view.dropPct)}% vs your normal</span>}
              </div>
              <p className={`${LOOK.detail} font-semibold text-white`} data-readiness-line>{view.line}</p>
              {view.next && <p className={LOOK.detail} data-readiness-next>{view.next}</p>}
              <dl className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-white/5 p-2"><dt className="text-[11px] text-white/45">Best</dt><dd className="font-bold tabular-nums text-white" data-readiness-best>{cmIn(view.bestCm)}</dd></div>
                <div className="rounded-lg bg-white/5 p-2"><dt className="text-[11px] text-white/45">Average</dt><dd className="font-bold tabular-nums text-white">{cmIn(view.meanCm)}</dd></div>
                <div className="rounded-lg bg-white/5 p-2"><dt className="text-[11px] text-white/45">Your normal</dt><dd className="font-bold tabular-nums text-white">{view.baselineCm != null ? cmIn(view.baselineCm) : '—'}</dd></div>
              </dl>
              {view.feel != null && <p className={LOOK.detail}>You said you feel {view.feel} of 5.</p>}
              <p className={`flex items-center gap-1.5 ${LOOK.detail}`} data-readiness-kept={kept ?? ''}>
                {kept === 'server' ? <><CheckCircle2 className="h-3.5 w-3.5 text-[#00FF9D]" /> Saved to your history.</> : NOT_SAVED_LINE}
              </p>
              {!view.solo && !view.coachTold && view.band === 'low' && kept !== 'server' && (
                <p className={LOOK.detail}>Your coach was not told and today&apos;s session is as written: only a saved check reaches them.</p>
              )}
            </div>
          )} />
        </div>
      )}

      {trend.length > 1 && phase !== 'live' && <ReadinessTrend points={trend} />}
      <p className="text-center text-xs text-white/40"><Link href="/train" className="underline">Back to Train</Link></p>
    </div>
  );
}
