'use client';

// ShotSession — the shot and dribble tracker, one screen (BBS-01 / BBS-02, 2026-10-26).
//
//   1. SET UP: Shots or Dribbles. For shots: where the phone stands around the hoop (the shot chart turns on it), the
//      player's height (the spot's ruler; remembered on this phone), the guide (off to the side, still, the rim and the
//      arc in the picture). The BETA line and the privacy line, always.
//   2. THE RIM (shots): the camera shows through SelfView; the page suggests a rim (lib/hoops-cam/rim.ts findRim) and the
//      player taps its two ends to set or correct it. The rim is remembered on this phone for next time.
//   3. LIVE: made / taken / %, the last shot's call, and a tap to fix any call ("Did that one go in?" when the read was
//      not sure); a shot it missed can be added by hand. Dribbles: the count, crossovers, the rate and the rhythm.
//   4. SUMMARY: the shot chart, the zones, the make-% trend; kept on this phone for an adult, nowhere for a teen.
//      BBS-04: also saved to the account when the page says the server keeps it (`serverKeep`: a verified adult who opted
//      in, and the table applied); the route runs the movement-save gate again. Only the numbers are sent, never a frame.
// The camera picture is shown ONLY through SelfView and never leaves the phone; the colour copy the ball detector reads
// (frame-grab.ts) is never shown or sent; the only thing ever sent is a finished session's numbers (serverKeep above).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { notice } from '@/lib/every-screen/notices';
import { lineSize } from '@/lib/design/type';
import { Fold } from '@/components/every-screen/fold';
import Link from 'next/link';
import { Check, CheckCircle2, Crosshair, Loader2, RotateCcw, Square, Trash2, X, XCircle } from 'lucide-react';
import { Layer } from '@/components/session-player/layer';
import { PrimaryCta } from '@/components/ui/fel/primary-cta';
import { HOOPS_LOOK as K } from './look';
import { poseService } from '@/lib/pose/PoseService';
import { MirrorWakeLock, type WakeLockApiLike } from '@/lib/mirror/liveCamera';
import { localDayKey } from '@/lib/health/readiness';
import { deviceStorage } from '@/lib/vbt/sets';
import { SelfView } from '@/components/games/body-play';
import { HoopsLive, type HoopsMode, type HoopsView } from '@/lib/hoops-cam/live';
import { findRim, rimFromTaps, type Rim } from '@/lib/hoops-cam/rim';
import { PLACEMENTS, PLACEMENT_IDS, isPlacement, type Placement } from '@/lib/hoops-cam/spot';
import { byZone, keepDeviceSession, readDeviceSessions, trend, type HoopsSession } from '@/lib/hoops-cam/log';
import { keepsSessions, type HoopsTier } from '@/lib/hoops-cam/gate';
import {
  ASK_LINE, BETA_LINE, DEVICE_LINE, DRIBBLE_GUIDE, PRIVACY_LINE, RIM_LINE, RIM_SUGGEST_LINE, SERVER_LINE, SHOT_GUIDE, SPOT_LINE, TEEN_LINE,
  pctText, placementLine, statusLine,
} from '@/lib/hoops-cam/copy';
import { ShotChart, MakeTrend } from './shot-chart';
import { videoRgbGrab, type RgbGrab } from './frame-grab';

const HEIGHT_KEY = 'fel.hoopscam.height.v1';
const RIM_KEY = 'fel.hoopscam.rim.v1';
const PLACE_KEY = 'fel.hoopscam.place.v1';
type Phase = 'setup' | 'starting' | 'rim' | 'live' | 'summary';

const store = () => deviceStorage();
const readKey = (k: string): string => { try { return store()?.getItem(k) ?? ''; } catch { return ''; } };
const writeKey = (k: string, v: string): void => { try { store()?.setItem(k, v); } catch { /* not kept */ } };
const readRim = (): Rim | null => {
  try {
    const r = JSON.parse(readKey(RIM_KEY) || 'null') as Rim | null;
    return r && [r.x, r.y, r.hw, r.hh].every((n) => typeof n === 'number' && n >= 0 && n <= 1) ? r : null;
  } catch { return null; }
};

export const HOOPS_SESSIONS_API = '/api/hoops-cam/sessions';

export function ShotSession({ tier, grab, startMode = 'shots', serverKeep = false }: { tier: HoopsTier; grab?: RgbGrab; startMode?: HoopsMode; serverKeep?: boolean }) {
  const [mode, setMode] = useState<HoopsMode>(startMode);
  const [placement, setPlacement] = useState<Placement>('left_wing');
  const [height, setHeight] = useState('');
  const [front, setFront] = useState(startMode === 'dribble');
  const [phase, setPhase] = useState<Phase>('setup');
  const [view, setView] = useState<HoopsView | null>(null);
  const [aspect, setAspect] = useState(16 / 9);
  const [tap, setTap] = useState<{ x: number; y: number } | null>(null);
  const [suggest, setSuggest] = useState<Rim | null>(null);
  const [lastRim, setLastRim] = useState<Rim | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [kept, setKept] = useState<'device' | 'server' | 'none' | null>(null);
  const [history, setHistory] = useState<HoopsSession[]>([]);
  const live = useRef<HoopsLive | null>(null);
  const off = useRef<(() => void)[]>([]);
  const wake = useRef<MirrorWakeLock | null>(null);
  const startedAt = useRef(0);
  const grabRef = useRef<RgbGrab | null>(null);
  const keep = keepsSessions(tier);

  useEffect(() => {
    setHeight(readKey(HEIGHT_KEY));
    const p = readKey(PLACE_KEY);
    if (isPlacement(p)) setPlacement(p);
    setLastRim(readRim());
    if (keep) setHistory(readDeviceSessions(store()));
  }, [keep]);

  const release = useCallback(() => {
    for (const f of off.current.splice(0)) f();
    void wake.current?.release();
    const svc = poseService();
    if (svc.status.source === 'camera') svc.stop();
  }, []);
  useEffect(() => () => { release(); wake.current?.dispose(); }, [release]);

  const heightM = Number(height) > 90 && Number(height) < 250 ? Number(height) / 100 : null;

  const start = useCallback(async () => {
    setWhy(null); setKept(null); setView(null); setTap(null); setSuggest(null);
    if (heightM) writeKey(HEIGHT_KEY, String(Math.round(heightM * 100)));
    writeKey(PLACE_KEY, placement);
    setPhase('starting');
    const svc = poseService();
    const ok = await svc.start({ facingMode: front ? 'user' : 'environment' });
    if (!ok) { setWhy(svc.why ?? 'The camera did not start.'); setPhase('setup'); return; }
    wake.current ??= new MirrorWakeLock((navigator as Navigator & { wakeLock?: WakeLockApiLike }).wakeLock ?? null, document);
    void wake.current.hold();
    const cam = svc.status.camera;
    const a = cam && cam.height ? cam.width / cam.height : 16 / 9;
    setAspect(a);
    const l = new HoopsLive({ mode, rim: null, placement, heightM, aspect: a });
    live.current = l;
    startedAt.current = Date.now();
    const g = grab ?? videoRgbGrab(() => svc.video);
    grabRef.current = g;
    let shown: HoopsView | null = null, asked = false;
    off.current.push(svc.onFrame((fr) => {
      const rgb = g();
      if (!rgb) return;
      const v = l.push({ t: fr.t, rgb, pose: fr.present ? fr.image : null });
      if (mode === 'shots' && !l.rim && !asked) { asked = true; const s = findRim(rgb); if (s) setSuggest({ x: s.x, y: s.y, hw: s.hw, hh: s.hh }); }
      if (v !== shown) { shown = v; setView(v); }
    }));
    setPhase(mode === 'shots' ? 'rim' : 'live');
  }, [front, grab, heightM, mode, placement]);

  const applyRim = useCallback((r: Rim) => {
    live.current?.setRim(r);
    writeKey(RIM_KEY, JSON.stringify(r));
    setLastRim(r); setTap(null); setSuggest(null);
    setPhase('live');
  }, []);

  /** A tap on the picture: the rim's ends (normalised IMAGE coordinates — a mirrored view is flipped back). */
  const onPictureTap = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (phase !== 'rim') return;
    const box = e.currentTarget.getBoundingClientRect();
    const u = (e.clientX - box.left) / box.width, v = (e.clientY - box.top) / box.height;
    const p = { x: front ? 1 - u : u, y: v };
    if (!tap) { setTap(p); return; }
    const r = rimFromTaps(tap, p, aspect);
    setTap(null);
    if (r) applyRim(r); else setWhy('Those two taps are not the two ends of one rim: tap the left end, then the right end.');
  }, [aspect, applyRim, front, phase, tap]);

  const finish = useCallback(() => {
    const l = live.current;
    const t = poseService().latest?.t ?? performance.now();
    release();
    if (!l) return;
    const v = l.finish(t);
    setView(v);
    setPhase('summary');
    const day = localDayKey(new Date());
    const session = mode === 'shots' ? l.shotSession(day, startedAt.current) : l.dribbleSession(day, startedAt.current, (Date.now() - startedAt.current) / 1000);
    const has = session.kind === 'shots' ? session.shots.length > 0 : session.count > 0;
    if (!keep || !has) { setKept('none'); return; }
    const ok = keepDeviceSession(store(), session);
    setKept(ok ? 'device' : 'none');
    setHistory(readDeviceSessions(store()));
    // BBS-04: the account copy, for a coach the player shares with (a teen never has serverKeep, and the route refuses one)
    if (serverKeep && tier === 'adult') {
      void fetch(HOOPS_SESSIONS_API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(session) })
        .then((r) => { if (r.ok) setKept('server'); }).catch(() => { /* kept on the phone */ });
    }
  }, [keep, mode, release, serverKeep, tier]);

  const fix = (index: number, made: boolean) => { const l = live.current; if (l) setView(l.fix(index, made)); };
  const drop = (index: number) => { const l = live.current; if (l) setView(l.drop(index)); };
  const byHand = (made: boolean) => { const l = live.current; if (l) setView(l.addByHand(made, poseService().latest?.t ?? performance.now())); };

  const shots = useMemo(() => view?.shots ?? [], [view]);
  const chartShots = useMemo(() => shots.map((s) => ({ made: s.made, x: s.spot?.x ?? null, z: s.spot?.z ?? null })), [shots]);
  const zones = useMemo(() => byZone(shots.map((s) => ({ t: s.t, made: s.made, fixed: s.fixed, x: s.spot?.x ?? null, z: s.spot?.z ?? null }))), [shots]);
  const days = useMemo(() => trend(history), [history]);
  const liveish = phase === 'rim' || phase === 'live' || phase === 'starting';
  const ask = view?.shots.find((s) => s.ask) ?? null;
  const d = view?.dribble ?? null;

  return (
    <div className="space-y-4" data-hoops-session data-hoops-phase={phase} data-hoops-mode={mode}>
      {tier === 'teen' && <p className="fel-card rounded-xl p-3 text-sm text-white/75" data-hoops-teen>{TEEN_LINE}</p>}

      {phase === 'setup' && (
        <div className="fel-card space-y-3 rounded-xl p-4" data-hoops-setup>
          <div className="flex gap-1.5" role="tablist" aria-label="What to track">
            {(['shots', 'dribble'] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} data-hoops-tab={m}
                onClick={() => { setMode(m); setFront(m === 'dribble'); }}
                className={`${K.chip} font-bold ${mode === m ? K.chipOn : ''}`}>
                {m === 'shots' ? 'Shots' : 'Dribbles'}
              </button>
            ))}
          </div>
          {mode === 'shots' && (
            <>
              <div>
                <p className="mb-1 text-xs text-white/55">Where the phone stands</p>
                <div className="flex flex-wrap gap-1.5">
                  {PLACEMENT_IDS.map((p) => (
                    <button key={p} type="button" aria-pressed={placement === p} data-hoops-place={p} onClick={() => setPlacement(p)}
                      className={`${K.chip} ${placement === p ? K.chipOn : ''}`}>{PLACEMENTS[p].label}</button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-white/60">{placementLine(placement)}</p>
              </div>
              <label className="block text-xs text-white/55">Your height (cm)
                <input inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value.replace(/[^0-9]/g, ''))} data-hoops-height
                  className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-black/40 px-3 text-base text-white" placeholder="178" />
              </label>
            </>
          )}
          <label className="flex items-center gap-2 text-sm text-white/75">
            <input type="checkbox" checked={front} onChange={(e) => setFront(e.target.checked)} data-hoops-front className="h-5 w-5" />
            Use the front camera (the screen faces you)
          </label>
          {/* PLAT-P09: the set-up guide folds away (fewer words before the camera; one tap to read it) */}
          <Fold summary="How to set the phone up" className="text-white/60" testId="hoops-guide">
            <ul className="list-disc space-y-1 pl-4" data-hoops-guide>
              {(mode === 'shots' ? SHOT_GUIDE : DRIBBLE_GUIDE).map((l) => <li key={l} className={lineSize(l)}>{l}</li>)}
            </ul>
          </Fold>
          <p className={`${lineSize(BETA_LINE)} text-[#FFB020]/90`} data-hoops-beta>{BETA_LINE}</p>
          <p {...notice('privacy')} className={`${lineSize(PRIVACY_LINE)} text-white/60`}>{PRIVACY_LINE}</p>
        </div>
      )}

      {/* PLAT-P09: while the camera runs, the session is the whole screen (the premium rule: only the count, the makes
          and misses and one line while you play). The camera picture is shown in one place only, SelfView (Z-P4-4). */}
      {liveish && (
        <Layer>
          <div className={K.layer} data-hoops-layer={phase}>
            <div className={K.hud} aria-live="polite" data-hoops-live>
              {mode === 'shots' ? (
                <span className="flex items-baseline gap-3">
                  <span className={K.count} data-hoops-count>{view?.made ?? 0}/{view?.taken ?? 0}</span>
                  <span className={K.pct} data-hoops-pct>{pctText(view?.made ?? 0, view?.taken ?? 0)}</span>
                  {view?.last && <span className={`${K.call} ${view.last.made ? 'bg-[#00FF9D]' : 'bg-[#FF6B8A]'}`} data-hoops-last={view.last.made ? 'make' : 'miss'}>{view.last.made ? 'MAKE' : 'MISS'}{view.last.ask ? '?' : ''}</span>}
                </span>
              ) : (
                <span className="flex items-baseline gap-3">
                  <span className={K.count} data-hoops-dribbles>{d?.count ?? 0}</span>
                  <span className={K.pct}><b data-hoops-crossovers>{d?.crossovers ?? 0}</b> crossovers</span>
                </span>
              )}
              <button type="button" onClick={finish} aria-label="End the session" data-hoops-end className={K.end}><Square className="h-5 w-5" /></button>
            </div>
            <p className={K.line} data-hoops-status>
              {phase === 'rim' ? (tap ? 'Now the right end of the rim.' : suggest ? RIM_SUGGEST_LINE : RIM_LINE) : statusLine(view?.status ?? 'looking', mode)}
            </p>
            <div className={K.stage}>
              <div className="relative mx-auto max-h-full w-full" style={{ aspectRatio: String(aspect) }} data-camera-box>
                <SelfView mirrored={front} className="absolute inset-0 h-full w-full rounded-none" style={{ aspectRatio: 'auto' }}
                  overlay={<Overlay rim={live.current?.rim ?? null} suggest={phase === 'rim' ? suggest : null} tap={tap} ball={view?.ball ?? null} aspect={aspect} />} />
                <div className="absolute inset-0" onClick={onPictureTap} data-hoops-tap-layer style={{ cursor: phase === 'rim' ? 'crosshair' : 'default' }} />
              </div>
            </div>
            {phase === 'rim' && (suggest || lastRim) && (
              <div className={K.bar}>
                {suggest && <button type="button" onClick={() => applyRim(suggest)} data-hoops-use-suggest className={K.pick}>Use this rim</button>}
                {lastRim && <button type="button" onClick={() => applyRim(lastRim)} data-hoops-use-last className={K.pick}>Same rim as last time</button>}
              </div>
            )}
            {phase === 'live' && mode === 'shots' && ask && (
              <div className={K.ask} data-hoops-ask={ask.index}>
                <span className="text-sm font-bold text-white">{ASK_LINE}</span>
                <span className="flex gap-2">
                  <button type="button" onClick={() => fix(ask.index, true)} data-hoops-ask-in className={K.yes}>In</button>
                  <button type="button" onClick={() => fix(ask.index, false)} data-hoops-ask-out className={K.no}>Out</button>
                </span>
              </div>
            )}
            {phase === 'live' && mode === 'shots' && (
              <div className={K.bar} data-hoops-fixers>
                {view?.last && !ask && (
                  <>
                    <button type="button" onClick={() => fix(view.last!.index, !view.last!.made)} aria-label={`Shot ${view.last.index} was a ${view.last.made ? 'miss' : 'make'}`} data-hoops-flip className={K.icon}><RotateCcw className="h-5 w-5" /></button>
                    <button type="button" onClick={() => drop(view.last!.index)} aria-label={`Shot ${view.last.index} was not a shot`} data-hoops-drop className={K.icon}><Trash2 className="h-5 w-5" /></button>
                  </>
                )}
                <button type="button" onClick={() => byHand(true)} aria-label="Add a make it missed" data-hoops-add-make className={K.icon}><CheckCircle2 className="h-5 w-5 text-[#00FF9D]" /></button>
                <button type="button" onClick={() => byHand(false)} aria-label="Add a miss it missed" data-hoops-add-miss className={K.icon}><XCircle className="h-5 w-5 text-[#FF6B8A]" /></button>
                <button type="button" onClick={() => { setPhase('rim'); setTap(null); }} aria-label="Mark the rim again" data-hoops-remark className={K.icon}><Crosshair className="h-5 w-5" /></button>
              </div>
            )}
          </div>
        </Layer>
      )}

      {why && <p role="alert" className="text-sm text-[#FFB020]" data-hoops-why>{why}</p>}

      {phase === 'setup' && <PrimaryCta onClick={() => void start()} testId="hoops-start">Start the camera</PrimaryCta>}
      {phase === 'starting' && <p className="flex items-center justify-center gap-2 text-sm text-white/70" data-hoops-starting><Loader2 className="h-4 w-4 animate-spin" /> Starting the camera…</p>}

      {phase === 'summary' && view && (
        <div className="space-y-3" data-hoops-summary>
          {mode === 'shots' ? (
            <div className="fel-card space-y-3 rounded-xl p-4">
              <div className="flex items-baseline justify-between">
                <div className="text-2xl font-black tabular-nums text-white" data-hoops-sum-count>{view.made}/{view.taken} · {pctText(view.made, view.taken)}</div>
                <div className="text-xs text-white/60">{PLACEMENTS[placement].label}</div>
              </div>
              <ShotChart shots={chartShots} zones={zones} />
              <ol className="max-h-56 space-y-1 overflow-y-auto" data-hoops-shot-list>
                {shots.map((s) => (
                  <li key={s.index} className="flex items-center justify-between gap-2 text-sm tabular-nums text-white/85" data-hoops-shot={s.index}>
                    <span className="flex items-center gap-1.5">{s.made ? <Check className="h-3.5 w-3.5 text-[#00FF9D]" aria-label="make" /> : <X className="h-3.5 w-3.5 text-[#FF6B8A]" aria-label="miss" />}
                      Shot {s.index}{s.spot ? ` · ${s.spot.distM} m` : ''}{s.fixed ? ' · fixed' : s.ask ? ' · not sure' : ''}</span>
                    <button type="button" onClick={() => fix(s.index, !s.made)} data-hoops-sum-flip={s.index} className="min-h-8 rounded-md border border-white/15 px-2 text-xs text-white/75">Make it a {s.made ? 'miss' : 'make'}</button>
                  </li>
                ))}
              </ol>
              <p className="text-xs text-white/60">{SPOT_LINE}{heightM ? '' : ' Enter your height for steadier distances.'}</p>
            </div>
          ) : (
            <div className="fel-card space-y-2 rounded-xl p-4" data-hoops-dribble-sum>
              <dl className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-white/5 p-2"><dt className="text-xs text-white/60">Dribbles</dt><dd className="font-bold tabular-nums text-white" data-hoops-sum-dribbles>{d?.count ?? 0}</dd></div>
                <div className="rounded-lg bg-white/5 p-2"><dt className="text-xs text-white/60">Crossovers</dt><dd className="font-bold tabular-nums text-white" data-hoops-sum-crossovers>{d?.crossovers ?? 0}</dd></div>
                <div className="rounded-lg bg-white/5 p-2"><dt className="text-xs text-white/60">A second</dt><dd className="font-bold tabular-nums text-white" data-hoops-sum-rate>{d?.rateHz != null ? d.rateHz.toFixed(1) : '—'}</dd></div>
              </dl>
              <p className="text-sm text-white/70" data-hoops-sum-rhythm>
                {d?.rhythmCv != null ? `Rhythm: the gaps between dribbles vary ${Math.round(d.rhythmCv)}% (lower is steadier).` : 'Dribble a little longer for a rhythm read.'}
                {d && (d.left || d.right) ? ` Left hand ${d.left}, right hand ${d.right}.` : ''}
                {d?.height ? ` Mostly ${d.height === 'low' ? 'below the knee' : d.height === 'mid' ? 'knee to hip' : 'above the hip'}.` : ''}
              </p>
            </div>
          )}
          {mode === 'shots' && days.length > 0 && <div className="fel-card rounded-xl p-4"><MakeTrend days={days} /></div>}
          <p className="text-xs text-white/50" data-hoops-kept={kept ?? ''}>{kept === 'server' ? SERVER_LINE : kept === 'device' ? DEVICE_LINE : tier === 'teen' ? 'Not kept.' : 'Nothing to keep.'}</p>
          <p className="text-xs text-[#FFB020]/80">{BETA_LINE}</p>
          <button type="button" onClick={() => { setPhase('setup'); setView(null); }} data-hoops-again className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[#FF8A3D] px-4 font-bold text-black">New session</button>
        </div>
      )}
      <p className="text-center text-xs text-white/60">
        <Link href="/train" className="inline-flex min-h-11 items-center underline">Back to Train</Link> · <Link href="/play/drills?shelf=hoops" className="inline-flex min-h-11 items-center underline" data-hoops-drills-door>Ball-skill drills</Link>
      </p>
    </div>
  );
}

/** Drawn inside SelfView's flip in IMAGE coordinates, so it lines up with the picture whether or not the view is mirrored. */
function Overlay({ rim, suggest, tap, ball, aspect }: { rim: Rim | null; suggest: Rim | null; tap: { x: number; y: number } | null; ball: { x: number; y: number; r: number } | null; aspect: number }) {
  const box = (r: Rim, cls: string, attr: string) => (
    <div className={`pointer-events-none absolute rounded-[50%] border-2 ${cls}`} {...{ [attr]: '' }}
      style={{ left: `${(r.x - r.hw) * 100}%`, top: `${(r.y - Math.max(r.hh, 0.01)) * 100}%`, width: `${r.hw * 200}%`, height: `${Math.max(r.hh, 0.01) * 200}%` }} />
  );
  return (
    <>
      {rim && box(rim, 'border-[#FF8A3D]', 'data-hoops-rim')}
      {suggest && box(suggest, 'border-dashed border-[#FFB020]', 'data-hoops-suggest')}
      {tap && <div className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ left: `${tap.x * 100}%`, top: `${tap.y * 100}%` }} data-hoops-tap-mark />}
      {ball && <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#00E5FF]" data-hoops-ball
        style={{ left: `${ball.x * 100}%`, top: `${ball.y * 100}%`, width: `${Math.max(1.5, (ball.r * 200) / aspect)}%`, height: `${Math.max(1.5 * aspect, ball.r * 200)}%` }} />}
    </>
  );
}
