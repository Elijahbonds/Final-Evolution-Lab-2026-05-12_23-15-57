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
import {
  NeuroMirror, ZONE_LABEL, ZONE_STATE_COLOR, ZONE_STATE_LABEL,
  PATTERN_ZONES, type MirrorRuntime, type SessionSummary, type ZoneId, type ZoneState,
} from '@/lib/babylon/nexus/neuro-mirror';
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
    if (rt) setSummary(NeuroMirror.sessionSummary(rt));
    stop();
    setStatus('idle');
  }, [stop]);

  const secs = (ms: number) => (ms / 1000).toFixed(1);

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-[#00E5FF]">Neuro-Mechanic Mirror</h1>
          <p className="text-sm text-white/70">
            On-device movement coaching — your skeleton, your reps, your jump.
          </p>
          {/* pattern picker — locked while a session runs */}
          <div className="mt-3 flex gap-2">
            {([
              ['pressRow', 'Split-Stance Press / Row'],
              ['squat', 'Corrective Squat — guided'],
              ['jump', 'Vertical Jump'],
            ] as [Pattern, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setPattern(key)}
                disabled={status === 'live'}
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                  pattern === key
                    ? 'border-[#FFD700] bg-[#FFD700]/10 text-[#FFD700]'
                    : 'border-white/10 text-white/50 hover:border-white/30'
                } ${status === 'live' ? 'cursor-not-allowed opacity-40' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        {/* Accuracy disclaimer — estimated language, no clinical claims (brief §2.4) */}
        <div className="mb-4 rounded-xl border border-[#00E5FF]/25 bg-[#00E5FF]/5 px-4 py-3 text-xs leading-relaxed text-white/70">
          This overlay shows <strong className="text-white">estimated / inferred engagement</strong> from your
          movement, derived from joint kinematics only. It does <strong className="text-white">not</strong> measure
          actual muscle activation (no EMG). Everything runs in your browser — your camera feed is never uploaded.
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_260px]">
          {/* Video + transparent overlay */}
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
            <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
            {/* the proof-of-tracking skeleton — drawn from the pose stream */}
            <canvas ref={skeletonRef} className="pointer-events-none absolute inset-0 h-full w-full" />
            {status !== 'live' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-center text-sm text-white/60">
                {status === 'requesting' ? 'Requesting camera…'
                  : status === 'loading-model' ? 'Loading pose model…'
                  : status === 'error' ? '—'
                  : 'Start a session to begin coaching.'}
              </div>
            )}
            {status === 'live' && (
              <div className="absolute left-2 top-2 rounded-lg bg-black/60 px-2 py-1 text-[11px] text-white/80">
                {pattern === 'pressRow' ? (
                  <>
                    Phase: <span className="text-[#00E5FF]">{phase}</span>
                    {' · '}REPS <span className="font-bold text-[#FFD700]">{reps?.reps ?? 0}</span>
                    {reps?.last && (
                      <span className="text-white/50"> · {reps.last.pullSec}s↓ {reps.last.pressSec}s↑</span>
                    )}
                  </>
                ) : (
                  <>
                    Jump: <span className="text-[#00E5FF]">{jumpState === 'ready' ? 'TRACKING — jump when ready' : jumpState === 'airborne' ? 'AIRBORNE' : jumpState === 'calibrating' ? 'stand still…' : jumpState}</span>
                    {jumps.length > 0 && (
                      <span> · BEST <span className="font-bold text-[#FFD700]">{Math.max(...jumps.map((j) => j.verticalCm))}cm</span></span>
                    )}
                  </>
                )}
                {' · '}{frameMs.toFixed(1)} ms/frame
                {frameMs > 50 && <span className="text-[#FFC24B]"> (over 50ms budget)</span>}
              </div>
            )}
          </div>

          {/* Zone legend + live states (press/row) OR the jump book OR the
              squat's four-check audit */}
          <aside className="space-y-3">
            {pattern === 'squat' ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <h2 className="mb-2 text-sm font-semibold text-white">The four checks (estimated)</h2>
                <ul className="space-y-2">
                  {([
                    ['kneeValgus', 'Knees track over toes'],
                    ['heelRise', 'Heels stay down'],
                    ['armFall', 'Chest stays tall'],
                    ['lateralShift', 'Weight stays centered'],
                  ] as [SquatFault, string][]).map(([id, label]) => {
                    const faulting = squatFaults.includes(id);
                    return (
                      <li key={id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded-full"
                            style={{ backgroundColor: faulting ? '#FF3366' : '#00FF9D' }}
                          />
                          <span className="text-white/80">{label}</span>
                        </span>
                        <span className="text-white/50">{faulting ? 'estimated fault' : 'estimated stable'}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : pattern === 'jump' ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <h2 className="mb-2 text-sm font-semibold text-white">Jumps (measured from flight time)</h2>
                {jumps.length === 0 ? (
                  <p className="text-xs text-white/50">Stand tall, let the floor calibrate, then jump. Landing settles the rep.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {jumps.map((j, i) => (
                      <li key={i} className="flex items-center justify-between text-xs text-white/80">
                        <span>Jump {i + 1}</span>
                        <span>
                          <b className="text-[#FFD700]">{j.verticalCm}cm</b>
                          <span className="text-white/40"> · {j.flightTimeMs}ms · {j.takeoff}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <h2 className="mb-2 text-sm font-semibold text-white">Estimated engagement zones</h2>
              <ul className="space-y-2">
                {PATTERN_ZONES.map((id) => {
                  const st = zoneStates[id];
                  return (
                    <li key={id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: ZONE_STATE_COLOR[st] }} />
                        <span className="text-white/80">{ZONE_LABEL[id]}</span>
                      </span>
                      <span className="text-white/50">{ZONE_STATE_LABEL[st]}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            )}

            {pattern === 'pressRow' && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] text-white/60">
              <div className="mb-1 font-semibold text-white/80">Legend</div>
              {(['stable', 'warning', 'fault', 'unavailable'] as ZoneState[]).map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ZONE_STATE_COLOR[s] }} />
                  <span>{ZONE_STATE_LABEL[s]}</span>
                </div>
              ))}
            </div>
            )}
          </aside>
        </div>

        {/* the corrective coach: stage card + the cue, while a squat session runs */}
        {pattern === 'squat' && status === 'live' && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-[#FFD700]/25 bg-[#FFD700]/5 px-4 py-3">
              <div className="text-xs text-white/70">
                {squatStage === 'breathe' && (
                  <span><b className="text-white">BREATHE FIRST.</b> In through the nose 4s · hold 2s · out slow 6s. {BREATH_CYCLES} cycles, then we move. The breath is the bedrock — everything else builds on it.</span>
                )}
                {squatStage === 'check' && (
                  <span><b className="text-white">THE MOVEMENT CHECK.</b> {SQUAT_CHECK_REPS} slow squats — I watch the knees, heels, chest and shift. Squat {Math.min(squatReps + 1, SQUAT_CHECK_REPS)}/{SQUAT_CHECK_REPS}.</span>
                )}
                {squatStage === 'work' && (
                  <span><b className="text-white">THE WORK SET.</b> {SQUAT_WORK_REPS} squats — I cue what the camera measures. Squat {Math.min(squatReps + 1, SQUAT_WORK_REPS)}/{SQUAT_WORK_REPS}.</span>
                )}
                {squatStage === 'review' && (
                  <span><b className="text-white">REVIEW.</b> What faulted, what I cued, and whether the correction held.</span>
                )}
              </div>
              <button
                onClick={() => setVoiceOn((v) => !v)}
                className={`ml-3 shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-bold ${voiceOn ? 'border-[#00E5FF]/40 text-[#00E5FF]' : 'border-white/15 text-white/40'}`}
              >
                VOICE {voiceOn ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* the breath pacer */}
            {squatStage === 'breathe' && (
              <div className="flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] py-6">
                <div className="breath-pacer" />
                <style>{`.breath-pacer{width:64px;height:64px;border-radius:50%;background:radial-gradient(circle,#00E5FF66,transparent 70%);border:2px solid #00E5FF;animation:felbreathe 12s ease-in-out infinite}@keyframes felbreathe{0%{transform:scale(.6);opacity:.5}33%{transform:scale(1);opacity:1}50%{transform:scale(1)}100%{transform:scale(.6);opacity:.5}}`}</style>
              </div>
            )}

            {/* the cue card — the coach's voice, one cue at a time */}
            {cue && squatStage === 'work' && (
              <div
                className="rounded-xl border px-4 py-3 text-sm font-bold"
                style={{
                  borderColor: cue.level === 'regress' ? '#FF336688' : cue.level === 'escalate' ? '#FFD70088' : cue.level === 'confirm' ? '#00FF9D88' : '#00E5FF55',
                  color: cue.level === 'regress' ? '#FF3366' : cue.level === 'escalate' ? '#FFD700' : cue.level === 'confirm' ? '#00FF9D' : '#00E5FF',
                }}
              >
                {cue.level === 'regress' ? 'REGRESS: ' : cue.level === 'escalate' ? 'STRONGER: ' : ''}{cue.text}
              </div>
            )}

            {/* the review */}
            {squatStage === 'review' && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs text-white/70">
                <div className="mb-2 font-semibold text-white">What the camera measured (estimated)</div>
                {squatFindings.length === 0 ? (
                  <p>No faults measured in the check. Clean structure — load it.</p>
                ) : (
                  <ul className="mb-2 list-inside list-disc">
                    {squatFindings.map((f) => (
                      <li key={f}>{({ kneeValgus: 'Knee valgus on the descent', heelRise: 'Heels lifting (dorsiflexion limit)', armFall: 'Arms falling forward (thoracic leak)', lateralShift: 'Lateral weight shift', shallow: 'Shallow depth' } as Record<string, string>)[f]}</li>
                    ))}
                  </ul>
                )}
                <div className="mb-1 font-semibold text-white/80">What I cued</div>
                {cueLog.length === 0 ? (
                  <p>No corrections needed during the work set — every rep clean.</p>
                ) : (
                  <ul className="list-inside list-disc">
                    {cueLog.map((c, i) => <li key={i}><span className="text-white/45">{c.level}:</span> {c.text}</li>)}
                  </ul>
                )}
                <p className="mt-2 border-t border-white/5 pt-2 text-white/50">
                  {cueLog.some((c) => c.level === 'regress')
                    ? 'A fault survived the cues — regress the drill (see above) and rebuild. That is the correction working, not failing.'
                    : cueLog.length
                      ? 'The correction held by the end of the set — that reflex is the goal. Next session it should need fewer cues.'
                      : 'Clean set. Add load or speed next time.'}
                </p>
              </div>
            )}
          </div>
        )}

        {error && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          {status === 'idle' || status === 'error' ? (
            <button onClick={start}
              className="rounded-xl bg-[#00E5FF] px-5 py-2.5 text-sm font-bold text-black transition hover:bg-[#33ecff]">
              Start session
            </button>
          ) : (
            <button onClick={endSession}
              className="rounded-xl bg-[#FF3366] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#ff4d7a]">
              End session
            </button>
          )}
        </div>

        {/* Session summary — real accumulated stats only (brief §4) */}
        {summary && (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="mb-2 text-sm font-semibold text-white">Session summary (estimated)</h2>
            <p className="mb-3 text-xs text-white/50">
              Duration {secs(summary.durationMs)}s · avg {summary.avgFrameMs.toFixed(1)} ms/frame
              {summary.reps > 0 && (
                <span> · <span className="text-white/80">{summary.reps} reps</span> (counted from movement)
                  {summary.avgTempo && (
                    <span> · avg tempo {summary.avgTempo.pullSec}s down / {summary.avgTempo.pressSec}s up</span>
                  )}
                </span>
              )}
            </p>
            {jumps.length > 0 && (
              <p className="mb-3 text-xs text-white/50">
                <span className="text-white/80">{jumps.length} jumps</span> measured from flight time · best{' '}
                <span className="text-[#FFD700]">{Math.max(...jumps.map((j) => j.verticalCm))}cm</span>
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-white/50">
                  <tr><th className="py-1 pr-4">Zone</th><th className="py-1 pr-4">Time estimated-stable</th><th className="py-1">Estimated faults</th></tr>
                </thead>
                <tbody className="text-white/80">
                  {PATTERN_ZONES.map((id) => (
                    <tr key={id} className="border-t border-white/5">
                      <td className="py-1 pr-4">{ZONE_LABEL[id]}</td>
                      <td className="py-1 pr-4">{secs(summary.timeInStableMs[id])}s</td>
                      <td className="py-1">{summary.faultCounts[id]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
