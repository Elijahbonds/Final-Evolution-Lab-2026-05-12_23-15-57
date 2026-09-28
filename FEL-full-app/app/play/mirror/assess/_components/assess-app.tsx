'use client';

// Mirror Assess, the Quick Screen (lib/assess; spec §8). One camera owner (lib/pose/PoseService), the camera picture and
// a 2-D skeleton on two canvases flipped together as a mirror, and the runner deciding what happens next. No Babylon
// anywhere on this route.
//
// THE PICTURE IS PAINTED, NOT PLACED. The app's rule (components/games/bodyPlay.scan.test.ts, Z-P4-4) is that
// PoseService's <video> is placed in exactly one self-view, SelfView; that component lives in body-play.tsx, whose
// imports reach the Babylon session store and sound kits, which this route must not load. So PoseService keeps its
// <video> parked and this page paints its current frame into its own canvas each pose frame: the same pixels, local
// to this page, never exported (no toDataURL, no toBlob, no stream capture: replay.test.ts scans for them).
//
// PRIVACY (spec §10), which the first screen says out loud: pose runs on this device; the picture, the landmarks and the
// worst-rep skeletons never leave it; only the numbers are sent, only for a signed-in athlete, and the camera stops the
// moment the screen ends or this page goes away.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Volume2, VolumeX } from 'lucide-react';
import { poseService, type PoseStatus } from '@/lib/pose/PoseService';
import { deviceClass, MIN_CAMERA_FPS } from '@/lib/pose/modelChoice';
import { feedHookAllowed } from '@/lib/pose/feed';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { ASSESSMENT_DISCLAIMER } from '@/lib/mirror/assessment';
import { AssessRunner, type RunnerView, type SessionResult } from '@/lib/assess/runner';
import { PROTOCOL, NOT_BUILT_LINE, type Side } from '@/lib/assess/protocol';
import { postAssessment, toRecord } from '@/lib/assess/prqWrite';
import { drawSkeleton, SKELETON_COLOURS } from './skeleton';
import { useVoice } from './use-voice';
import { CameraHelp } from './camera-help';
import { LiveHud } from './live-hud';
import { ResultsView, type SaveState } from './results-view';

type Phase = 'intro' | 'starting' | 'device' | 'running' | 'results' | 'cameraError';

/** The QA handle (see the effect that installs it). */
interface AssessProbe {
  view(): { step: string; part: string | null; test: string | null; reps: number; target: number; mini: string | null } | null;
  frames(part: string): Promise<PoseFrame[]>;
}
declare global {
  interface Window { __FEL_ASSESS__?: AssessProbe }
}

const TAKEOFF_KEY = 'fel.assess.takeoffLeg';
const readTakeoff = (): Side | null => {
  try { const v = localStorage.getItem(TAKEOFF_KEY); return v === 'left' || v === 'right' ? v : null; } catch { return null; }
};

export function AssessApp({ signedIn }: { signedIn: boolean }) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [status, setStatus] = useState<PoseStatus | null>(null);
  const [poseHz, setPoseHz] = useState(0);
  const [view, setView] = useState<RunnerView | null>(null);
  const [caption, setCaption] = useState('');
  const [result, setResult] = useState<SessionResult | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const voice = useVoice();

  const pictureRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef<RunnerView | null>(null);
  const runnerRef = useRef<AssessRunner | null>(null);
  const unsubRef = useRef<(() => void)[]>([]);
  const previewRef = useRef<(() => void) | null>(null);
  const lastSayRef = useRef(0);
  const cameraFpsRef = useRef<number | null>(null);
  const highFpsRef = useRef(false);
  const deviceRef = useRef<{ model: 'lite' | 'full' | null; width: number; height: number }>({ model: null, width: 0, height: 0 });

  /** Drop this page's listeners; stop the camera too unless `keepFeed` and the QA feed is standing in for it. */
  const cleanup = useCallback((keepFeed = false) => {
    previewRef.current?.(); previewRef.current = null;
    for (const u of unsubRef.current.splice(0)) u();
    const svc = poseService();
    if (!(keepFeed && svc.status.source === 'feed')) svc.stop();
    try { window.speechSynthesis?.cancel(); } catch { /* nothing speaking */ }
  }, []);
  // the camera stops when the page goes away
  useEffect(() => () => cleanup(), [cleanup]);

  const draw = useCallback((f: PoseFrame, colour: string) => {
    // the picture: the camera's current frame, painted (see the header)
    const pic = pictureRef.current, video = poseService().video;
    const pctx = pic?.getContext('2d');
    if (pic && pctx && video && video.readyState >= 2) pctx.drawImage(video, 0, 0, pic.width, pic.height);
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    if (f.present && f.image.length >= 33) drawSkeleton(ctx, f.image, { colour });
  }, []);

  const attach = useCallback(() => {
    const svc = poseService();
    const cam = svc.status.camera;
    for (const c of [pictureRef.current, canvasRef.current]) if (c && cam?.width && cam.height) { c.width = cam.width; c.height = cam.height; }
    deviceRef.current = { model: svc.status.model, width: cam?.width ?? 0, height: cam?.height ?? 0 };
    cameraFpsRef.current = cam?.frameRate ?? null;
  }, []);

  const start = useCallback(async (model?: 'lite') => {
    // a camera already running is restarted (the lighter model); a QA feed standing in for it is kept (lib/pose/feed.ts)
    cleanup(true);
    setPhase('starting');
    const svc = poseService();
    unsubRef.current.push(svc.onStatus((s) => setStatus(s)));
    const ok = await svc.start(model ? { model } : {});
    setStatus(svc.status);
    if (!ok) { setPhase('cameraError'); return; }
    setPhase('device');
    // the device check: the pose rate the model really delivers, with a body or without
    previewRef.current = svc.onFrame((f) => { draw(f, SKELETON_COLOURS.tracking); });
    const timer = setInterval(() => setPoseHz(svc.stats.fps), 500);
    unsubRef.current.push(() => clearInterval(timer));
  }, [cleanup, draw]);

  // the video host exists once the stage renders: show the picture there
  useEffect(() => {
    if (phase === 'device') attach();
  }, [phase, attach]);

  const begin = useCallback(() => {
    const svc = poseService();
    const cam = svc.status.camera;
    const aspect = cam?.width && cam.height ? cam.width / cam.height : 4 / 3;
    previewRef.current?.(); previewRef.current = null;       // the runner draws from here on
    const runner = new AssessRunner({ aspect, takeoffLeg: readTakeoff(), cameraFps: () => cameraFpsRef.current });
    runnerRef.current = runner;
    lastSayRef.current = 0;
    setPhase('running');
    unsubRef.current.push(svc.onFrame((f) => {
      const v = runner.tick(f, performance.now());
      draw(f, SKELETON_COLOURS[v.skeleton]);
      if (v.say && v.say.id !== lastSayRef.current) {
        lastSayRef.current = v.say.id;
        setCaption(v.say.text);
        voice.speak(v.say.text);
      }
      viewRef.current = v;
      setView(v);
      if (v.step === 'done' || v.step === 'stopped') {
        setResult(v.result);
        setPhase('results');
        cleanup();                               // the camera stops the moment the screen ends
      }
    }));
  }, [cleanup, draw, voice]);

  // QA, with the pose feed's own gate (development, or ?agent=1 on this machine; never the deployed site): read the
  // runner's state, and load the synthetic captures (lib/assess/replay, fetched only when asked) to play through
  // window.__FEL_POSE_FEED__, so a probe can run the whole screen in a real browser without a camera.
  useEffect(() => {
    const agent = new URLSearchParams(window.location.search).get('agent') === '1';
    if (!feedHookAllowed(process.env.NODE_ENV, agent, window.location.hostname)) return;
    window.__FEL_ASSESS__ = {
      view: () => {
        const v = viewRef.current;
        return v ? { step: v.step, part: v.part, test: v.test, reps: v.reps.count, target: v.reps.target, mini: v.mini?.text ?? null } : null;
      },
      frames: async (part: string) => (await import('@/lib/assess/replay')).partFrames(part),
    };
    return () => { delete window.__FEL_ASSESS__; };
  }, []);

  // T5 asks the camera for 60 fps (spec §3.1), and records what it really delivers
  useEffect(() => {
    if (!view?.wantsHighFps || highFpsRef.current) return;
    highFpsRef.current = true;
    const track = (poseService().video?.srcObject as MediaStream | null)?.getVideoTracks?.()[0];
    if (!track?.applyConstraints) return;
    track.applyConstraints({ frameRate: { ideal: 60 } })
      .then(() => { cameraFpsRef.current = track.getSettings?.().frameRate ?? cameraFpsRef.current; })
      .catch(() => { /* the camera keeps its rate; the result records what it was */ });
  }, [view?.wantsHighFps]);

  // the prompts
  const now = () => performance.now();
  const answerPain = (pain: boolean) => runnerRef.current?.answerPain(pain, now());
  const answerTakeoff = (side: Side) => {
    try { localStorage.setItem(TAKEOFF_KEY, side); } catch { /* asked again next time */ }
    runnerRef.current?.answerTakeoff(side, now());
  };
  const reportPain = () => runnerRef.current?.reportPain(now());

  // results: save the numbers for a signed-in athlete (never after a pain stop)
  useEffect(() => {
    if (phase !== 'results' || !result || save.kind !== 'idle') return;
    if (result.pain) { setSave({ kind: 'notSaved', why: 'pain' }); return; }
    if (!signedIn) { setSave({ kind: 'notSaved', why: 'guest' }); return; }
    const runner = runnerRef.current;
    const d = deviceRef.current;
    const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
    const record = toRecord({
      assessmentId: `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      mode: 'quick', measuredAt: new Date(), takeoffLeg: result.takeoffLeg, tests: result.tests, mqs: result.mqs,
      device: {
        class: deviceClass({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints, uaMobile: nav.userAgentData?.mobile }),
        model: d.model, poseHz: runner?.poseHz ?? 0, cameraFps: cameraFpsRef.current, width: d.width, height: d.height,
      },
    });
    setSave({ kind: 'saving' });
    postAssessment(record, (u, i) => fetch(u, i))
      .then(({ status: code, body }) => {
        if (code === 200) setSave({ kind: 'saved', body: body as Record<string, unknown> });
        else if (code === 412) setSave({ kind: 'notSaved', why: 'consent' });
        else if (code === 401) setSave({ kind: 'notSaved', why: 'guest' });
        else setSave({ kind: 'error', code });
      })
      .catch(() => setSave({ kind: 'error', code: 0 }));
  }, [phase, result, save.kind, signedIn]);

  const restart = () => { setResult(null); setSave({ kind: 'idle' }); setView(null); setCaption(''); highFpsRef.current = false; setPhase('intro'); };

  const cam = status?.camera;
  const aspect = cam?.width && cam.height ? `${cam.width} / ${cam.height}` : '4 / 3';
  const live = phase === 'device' || phase === 'running';

  return (
    <div className="relative min-h-screen bg-[#050505] text-white">
      <div className="relative mx-auto max-w-[920px] px-4 pb-16 pt-4">
        <header className="mb-5 flex items-center gap-3">
          <Link href="/play/mirror" aria-label="Back to the Mirror"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-white/70">
            <ArrowLeft className="h-[18px] w-[18px]" />
          </Link>
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#00E5FF]">The Mirror · Assess</p>
            <h1 className="fel-heading truncate text-[22px] font-black leading-none tracking-tight md:text-[26px]">Quick Screen</h1>
          </div>
          <button type="button" onClick={() => voice.setOn(!voice.on)} aria-pressed={voice.on}
            className="ml-auto inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-white/70">
            {voice.on ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            Voice {voice.on ? 'on' : 'off'}
          </button>
        </header>

        {phase === 'intro' ? <Intro onStart={() => start()} signedIn={signedIn} /> : null}
        {phase === 'starting' ? (
          <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-white/70">
            <Loader2 className="h-5 w-5 animate-spin text-[#00E5FF]" />
            {status?.state === 'loading' ? 'Loading the pose model (6–9 MB the first time, kept after that)…' : 'Asking for the camera…'}
          </div>
        ) : null}
        {phase === 'cameraError' ? <CameraHelp why={status?.why ?? null} onRetry={() => start()} /> : null}

        {live ? (
          <div className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-black" style={{ aspectRatio: aspect }}>
            {/* the picture and the skeleton, flipped together so the athlete sees a mirror */}
            <div className="absolute inset-0" style={{ transform: 'scaleX(-1)' }}>
              <canvas ref={pictureRef} aria-hidden className="absolute inset-0 h-full w-full" />
              <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
            </div>
            {phase === 'device' ? (
              <DeviceCheck status={status} poseHz={poseHz} onContinue={begin} onLite={() => start('lite')} />
            ) : null}
            {phase === 'running' && view ? (
              <LiveHud view={view} caption={caption} onPain={answerPain} onTakeoff={answerTakeoff} onStop={reportPain} />
            ) : null}
          </div>
        ) : null}
        {live ? (
          <p aria-live="polite" className="mt-3 min-h-[1.5em] text-center text-[15px] font-semibold text-white/85">{caption}</p>
        ) : null}

        {phase === 'results' && result ? <ResultsView result={result} save={save} signedIn={signedIn} onAgain={restart} /> : null}
      </div>
    </div>
  );
}

function Intro({ onStart, signedIn }: { onStart: () => void; signedIn: boolean }) {
  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-[18px] font-black">About five minutes, four tests, one camera</h2>
        <ul className="mt-3 space-y-1.5 text-[14px] text-white/75">
          {PROTOCOL.map((t) => (
            <li key={t.id} className="flex items-baseline gap-2">
              <span className="font-mono text-[11px] text-[#00E5FF]">{t.id}</span>
              <span className={t.notBuilt ? 'text-white/35' : ''}>{t.name}{t.sided ? ' (each side)' : ''}</span>
              {t.notBuilt ? <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">{NOT_BUILT_LINE}</span> : null}
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-[14px] leading-relaxed text-white/75">
        <h2 className="text-[16px] font-black text-white">Set up</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Phone or laptop at hip height (about 1 m), 2.5–3.5 m away.</li>
          <li>Your whole body in the shot, with a little room above your head.</li>
          <li>Light in front of you, not behind. A wall nearby for the ankle test.</li>
        </ul>
      </section>
      <section className="rounded-3xl border border-[#00E5FF]/20 bg-[#00E5FF]/[0.04] p-5 text-[13.5px] leading-relaxed text-white/75">
        <h2 className="text-[16px] font-black text-white">What happens to the picture</h2>
        <p className="mt-2">Everything runs on this device. The camera picture and your body&apos;s points never leave it and are never stored.
          {signedIn ? ' Only the scores are saved to your profile, and your PRQ power and flexibility are updated as camera estimates.' : ' You are not signed in, so nothing is saved: the scores are shown here and kept nowhere.'}
          {' '}The camera turns off when the screen ends.</p>
        <p className="mt-2 text-white/50">{ASSESSMENT_DISCLAIMER} Every score here is provisional until the thresholds are signed off.</p>
      </section>
      <button type="button" onClick={onStart} className="w-full rounded-full bg-[#00E5FF] px-6 py-3.5 text-[16px] font-black text-black">
        Start the camera
      </button>
    </div>
  );
}

function DeviceCheck({ status, poseHz, onContinue, onLite }: { status: PoseStatus | null; poseHz: number; onContinue: () => void; onLite: () => void }) {
  const slow = poseHz > 0 && poseHz < MIN_CAMERA_FPS;
  return (
    <div className="absolute inset-x-3 bottom-3 rounded-2xl border border-white/10 bg-black/75 p-4 backdrop-blur">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/50">Device check</p>
      <ul className="mt-2 space-y-1 text-[14px] text-white/85">
        <li>Camera: on{status?.camera ? ` · ${status.camera.width}×${status.camera.height}` : ''}{status?.camera?.frameRate ? ` · ${Math.round(status.camera.frameRate)} fps` : ''}</li>
        <li>Pose model: {status?.model ?? '…'}</li>
        <li className={slow ? 'text-[#FFB020]' : ''}>Pose rate: {poseHz ? `${Math.round(poseHz)} a second` : 'measuring…'}{slow ? ` (the screen needs ${MIN_CAMERA_FPS}; scores will count for less)` : ''}</li>
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onContinue} disabled={!poseHz}
          className="rounded-full bg-[#00E5FF] px-5 py-2 text-[14px] font-bold text-black disabled:opacity-40">
          {slow ? 'Continue anyway' : 'Continue'}
        </button>
        {slow && status?.model !== 'lite' ? (
          <button type="button" onClick={onLite} className="rounded-full border border-white/20 px-5 py-2 text-[14px] font-bold text-white">Use the lighter model</button>
        ) : null}
      </div>
    </div>
  );
}
