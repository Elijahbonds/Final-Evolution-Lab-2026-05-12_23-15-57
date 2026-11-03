'use client';

// SprintRunner — one camera run, start to read (SPRINT-SPEED, 2026-10-25).
//
//   camera      the phone's camera through the Mirror's pose pipeline (lib/pose/PoseService.ts), the BACK camera by
//               default (the phone films the lane, not the person holding it), asked for 60 fps. SHOWN ONLY THROUGH
//               SelfView (components/games/body-play.tsx, the app's one self-view; Z-P4-4), not mirrored, so a tap
//               lands where it looks
//   calibrate   tap the line(s), markers or cones on the picture (lib/sprint/geometry.ts); the tracked body point is
//               drawn live so the coach sees the camera has the athlete
//   run         the phone's Go (components/sprint/go-signal.ts) or "ready" for a first-movement start; the frames go
//               into lib/sprint/session.ts, which says when the run is over; a Stop reads whatever was seen
//   read        lib/sprint/session.ts read(), handed up. The camera stays on for the next run; the taps are kept
//
// Nothing here sends anything: no fetch, no upload; the picture never leaves the phone.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Crosshair, Loader2, Play, RotateCcw, Square } from 'lucide-react';
import { poseService } from '@/lib/pose/PoseService';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { MirrorWakeLock, type WakeLockApiLike } from '@/lib/mirror/liveCamera';
import { bodyPoint, CENTRE_LINE, lineFromTaps, markerScale, type BodyPointKind, type Line, type Pt } from '@/lib/sprint/geometry';
import { agilityScale } from '@/lib/sprint/agility';
import { goPlan, goStart } from '@/lib/sprint/start';
import { SprintSession, type RunConfig, type RunResult, type StartMode } from '@/lib/sprint/session';
import { PRIVACY_LINE } from '@/lib/sprint/copy';
import { SelfView } from '@/components/games/body-play';
import { playGo, type GoCall, type GoHandle } from './go-signal';

/** A run's settings before the taps. */
export type RunBase =
  | { test: 'gate'; label: string; distanceM: number; start: StartMode; point: BodyPointKind }
  | { test: 'flying'; label: string; distanceM: number; cameraM: number | null; point: BodyPointKind }
  | { test: 'trace'; label: string; start: StartMode | 'none'; useMarkers: boolean; markerM: number; startAtOrigin: boolean; statureM: number | null; massKg: number | null }
  | { test: 'agility'; label: string; start: StartMode };

/** How many taps each test needs, and what each one is. */
export function tapPrompts(b: RunBase): string[] {
  if (b.test === 'gate') return ['Tap one end of the finish line', 'Tap the other end of the finish line'];
  if (b.test === 'flying') return ['Line 1: tap the bottom of its pole', 'Line 1: tap the top of its pole', 'Line 2: tap the bottom of its pole', 'Line 2: tap the top of its pole'];
  if (b.test === 'trace') return b.useMarkers ? ['Tap the start marker', `Tap the marker ${b.markerM} m along`] : [];
  return ['Tap the left cone', 'Tap the middle cone', 'Tap the right cone'];
}

/** Assumption (flagged in docs/SPRINT-SPEED.md): how far the athlete is from the phone at the Go, when the test does not say. */
const GO_DISTANCE_M = { trace: 20, agility: 9 } as const;

type CfgResult = { ok: true; cfg: RunConfig } | { ok: false; why: string };

/** The taps → the run's config, or why not. */
export function configFrom(b: RunBase, taps: Pt[], aspect: number, useCentre: boolean): CfgResult {
  if (!(b.test === 'gate' && useCentre) && taps.length < tapPrompts(b).length) return { ok: false, why: 'Tap every point first.' };
  if (b.test === 'gate') {
    if (useCentre) return { ok: true, cfg: { ...b, line: CENTRE_LINE } };
    const l = lineFromTaps(taps[0], taps[1], aspect);
    return l.ok ? { ok: true, cfg: { ...b, line: l.line } } : l;
  }
  if (b.test === 'flying') {
    const a = lineFromTaps(taps[0], taps[1], aspect), c = lineFromTaps(taps[2], taps[3], aspect);
    if (!a.ok) return a;
    if (!c.ok) return c;
    return { ok: true, cfg: { test: 'flying', label: b.label, distanceM: b.distanceM, cameraM: b.cameraM, point: b.point, first: a.line, second: c.line } };
  }
  if (b.test === 'trace') {
    if (b.useMarkers) {
      const s = markerScale(taps[0], taps[1], b.markerM, aspect);
      if (!s.ok) return s;
    } else if (!b.statureM) return { ok: false, why: 'Type the athlete\'s height, or use markers.' };
    return { ok: true, cfg: { test: 'trace', label: b.label, start: b.start, markers: b.useMarkers ? [taps[0], taps[1]] : null, markerM: b.markerM, startAtOrigin: b.startAtOrigin, statureM: b.statureM, massKg: b.massKg } };
  }
  const cones = { left: taps[0], middle: taps[1], right: taps[2] };
  const s = agilityScale(cones, aspect);
  return s.ok ? { ok: true, cfg: { test: 'agility', label: b.label, start: b.start, cones } } : s;
}

type Phase = 'idle' | 'starting' | 'calibrate' | 'ready' | 'running' | 'reading';
const CALL_WORDS: Record<GoCall, string> = { marks: 'On your marks', set: 'Set', go: 'GO' };
const MAX_RUN_MS = 40_000;

export function SprintRunner({ base, onResult, facingMode = 'environment', onLive }: {
  base: RunBase; onResult: (r: RunResult, cfg: RunConfig) => void; facingMode?: 'user' | 'environment';
  /** TOOLS-EASY (2026-10-28): the camera turned on or off (the speed page folds its set-up while it is on). */
  onLive?: (on: boolean) => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [why, setWhy] = useState<string | null>(null);
  const [taps, setTaps] = useState<Pt[]>([]);
  const [useCentre, setUseCentre] = useState(false);
  const [aspect, setAspect] = useState(16 / 9);
  const [dot, setDot] = useState<Pt | null>(null);
  const [call, setCall] = useState<GoCall | null>(null);
  const [goAt, setGoAt] = useState<number | null>(null);
  const cfg = useRef<RunConfig | null>(null);
  const session = useRef<SprintSession | null>(null);
  const off = useRef<(() => void)[]>([]);
  const go = useRef<GoHandle | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const wake = useRef<MirrorWakeLock | null>(null);
  const latest = useRef<PoseFrame | null>(null);
  const prompts = tapPrompts(base);
  useEffect(() => { onLive?.(phase !== 'idle'); }, [phase, onLive]);
  const point: BodyPointKind = base.test === 'gate' || base.test === 'flying' ? base.point : 'hips';

  const stopPoll = () => { if (poll.current) clearInterval(poll.current); poll.current = null; go.current?.cancel(); go.current = null; };
  const release = useCallback(() => {
    stopPoll();
    for (const f of off.current.splice(0)) f();
    void wake.current?.release();
    const svc = poseService();
    svc.endHighRate();
    if (svc.status.source === 'camera') svc.stop();
  }, []);
  useEffect(() => () => { release(); wake.current?.dispose(); }, [release]);
  // a new test or new settings: the taps start over
  const baseKey = JSON.stringify(base);
  useEffect(() => { setTaps([]); setUseCentre(false); setWhy(null); cfg.current = null; setPhase((p) => (p === 'idle' || p === 'starting' ? p : 'calibrate')); }, [baseKey]);

  const startCamera = useCallback(async () => {
    setWhy(null); setPhase('starting');
    const svc = poseService();
    const ok = await svc.start({ facingMode });
    if (!ok) { setWhy(svc.why ?? 'The camera did not start.'); setPhase('idle'); return; }
    void svc.requestHighRate();
    wake.current ??= new MirrorWakeLock((navigator as Navigator & { wakeLock?: WakeLockApiLike }).wakeLock ?? null, document);
    void wake.current.hold();
    const cam = svc.status.camera;
    setAspect(cam && cam.height ? cam.width / cam.height : 16 / 9);
    let last = 0;
    off.current.push(svc.onFrame((fr) => {
      latest.current = fr;
      session.current?.push(fr);
      const now = performance.now();
      if (now - last > 80) { last = now; const p = bodyPoint(fr, point); setDot(p ? { x: p.x, y: p.y } : null); }
    }));
    setPhase(prompts.length ? 'calibrate' : 'ready');
  }, [facingMode, point, prompts.length]);

  // taps complete → config
  useEffect(() => {
    if (phase !== 'calibrate' && phase !== 'ready') return;
    const centre = useCentre && base.test === 'gate';
    if (!centre && taps.length < prompts.length) { cfg.current = null; if (phase === 'ready') setPhase('calibrate'); return; }
    const r = configFrom(base, taps, aspect, centre);
    if (!r.ok) { setWhy(r.why); setTaps([]); cfg.current = null; setPhase('calibrate'); return; }
    setWhy(null); cfg.current = r.cfg; setPhase('ready');
  }, [taps, useCentre, phase, base, aspect, prompts.length]);

  const tap = (e: React.PointerEvent<HTMLDivElement>) => {
    if (phase !== 'calibrate') return;
    const box = e.currentTarget.getBoundingClientRect();
    const p = { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height };
    setTaps((t) => (t.length < prompts.length ? [...t, p] : t));
  };

  const finish = useCallback(() => {
    const s = session.current, c = cfg.current;
    stopPoll();
    if (!s || !c) return;
    setPhase('reading');
    // let the frame loop hand over the last frames, then read (the trace's fit takes a moment)
    setTimeout(() => {
      const r = s.read();
      session.current = null; setCall(null);
      setPhase('ready');
      onResult(r, c);
    }, 30);
  }, [onResult]);

  const arm = useCallback(() => {
    const c = cfg.current;
    if (!c) return;
    setWhy(null); setGoAt(null);
    const s = new SprintSession(c, aspect);
    s.arm(performance.now());
    session.current = s;
    setPhase('running');
    const startMode = c.test === 'flying' ? null : c.test === 'trace' ? (c.start === 'none' ? null : c.start) : c.start;
    if (startMode === 'go') {
      const plan = goPlan();
      setCall(null);
      go.current = playGo(plan, setCall);
      void go.current.done.then(({ goAt: at, outputLatencyMs }) => {
        const distanceM = c.test === 'gate' ? c.distanceM : c.test === 'agility' ? GO_DISTANCE_M.agility : GO_DISTANCE_M.trace;
        const read = goStart({ goAt: at, outputLatencyMs, distanceM });
        session.current?.setGo(read);
        setGoAt(read.t);   // when the athlete heard it: the run's start (data-sprint-go-at, for the rig)
      });
    } else setCall(null);
    const began = performance.now();
    poll.current = setInterval(() => {
      const cur = session.current;
      if (!cur) return;
      if (performance.now() - began > MAX_RUN_MS) { finish(); return; }
      if (cur.over()) finish();
    }, 200);
  }, [aspect, finish]);

  const lines: Line[] = cfg.current?.test === 'gate' ? [cfg.current.line]
    : cfg.current?.test === 'flying' ? [cfg.current.first, cfg.current.second]
    : useCentre && base.test === 'gate' ? [CENTRE_LINE] : [];
  const live = phase === 'calibrate' || phase === 'ready' || phase === 'running' || phase === 'reading';
  const prompt = phase === 'calibrate' && !useCentre ? prompts[taps.length] ?? null : null;

  return (
    <div className="space-y-3" data-sprint-runner data-sprint-phase={phase} data-sprint-taps={taps.length} {...(goAt !== null ? { 'data-sprint-go-at': String(goAt) } : {})}>
      <div className={`relative overflow-hidden rounded-xl border border-white/10 bg-black ${live || phase === 'starting' ? '' : 'hidden'}`} style={{ aspectRatio: String(aspect) }} data-camera-box>
        {/* Z-P4-4: the camera picture is shown in one place only, SelfView (not mirrored: a tap lands where it looks) */}
        <SelfView mirrored={false} className="absolute inset-0 h-full w-full rounded-none" style={{ aspectRatio: 'auto' }}
          overlay={
            <div className="absolute inset-0 touch-none" onPointerDown={tap} data-sprint-overlay>
              <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
                {lines.map((l, i) => <line key={i} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} stroke="#00FF9D" strokeWidth={3} vectorEffect="non-scaling-stroke" />)}
                {taps.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={0.012} fill="#00E5FF" stroke="#000" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
                {base.test === 'agility' && taps.map((p, i) => <line key={`a${i}`} x1={p.x} y1={0.05} x2={p.x} y2={0.95} stroke="#00FF9D" strokeOpacity={0.5} strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
                {base.test === 'trace' && taps.length === 2 && <line x1={taps[0].x} y1={taps[0].y} x2={taps[1].x} y2={taps[1].y} stroke="#00FF9D" strokeDasharray="4 4" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
                {dot && <circle cx={dot.x} cy={dot.y} r={0.014} fill="#FFB020" data-sprint-dot />}
              </svg>
              {/* TOOLS-EASY: the tap to make, big (the setup card's word size and amber) — it was a 14 px line */}
              {prompt && <div className="absolute inset-x-2 top-2 rounded-2xl border border-white/15 bg-black/75 px-3 py-2 text-center text-[clamp(20px,6vw,28px)] font-black leading-tight text-[#FFB020]" data-sprint-prompt>{prompt}</div>}
              {call && <div className={`absolute inset-0 flex items-center justify-center text-4xl font-black ${call === 'go' ? 'bg-[#00FF9D]/40 text-white' : 'text-white'}`} data-sprint-call={call}>{CALL_WORDS[call]}</div>}
              {phase === 'running' && !call && <div className="absolute inset-x-2 bottom-2 rounded-lg bg-black/65 px-3 py-1.5 text-center text-sm font-bold text-white" data-sprint-live>Running — the camera is watching the {base.test === 'agility' ? 'lines' : base.test === 'trace' ? 'run' : 'line'}</div>}
            </div>
          }
        />
      </div>

      {why && <p role="alert" className="text-sm text-[#FFB020]" data-sprint-why>{why}</p>}

      {phase === 'idle' || phase === 'starting' ? (
        <button type="button" onClick={() => void startCamera()} disabled={phase === 'starting'} data-sprint-camera
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#00E5FF] px-4 font-bold text-black disabled:opacity-50">
          {phase === 'starting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Start the camera
        </button>
      ) : phase === 'calibrate' ? (
        <div className="flex gap-2">
          {base.test === 'gate' && (
            <button type="button" onClick={() => { setTaps([]); setUseCentre(true); }} data-sprint-centre
              className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-white/20 px-3 text-sm font-bold text-white"><Crosshair className="h-4 w-4" /> Use the centre line</button>
          )}
          <button type="button" onClick={() => { setTaps([]); setUseCentre(false); }} data-sprint-retap
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-white/20 px-3 text-sm font-bold text-white"><RotateCcw className="h-4 w-4" /> Tap again</button>
        </div>
      ) : phase === 'ready' ? (
        <div className="flex gap-2">
          <button type="button" onClick={arm} data-sprint-arm className="flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-[#00FF9D] px-4 font-black text-black">
            <Play className="h-4 w-4" /> {startLabel(base)}
          </button>
          {prompts.length > 0 && (
            <button type="button" onClick={() => { setTaps([]); setUseCentre(false); setPhase('calibrate'); }} data-sprint-recal className="min-h-12 flex-1 rounded-xl border border-white/20 px-3 text-sm font-bold text-white">Re-tap</button>
          )}
        </div>
      ) : (
        <button type="button" onClick={finish} disabled={phase === 'reading'} data-sprint-stop className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 font-bold text-black disabled:opacity-60">
          {phase === 'reading' ? <><Loader2 className="h-4 w-4 animate-spin" /> Reading…</> : <><Square className="h-4 w-4" /> Stop and read the run</>}
        </button>
      )}
      <p className="text-[11px] text-white/45">{PRIVACY_LINE}</p>
    </div>
  );
}

function startLabel(b: RunBase): string {
  const mode = b.test === 'flying' ? null : b.test === 'trace' ? (b.start === 'none' ? null : b.start) : b.start;
  return mode === 'go' ? 'Start: On your marks…' : mode === 'movement' ? 'Ready: go when you like' : 'Ready: run through';
}
