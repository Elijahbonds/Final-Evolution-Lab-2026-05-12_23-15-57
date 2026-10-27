'use client';

// VelocitySession — the bar-speed tool, one screen (VBT, 2026-10-25; owner: camera only).
//
//   1. SET UP: the move (barbell / DB & KB / body / med ball), the load, the athlete's height (the ruler when no plate is
//      seen; remembered on this phone), an optional warm-up readiness read (adults), the stop line (the coach's for this
//      lift when they set one, else 20 %), and the setup guide: side-on, ~3 m, the whole bar path in the picture.
//   2. LIVE: the camera through the app's pose pipeline, 60 fps where the phone holds it, SHOWN ONLY THROUGH SelfView
//      (components/games/body-play.tsx; Z-P4-4). Each rep's speed in big type, coloured by its velocity zone; the
//      velocity-loss cue when the set has slowed past the stop line. A barbell is read at the plate when the plate is
//      found (frame-grab.ts → lib/vbt/plate.ts), else at the hands.
//   3. SUMMARY: every rep (MCV ±, peak, range, flags), the set's loss, where it was read from; for an adult the
//      load-velocity line and e1RM (estimates) and loads for the target zone, the warm-up readiness read; milestones.
//      Kept on the server for a verified adult who opted in (numbers only), else on this phone; a teen's are not kept.
//   OR: a slow-motion video, read on this phone through the jump check's decoder (lib/jump/slowmoDecode.ts).
// The video never leaves the device. Every number on screen is labelled an estimate.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, CheckCircle2, Film, Loader2, Square } from 'lucide-react';
import { poseService } from '@/lib/pose/PoseService';
import { MirrorWakeLock, type WakeLockApiLike } from '@/lib/mirror/liveCamera';
import { localDayKey } from '@/lib/health/readiness';
import { BAND_LABEL } from '@/lib/coach/readiness/copy';
import type { CoachRuleCtx } from '@/lib/coach/readiness/view';
import { SelfView } from '@/components/games/body-play';
import { LIFTS, LIFT_IDS, ZONES, zoneOf, type LiftFamily, type LiftId, type ZoneId } from '@/lib/vbt/lifts';
import { VbtLive, viewOf, clampStop, type LiveView } from '@/lib/vbt/live';
import { PlateTracker } from '@/lib/vbt/plate';
import { plateGuess, type VbtFrame } from '@/lib/vbt/track';
import { fitProfile, loadsForZone } from '@/lib/vbt/profile';
import { readBarSpeed, warmupOf } from '@/lib/vbt/readiness';
import { barSpeedDays, deviceStorage, keepDeviceSet, keptOf, readDeviceSets, type KeptSet } from '@/lib/vbt/sets';
import { addMilestones, MILESTONES, reached } from '@/lib/vbt/milestones';
import type { VbtFeatures, VbtTier } from '@/lib/vbt/gate';
import { E1RM_LINE, ESTIMATE_LINE, NOT_SAVED_LINE, PRIVACY_LINE, SLOWMO_LINE, TEEN_LINE, setResult, setupLines, sourceLine, speedText, statusLine, stopLine } from '@/lib/vbt/copy';
import { STRETCHES } from '@/lib/jump/slowmo';
import type { Decoder } from '@/lib/jump/slowmoDecode';
import { videoGrab, type Grab } from './frame-grab';

export const VBT_API = '/api/vbt/sets';
const HEIGHT_KEY = 'fel.vbt.height.v1';

export interface VbtCtx {
  ok: boolean; error?: string; tier: VbtTier; features: VbtFeatures; canSave: boolean; ready: boolean; kept: 'server' | 'device' | 'none';
  history: KeptSet[] | null; coaches: CoachRuleCtx[];
  targets: { sessionExerciseId: string; name: string; lift: LiftId; zone: ZoneId; lossStopPct: number }[];
}
type Phase = 'setup' | 'starting' | 'live' | 'reading' | 'summary';

const FAMILIES: { id: LiftFamily; label: string }[] = [
  { id: 'barbell', label: 'Barbell' }, { id: 'dbkb', label: 'DB / KB' }, { id: 'body', label: 'Body' }, { id: 'medball', label: 'Med ball' },
];
const store = () => deviceStorage();
const readHeight = (): string => { try { return store()?.getItem(HEIGHT_KEY) ?? ''; } catch { return ''; } };

export function VelocitySession({ api = VBT_API, grab, decoder }: { api?: string; grab?: Grab; decoder?: Decoder }) {
  const [ctx, setCtx] = useState<VbtCtx | null>(null);
  const [family, setFamily] = useState<LiftFamily>('barbell');
  const [liftId, setLiftId] = useState<LiftId>('back_squat');
  const [load, setLoad] = useState('');
  const [height, setHeight] = useState('');
  const [warmup, setWarmup] = useState(false);
  const [phase, setPhase] = useState<Phase>('setup');
  const [view, setView] = useState<LiveView | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [kept, setKept] = useState<'server' | 'device' | 'none' | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  const [deviceSets, setDeviceSets] = useState<KeptSet[]>([]);
  const [filmedAt, setFilmedAt] = useState<number>(240);
  const live = useRef<VbtLive | null>(null);
  const off = useRef<(() => void)[]>([]);
  const wake = useRef<MirrorWakeLock | null>(null);
  const today = localDayKey(new Date());

  useEffect(() => {
    setHeight(readHeight());
    setDeviceSets(readDeviceSets(store()));
    fetch(api).then((r) => r.json()).then((j: VbtCtx) => setCtx(j)).catch(() => setCtx(null));
  }, [api]);

  const lift = LIFTS[liftId];
  const features = ctx?.features;
  const target = ctx?.targets.find((t) => t.lift === liftId) ?? null;
  const stopPct = clampStop(target?.lossStopPct);
  const loadKg = lift.loaded && Number(load) > 0 ? Number(load) : null;
  const heightM = Number(height) > 90 && Number(height) < 250 ? Number(height) / 100 : null;
  const history = useMemo(() => ctx?.history ?? (features?.keep ? deviceSets : []), [ctx, features, deviceSets]);
  const families = FAMILIES.filter((f) => f.id !== 'medball' || features?.medball);

  const release = useCallback(() => {
    for (const f of off.current.splice(0)) f();
    void wake.current?.release();
    const svc = poseService();
    svc.endHighRate();
    if (svc.status.source === 'camera') svc.stop();
  }, []);
  useEffect(() => () => { release(); wake.current?.dispose(); }, [release]);

  /** The set is over (live or imported): keep it, read the warm-up, award milestones. */
  const settle = useCallback(async (v: LiveView) => {
    setView(v);
    setPhase('summary');
    const set = keptOf(v, { day: today, at: Date.now(), lift: liftId, loadKg, warmup: warmup && !!features?.readiness && !!loadKg, band: null });
    const rec = { lift: liftId, mcv: v.read?.bestMcv ?? null, pv: v.read?.bestPv ?? null, release: v.throws?.length ? Math.max(...v.throws.map((t) => t.speed)) : null, fps: v.fps };
    if (set) setFresh(addMilestones(store(), [...reached(rec, ctx?.tier !== 'adult'), 'first_set']));
    if (!set || !features?.keep) { setKept('none'); return; }
    let band = null as KeptSet['band'];
    if (set.warmup && v.read) {
      const w = warmupOf(v.read, { day: today, lift: liftId, loadKg: loadKg! });
      if (w) band = readBarSpeed(w, barSpeedDays(history), ctx?.coaches ?? []).kept.band;
    }
    const s: KeptSet = { ...set, warmup: !!band, band };
    if (ctx?.kept === 'server') {
      const r = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s) }).catch(() => null);
      if (r?.ok) { setKept('server'); setCtx((c) => (c ? { ...c, history: [s, ...(c.history ?? [])] } : c)); return; }
    }
    const ok = keepDeviceSet(store(), s);
    setKept(ok ? 'device' : 'none');
    setDeviceSets(readDeviceSets(store()));
  }, [api, ctx, features, history, liftId, loadKg, today, warmup]);

  const finish = useCallback(() => {
    const l = live.current;
    release();
    if (!l) return;
    void settle(l.finish());
  }, [release, settle]);

  const start = useCallback(async () => {
    setWhy(null); setKept(null); setFresh([]); setView(null);
    try { if (heightM) store()?.setItem(HEIGHT_KEY, String(Math.round(heightM * 100))); } catch { /* not kept */ }
    setPhase('starting');
    const svc = poseService();
    const ok = await svc.start();
    if (!ok) { setWhy(svc.why ?? 'The camera did not start.'); setPhase('setup'); return; }
    void svc.requestHighRate();      // 60 fps where the phone holds it (the jump check's own ask)
    wake.current ??= new MirrorWakeLock((navigator as Navigator & { wakeLock?: WakeLockApiLike }).wakeLock ?? null, document);
    void wake.current.hold();
    const cam = svc.status.camera;
    const aspect = cam && cam.height ? cam.width / cam.height : 9 / 16;
    const l = new VbtLive({ lift: liftId, loadKg, heightM, aspect, lossStopPct: stopPct });
    live.current = l;
    const tracker = new PlateTracker();
    const grabFrame = grab ?? videoGrab(() => svc.video);
    let shown: LiveView | null = null, cued = false;
    off.current.push(svc.onFrame((fr) => {
      const image = fr.present ? fr.image.map((p) => ({ x: p.x, y: p.y, z: p.z, v: p.v })) : [];
      let plate = null;
      if (lift.point === 'bar' && image.length) {
        const g = plateGuess(image, aspect, heightM);
        const luma = g ? grabFrame() : null;
        if (g && luma) plate = tracker.push(fr.t, luma, g.wrist, g.range);
      }
      const v = l.push({ t: fr.t, image, plate } satisfies VbtFrame);
      if (v !== shown) { shown = v; setView(v); }
      if (v.stop && !cued) { cued = true; try { navigator.vibrate?.(250); } catch { /* no buzz */ } }
    }));
    setPhase('live');
  }, [grab, heightM, lift.point, liftId, loadKg, stopPct]);

  /** A slow-motion file, read on this phone; the clock is the one the athlete says it was filmed at. */
  const importClip = useCallback(async (file: File) => {
    setWhy(null); setKept(null); setFresh([]); setView(null); setPhase('reading');
    try {
      const dec = decoder ?? (await import('@/lib/jump/slowmoDecode')).poseDecoder('full');
      const clip = await dec(file, () => {}, new AbortController().signal);
      // a clip that plays slower than it was filmed is stretched by filmed ÷ file rate (the phones use 1, 2, 4, 8)
      const want = filmedAt / Math.max(1, clip.fileFps);
      const k = want < 1.5 ? 1 : STRETCHES.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a), 1 as number);
      const frames: VbtFrame[] = clip.frames.map((f) => ({ t: f.t / k, image: f.present ? f.image : [] }));
      await settle(viewOf(lift, frames, { lift: liftId, loadKg, heightM, aspect: clip.aspect, lossStopPct: stopPct }, true));
    } catch (e) {
      setWhy(e instanceof Error ? e.message : 'The video could not be read.');
      setPhase('setup');
    }
  }, [decoder, filmedAt, heightM, lift, liftId, loadKg, settle, stopPct]);

  if (!ctx) return <p className="text-sm text-white/50" data-vbt-loading>Loading…</p>;
  if (!ctx.ok) return null;

  const read = view?.read ?? null;
  const counted = read?.reps.filter((r) => r.counted) ?? [];
  const head = view?.headline ?? null;
  const zone = head ? zoneOf(head.value) : null;
  const liveish = phase === 'live' || phase === 'starting';

  // the load-velocity line for this lift: kept sets + this one
  const profile = features?.profile && lift.loaded ? fitProfile(liftId, [
    ...history.filter((s) => s.lift === liftId && s.loadKg && s.bestMcv != null).map((s) => ({ loadKg: s.loadKg!, mcv: s.bestMcv! })),
    ...(phase === 'summary' && loadKg && read?.bestMcv != null ? [{ loadKg, mcv: read.bestMcv, mcvPm: counted.find((r) => r.mcv === read.bestMcv)?.mcvPm }] : []),
  ]) : null;
  const targetZone: ZoneId = target?.zone ?? 'accelerative_strength';
  const zoneLoads = profile?.ok ? loadsForZone(profile, targetZone) : null;
  const warmRead = phase === 'summary' && warmup && features?.readiness && read && loadKg ? (() => {
    const w = warmupOf(read, { day: today, lift: liftId, loadKg });
    return w ? readBarSpeed(w, barSpeedDays(history.filter((s) => s.day < today)), ctx.coaches) : null;
  })() : null;

  return (
    <div className="space-y-4" data-vbt-session data-vbt-phase={phase}>
      {ctx.tier === 'teen' && <p className="fel-card rounded-xl p-3 text-sm text-white/75" data-vbt-teen>{TEEN_LINE}</p>}

      {!liveish && phase !== 'summary' && (
        <div className="fel-card space-y-3 rounded-xl p-4" data-vbt-setup>
          <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Kind of move">
            {families.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={family === f.id} data-vbt-family={f.id}
                onClick={() => { setFamily(f.id); setLiftId(LIFT_IDS.find((id) => LIFTS[id].family === f.id)!); }}
                className={`min-h-10 shrink-0 rounded-lg border px-3 text-sm font-bold ${family === f.id ? 'border-[#00E5FF] bg-[#00E5FF]/15 text-[#00E5FF]' : 'border-white/15 text-white/70'}`}>{f.label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {LIFT_IDS.filter((id) => LIFTS[id].family === family).map((id) => (
              <button key={id} type="button" data-vbt-lift={id} aria-pressed={liftId === id} onClick={() => setLiftId(id)}
                className={`min-h-9 rounded-full border px-3 text-[13px] ${liftId === id ? 'border-white bg-white text-black' : 'border-white/15 text-white/75'}`}>{LIFTS[id].name}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {lift.loaded && (
              <label className="text-xs text-white/55">Load (kg)
                <input inputMode="decimal" value={load} onChange={(e) => setLoad(e.target.value.replace(/[^0-9.]/g, ''))} data-vbt-load
                  className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-black/40 px-3 text-base text-white" placeholder="100" />
              </label>
            )}
            <label className="text-xs text-white/55">Your height (cm)
              <input inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value.replace(/[^0-9]/g, ''))} data-vbt-height
                className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-black/40 px-3 text-base text-white" placeholder="178" />
            </label>
          </div>
          {features?.readiness && lift.loaded && (
            <label className="flex items-center gap-2 text-sm text-white/75">
              <input type="checkbox" checked={warmup} onChange={(e) => setWarmup(e.target.checked)} data-vbt-warmup className="h-5 w-5" />
              Warm-up readiness read (same lift, a load you use often)
            </label>
          )}
          <p className="text-xs text-white/55" data-vbt-stopline>
            {target ? `Your coach's target: ${ZONES[target.zone].name}. End the set when the bar is ${stopPct}% slower than your best rep.` : `End the set when the bar is ${stopPct}% slower than your best rep.`}
          </p>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-white/60" data-vbt-guide>
            {setupLines(lift.family).map((l) => <li key={l}>{l}</li>)}
            <li>The camera asks for 60 frames a second where your phone can hold it.</li>
          </ul>
          <p className="text-[11px] text-white/40">{PRIVACY_LINE}</p>
        </div>
      )}

      {/* collapsed (not unmounted) outside a set: the camera attaches to it on Start (record-set.tsx's pattern) */}
      <div className={`relative overflow-hidden rounded-xl border border-white/10 bg-black ${liveish ? '' : 'hidden'}`} style={{ aspectRatio: '3 / 4' }} data-camera-box>
        {/* Z-P4-4: the camera picture is shown in one place only, SelfView */}
        <SelfView className="absolute inset-0 h-full w-full rounded-none" style={{ aspectRatio: 'auto' }} />
        {phase === 'live' && (
          <div className="absolute inset-x-3 top-3 rounded-xl bg-black/70 px-3 py-2 text-center" aria-live="polite" data-vbt-live>
            {head ? (
              <>
                <div className="text-[56px] font-black leading-none tabular-nums" style={{ color: zone!.color }} data-vbt-speed data-zone={zone!.id}>{head.value.toFixed(2)}</div>
                <div className="mt-1 text-xs text-white/70">m/s {head.kind === 'mcv' ? 'mean' : head.kind === 'pv' ? 'peak' : 'release'} · ± {head.pm.toFixed(2)} · {zone!.name}</div>
              </>
            ) : <div className="py-3 text-base font-bold text-white" data-vbt-status>{statusLine(view?.status ?? 'waiting')}</div>}
            <div className="mt-1 flex justify-center gap-3 text-sm text-white/80">
              <span data-vbt-reps>{view?.throws ? `${view.throws.length} throws` : `${counted.length} reps`}</span>
              {counted.length > 1 && <span data-vbt-loss>−{counted[counted.length - 1].lossPct ?? 0}%</span>}
            </div>
          </div>
        )}
        {phase === 'live' && view?.stop && (
          <div className="absolute inset-x-3 bottom-3 rounded-xl bg-[#FF4D8D] px-3 py-3 text-center text-base font-black text-black" role="alert" data-vbt-stop>{stopLine(stopPct)}</div>
        )}
      </div>

      {why && <p role="alert" className="text-sm text-[#FFB020]" data-vbt-why>{why}</p>}

      {phase !== 'summary' && (
        phase === 'live' ? (
          <button type="button" onClick={finish} data-vbt-end className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 font-bold text-black">
            <Square className="h-4 w-4" /> End the set
          </button>
        ) : (
          <div className="space-y-2">
            <button type="button" onClick={() => void start()} disabled={phase !== 'setup' || (lift.loaded && !loadKg && lift.family !== 'medball')} data-vbt-start
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#00E5FF] px-4 font-bold text-black disabled:opacity-50">
              {phase === 'starting' || phase === 'reading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              {phase === 'reading' ? 'Reading the video…' : 'Start the set'}
            </button>
            {phase === 'setup' && (
              <div className="fel-card space-y-2 rounded-xl p-3" data-vbt-slowmo>
                <p className="text-xs text-white/60">{SLOWMO_LINE}</p>
                <div className="flex items-center gap-2 text-xs text-white/60">
                  Filmed at
                  {[30, 60, 120, 240].map((f) => (
                    <button key={f} type="button" onClick={() => setFilmedAt(f)} aria-pressed={filmedAt === f} data-vbt-filmed={f}
                      className={`min-h-8 rounded-md border px-2 ${filmedAt === f ? 'border-[#00E5FF] text-[#00E5FF]' : 'border-white/15'}`}>{f}</button>
                  ))}
                  fps
                </div>
                <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/15 text-sm font-bold text-white/80">
                  <Film className="h-4 w-4" /> Pick a slow-mo video
                  <input type="file" accept="video/*" className="sr-only" data-vbt-file onChange={(e) => { const f = e.target.files?.[0]; if (f) void importClip(f); e.target.value = ''; }} />
                </label>
              </div>
            )}
          </div>
        )
      )}

      {phase === 'summary' && view && (
        <div className="space-y-3" data-vbt-summary>
          <div className="fel-card space-y-2 rounded-xl p-4">
            <div className="flex items-baseline justify-between">
              <div className="text-sm font-bold text-white">{lift.name}{loadKg ? ` · ${loadKg} kg` : ''}</div>
              <div className="text-xs text-white/50" data-vbt-fps>{view.fps} fps</div>
            </div>
            {view.throws ? (
              <ol className="space-y-1" data-vbt-throws>
                {view.throws.map((t) => <li key={t.index} className="flex justify-between text-sm tabular-nums text-white/85"><span>Throw {t.index}</span><span>{speedText(t.speed, t.speedPm)} · {t.angleDeg}°</span></li>)}
              </ol>
            ) : (
              <>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-white/5 p-2"><dt className="text-[11px] text-white/45">Reps</dt><dd className="font-bold tabular-nums text-white" data-vbt-sum-reps>{read?.counted ?? 0}{read?.partials ? ` +${read.partials}` : ''}</dd></div>
                  <div className="rounded-lg bg-white/5 p-2"><dt className="text-[11px] text-white/45">Best (m/s)</dt><dd className="font-bold tabular-nums text-white" data-vbt-sum-best>{read?.bestMcv != null ? read.bestMcv.toFixed(2) : '—'}</dd></div>
                  <div className="rounded-lg bg-white/5 p-2"><dt className="text-[11px] text-white/45">Slowed by</dt><dd className="font-bold tabular-nums text-white" data-vbt-sum-loss>{read?.lossPct != null ? `${read.lossPct}%` : '—'}</dd></div>
                </dl>
                <ol className="space-y-1" data-vbt-reps-list>
                  {read?.reps.map((r) => (
                    <li key={r.index} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[13px] tabular-nums ${r.partial ? 'text-white/40' : 'text-white/85'}`} data-vbt-rep={r.index}>
                      <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: zoneOf(r.mcv).color }} />Rep {r.index}{r.partial ? ' · partial' : r.bounce ? ' · bounce' : ''}</span>
                      <span>{speedText(r.mcv, r.mcvPm)}{r.lossPct != null ? ` · −${r.lossPct}%` : ''}</span>
                    </li>
                  ))}
                </ol>
                {view.stop && <p className="text-xs text-[#FF4D8D]" data-vbt-sum-stop>{stopLine(stopPct)}</p>}
                {/* CUE-REWRITE: what we saw / what it means / what next */}
                {(() => { const r = setResult({ bestMcv: read?.bestMcv ?? null, lossPct: read?.lossPct ?? null, stopPct }); return (
                  <div className="space-y-0.5 text-sm" data-vbt-result><p className="text-white/85">{r.saw}</p><p className="text-white/70" data-vbt-means>{r.means}</p><p className="font-bold text-white" data-vbt-next>{r.next.text}</p></div>
                ); })()}
              </>
            )}
            <p className="text-[11px] text-white/45" data-vbt-source>{sourceLine(view.source)} {ESTIMATE_LINE}</p>
            <p className="flex items-center gap-1.5 text-xs text-white/50" data-vbt-kept={kept ?? ''}>
              {kept === 'server' ? <><CheckCircle2 className="h-3.5 w-3.5 text-[#00FF9D]" /> Saved to your history.</> : kept === 'device' ? NOT_SAVED_LINE : ctx.tier === 'teen' ? 'Not kept.' : ''}
            </p>
          </div>

          {warmRead && (
            <div className="fel-card space-y-1 rounded-xl p-4" data-vbt-readiness data-band={warmRead.read.band}>
              <div className="text-[11px] uppercase tracking-wider text-white/40">Warm-up readiness · bar speed</div>
              <div className="text-lg font-black text-white">{BAND_LABEL[warmRead.read.band]}</div>
              <p className="text-sm text-white/70">
                {warmRead.facts.baseline ? `Best ${(warmRead.kept.bestMcv).toFixed(2)} m/s at ${loadKg} kg against your normal ${(warmRead.facts.baseline.bestCm / 100).toFixed(2)} (${warmRead.facts.dropPct != null && warmRead.facts.dropPct > 0 ? '−' : '+'}${Math.abs(warmRead.facts.dropPct ?? 0)}%).` : 'Building your normal: three warm-ups on other days at this load and this compares you with yourself.'}
              </p>
            </div>
          )}

          {profile && (
            <div className="fel-card space-y-1 rounded-xl p-4" data-vbt-profile>
              <div className="text-[11px] uppercase tracking-wider text-white/40">Weight and bar speed · estimate</div>
              {profile.ok ? (
                <>
                  {profile.e1rmKg != null && <div className="text-lg font-black text-white" data-vbt-e1rm>Estimated max ≈ {profile.e1rmKg} ± {profile.e1rmPmKg} kg</div>}
                  {zoneLoads && <p className="text-sm text-white/75" data-vbt-zone-loads>{ZONES[targetZone].name} today: {zoneLoads.loKg}–{zoneLoads.hiKg} kg</p>}
                  <p className="text-[11px] text-white/45">{profile.loads.length} loads{profile.r2 != null ? ` · fit ${profile.r2} (closer to 1 is better)` : ''}. {E1RM_LINE}</p>
                </>
              ) : <p className="text-sm text-white/60">{profile.why === 'few_loads' ? 'Film a second and third weight (5 kg or more apart) to see how your speed changes with weight.' : 'The bar did not slow as the load rose: track the loads again.'}</p>}
            </div>
          )}

          {fresh.length > 0 && (
            <div className="fel-card rounded-xl p-4" data-vbt-milestones>
              <div className="text-[11px] uppercase tracking-wider text-white/40">Unlocked · practice challenges</div>
              <ul className="mt-1 space-y-1 text-sm text-white/80">
                {MILESTONES.filter((m) => fresh.includes(m.id)).map((m) => <li key={m.id} data-vbt-milestone={m.id}><b>{m.label}</b> — {m.challenge}</li>)}
              </ul>
            </div>
          )}

          <button type="button" onClick={() => { setPhase('setup'); setView(null); }} data-vbt-again className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[#00E5FF] px-4 font-bold text-black">Next set</button>
        </div>
      )}
      <p className="text-center text-xs text-white/40">
        <Link href="/train" className="underline">Back to Train</Link> · <Link href="/coach/velocity" className="underline" data-vbt-coach-door>Coaching? Your athletes&apos; bar speed</Link>
      </p>
    </div>
  );
}
