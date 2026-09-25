'use client';

// /dev/pose-record: the owner's local pose recorder (movement play, 2026-09-24).
//
// The owner records their own moves so the body detectors are tuned on a real athlete, not only on synthetic streams.
// What it keeps is LANDMARK NUMBERS ONLY. The camera picture is drawn in this page and nowhere else: never saved,
// never sent. Takes live in this tab's memory until the owner downloads them as one .json file, which the browser
// saves on the Mac. There is no fetch and no POST here. The only network use is the pose model's one-time download
// (from our own /pose copy, like every camera feature in the app; the MediaPipe CDN only if ours is missing).
//
// The owner stands about 3 m from the screen, so everything they need mid-take (the prompt, the 3-2-1, GO) is drawn
// big on the video, with a beep on each count, and "Record all remaining" runs the takes back to back.

import { useEffect, useRef, useState } from 'react';
import {
  MediaPipePoseAdapter, onVideoFrames, POSE_MODEL_NAME,
  type PoseFrame as AdapterPoseFrame, type VideoFrameTick,
} from '@/lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';
import { checkFraming } from '@/lib/mirror/framing';
import {
  NOSE, LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_ELBOW, RIGHT_ELBOW, LEFT_WRIST, RIGHT_WRIST, LEFT_HIP, RIGHT_HIP,
  LEFT_KNEE, RIGHT_KNEE, LEFT_ANKLE, RIGHT_ANKLE, LEFT_HEEL, RIGHT_HEEL, LEFT_FOOT_INDEX, RIGHT_FOOT_INDEX,
  type PoseFrame,
} from '@/lib/pose/landmarks';
import {
  BYTES_PER_FRAME, COUNTDOWN_MS, TAKES, buildTakesFile, measureFps, shortUserAgent, takesFileName, toRecordedFrame,
  type FrameClock, type RecordedTake, type TakeSpec,
} from './recording';

const CYAN = '#00E5FF';
const GOLD = '#FFD700';
/** How long past a take's end its last frames can still be arriving (camera + model latency, est. ~100 ms). */
const ARRIVE_GRACE_MS = 250;

type CamState = 'off' | 'camera' | 'model' | 'live' | 'error';

/** The take being recorded. Times are performance.now() ms: the 3-2-1 starts at t0, GO at goAt, the end at endAt. */
interface Run {
  spec: TakeSpec;
  t0: number;
  goAt: number;
  endAt: number;
  recordedAt: string;
  frames: PoseFrame[];
  inferSum: number;
  inferN: number;
  clock: FrameClock | null;
}

/** What the overlay shows: getting in place, the 3-2-1, or GO with the seconds left. */
interface RunView { spec: TakeSpec; stage: 'lead' | 'count' | 'go'; n: number; progress: number; next: boolean }

const BONES: [number, number][] = [
  [LEFT_SHOULDER, RIGHT_SHOULDER], [LEFT_SHOULDER, LEFT_ELBOW], [LEFT_ELBOW, LEFT_WRIST],
  [RIGHT_SHOULDER, RIGHT_ELBOW], [RIGHT_ELBOW, RIGHT_WRIST], [LEFT_SHOULDER, LEFT_HIP], [RIGHT_SHOULDER, RIGHT_HIP],
  [LEFT_HIP, RIGHT_HIP], [LEFT_HIP, LEFT_KNEE], [LEFT_KNEE, LEFT_ANKLE], [RIGHT_HIP, RIGHT_KNEE],
  [RIGHT_KNEE, RIGHT_ANKLE], [LEFT_ANKLE, LEFT_HEEL], [LEFT_HEEL, LEFT_FOOT_INDEX], [LEFT_ANKLE, LEFT_FOOT_INDEX],
  [RIGHT_ANKLE, RIGHT_HEEL], [RIGHT_HEEL, RIGHT_FOOT_INDEX], [RIGHT_ANKLE, RIGHT_FOOT_INDEX],
];

/** The tracked skeleton over the self-view, so the owner can see the model has them before recording. */
function drawPose(canvas: HTMLCanvasElement | null, video: HTMLVideoElement, frame: AdapterPoseFrame): void {
  const w = video.videoWidth, h = video.videoHeight;
  if (!canvas || !w || !h) return;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  if (!frame.present) return;
  const p = frame.landmarks;
  ctx.lineWidth = Math.max(2, w / 320);
  for (const [a, b] of BONES) {
    const A = p[a], B = p[b];
    if (!A || !B) continue;
    ctx.strokeStyle = Math.min(A.visibility, B.visibility) >= 0.5 ? CYAN : 'rgba(0,229,255,0.25)';
    ctx.beginPath(); ctx.moveTo(A.x * w, A.y * h); ctx.lineTo(B.x * w, B.y * h); ctx.stroke();
  }
  const r = Math.max(2, w / 250);
  for (const q of p) {
    ctx.fillStyle = q.visibility >= 0.5 ? GOLD : 'rgba(255,215,0,0.25)';
    ctx.fillRect(q.x * w - r, q.y * h - r, r * 2, r * 2);
  }
}

export default function PoseRecorder() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const adapterRef = useRef<MediaPipePoseAdapter | null>(null);
  const stopFramesRef = useRef<(() => void) | null>(null);
  const aliveRef = useRef(true);
  const lastFrameRef = useRef<AdapterPoseFrame | null>(null);
  const lastClockRef = useRef<FrameClock | null>(null);
  const detectStampsRef = useRef<number[]>([]);   // the last second of detections, for the live fps
  const runRef = useRef<Run | null>(null);
  const queueRef = useRef<string[]>([]);
  const stageKeyRef = useRef('');
  const audioRef = useRef<AudioContext | null>(null);
  const leadInRef = useRef(5);

  const [cam, setCam] = useState<CamState>('off');
  const [err, setErr] = useState<string | null>(null);
  const [takes, setTakes] = useState<Record<string, RecordedTake>>({});
  const [runView, setRunView] = useState<RunView | null>(null);
  const [live, setLive] = useState({ fps: 0, present: false, ok: false, hint: '' });
  const [leadIn, setLeadIn] = useState(5);
  const [notes, setNotes] = useState('');
  const [unsaved, setUnsaved] = useState(false);
  const [device] = useState(() => shortUserAgent(navigator.userAgent));
  leadInRef.current = leadIn;

  // ── sound: a beep per count, so the owner does not have to read the screen mid-move ──
  const ensureAudio = () => {
    try {
      if (!audioRef.current) audioRef.current = new AudioContext();
      void audioRef.current.resume();
    } catch { /* no sound is fine; the screen still counts */ }
  };
  const beep = (hz: number, ms: number) => {
    const ctx = audioRef.current;
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    const t = ctx.currentTime;
    o.frequency.value = hz;
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + ms / 1000);
  };

  // ── the camera and the model ──
  /** Camera off, model freed, loop stopped. Takes already recorded are kept. */
  const stopCamera = () => {
    stopFramesRef.current?.(); stopFramesRef.current = null;
    runRef.current = null; queueRef.current = [];
    adapterRef.current?.dispose(); adapterRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    lastFrameRef.current = null; detectStampsRef.current = [];
  };

  /** One camera frame: detect, draw, and keep it if a take is recording. Reads refs only (it outlives renders). */
  const onTick = (tick: VideoFrameTick) => {
    const v = videoRef.current, a = adapterRef.current;
    if (!v || !a?.ready) return;
    const before = performance.now();
    const frame = a.detect(v, tick.timestampMs, { frameId: tick.frameId });
    if (frame === lastFrameRef.current) return;   // the same frame again, or a failed detect: nothing new
    const arrived = performance.now();
    lastFrameRef.current = frame;
    lastClockRef.current = tick.clock;

    const stamps = detectStampsRef.current;
    stamps.push(tick.timestampMs);
    while (stamps.length && stamps[0] < tick.timestampMs - 1000) stamps.shift();

    const run = runRef.current;
    if (run && tick.timestampMs >= run.t0 && tick.timestampMs <= run.endAt) {
      run.frames.push(toRecordedFrame(frame, tick.timestampMs - run.t0, arrived - run.t0));
      run.inferSum += arrived - before; run.inferN += 1;
      run.clock = run.clock == null || run.clock === tick.clock ? tick.clock : 'mixed';
    }
    drawPose(canvasRef.current, v, frame);
  };

  const startCamera = async () => {
    setErr(null);
    ensureAudio();
    setCam('camera');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: false,
      });
    } catch (e) {
      if (!aliveRef.current) return;
      setErr(e instanceof DOMException && e.name === 'NotAllowedError'
        ? 'Camera access was refused. Allow the camera for localhost and try again.'
        : `The camera could not start (${e instanceof Error ? e.message : String(e)}).`);
      setCam('error');
      return;
    }
    // Left the page while the permission prompt was up: the stream must not outlive us.
    if (!aliveRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
    streamRef.current = stream;
    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (streamRef.current !== stream || !aliveRef.current) return;
      stopCamera(); setRunView(null);
      setErr('The camera stopped (unplugged, or taken by another app). Takes so far are kept.');
      setCam('error');
    });
    const v = videoRef.current;
    if (!v) { stopCamera(); return; }
    v.srcObject = stream;
    try { await v.play(); } catch { /* muted + playsInline autoplays; a refusal shows as no frames */ }

    setCam('model');
    const adapter = new MediaPipePoseAdapter({ numPoses: 1, world: true });
    try {
      await adapter.init();
    } catch {
      adapter.dispose();
      if (!aliveRef.current || streamRef.current !== stream) return;
      stopCamera();
      setErr('The pose model did not load (from /pose, or the MediaPipe CDN when ours is missing), so check the network.');
      setCam('error');
      return;
    }
    // Left, or stopped the camera, while the model loaded: free it rather than start a loop nobody owns.
    if (!aliveRef.current || streamRef.current !== stream) { adapter.dispose(); return; }
    adapterRef.current = adapter;
    stopFramesRef.current = onVideoFrames(v, onTick);
    setCam('live');
  };

  // ── takes ──
  const beginTake = (id: string, next = false) => {
    const spec = TAKES.find((s) => s.id === id);
    if (!spec || !adapterRef.current) return;
    const now = performance.now();
    // Back-to-back takes still get a few seconds to read the next prompt and reset.
    const lead = Math.max(next ? 4 : 0, leadInRef.current) * 1000;
    const t0 = now + lead;
    runRef.current = {
      spec, t0, goAt: t0 + COUNTDOWN_MS, endAt: t0 + COUNTDOWN_MS + spec.seconds * 1000,
      recordedAt: new Date(Date.now() + lead).toISOString(), frames: [], inferSum: 0, inferN: 0, clock: null,
    };
    stageKeyRef.current = '';
    stepRun();
  };

  /** Close the take at `end` (performance.now ms) and keep it; then the next queued take, if any. */
  const finishRun = (end: number) => {
    const run = runRef.current;
    if (!run) return;
    runRef.current = null;
    const v = videoRef.current;
    const endT = end - run.t0;
    const frames = run.frames.filter((f) => f.t <= endT);
    const take: RecordedTake = {
      id: run.spec.id, label: run.spec.label, prompt: run.spec.prompt, recordedAt: run.recordedAt, device,
      video: { width: v?.videoWidth ?? 0, height: v?.videoHeight ?? 0 },
      clock: run.clock ?? lastClockRef.current ?? 'now',
      detectFps: measureFps(frames),
      inferMs: Math.round((run.inferSum / Math.max(1, run.inferN)) * 10) / 10,
      goT: COUNTDOWN_MS, endT: Math.round(endT * 10) / 10, frames,
    };
    setTakes((prev) => ({ ...prev, [take.id]: take }));
    setUnsaved(true);
    beep(330, 250);
    const next = queueRef.current.shift();
    if (next) beginTake(next, true);
    else setRunView(null);
  };

  /** Advance the take's clock: lead-in → 3-2-1 → GO → done. Runs every 100 ms while the camera is live. */
  const stepRun = () => {
    const run = runRef.current;
    if (!run) return;
    const now = performance.now();
    // Frames are stamped when the camera took them but land here a camera + model latency later: hold the take open
    // that long past its end, or the last few frames of the move (a landing) arrive after it closed and are lost.
    if (now >= run.endAt + ARRIVE_GRACE_MS) { finishRun(run.endAt); return; }
    const view: RunView = now < run.t0
      ? { spec: run.spec, stage: 'lead', n: Math.ceil((run.t0 - now) / 1000), progress: 0, next: queueRef.current.length > 0 }
      : now < run.goAt
        ? { spec: run.spec, stage: 'count', n: Math.ceil((run.goAt - now) / 1000), progress: 0, next: false }
        : { spec: run.spec, stage: 'go', n: Math.ceil((run.endAt - now) / 1000), progress: (now - run.goAt) / (run.endAt - run.goAt), next: false };
    const key = view.stage === 'go' ? 'go' : `${view.stage}${view.n}`;
    if (key !== stageKeyRef.current) {
      stageKeyRef.current = key;
      if (view.stage === 'count') beep(440, 120);
      else if (view.stage === 'go') beep(880, 300);
    }
    setRunView(view);
  };
  const stepRef = useRef(stepRun);
  stepRef.current = stepRun;

  const recordOne = (id: string) => { ensureAudio(); queueRef.current = []; beginTake(id); };
  const recordRemaining = () => {
    ensureAudio();
    const ids = TAKES.filter((s) => !takes[s.id]).map((s) => s.id);
    if (!ids.length) return;
    queueRef.current = ids.slice(1);
    beginTake(ids[0]);
  };
  /** End this take now and keep it (if GO was reached); the queue stops. */
  const stopTake = () => {
    const run = runRef.current;
    queueRef.current = [];
    if (!run) return;
    if (performance.now() < run.goAt) { runRef.current = null; setRunView(null); return; }
    finishRun(Math.min(performance.now(), run.endAt));   // inside the grace, the take already ended
  };
  const cancelTake = () => { queueRef.current = []; runRef.current = null; setRunView(null); };
  const cancelRef = useRef(cancelTake);
  cancelRef.current = cancelTake;

  // ── the one download: every take in one .json, handed to the browser. Nothing is sent anywhere. ──
  const download = () => {
    const now = new Date();
    const file = buildTakesFile(takes, { device, model: POSE_MODEL_NAME, notes, savedAt: now });
    const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = takesFileName(now);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setUnsaved(false);
  };

  // ── lifecycle ──
  // Leaving the page frees the model and turns the camera light off; set again on the dev double-mount.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      stopCamera();
      try { void audioRef.current?.close(); } catch { /* already closed */ }
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The take clock and the live readout, only while the camera is up.
  useEffect(() => {
    if (cam !== 'live') return;
    const clock = setInterval(() => stepRef.current(), 100);
    const readout = setInterval(() => {
      const f = lastFrameRef.current;
      const s = detectStampsRef.current;
      const fresh = s.length > 1 && performance.now() - s[s.length - 1] < 500;
      const fps = fresh ? Math.round(((s.length - 1) * 1000) / (s[s.length - 1] - s[0])) : 0;
      const fr = f ? checkFraming(f) : null;
      // the framing check has no rule for jumping: a head near the top of the frame leaves the jump no room
      const nose = f?.present ? f.landmarks[NOSE] : undefined;
      const hint = fr?.ok && nose && nose.y < 0.15 ? 'Leave room above your head for the jumps: step back a little.' : fr?.instruction ?? '';
      setLive({ fps, present: !!f?.present, ok: !!fr?.ok, hint });
    }, 250);
    return () => { clearInterval(clock); clearInterval(readout); };
  }, [cam]);

  // Esc cancels a take (the owner may be across the room with a keyboard in hand).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Takes only exist in this tab until downloaded: ask before a reload or close throws them away.
  const takeCount = Object.keys(takes).length;
  useEffect(() => {
    if (!unsaved || !takeCount) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved, takeCount]);

  const totalFrames = Object.values(takes).reduce((n, t) => n + t.frames.length, 0);
  const remaining = TAKES.filter((s) => !takes[s.id]).length;
  const busy = !!runView;
  const video = videoRef.current;

  return (
    <div className="min-h-screen bg-[#07090d] p-4 font-mono text-xs text-white">
      <h1 className="text-lg font-bold text-[#00E5FF]">Pose recorder (dev)</h1>
      <p className="mt-1 text-white/50">
        Record your own moves to tune the movement-play detectors. Stand about 3 m back, whole body in the shot.
      </p>

      <section className="mt-3 max-w-4xl rounded-lg border border-[#00FF9D]/30 bg-[#00FF9D]/5 p-3 leading-relaxed text-white/80">
        <b className="text-[#00FF9D]">NUMBERS ONLY. NOTHING IS UPLOADED.</b> The camera picture is shown on this page and
        nowhere else. It is never saved and never sent. What is kept is the 33 body points per frame (positions and
        visibility), in this tab&apos;s memory, until you download them as one .json file to this Mac. This page sends
        nothing to any server. The only network use is the pose model&apos;s one-time download (MediaPipe, from jsDelivr
        and Google&apos;s model storage). Closing the tab throws the takes away.
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <div className="relative aspect-video overflow-hidden rounded-lg border border-white/10 bg-black">
            {/* mirrored self-view: the owner moves left, the picture moves left. The landmarks stay unmirrored. */}
            <div className="absolute inset-0" style={{ transform: 'scaleX(-1)' }}>
              <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-contain" />
              <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
            </div>

            {cam === 'live' && (
              <div className="absolute left-2 top-2 flex flex-wrap gap-2">
                <span className="rounded bg-black/70 px-2 py-1">{live.fps} fps</span>
                <span className={`rounded bg-black/70 px-2 py-1 ${live.present ? 'text-[#00FF9D]' : 'text-[#FF3366]'}`}>
                  {live.present ? 'BODY' : 'NO BODY'}
                </span>
                {live.hint && (
                  <span className={`rounded bg-black/70 px-2 py-1 ${live.ok ? 'text-white/70' : 'text-[#FFD700]'}`}>{live.hint}</span>
                )}
              </div>
            )}

            {runView && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/35 p-6 text-center">
                <div className="text-3xl font-bold text-[#00E5FF]">{runView.spec.label}</div>
                <div className="mt-3 max-w-3xl text-2xl leading-snug text-white">{runView.spec.prompt}</div>
                {runView.stage === 'lead' && (
                  <div className="mt-6 text-2xl text-white/70">Get in place… {runView.n}</div>
                )}
                {runView.stage === 'count' && (
                  <div className="mt-4 text-[9rem] font-bold leading-none text-[#FFD700]">{runView.n}</div>
                )}
                {runView.stage === 'go' && (
                  <>
                    <div className="mt-4 text-7xl font-bold text-[#00FF9D]">GO · {runView.n}</div>
                    <div className="mt-4 h-3 w-2/3 overflow-hidden rounded bg-white/15">
                      <div className="h-full bg-[#00FF9D]" style={{ width: `${Math.min(100, runView.progress * 100)}%` }} />
                    </div>
                  </>
                )}
              </div>
            )}

            {cam !== 'live' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                {cam === 'off' || cam === 'error' ? (
                  <button onClick={startCamera} className="rounded-lg bg-[#00E5FF] px-5 py-3 text-sm font-bold text-black">
                    Start camera
                  </button>
                ) : (
                  <p className="text-sm text-white/70">{cam === 'camera' ? 'Waiting for the camera…' : 'Loading the pose model…'}</p>
                )}
                {err && <p className="max-w-lg text-[#FF3366]">{err}</p>}
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={recordRemaining} disabled={cam !== 'live' || busy || !remaining}
              className="rounded bg-[#00E5FF] px-3 py-2 font-bold text-black disabled:opacity-30"
            >
              Record all remaining ({remaining})
            </button>
            <button onClick={stopTake} disabled={!busy} className="rounded border border-white/20 px-3 py-2 disabled:opacity-30">
              Stop take (keep it)
            </button>
            <button onClick={cancelTake} disabled={!busy} className="rounded border border-white/20 px-3 py-2 disabled:opacity-30">
              Cancel take (Esc)
            </button>
            <label className="ml-2 flex items-center gap-2 text-white/60">
              Lead-in
              <select
                value={leadIn} onChange={(e) => setLeadIn(Number(e.target.value))}
                className="rounded border border-white/20 bg-black px-2 py-1 text-white"
              >
                {[3, 5, 10, 15].map((s) => <option key={s} value={s}>{s} s</option>)}
              </select>
            </label>
            {cam === 'live' && (
              <button
                onClick={() => { stopCamera(); setRunView(null); setCam('off'); }}
                className="ml-auto rounded border border-white/20 px-3 py-2 text-white/70"
              >
                Stop camera
              </button>
            )}
          </div>
          <p className="mt-2 text-white/40">
            Each take: the lead-in to walk back, then 3-2-1 (recorded, standing ready), then GO. A beep marks each count,
            GO and the end.
            {video && video.videoWidth ? ` Camera ${video.videoWidth}×${video.videoHeight}.` : ''} {device}.
          </p>
        </div>

        <aside className="flex flex-col gap-3">
          <ol className="flex flex-col gap-1">
            {TAKES.map((s, i) => {
              const t = takes[s.id];
              const bodyPct = t && t.frames.length ? Math.round((100 * t.frames.filter((f) => f.present).length) / t.frames.length) : 0;
              const active = runView?.spec.id === s.id;
              return (
                <li
                  key={s.id}
                  className={`flex items-center gap-2 rounded border px-2 py-1.5 ${active ? 'border-[#00E5FF] bg-[#00E5FF]/10' : 'border-white/10'}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-white">{i + 1}. {s.label}</div>
                    <div className={t && bodyPct < 90 ? 'text-[#FFD700]' : 'text-white/40'}>
                      {t
                        ? `${t.frames.length} frames · ${t.detectFps} fps · body ${bodyPct}% · ${((t.endT - t.goT) / 1000).toFixed(1)} s`
                        : `${s.seconds} s after GO`}
                    </div>
                  </div>
                  <button
                    onClick={() => recordOne(s.id)} disabled={cam !== 'live' || busy}
                    className="shrink-0 rounded border border-white/20 px-2 py-1 disabled:opacity-30"
                  >
                    {t ? 'Re-record' : 'Record'}
                  </button>
                </li>
              );
            })}
          </ol>

          <label className="flex flex-col gap-1 text-white/60">
            Notes (saved in the file)
            <input
              value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. orthodox, dunks right-handed, laptop on the TV stand 3 m away"
              className="rounded border border-white/20 bg-black px-2 py-1.5 text-white"
            />
          </label>
          <button
            onClick={download} disabled={!takeCount || busy}
            className="rounded-lg bg-[#00FF9D] px-3 py-3 text-sm font-bold text-black disabled:opacity-30"
          >
            Download all takes (.json): {takeCount} take{takeCount === 1 ? '' : 's'}, ~{((totalFrames * BYTES_PER_FRAME) / 1e6).toFixed(1)} MB
          </button>
          <p className="leading-relaxed text-white/40">
            The browser saves it on this Mac (usually ~/Downloads). {unsaved && takeCount ? 'Not downloaded since the last take.' : ''}
          </p>
        </aside>
      </div>
    </div>
  );
}
