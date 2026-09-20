'use client';

// Neuro-Mechanic Mirror (v1) harness.
//
// Wires a live camera <video> to the transparent Babylon overlay and the
// client-side pose/rule pipeline (lib/babylon/nexus/neuro-mirror). Everything
// runs in the browser — the camera stream is never uploaded.
//
// COPY RULE (brief §2.4): all wording here describes ESTIMATED / INFERRED
// engagement from movement, never "measured muscle activation" or clinical
// claims. No biomechanical statistics are fabricated — the only numbers shown
// are the ones the engine actually computes for this session.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, ScanLine, Volume2, VolumeX } from 'lucide-react';
// CODE-SPLIT (2026-09-12). `NeuroMirror` reaches @babylonjs through render/overlay-compositor and
// rig/zone-binding, so importing it here as a VALUE pulled the whole engine into this route's
// first-load bundle: /play/mirror shipped 2.03 MB against ~160 kB for every other /play route,
// which lazy-load Babylon via dynamicImport (see app/play/onevone/_components/loader.tsx).
// The labels and zone tables below are plain data and stay static; the engine loads on demand.
// Pulled from the SOURCE modules, not the barrel. The barrel's own top-level import of
// render/overlay-compositor reaches @babylonjs, so importing even a label through index.ts loads
// the engine — which is why splitting only the NeuroMirror value changed nothing (measured:
// still 2.03 MB). These two modules are plain data and carry no engine.
import { PATTERN_ZONES, ZONE_LABEL } from '@/lib/babylon/nexus/neuro-mirror/patterns/split-stance-press-row';
import { ZONE_STATE_COLOR, ZONE_STATE_LABEL, type ZoneState } from '@/lib/babylon/nexus/neuro-mirror/rules/config';
import type { ZoneId } from '@/lib/babylon/nexus/neuro-mirror/patterns/split-stance-press-row';
import type { MirrorRuntime, SessionSummary } from '@/lib/babylon/nexus/neuro-mirror/render/overlay-compositor';

type MirrorModule = typeof import('@/lib/babylon/nexus/neuro-mirror');
/** Cached so a second session does not re-fetch the chunk. */
let mirrorModPromise: Promise<MirrorModule> | null = null;
const loadMirror = (): Promise<MirrorModule> =>
  (mirrorModPromise ??= import('@/lib/babylon/nexus/neuro-mirror'));
import { DunkTracker, type DunkMetrics } from '@/lib/irl/dunkTracker';
import type { PoseFrame } from '@/lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';
import type { RepState } from '@/lib/babylon/nexus/neuro-mirror/rules/rep-counter';
import type { SquatFrameResult, SquatFault } from '@/lib/babylon/nexus/neuro-mirror/rules/squat-audit';
import { CueEngine, type CueEvent } from '@/lib/babylon/nexus/neuro-mirror/rules/cue-engine';

type Status = 'idle' | 'requesting' | 'loading-model' | 'live' | 'error';
type Pattern = 'pressRow' | 'jump' | 'squat';
/** The guided corrective session: breathe → check → work → review. The
 *  Blueprint is emphatic that the breath comes FIRST — the pacer is not a
 *  warm-up nicety, it is the foundation the book insists on. */
type SquatStage = 'breathe' | 'check' | 'work' | 'review';
const SQUAT_CHECK_REPS = 3;
const SQUAT_WORK_REPS = 8;
const BREATH_CYCLES = 3; // inhale 4s · hold 2s · exhale 6s, per the book's cadence

/** Pose skeleton bone pairs (MediaPipe indices) — the visible proof the
 *  tracker is locked on you. */
const BONES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],   // shoulders + arms
  [11, 23], [12, 24], [23, 24],                        // torso
  [23, 25], [25, 27], [24, 26], [26, 28],              // legs
];

export function MirrorHarness() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runtimeRef = useRef<MirrorRuntime | null>(null);

  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<string>('hold');
  const [frameMs, setFrameMs] = useState<number>(0);
  const [zoneStates, setZoneStates] = useState<Record<ZoneId, ZoneState>>({
    posterior_chain: 'unavailable', lat_rhomboid: 'unavailable', upper_traps: 'unavailable',
    rib_thoracic: 'unavailable', lumbo_pelvic: 'unavailable',
  });
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [pattern, setPattern] = useState<Pattern>('pressRow');
  // the onFrame closure is created once per session — it reads the pattern
  // through a ref so switching patterns never needs a session restart
  const patternRef = useRef<Pattern>('pressRow');
  patternRef.current = pattern;
  const [reps, setReps] = useState<RepState | null>(null);
  const [jumps, setJumps] = useState<DunkMetrics[]>([]);
  const [jumpState, setJumpState] = useState('idle');
  const skeletonRef = useRef<HTMLCanvasElement | null>(null);
  const jumpTrackerRef = useRef(new DunkTracker());
  const cueEngineRef = useRef(new CueEngine());
  const [squatStage, setSquatStage] = useState<SquatStage>('breathe');
  const [squatReps, setSquatReps] = useState(0);
  const [squatFaults, setSquatFaults] = useState<SquatFault[]>([]);
  const [squatFindings, setSquatFindings] = useState<SquatFault[]>([]);
  const [cue, setCue] = useState<CueEvent | null>(null);
  const [cueLog, setCueLog] = useState<CueEvent[]>([]);
  const [voiceOn, setVoiceOn] = useState(true);
  const squatPrevPhase = useRef<string>('standing');
  const breatheStart = useRef(0);
  const voiceRef = useRef(true);
  voiceRef.current = voiceOn;

  const speak = useCallback((text: string) => {
    if (!voiceRef.current || typeof speechSynthesis === 'undefined') return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.96; u.pitch = 0.9;
    speechSynthesis.speak(u);
  }, []);

  /** Paint the user's skeleton on the 2D canvas — every frame, outside
   *  React state (a setState per pose frame would thrash). When a valgus
   *  fault is active, paint the RNT band: arrows pulling the knees IN, the
   *  instruction to resist OUT — the perturbation made visible. */
  const paintSkeleton = useCallback((pose: PoseFrame, ph: string, faults: readonly SquatFault[] = []) => {
    const c = skeletonRef.current;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;
    if (c.width !== c.clientWidth || c.height !== c.clientHeight) {
      c.width = c.clientWidth; c.height = c.clientHeight;
    }
    g.clearRect(0, 0, c.width, c.height);
    if (!pose.present || !pose.landmarks.length) return;
    const W = c.width, H = c.height;
    const color = ph === 'pull' ? '#00E5FF' : ph === 'press' ? '#FFD700' : 'rgba(255,255,255,0.75)';
    g.strokeStyle = color;
    g.lineWidth = 2.5;
    g.lineCap = 'round';
    for (const [a, b] of BONES) {
      const pa = pose.landmarks[a], pb = pose.landmarks[b];
      if (!pa || !pb || pa.visibility < 0.5 || pb.visibility < 0.5) continue;
      g.beginPath();
      g.moveTo(pa.x * W, pa.y * H);
      g.lineTo(pb.x * W, pb.y * H);
      g.stroke();
    }
    // joints pop on top
    g.fillStyle = color;
    for (const idx of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
      const p = pose.landmarks[idx];
      if (!p || p.visibility < 0.5) continue;
      g.beginPath();
      g.arc(p.x * W, p.y * H, 3.5, 0, Math.PI * 2);
      g.fill();
    }
    // RNT band: knees caving → the visible perturbation to resist
    if (faults.includes('kneeValgus')) {
      for (const kneeIdx of [25, 26]) {
        const k = pose.landmarks[kneeIdx];
        if (!k || k.visibility < 0.5) continue;
        const kx = k.x * W, ky = k.y * H;
        const dir = kneeIdx === 25 ? 1 : -1;  // arrows point INWARD (the band)
        g.strokeStyle = '#FF3366';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(kx + dir * 34, ky);
        g.lineTo(kx + dir * 10, ky);
        g.lineTo(kx + dir * 16, ky - 6);
        g.moveTo(kx + dir * 10, ky);
        g.lineTo(kx + dir * 16, ky + 6);
        g.stroke();
      }
      g.fillStyle = '#FF3366';
      g.font = 'bold 11px monospace';
      g.textAlign = 'center';
      g.fillText('MY BAND PULLS IN — YOU PUSH OUT', W / 2, H - 18);
    }
  }, []);

  const stop = useCallback(() => {
    runtimeRef.current?.dispose();
    runtimeRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => { stop(); }, [stop]);

  // guided-squat stage advancement: the movement check runs 3 reps, then the
  // coached work set runs 8 — then the review. (Breathing advances on the
  // frame clock inside onFrame.)
  useEffect(() => {
    if (squatStage === 'check' && squatReps >= SQUAT_CHECK_REPS) {
      setSquatStage('work');
      setSquatReps(0);
    } else if (squatStage === 'work' && squatReps >= SQUAT_WORK_REPS) {
      setSquatStage('review');
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    }
  }, [squatReps, squatStage]);

  const start = useCallback(async () => {
    setError('');
    setJumps([]);
    setReps(null);
    jumpTrackerRef.current.reset();
    cueEngineRef.current.reset();
    setSquatStage('breathe');
    setSquatReps(0);
    setSquatFaults([]);
    setSquatFindings([]);
    setCue(null);
    setCueLog([]);
    breatheStart.current = 0;
    squatPrevPhase.current = 'standing';
    setSummary(null);
    setStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // front camera preferred for form work, but as an IDEAL: a hard
        // 'user' constraint rejects devices that don't declare facing modes
        // at all (measured: some webcams/fake devices refuse and the session
        // never starts)
        video: { facingMode: { ideal: 'user' }, width: { ideal: 960 }, height: { ideal: 720 } }, audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();

      setStatus('loading-model');
      const { NeuroMirror } = await loadMirror();
      const runtime = await NeuroMirror.session({
        video: v,
        overlayCanvas: canvasRef.current!,
        analysis: patternRef.current === 'squat' ? 'squat' : 'zones',
        onReady: () => setStatus('live'),
        onFrame: ({ phase: p, frameMs: fm, zones, reps: r, pose, squat }) => {
          setPhase(p);
          setFrameMs(fm);
          setZoneStates(zones);
          setReps(r);
          // the vertical-jump pattern runs the Prove It tracker on the same
          // stream — floor calibration, flight time, landing
          if (patternRef.current === 'jump') {
            const got = jumpTrackerRef.current.feed(pose);
            setJumpState(jumpTrackerRef.current.state);
            if (got) {
              setJumps((prev) => [...prev, got]);
              jumpTrackerRef.current.reset();
            }
          }
          // the corrective squat: the guided session breathes, checks, works
          if (patternRef.current === 'squat' && squat) {
            const now = pose.timestampMs;
            setSquatFaults(squat.faults);
            paintSkeleton(pose, p, squat.faults);
            // rep boundaries: leaving standing starts a rep, regaining it ends one
            const prev = squatPrevPhase.current;
            squatPrevPhase.current = squat.phase;
            const repDone = prev !== 'standing' && squat.phase === 'standing' && squat.present;
            const leftFloor = prev === 'standing' && (squat.phase === 'descending');
            setSquatStage((stage) => {
              if (stage === 'breathe') {
                if (breatheStart.current === 0) breatheStart.current = now;
                if (now - breatheStart.current >= BREATH_CYCLES * 12000) return 'check';
                return stage;
              }
              if (stage === 'check' || stage === 'work') {
                if (leftFloor) setSquatReps((n) => n);        // no-op, keeps reactivity honest
                if (repDone) setSquatReps((n) => n + 1);
                if (stage === 'check' && squat.faults.length) {
                  setSquatFindings((f) => Array.from(new Set([...f, ...squat.faults])));
                }
                if (stage === 'work' && squat.faults.length) {
                  const evt = cueEngineRef.current.decide(now, squat.faults);
                  if (evt) {
                    setCue(evt);
                    setCueLog((l) => [...l, evt]);
                    speak(evt.text);
                  }
                }
                return stage;
              }
              return stage;
            });
          } else {
            paintSkeleton(pose, p);
          }
        },
      });
      runtimeRef.current = runtime;
    } catch (e: any) {
      console.error('[FEL-MIRROR] start failed', e);
      // Honest errors: a denied camera, a missing camera, and a dead 3D
      // overlay are three different problems (measured: a WebGL-less
      // environment hit the overlay path and the page blamed the camera).
      setError(
        e?.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera access and try again.'
          : e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError' || e?.name === 'NotReadableError'
            ? 'Camera unavailable in this browser/environment.'
            : 'The coaching overlay failed to start (3D renderer). Try a WebGL-capable browser.');
      setStatus('error');
    }
  }, []);

  const endSession = useCallback(() => {
    const rt = runtimeRef.current;
    // the module is necessarily loaded by now (a runtime only exists after session() resolved),
    // but this stays async-safe rather than assuming it
    if (rt) void loadMirror().then((m) => {
      const s = m.NeuroMirror.sessionSummary(rt);
      setSummary(s);
      // PERSIST IT (2026-09-12). This summary — reps, tempo, per-zone time-in-stable and fault
      // counts — was computed on every session and then discarded when the tab closed, so the
      // Mirror could never show whether anyone was improving. Saving is best-effort and silent:
      // a failed write must never interrupt the end of a workout.
      void fetch('/api/mirror/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          patternId: s.patternId,
          startedAtMs: s.startedAtMs,
          durationMs: s.durationMs,
          reps: s.reps,
          avgTempoMs: s.avgTempo ?? null,
          avgFrameMs: s.avgFrameMs,
          timeInStableMs: s.timeInStableMs,
          faultCounts: s.faultCounts,
        }),
      }).catch(() => { /* offline or signed out: the session still showed on screen */ });
    });
    stop();
    setStatus('idle');
  }, [stop]);

  const secs = (ms: number) => (ms / 1000).toFixed(1);

  const PATTERN_TITLE: Record<Pattern, string> = {
    pressRow: 'Split-Stance Press / Row',
    squat: 'Corrective Squat',
    jump: 'Vertical Jump',
  };
  const live = status === 'live';
  // ms/frame is an engineering number. It belongs to whoever is tuning the pipeline, not to an athlete standing
  // in their front room trying to squat, so it shows in development and stays out of the way in a shipped build.
  const showFrameBudget = process.env.NODE_ENV !== 'production';

  return (
    <div className="relative min-h-screen bg-[#050505] text-white">
      {/* One wash of colour behind the stage, so the page has a light source instead of being a flat black sheet. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{ background: 'radial-gradient(120% 90% at 50% 0%, rgba(0,229,255,0.10) 0%, transparent 70%)' }}
      />

      <div className="relative mx-auto max-w-[1180px] px-4 pb-16 pt-4">
        {/* THE WAY OUT. This route sits under /play/, where the app shell hides itself so a running mode owns the
            screen — correct for a game, wrong for a tool, and it left the Mirror with no way back at all. A camera
            surface should not carry a navigation bar anyway; it should carry one explicit exit. */}
        <header className="mb-5 flex items-center gap-3">
          <Link
            href="/train"
            aria-label="Back to Train"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.03]
                       text-white/55 transition-colors hover:border-white/25 hover:text-white"
          >
            <ArrowLeft className="h-[18px] w-[18px]" />
          </Link>
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#00E5FF]">The Mirror</p>
            <h1 className="fel-heading truncate text-[22px] font-black leading-none tracking-tight text-white md:text-[26px]">
              {PATTERN_TITLE[pattern]}
            </h1>
          </div>
          <span
            className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 font-mono
                       text-[10px] font-bold uppercase tracking-[0.14em]"
            style={{
              borderColor: live ? 'rgba(0,255,157,0.35)' : 'rgba(255,255,255,0.12)',
              color: live ? '#00FF9D' : 'rgba(255,255,255,0.4)',
              background: live ? 'rgba(0,255,157,0.07)' : 'transparent',
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: live ? '#00FF9D' : 'rgba(255,255,255,0.3)' }}
            />
            {live ? 'Live' : status === 'requesting' ? 'Camera' : status === 'loading-model' ? 'Loading' : 'Ready'}
          </span>
        </header>

        {/* One segmented control instead of three loose pills, so the three patterns read as one choice. */}
        <div
          role="tablist"
          aria-label="Movement pattern"
          className="mb-4 inline-flex rounded-2xl border border-white/10 bg-white/[0.03] p-1"
        >
          {(Object.keys(PATTERN_TITLE) as Pattern[]).map((key) => {
            const on = pattern === key;
            return (
              <button
                key={key}
                role="tab"
                aria-selected={on}
                // The visible label is short because a segmented control should be; the accessible name is the
                // full one, so what a screen reader announces is the pattern's actual name.
                aria-label={PATTERN_TITLE[key]}
                onClick={() => setPattern(key)}
                disabled={live}
                className={`rounded-xl px-3.5 py-2 text-[12.5px] font-bold transition-all duration-200
                            disabled:cursor-not-allowed disabled:opacity-40
                            ${on ? 'bg-white/[0.07] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)]'
                                 : 'text-white/45 hover:text-white/75'}`}
              >
                {key === 'pressRow' ? 'Press / Row' : key === 'squat' ? 'Squat' : 'Jump'}
              </button>
            );
          })}
        </div>

        {/* THE STAGE. The camera is the product here, so it gets the whole width and everything else floats over
            it. Before, it was a 4:3 box in a two-column grid beside a 260px column of bullet lists — the shape of
            a settings page, not of a thing you stand in front of. */}
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl border border-white/10 bg-black
                        shadow-[0_40px_120px_-60px_rgba(0,229,255,0.5)] sm:aspect-[16/10]">
          <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          {/* the proof-of-tracking skeleton — drawn from the pose stream */}
          <canvas ref={skeletonRef} className="pointer-events-none absolute inset-0 h-full w-full" />

          {/* IDLE: the invitation, and the disclaimer where it is actually read — before you start, not shouting
              above the fold forever. The wording is unchanged (brief §2.4): estimated / inferred engagement, no
              clinical claim, nothing uploaded. */}
          {!live && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/70 px-6 text-center backdrop-blur-[2px]">
              {status === 'requesting' || status === 'loading-model' ? (
                <>
                  <Loader2 className="h-7 w-7 animate-spin text-[#00E5FF]" />
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/55">
                    {status === 'requesting' ? 'Asking for the camera' : 'Loading the pose model'}
                  </p>
                </>
              ) : (
                <>
                  <ScanLine className="h-8 w-8 text-[#00E5FF]" strokeWidth={1.6} />
                  <div>
                    <p className="fel-heading text-[20px] font-black leading-tight text-white">Stand where it can see you</p>
                    <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-white/50">
                      Prop the phone up, step back until your whole body is in frame, and start when you are ready.
                    </p>
                  </div>
                  <p className="mx-auto max-w-md text-[11.5px] leading-relaxed text-white/35">
                    This shows <span className="text-white/60">estimated engagement</span> inferred from joint
                    movement. It does not measure muscle activation, and it is not a medical assessment. Everything
                    runs in your browser — the camera feed is never uploaded.
                  </p>
                </>
              )}
            </div>
          )}

          {/* LIVE HUD. The readout used to be one comma-separated line in a black box: "Phase: hold · REPS 0 ·
              12.4 ms/frame". That is a debug print. What somebody mid-rep can actually use is the count, big, and
              the phase word — so those are the two things, and they are legible from across a room. */}
          {live && (
            <>
              <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2">
                <span className="rounded-lg bg-black/55 px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase
                                 tracking-[0.16em] text-white/75 backdrop-blur-sm">
                  {pattern === 'pressRow' ? phase
                    : pattern === 'jump' ? (jumpState === 'ready' ? 'Jump when ready' : jumpState === 'airborne' ? 'Airborne' : jumpState === 'calibrating' ? 'Stand still' : jumpState)
                    : squatStage}
                </span>
                {showFrameBudget && (
                  <span
                    className="rounded-lg bg-black/55 px-2 py-1.5 font-mono text-[10px] backdrop-blur-sm"
                    style={{ color: frameMs > 50 ? '#FFC24B' : 'rgba(255,255,255,0.4)' }}
                  >
                    {frameMs.toFixed(1)}ms
                  </span>
                )}
              </div>

              <div className="pointer-events-none absolute right-4 top-4 text-right">
                {pattern === 'jump' ? (
                  jumps.length > 0 && (
                    <>
                      <p className="fel-heading text-[40px] font-black leading-none text-[#FFD700]">
                        {Math.max(...jumps.map((j) => j.verticalCm))}
                        <span className="ml-1 text-[16px]">cm</span>
                      </p>
                      <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.18em] text-white/45">Best jump</p>
                    </>
                  )
                ) : (
                  <>
                    <p className="fel-heading text-[40px] font-black leading-none text-white">
                      {pattern === 'squat' ? squatReps : reps?.reps ?? 0}
                    </p>
                    <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.18em] text-white/45">Reps</p>
                  </>
                )}
              </div>

              {/* the breath pacer, centred on the stage where the eye already is */}
              {pattern === 'squat' && squatStage === 'breathe' && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div className="fel-breath" />
                </div>
              )}

              {/* THE COACH'S VOICE, one cue at a time, over the picture rather than in a panel below it — you are
                  looking at yourself when the correction lands, not at a sidebar. */}
              {cue && pattern === 'squat' && squatStage === 'work' && (
                <div className="pointer-events-none absolute inset-x-4 bottom-24 flex justify-center">
                  <p
                    className="max-w-lg rounded-2xl border px-5 py-3 text-center text-[15px] font-bold backdrop-blur-md"
                    style={{
                      borderColor: cue.level === 'regress' ? '#FF336688' : cue.level === 'escalate' ? '#FFD70088' : cue.level === 'confirm' ? '#00FF9D88' : '#00E5FF55',
                      color: cue.level === 'regress' ? '#FF3366' : cue.level === 'escalate' ? '#FFD700' : cue.level === 'confirm' ? '#00FF9D' : '#00E5FF',
                      background: 'rgba(0,0,0,0.55)',
                    }}
                  >
                    {cue.level === 'regress' ? 'Regress: ' : cue.level === 'escalate' ? 'Stronger: ' : ''}{cue.text}
                  </p>
                </div>
              )}
            </>
          )}

          {/* The action is docked to the stage, the way a camera's shutter is part of the camera. */}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t
                          from-black/80 to-transparent px-4 pb-5 pt-12">
            {!live ? (
              <button
                onClick={start}
                disabled={status === 'requesting' || status === 'loading-model'}
                className="rounded-2xl bg-[#00E5FF] px-7 py-3 text-[14px] font-black text-black shadow-[0_10px_40px_-12px_#00E5FF]
                           transition-transform hover:scale-[1.02] active:scale-[0.99] disabled:opacity-50"
              >
                Start session
              </button>
            ) : (
              <>
                <button
                  onClick={endSession}
                  className="rounded-2xl border border-white/20 bg-black/50 px-6 py-3 text-[14px] font-bold text-white
                             backdrop-blur-md transition-colors hover:border-[#FF3366]/60 hover:text-[#FF3366]"
                >
                  End session
                </button>
                {pattern === 'squat' && (
                  <button
                    onClick={() => setVoiceOn((v) => !v)}
                    aria-pressed={voiceOn}
                    aria-label={voiceOn ? 'Turn coaching voice off' : 'Turn coaching voice on'}
                    className="grid h-12 w-12 place-items-center rounded-2xl border border-white/20 bg-black/50 backdrop-blur-md transition-colors"
                    style={{ color: voiceOn ? '#00E5FF' : 'rgba(255,255,255,0.35)' }}
                  >
                    {voiceOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* The stage direction for the guided squat, under the picture where a caption belongs. */}
        {pattern === 'squat' && live && (
          <p className="mt-4 text-[13px] leading-relaxed text-white/55">
            {squatStage === 'breathe' && (
              <><span className="font-bold text-white">Breathe first.</span> In through the nose 4s · hold 2s · out slow 6s, {BREATH_CYCLES} cycles. The breath is the bedrock — everything else builds on it.</>
            )}
            {squatStage === 'check' && (
              <><span className="font-bold text-white">The movement check.</span> {SQUAT_CHECK_REPS} slow squats — knees, heels, chest and shift. Squat {Math.min(squatReps + 1, SQUAT_CHECK_REPS)} of {SQUAT_CHECK_REPS}.</>
            )}
            {squatStage === 'work' && (
              <><span className="font-bold text-white">The work set.</span> {SQUAT_WORK_REPS} squats — cued from what the camera measures. Squat {Math.min(squatReps + 1, SQUAT_WORK_REPS)} of {SQUAT_WORK_REPS}.</>
            )}
            {squatStage === 'review' && (
              <><span className="font-bold text-white">Review.</span> What faulted, what was cued, and whether the correction held.</>
            )}
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-xl border border-[#FF3366]/30 bg-[#FF3366]/10 px-4 py-3 text-[13px] text-[#ff8da8]">
            {error}
          </p>
        )}

        {/* THE READOUT, under the stage and across the full width. It was a 260px column of 11px bullet lists
            squeezed beside the camera; there is no reason for the picture to be narrow so a legend can sit next
            to it. */}
        <section className="mt-6">
          {pattern === 'squat' ? (
            <>
              <h2 className="fel-heading mb-3 text-[15px] font-bold text-white/80">The four checks</h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {([
                  ['kneeValgus', 'Knees track over toes'],
                  ['heelRise', 'Heels stay down'],
                  ['armFall', 'Chest stays tall'],
                  ['lateralShift', 'Weight stays centered'],
                ] as [SquatFault, string][]).map(([id, label]) => {
                  const faulting = squatFaults.includes(id);
                  return (
                    <li
                      key={id}
                      className="flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors duration-300"
                      style={{
                        borderColor: faulting ? 'rgba(255,51,102,0.35)' : 'rgba(255,255,255,0.08)',
                        background: faulting ? 'rgba(255,51,102,0.06)' : 'rgba(255,255,255,0.02)',
                      }}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: faulting ? '#FF3366' : '#00FF9D' }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-white/85">{label}</span>
                        <span className="mt-0.5 block font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/35">
                          {faulting ? 'Estimated fault' : 'Estimated stable'}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : pattern === 'jump' ? (
            <>
              <h2 className="fel-heading mb-3 text-[15px] font-bold text-white/80">Jumps · measured from flight time</h2>
              {jumps.length === 0 ? (
                <p className="text-[13px] text-white/45">
                  Stand tall, let the floor calibrate, then jump. The landing settles the rep.
                </p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {jumps.map((j, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Jump {i + 1}</span>
                      <span className="text-right">
                        <span className="fel-heading text-[20px] font-black text-[#FFD700]">{j.verticalCm}<span className="text-[12px]">cm</span></span>
                        <span className="mt-0.5 block font-mono text-[9.5px] text-white/30">{j.flightTimeMs}ms · {j.takeoff}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <h2 className="fel-heading mb-3 text-[15px] font-bold text-white/80">Estimated engagement</h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {PATTERN_ZONES.map((id) => {
                  const st = zoneStates[id];
                  return (
                    <li
                      key={id}
                      className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3"
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: ZONE_STATE_COLOR[st] }} />
                      {/* Stacked, not side by side: these zone names are long ("Lumbo-pelvic control") and the
                          state is longer still ("not computable from view"), so on one line every label truncated
                          to "Lumbo-pelvi…" and the row said nothing. The name is the thing being read. */}
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold leading-tight text-white/85">{ZONE_LABEL[id]}</span>
                        <span className="mt-0.5 block font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/35">
                          {ZONE_STATE_LABEL[st]}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        {/* The review of a guided squat — what faulted, what was said, and whether it held. */}
        {pattern === 'squat' && squatStage === 'review' && (
          <section className="mt-6 rounded-2xl border border-white/8 bg-white/[0.02] p-5">
            <h2 className="fel-heading text-[15px] font-bold text-white/80">What the camera measured</h2>
            <div className="mt-3 grid gap-5 sm:grid-cols-2">
              <div>
                <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/35">Findings</p>
                {squatFindings.length === 0 ? (
                  <p className="mt-2 text-[13px] text-white/60">No faults measured in the check. Clean structure — load it.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {squatFindings.map((f) => (
                      <li key={f} className="flex gap-2 text-[13px] text-white/70">
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#FF3366]" />
                        {({ kneeValgus: 'Knee valgus on the descent', heelRise: 'Heels lifting (dorsiflexion limit)', armFall: 'Arms falling forward (thoracic leak)', lateralShift: 'Lateral weight shift', shallow: 'Shallow depth' } as Record<string, string>)[f]}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/35">What was cued</p>
                {cueLog.length === 0 ? (
                  <p className="mt-2 text-[13px] text-white/60">No corrections needed during the work set — every rep clean.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {cueLog.map((c, i) => (
                      <li key={i} className="text-[13px] text-white/70">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-white/30">{c.level}</span>{' '}{c.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <p className="mt-4 border-t border-white/[0.06] pt-4 text-[13px] leading-relaxed text-white/50">
              {cueLog.some((c) => c.level === 'regress')
                ? 'A fault survived the cues — regress the drill and rebuild. That is the correction working, not failing.'
                : cueLog.length
                  ? 'The correction held by the end of the set — that reflex is the goal. Next session it should need fewer cues.'
                  : 'Clean set. Add load or speed next time.'}
            </p>
          </section>
        )}

        {/* SESSION SUMMARY. Real accumulated stats only (brief §4) — but read as figures, not as a bare <table>. */}
        {summary && (
          <section className="mt-6 rounded-2xl border border-white/8 bg-white/[0.02] p-5">
            <h2 className="fel-heading text-[15px] font-bold text-white/80">Session summary · estimated</h2>

            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Figure label="Duration" value={`${secs(summary.durationMs)}s`} />
              {summary.reps > 0 && <Figure label="Reps" value={String(summary.reps)} />}
              {summary.avgTempo && (
                <Figure label="Avg tempo" value={`${summary.avgTempo.pullSec}s / ${summary.avgTempo.pressSec}s`} />
              )}
              {jumps.length > 0 && (
                <Figure label="Best jump" value={`${Math.max(...jumps.map((j) => j.verticalCm))}cm`} accent="#FFD700" />
              )}
            </div>

            <ul className="mt-5 space-y-1.5 border-t border-white/[0.06] pt-4">
              {PATTERN_ZONES.map((id) => (
                <li key={id} className="flex items-baseline gap-3 text-[13px]">
                  <span className="min-w-0 flex-1 truncate text-white/70">{ZONE_LABEL[id]}</span>
                  <span className="shrink-0 font-mono text-[12px] text-white/45">
                    {secs(summary.timeInStableMs[id])}s stable
                  </span>
                  <span
                    className="w-16 shrink-0 text-right font-mono text-[12px]"
                    style={{ color: summary.faultCounts[id] > 0 ? '#FF3366' : 'rgba(255,255,255,0.25)' }}
                  >
                    {summary.faultCounts[id]} {summary.faultCounts[id] === 1 ? 'fault' : 'faults'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

/** A number worth reading from a distance, with the quiet label under it. */
function Figure({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <p className="fel-heading text-[24px] font-black leading-none" style={{ color: accent ?? '#FFFFFF' }}>{value}</p>
      <p className="mt-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/35">{label}</p>
    </div>
  );
}
