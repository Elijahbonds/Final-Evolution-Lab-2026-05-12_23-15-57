'use client';

// Mirror Assess, the Quick Screen (lib/assess; spec §8). One camera owner (lib/pose/PoseService), the camera picture and
// a 2-D skeleton on two canvases flipped together as a mirror, and the runner deciding what happens next. No Babylon
// anywhere on this route.
//
// SCREEN-SHIP (2026-09-29), SCREEN-FIX: portrait first, one step per screen, system font. Start → age (every new Start:
// the last person's answer is reset first, audit 2.2) → "A grown-up is with me" (under 18, or an age not given) →
// "Does anything hurt right now?" → the camera card → only then the camera → the checks → results.
//   · NOTHING IS SENT. No server save in this ship (A2-3): the screen never calls POST /api/mirror/assessment, no PRQ
//     write, no analytics, no crash report (SCREEN-FIX-2 amend 4). The age answer is kept in this tab's sessionStorage,
//     so it is asked once per run (every new Start resets it first, AGE-RESET audit 2.2). 18 or older keep their results
//     there too; UNDER 18 (and "rather not say") keep
//     NOTHING ELSE: their number is shown from this page's memory, with the change since their last screen here
//     (lastJumpRef), and "Run it again" (SCREEN-FIX-2 item 3; lib/screen/store.ts keepResult). Never localStorage: the
//     camera's model memory is this page's too (screen-pose.ts, Cyber F5).
//   · THE BACK ARROW STAYS IN THE SCREEN: one step back through the flow, and from the start card to /screen (S-2).
//     The browser's Back in the middle of the screen asks first (use-leave-guard.ts, S-6).
//   · The camera check's numbers (resolution, frame rate, model, pose rate) show only where the QA hooks are allowed
//     (development, or ?agent=1 on this machine); everyone else gets a plain "this device may be slow" (S-5).
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
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Volume2, VolumeX } from 'lucide-react';
import { makeFeedHandle, type PoseStatus } from '@/lib/pose/PoseService';
import { MIN_CAMERA_FPS } from '@/lib/pose/modelChoice';
import { feedHookAllowed } from '@/lib/pose/feed';
import { PoseFilter } from '@/lib/pose/oneEuro';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { AssessRunner, JUMP_PARTS, REST_PARTS, type RunnerView } from '@/lib/assess/runner';
import type { TestResult } from '@/lib/assess/scoring';
import type { Side } from '@/lib/assess/protocol';
import { summarize } from '@/lib/screen/checks';
import {
  COACH_READY, LEAVE_BODY, LEAVE_GO, LEAVE_STAY, LEAVE_TITLE, PAIN_STOP, SLOW_DEVICE_LINE, STOP_CHECKS_BODY, STOP_CHECKS_GO, STOP_CHECKS_TITLE,
} from '@/lib/screen/copy';
import { isKid, type AgeBand } from '@/lib/screen/age';
import { clearScreen, keepResult, localForClear, lockAge, readAge, resetAge, tabStorage, writeTakeoff, type GateRecord } from '@/lib/screen/store';
import { PRE_START, preStep, type PreEvent, type PreState, type ScreenKind } from '@/lib/screen/flow';
import { forgetIntakeMemory } from '@/lib/health/intakeForget';
import { ASSESS_PATH, RESULTS_PATH, SCREEN_HOME } from '@/lib/screen/routes';
import { DEVICE_AUTO_FPS, DEVICE_AUTO_MS } from '@/lib/screen/realtime-cues';
import { SKELETON_EURO, SKELETON_MIN_VISIBILITY } from '@/lib/screen/ui';
import { drawSkeleton, SKELETON_COLOURS } from './skeleton';
import { useVoice } from './use-voice';
import { CameraHelp } from './camera-help';
import { KidResults } from './kid-results';
import { screenPose } from './screen-pose';
import { LiveHud } from './live-hud';
import { AgeStep, CameraInfoStep, GrownUpStep, PainStep, PainStopStep, StartStep } from './gate-steps';
import { JumpResult } from './jump-result';
import { ScreenFrame, StepCard, primaryBtn, quietBtn } from './screen-ui';
import { useLeaveGuard } from './use-leave-guard';

type Phase = 'intro' | 'age' | 'grownUp' | 'pain' | 'painStop' | 'cameraInfo' | 'starting' | 'device' | 'running' | 'stopped' | 'toResults' | 'kidResults' | 'jumpResult' | 'cameraError';
interface JumpView { heightCm: number | null; attempts: number; jumpIn: number | null; lastIn: number | null; kid: boolean }
/** From the age question to the results: the browser's Back asks before it leaves (S-6). */
const MID_FLOW: readonly Phase[] = ['age', 'grownUp', 'pain', 'cameraInfo', 'starting', 'device', 'running'];

/** The QA handle (see the effect that installs it). */
interface AssessProbe {
  view(): { step: string; part: string | null; test: string | null; reps: number; target: number; mini: string | null } | null;
  frames(part: string): Promise<PoseFrame[]>;
}
declare global {
  interface Window { __FEL_ASSESS__?: AssessProbe }
}

export function AssessApp({ initialRun = null }: { initialRun?: ScreenKind | null }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(initialRun ? 'age' : 'intro');
  const preRef = useRef<PreState>(PRE_START);
  const [status, setStatus] = useState<PoseStatus | null>(null);
  const [poseHz, setPoseHz] = useState(0);
  const [view, setView] = useState<RunnerView | null>(null);
  const [caption, setCaption] = useState('');
  const [tech, setTech] = useState(false);                       // the camera check's numbers (S-5)
  const [stopAsk, setStopAsk] = useState(false);                 // the back arrow during the checks asks first
  const [kid, setKid] = useState<{ jumpIn: number | null; lastIn: number | null } | null>(null);   // a kid's number (page memory)
  const voice = useVoice();
  const guard = useLeaveGuard(MID_FLOW.includes(phase));

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
  const camRunRef = useRef(0);                                   // the current camera start; a newer one (or a back) cancels it
  const lastJumpRef = useRef<number | null>(null);
  const modeRef = useRef<ScreenKind | 'rest'>(initialRun ?? 'full');
  const carryRef = useRef<TestResult | null>(null);
  const booted = useRef(false);
  const [jumpView, setJumpView] = useState<JumpView | null>(null);
  const deviceOkSince = useRef<number | null>(null);
  const facingRef = useRef<'user' | 'environment'>('user');

  /** Drop this page's listeners; stop the camera too unless `keepFeed` and the QA feed is standing in for it. */
  const cleanup = useCallback((keepFeed = false) => {
    previewRef.current?.(); previewRef.current = null;
    for (const u of unsubRef.current.splice(0)) u();
    const svc = screenPose();
    if (!(keepFeed && svc.status.source === 'feed')) svc.stop();
    try { window.speechSynthesis?.cancel(); } catch { /* nothing speaking */ }
  }, []);
  // the camera stops when the page goes away
  useEffect(() => () => cleanup(), [cleanup]);

  const draw = useCallback((f: PoseFrame, colour: string) => {
    // the picture: the camera's current frame, painted (see the header)
    const pic = pictureRef.current, video = screenPose().video;
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
    const svc = screenPose();
    const cam = svc.status.camera;
    for (const c of [pictureRef.current, canvasRef.current]) if (c && cam?.width && cam.height) { c.width = cam.width; c.height = cam.height; }
    cameraFpsRef.current = cam?.frameRate ?? null;
  }, []);

  // Resize / orientation mid-run: keep runner state, resize canvases (SCREEN-REALTIME).
  useEffect(() => {
    const onResize = () => {
      if (phase !== 'device' && phase !== 'running') return;
      attach();
      const cam = screenPose().status.camera;
      if (runnerRef.current && cam?.width && cam.height) {
        runnerRef.current.calibration.aspect = cam.width / cam.height;
      }
    };
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); window.visualViewport?.removeEventListener('resize', onResize); };
  }, [phase, attach]);

  const startCamera = useCallback(async (model?: 'lite') => {
    // a camera already running is restarted (the lighter model); a QA feed standing in for it is kept (lib/pose/feed.ts)
    cleanup(true);
    const run = ++camRunRef.current;
    setPhase('starting');
    const svc = screenPose();
    unsubRef.current.push(svc.onStatus((s) => setStatus(s)));
    const ok = await svc.start(model ? { model } : {});
    if (run !== camRunRef.current) return;                       // the athlete went back while the camera was starting
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

  // Skip the camera-info card tap: go straight to the browser prompt (SCREEN-REALTIME speed).
  useEffect(() => {
    if (phase === 'cameraInfo') cameraOn();
  }, [phase]);

  const finish = useCallback((v: RunnerView) => {
    cleanup();                                                   // the camera stops the moment the screen ends
    const summary = v.result ? summarize(v.result) : null;
    if (!summary || v.result?.pain) { setPhase('stopped'); return; }
    if (modeRef.current === 'jump') {
      const t5 = v.result?.tests.find((t) => t.id === 'T5') ?? null;
      carryRef.current = t5;
      const view: JumpView = {
        heightCm: t5?.t5?.bestHeightCm ?? null,
        attempts: t5?.t5?.jumps.length ?? 0,
        jumpIn: summary.jumpBestIn,
        lastIn: lastJumpRef.current,
        kid: keepResult(tabStorage(), gateRef.current, summary) === 'kid',
      };
      if (view.kid) lastJumpRef.current = summary.jumpBestIn ?? lastJumpRef.current;
      setJumpView(view);
      setPhase('jumpResult');
      return;
    }
    // under 18 (or "rather not say"): nothing kept anywhere; their number, and the change since the last screen here
    if (keepResult(tabStorage(), gateRef.current, summary) === 'kid') {
      setKid({ jumpIn: summary.jumpBestIn, lastIn: lastJumpRef.current });
      lastJumpRef.current = summary.jumpBestIn ?? lastJumpRef.current;
      setPhase('kidResults');
      return;
    }
    setPhase('toResults');                                        // 18 or older: kept in this tab (keepResult)
    router.replace(RESULTS_PATH);
  }, [cleanup, router]);

  const begin = useCallback(() => {
    const svc = screenPose();
    const cam = svc.status.camera;
    const aspect = cam?.width && cam.height ? cam.width / cam.height : 4 / 3;
    previewRef.current?.(); previewRef.current = null;       // the runner draws from here on
    const kind = modeRef.current;
    const runner = new AssessRunner({
      aspect, takeoffLeg: null, painAsked: true, handsFree: true, cameraFps: () => cameraFpsRef.current,
      ...(kind === 'jump' ? { parts: JUMP_PARTS } : {}),
      ...(kind === 'rest' ? { parts: REST_PARTS, priorTests: carryRef.current ? { T5: carryRef.current } : undefined } : {}),
    });
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
      runner.autoAdvance(performance.now());
      if (v.step === 'done' || v.step === 'stopped') finish(v);
    }));
  }, [draw, finish, voice]);

  // QA, with the pose feed's own gate (development, or ?agent=1 on this machine; never the deployed site): read the
  // runner's state, and load the synthetic captures (lib/assess/replay, fetched only when asked) to play through
  // window.__FEL_POSE_FEED__, so a probe can run the whole screen in a real browser without a camera.
  useEffect(() => {
    const agent = new URLSearchParams(window.location.search).get('agent') === '1';
    if (!feedHookAllowed(process.env.NODE_ENV, agent, window.location.hostname)) return;
    setTech(true);
    // the QA feed drives the screen's own PoseService while this page is up (screen-pose.ts), then goes back
    const feed = window.__FEL_POSE_FEED__;
    window.__FEL_POSE_FEED__ = makeFeedHandle(screenPose);
    window.__FEL_ASSESS__ = {
      view: () => {
        const v = viewRef.current;
        return v ? { step: v.step, part: v.part, test: v.test, reps: v.reps.count, target: v.reps.target, mini: v.mini?.text ?? null } : null;
      },
      frames: async (part: string) => (await import('@/lib/assess/replay')).partFrames(part),
    };
    return () => { delete window.__FEL_ASSESS__; window.__FEL_POSE_FEED__ = feed; };
  }, []);

  // T5 asks the camera for 60 fps (spec §3.1), and records what it really delivers
  useEffect(() => {
    if (!view?.wantsHighFps || highFpsRef.current) return;
    highFpsRef.current = true;
    const track = (screenPose().video?.srcObject as MediaStream | null)?.getVideoTracks?.()[0];
    if (!track?.applyConstraints) return;
    track.applyConstraints({ frameRate: { ideal: 60 } })
      .then(() => { cameraFpsRef.current = track.getSettings?.().frameRate ?? cameraFpsRef.current; })
      .catch(() => { /* the camera keeps its rate; the result records what it was */ });
  }, [view?.wantsHighFps]);

  // the steps before the camera (lib/screen/flow.ts): the camera is asked for only from the camera card's button
  const pre = (e: PreEvent) => {
    if (e.type === 'start') clearScreen(tabStorage(), localForClear());   // a new screen wipes the last one first (shared devices)
    // AGE-RESET (audit 2.2, 2026-10-03): a new Start is maybe a new person on a shared phone — the stored age and with
    // it the grown-up tick are cleared, so the question is asked again. The lock still holds WITHIN the run (lockAge).
    if (e.type === 'start') resetAge(tabStorage());
    // a start carries the tab's answer (none, after the reset above: the flow asks); a mid-run answer is locked (lockAge)
    const ev: PreEvent = e.type === 'start' ? { type: 'start', locked: readAge(tabStorage()), kind: e.kind }
      : e.type === 'age' ? { type: 'age', age: lockAge(tabStorage(), e.age) } : e;
    if (e.type === 'age' && isKid(ev.type === 'age' ? ev.age : null)) forgetIntakeMemory();
    const next = preStep(preRef.current, ev);
    preRef.current = next;
    gateRef.current = next.gate;
    if (e.type === 'start' && e.kind) modeRef.current = e.kind;
    if (next.step === 'camera') { void startCamera(); return; }
    setPhase(next.step);
  };
  const startNew = (kind: ScreenKind = 'full') => { lastJumpRef.current = null; modeRef.current = kind; pre({ type: 'start', kind }); };
  const answerAge = (a: AgeBand) => pre({ type: 'age', age: a });
  const grownUp = () => pre({ type: 'grownUp' });
  const answerPainFirst = (hurts: boolean) => {
    pre({ type: 'pain', hurts });
    if (!hurts) setTimeout(() => pre({ type: 'cameraOn' }), 0);
  };
  const cameraOn = () => pre({ type: 'cameraOn' });
  const resetRun = () => { camRunRef.current++; cleanup(); setView(null); viewRef.current = null; setCaption(''); highFpsRef.current = false; };
  const restart = () => { resetRun(); setKid(null); setJumpView(null); pre({ type: 'restart' }); };
  // "Run it again": a new Start (age is asked again). A jump-only result repeats the jump; after the full screen, the full screen.
  const runAgain = () => {
    const kind: ScreenKind = modeRef.current === 'jump' ? 'jump' : 'full';
    resetRun(); setKid(null); setJumpView(null); modeRef.current = kind; pre({ type: 'start', kind });
  };
  // Continue this run through T1–T3. The jump already graded is carried. Age and pain are not asked again.
  const doFull = () => { modeRef.current = 'rest'; setJumpView(null); void startCamera(); };
  // the camera off, back to the camera card (the flow's step before the camera)
  const cameraBack = () => { setStopAsk(false); resetRun(); pre({ type: 'back' }); };

  // ?run= from /screen: start that kind before paint, so the start card does not flash.
  useLayoutEffect(() => {
    if (!initialRun || booted.current) return;
    booted.current = true;
    modeRef.current = initialRun;
    lastJumpRef.current = null;
    pre({ type: 'start', kind: initialRun });
  }, [initialRun]);

  // the prompts inside the screen
  const now = () => performance.now();
  const answerPain = (pain: boolean) => runnerRef.current?.answerPain(pain, now());
  const answerTakeoff = (side: Side) => {
    writeTakeoff(tabStorage(), gateRef.current, side);          // this tab only, after the grown-up step
    runnerRef.current?.answerTakeoff(side, now());
  };
  const reportPain = () => runnerRef.current?.reportPain(now());

  const cam = status?.camera;
  const aspect = cam?.width && cam.height ? `${cam.width} / ${cam.height}` : '4 / 3';
  const live = phase === 'device' || phase === 'running';

  // S-14: /screen 307-loops back here; use history when we can, else stay on assess.
  const introBack = () => { if (typeof window !== 'undefined' && window.history.length > 1) window.history.back(); else router.replace(ASSESS_PATH); };
  const back: string | (() => void) = phase === 'intro' || phase === 'toResults' ? introBack
    : phase === 'running' ? () => setStopAsk(true)
    : phase === 'starting' || phase === 'device' ? cameraBack
    : phase === 'stopped' || phase === 'kidResults' || phase === 'jumpResult' ? restart
    : () => pre({ type: 'back' });

  if (phase === 'cameraError') return <CameraHelp why={status?.why ?? null} onRetry={() => void startCamera()} onBack={restart} />;

  return (
    <ScreenFrame back={back} right={live ? (
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => {
          facingRef.current = facingRef.current === 'user' ? 'environment' : 'user';
          void screenPose().start({ facingMode: facingRef.current });
        }} className="inline-flex min-h-12 items-center rounded-full border border-white/10 px-3 text-[16px] font-bold text-white/70">
          Flip camera
        </button>
        <button type="button" onClick={() => voice.setOn(!voice.on)} aria-pressed={voice.on}
          className="inline-flex min-h-12 items-center gap-1.5 rounded-full border border-white/10 px-3 text-[16px] font-bold text-white/70">
          {voice.on ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          Voice {voice.on ? 'on' : 'off'}
        </button>
      </div>
    ) : undefined}>
      {phase === 'intro' ? <StartStep onJump={() => startNew('jump')} onFull={() => startNew('full')} /> : null}
      {phase === 'age' ? <AgeStep onAnswer={answerAge} /> : null}
      {phase === 'grownUp' ? <GrownUpStep onContinue={grownUp} /> : null}
      {phase === 'pain' ? <PainStep onAnswer={answerPainFirst} /> : null}
      {phase === 'painStop' ? <PainStopStep onRestart={restart} /> : null}
      {phase === 'cameraInfo' ? <CameraInfoStep onCamera={cameraOn} /> : null}
      {phase === 'starting' ? (
        <StepCard testId="starting">
          <div className="flex items-center gap-3 text-white/75">
            <Loader2 className="h-5 w-5 animate-spin text-[#00E5FF]" />
            {status?.state === 'loading' ? (
              <span className="flex-1">
                <span className="block text-[16px]">{COACH_READY}</span>
                <span role="progressbar" aria-valuetext={COACH_READY} className="mt-2 block h-2 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full w-1/3 animate-pulse bg-[#00E5FF]" />
                </span>
              </span>
            ) : <span className="text-[16px]">Asking for the camera…</span>}
          </div>
        </StepCard>
      ) : null}
      {phase === 'stopped' ? (
        <StepCard testId="stopped">
          <h2 className="text-[21px] font-black">Screen stopped</h2>
          <p data-pain-stop className="mt-2 text-[16px] font-bold leading-snug text-[#FFB020]">{PAIN_STOP}</p>
          <p className="mt-2 text-[16px] text-white/60">Nothing from this screen was kept.</p>
          <button type="button" data-primary onClick={restart} className={`${quietBtn} mt-4`}>Back to the start</button>
        </StepCard>
      ) : null}
      {phase === 'toResults' ? (
        <StepCard testId="to-results"><p className="text-white/70">Your results…</p></StepCard>
      ) : null}
      {phase === 'kidResults' && kid ? <KidResults jumpIn={kid.jumpIn} lastIn={kid.lastIn} onRunAgain={runAgain} /> : null}
      {phase === 'jumpResult' && jumpView ? (
        <JumpResult heightCm={jumpView.heightCm} attempts={jumpView.attempts} kid={jumpView.kid} jumpIn={jumpView.jumpIn} lastIn={jumpView.lastIn} onFull={doFull} onAgain={runAgain} />
      ) : null}

      {live ? (
        <div data-step={phase === 'device' ? 'camera' : view?.step ?? 'running'} className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-black" style={{ aspectRatio: aspect, maxHeight: 'min(72vh, 100dvh - 12rem)' }}>
          {/* the picture and the skeleton, flipped together so the athlete sees a mirror */}
          <div className="absolute inset-0" style={{ transform: 'scaleX(-1)' }}>
            <canvas ref={pictureRef} aria-hidden className="absolute inset-0 h-full w-full" />
            <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
          </div>
          {phase === 'device' ? (
            <DeviceCheck status={status} poseHz={poseHz} tech={tech} onContinue={begin} onLite={() => void startCamera('lite')}
              autoContinue={begin} okSinceRef={deviceOkSince} />
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
          {caption && view?.instruction && caption !== view.instruction ? <p className="mt-1 text-[16px] text-white/65">{caption}</p> : null}
        </div>
      ) : null}
      {guard.asking ? <ConfirmCard title={LEAVE_TITLE} body={LEAVE_BODY} stay={LEAVE_STAY} go={LEAVE_GO} onStay={guard.stay} onGo={guard.leave} /> : null}
      {stopAsk && !guard.asking ? (
        <ConfirmCard title={STOP_CHECKS_TITLE} body={STOP_CHECKS_BODY} stay={LEAVE_STAY} go={STOP_CHECKS_GO} onStay={() => setStopAsk(false)} onGo={cameraBack} />
      ) : null}
    </ScreenFrame>
  );
}

/** "Leave the screen?" (the browser's Back, S-6) and "Stop the checks?" (the back arrow while a check runs). */
function ConfirmCard({ title, body, stay, go, onStay, onGo }: { title: string; body: string; stay: string; go: string; onStay: () => void; onGo: () => void }) {
  return (
    <div data-leave-dialog role="alertdialog" aria-modal="true" aria-labelledby="leave-title" className="fixed inset-0 z-[70] grid place-items-center bg-black/75 px-6">
      <div className="w-full max-w-[420px] rounded-3xl border border-white/15 bg-[#0b0b0b] p-5 text-white">
        <h2 id="leave-title" className="text-[21px] font-black leading-tight">{title}</h2>
        <p className="mt-2 text-[16px] leading-snug text-white/75">{body}</p>
        <button type="button" data-leave-stay onClick={onStay} className={`${primaryBtn} mt-4`}>{stay}</button>
        <button type="button" data-leave-go onClick={onGo} className={`${quietBtn} mt-2`}>{go}</button>
      </div>
    </div>
  );
}

/** The camera check. `tech`: the numbers, where the QA hooks are allowed; everyone else gets plain words (S-5). */
function DeviceCheck({ status, poseHz, tech, onContinue, onLite, autoContinue, okSinceRef }: {
  status: PoseStatus | null; poseHz: number; tech: boolean; onContinue: () => void; onLite: () => void;
  autoContinue?: () => void; okSinceRef?: React.MutableRefObject<number | null>;
}) {
  const slow = poseHz > 0 && poseHz < MIN_CAMERA_FPS;
  useEffect(() => {
    if (!autoContinue || !okSinceRef || poseHz < DEVICE_AUTO_FPS) { if (okSinceRef) okSinceRef.current = null; return; }
    const now = performance.now();
    if (okSinceRef.current === null) okSinceRef.current = now;
    if (now - okSinceRef.current >= DEVICE_AUTO_MS) autoContinue();
  }, [poseHz, autoContinue, okSinceRef]);
  return (
    <div className="absolute inset-x-3 bottom-3 rounded-2xl border border-white/10 bg-black/75 p-4 backdrop-blur">
      <p className="text-[16px] font-bold uppercase tracking-[0.16em] text-white/50">Camera check</p>
      {tech ? (
        <ul data-device-tech className="mt-2 space-y-1 text-[16px] text-white/85">
          <li>Camera: on{status?.camera ? ` · ${status.camera.width}×${status.camera.height}` : ''}{status?.camera?.frameRate ? ` · ${Math.round(status.camera.frameRate)} fps` : ''}</li>
          <li>Pose model: {status?.model ?? '…'}</li>
          <li className={slow ? 'text-[#FFB020]' : ''}>Pose rate: {poseHz ? `${Math.round(poseHz)} a second` : 'measuring…'}{slow ? ` (the screen needs ${MIN_CAMERA_FPS}; it may read less clearly)` : ''}</li>
        </ul>
      ) : (
        <p data-device-plain className={slow ? 'mt-2 text-[16px] leading-snug text-[#FFB020]' : 'mt-2 text-[16px] leading-snug text-white/85'}>
          {!poseHz ? 'Checking the camera…' : slow ? SLOW_DEVICE_LINE : 'The camera is ready.'}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" data-primary onClick={onContinue} disabled={!poseHz}
          className="inline-flex min-h-12 items-center rounded-full bg-[#00E5FF] px-5 text-[16px] font-black text-black disabled:opacity-40">
          {slow ? 'Continue anyway' : 'Continue'}
        </button>
        {slow && status?.model !== 'lite' ? (
          <button type="button" onClick={onLite} className="inline-flex min-h-12 items-center rounded-full border border-white/20 px-5 text-[16px] font-bold text-white">Use the lighter model</button>
        ) : null}
      </div>
    </div>
  );
}
