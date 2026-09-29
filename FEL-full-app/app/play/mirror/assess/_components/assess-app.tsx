'use client';

// Mirror Assess, the Quick Screen (lib/assess; spec §8). One camera owner (lib/pose/PoseService), the camera picture and
// a 2-D skeleton on two canvases flipped together as a mirror, and the runner deciding what happens next. No Babylon
// anywhere on this route.
//
// SCREEN-SHIP (2026-09-29): portrait first, one step per screen, system font. Start → age → a parent's consent (under
// 18, or an age not given) → "Does anything hurt right now?" → only then the camera → the checks → results.
//   · NOTHING IS SENT. No server save in this ship (A2-3): the screen never calls POST /api/mirror/assessment, no PRQ
//     write, no analytics. The results live on the phone: in this page's memory, and in this tab's sessionStorage only
//     after the age answer (and a parent's consent under 18). Never localStorage. (lib/screen/store.ts)
//   · A NEW SCREEN WIPES THE OLD ONE FIRST, on Start, before anything new is shown or written.
//   · The results have their own address (/play/mirror/assess/results), carrying no data: a refresh, "Back to my
//     results" and the browser's Back all read the same summary, and a tab without one says so.
//
// THE PICTURE IS PAINTED, NOT PLACED. The app's rule (components/games/bodyPlay.scan.test.ts, Z-P4-4) is that
// PoseService's <video> is placed in exactly one self-view, SelfView; that component lives in body-play.tsx, whose
// imports reach the Babylon session store and sound kits, which this route must not load. So PoseService keeps its
// <video> parked and this page paints its current frame into its own canvas each pose frame: the same pixels, local
// to this page, never exported (no toDataURL, no toBlob, no stream capture: replay.test.ts scans for them).
//
// The skeleton is One-Euro smoothed (lib/screen/ui SKELETON_EURO) and a joint under the confidence floor is hidden,
// never drawn jittering (Squad gate 2). The runner grades the raw frames, as before.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Volume2, VolumeX } from 'lucide-react';
import { poseService, type PoseStatus } from '@/lib/pose/PoseService';
import { MIN_CAMERA_FPS } from '@/lib/pose/modelChoice';
import { feedHookAllowed } from '@/lib/pose/feed';
import { PoseFilter } from '@/lib/pose/oneEuro';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { AssessRunner, type RunnerView } from '@/lib/assess/runner';
import type { Side } from '@/lib/assess/protocol';
import { summarize } from '@/lib/screen/checks';
import { PAIN_STOP } from '@/lib/screen/copy';
import { clearScreen, localForClear, remember, tabStorage, writeResult, writeTakeoff, type AgeBand, type GateRecord } from '@/lib/screen/store';
import { PRE_START, preStep, type PreEvent, type PreState } from '@/lib/screen/flow';
import { SKELETON_EURO, SKELETON_MIN_VISIBILITY } from '@/lib/screen/ui';
import { drawSkeleton, SKELETON_COLOURS } from './skeleton';
import { useVoice } from './use-voice';
import { CameraHelp } from './camera-help';
import { LiveHud } from './live-hud';
import { AgeStep, ConsentStep, PainStep, PainStopStep, StartStep } from './gate-steps';
import { ScreenFrame, StepCard, quietBtn } from './screen-ui';

export const RESULTS_PATH = '/play/mirror/assess/results';

type Phase = 'intro' | 'age' | 'consent' | 'pain' | 'painStop' | 'starting' | 'device' | 'running' | 'stopped' | 'toResults' | 'cameraError';

/** The QA handle (see the effect that installs it). */
interface AssessProbe {
  view(): { step: string; part: string | null; test: string | null; reps: number; target: number; mini: string | null } | null;
  frames(part: string): Promise<PoseFrame[]>;
}
declare global {
  interface Window { __FEL_ASSESS__?: AssessProbe }
}

export function AssessApp() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('intro');
  const preRef = useRef<PreState>(PRE_START);
  const [status, setStatus] = useState<PoseStatus | null>(null);
  const [poseHz, setPoseHz] = useState(0);
  const [view, setView] = useState<RunnerView | null>(null);
  const [caption, setCaption] = useState('');
  const voice = useVoice();

  const gateRef = useRef<GateRecord | null>(null);
  const pictureRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef<RunnerView | null>(null);
  const runnerRef = useRef<AssessRunner | null>(null);
  const unsubRef = useRef<(() => void)[]>([]);
  const previewRef = useRef<(() => void) | null>(null);
  const lastSayRef = useRef(0);
  const cameraFpsRef = useRef<number | null>(null);
  const highFpsRef = useRef(false);
  const smoothRef = useRef(new PoseFilter(SKELETON_EURO));

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
    if (!f.present || f.image.length < 33) { smoothRef.current.reset(); return; }
    // the drawn skeleton is smoothed; a low-confidence joint is hidden (drawSkeleton skips it)
    drawSkeleton(ctx, smoothRef.current.filter(f).image, { colour, minVisibility: SKELETON_MIN_VISIBILITY });
  }, []);

  const attach = useCallback(() => {
    const svc = poseService();
    const cam = svc.status.camera;
    for (const c of [pictureRef.current, canvasRef.current]) if (c && cam?.width && cam.height) { c.width = cam.width; c.height = cam.height; }
    cameraFpsRef.current = cam?.frameRate ?? null;
  }, []);

  const startCamera = useCallback(async (model?: 'lite') => {
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

  const finish = useCallback((v: RunnerView) => {
    cleanup();                                                   // the camera stops the moment the screen ends
    const summary = v.result ? summarize(v.result) : null;
    if (!summary) { setPhase('stopped'); return; }               // pain: a referral, nothing kept
    remember(gateRef.current, summary);
    writeResult(tabStorage(), gateRef.current, summary);          // refused unless the age/consent gate allows it
    setPhase('toResults');
    router.replace(RESULTS_PATH);
  }, [cleanup, router]);

  const begin = useCallback(() => {
    const svc = poseService();
    const cam = svc.status.camera;
    const aspect = cam?.width && cam.height ? cam.width / cam.height : 4 / 3;
    previewRef.current?.(); previewRef.current = null;       // the runner draws from here on
    const runner = new AssessRunner({ aspect, takeoffLeg: null, painAsked: true, cameraFps: () => cameraFpsRef.current });
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
      if (v.step === 'done' || v.step === 'stopped') finish(v);
    }));
  }, [draw, finish, voice]);

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

  // the steps before the camera (lib/screen/flow.ts): the camera is asked for only from the pain step's "no"
  const pre = (e: PreEvent) => {
    if (e.type === 'start') clearScreen(tabStorage(), localForClear());   // a new screen wipes the last one first (shared phones)
    const next = preStep(preRef.current, e);
    preRef.current = next;
    gateRef.current = next.gate;
    if (next.step === 'camera') { void startCamera(); return; }
    setPhase(next.step);
  };
  const startNew = () => pre({ type: 'start' });
  const answerAge = (a: AgeBand) => pre({ type: 'age', age: a });
  const consent = () => pre({ type: 'consent' });
  const answerPainFirst = (hurts: boolean) => pre({ type: 'pain', hurts });
  const restart = () => { cleanup(); setView(null); setCaption(''); highFpsRef.current = false; pre({ type: 'restart' }); };

  // the prompts inside the screen
  const now = () => performance.now();
  const answerPain = (pain: boolean) => runnerRef.current?.answerPain(pain, now());
  const answerTakeoff = (side: Side) => {
    writeTakeoff(tabStorage(), gateRef.current, side);          // this tab only, after consent
    runnerRef.current?.answerTakeoff(side, now());
  };
  const reportPain = () => runnerRef.current?.reportPain(now());

  const cam = status?.camera;
  const aspect = cam?.width && cam.height ? `${cam.width} / ${cam.height}` : '4 / 3';
  const live = phase === 'device' || phase === 'running';

  if (phase === 'cameraError') return <CameraHelp why={status?.why ?? null} onRetry={() => void startCamera()} onBack={restart} />;

  return (
    <ScreenFrame right={live ? (
      <button type="button" onClick={() => voice.setOn(!voice.on)} aria-pressed={voice.on}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[12px] font-bold text-white/70">
        {voice.on ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        Voice {voice.on ? 'on' : 'off'}
      </button>
    ) : undefined}>
      {phase === 'intro' ? <StartStep onStart={startNew} /> : null}
      {phase === 'age' ? <AgeStep onAnswer={answerAge} /> : null}
      {phase === 'consent' ? <ConsentStep onConsent={consent} onBack={() => pre({ type: 'back' })} /> : null}
      {phase === 'pain' ? <PainStep onAnswer={answerPainFirst} /> : null}
      {phase === 'painStop' ? <PainStopStep onRestart={restart} /> : null}
      {phase === 'starting' ? (
        <StepCard testId="starting">
          <div className="flex items-center gap-3 text-white/75">
            <Loader2 className="h-5 w-5 animate-spin text-[#00E5FF]" />
            {status?.state === 'loading' ? 'Loading the pose model (6–9 MB the first time, kept after that)…' : 'Asking for the camera…'}
          </div>
        </StepCard>
      ) : null}
      {phase === 'stopped' ? (
        <StepCard testId="stopped">
          <h2 className="text-[21px] font-black">Screen stopped</h2>
          <p data-pain-stop className="mt-2 text-[16px] font-bold leading-snug text-[#FFB020]">{PAIN_STOP}</p>
          <p className="mt-2 text-[13px] text-white/60">Nothing from this screen was kept.</p>
          <button type="button" data-primary onClick={restart} className={`${quietBtn} mt-4`}>Back to the start</button>
        </StepCard>
      ) : null}
      {phase === 'toResults' ? (
        <StepCard testId="to-results"><p className="text-white/70">Your results…</p></StepCard>
      ) : null}

      {live ? (
        <div data-step={phase === 'device' ? 'camera' : view?.step ?? 'running'} className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-black" style={{ aspectRatio: aspect, maxHeight: '72vh' }}>
          {/* the picture and the skeleton, flipped together so the athlete sees a mirror */}
          <div className="absolute inset-0" style={{ transform: 'scaleX(-1)' }}>
            <canvas ref={pictureRef} aria-hidden className="absolute inset-0 h-full w-full" />
            <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
          </div>
          {phase === 'device' ? (
            <DeviceCheck status={status} poseHz={poseHz} onContinue={begin} onLite={() => void startCamera('lite')} />
          ) : null}
          {phase === 'running' && view ? (
            <LiveHud view={view} onPain={answerPain} onTakeoff={answerTakeoff} onStop={reportPain} />
          ) : null}
        </div>
      ) : null}
      {/* the one instruction, under the picture where it has room (portrait), and the last line said when it differs */}
      {live ? (
        <div aria-live="polite" data-instruction className="mt-3 min-h-[3em] text-center">
          <p className="text-[18px] font-bold leading-snug text-white">{view?.instruction || caption}</p>
          {caption && view?.instruction && caption !== view.instruction ? <p className="mt-1 text-[14px] text-white/65">{caption}</p> : null}
        </div>
      ) : null}
    </ScreenFrame>
  );
}

function DeviceCheck({ status, poseHz, onContinue, onLite }: { status: PoseStatus | null; poseHz: number; onContinue: () => void; onLite: () => void }) {
  const slow = poseHz > 0 && poseHz < MIN_CAMERA_FPS;
  return (
    <div className="absolute inset-x-3 bottom-3 rounded-2xl border border-white/10 bg-black/75 p-4 backdrop-blur">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">Camera check</p>
      <ul className="mt-2 space-y-1 text-[14px] text-white/85">
        <li>Camera: on{status?.camera ? ` · ${status.camera.width}×${status.camera.height}` : ''}{status?.camera?.frameRate ? ` · ${Math.round(status.camera.frameRate)} fps` : ''}</li>
        <li>Pose model: {status?.model ?? '…'}</li>
        <li className={slow ? 'text-[#FFB020]' : ''}>Pose rate: {poseHz ? `${Math.round(poseHz)} a second` : 'measuring…'}{slow ? ` (the screen needs ${MIN_CAMERA_FPS}; it may read less clearly)` : ''}</li>
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" data-primary onClick={onContinue} disabled={!poseHz}
          className="rounded-full bg-[#00E5FF] px-5 py-2.5 text-[15px] font-black text-black disabled:opacity-40">
          {slow ? 'Continue anyway' : 'Continue'}
        </button>
        {slow && status?.model !== 'lite' ? (
          <button type="button" onClick={onLite} className="rounded-full border border-white/20 px-5 py-2.5 text-[14px] font-bold text-white">Use the lighter model</button>
        ) : null}
      </div>
    </div>
  );
}
