'use client';

// MotionStage — EDU-05 motion lessons, phase B (2026-11-10): a recorded movement, replayed on the student's own athlete.
//
// RIG-ADJACENT, and a new CONSUMER only: the body is spawned through the door every mode uses (CharacterLibrary.spawn on
// the default hero, role 'player': the account's body and saved look, GATE 0 run by the loader on the container), the
// lesson's pose keys are fitted to that body by buildPoseClip UNCHANGED (lib/babylon/anim/poseClip.ts — the same builder
// the dunk captures and the exercise loops go through), and the clip is played by the body's own CharacterAnimator. No
// rig, bone, solver or clip file is edited. The scene is stamped felModeId 'library', the exercise library's scope, and a
// lesson's clips are named `ex_ml_*`, so the scope's own rule (clipScope.ts: the 'exercise' suite) lets them play there.
//
// What it plays is decided outside 3D (lib/motion-lesson/playback.ts): the whole lesson or one phrase, mirrored or not,
// with the short return to the first pose that makes a recording loop. A built clip is kept until the stage goes, so
// going back to a phrase costs nothing.
//
// Phone care, as the library's stage (components/library/exercise-stage.tsx, read not edited): loaded only when a player
// mounts (next/dynamic, ssr:false); the device's own quality tier, so a phone gets the phone body file and the texture
// cap; the pixel ratio capped at 1.5; the loop stops while the page is hidden or the stage is off screen; reduced motion:
// the camera never moves by itself; the canvas leaves vertical swipes to the page (touch-action: pan-y). A parked library
// stage is released first, so a phone never holds two bodies. The body is shown only once it is drawn and measured OFF
// its bind pose (lib/babylon/library/poseGuard.ts): a T-pose is never what a student is left looking at.
import { useEffect, useRef, useState } from 'react';
import type { PoseKey } from '@/lib/babylon/anim/poseClip';
import { unscaledBodyUrl, warmDemoBody, warmedBodyUrl } from '@/lib/library/demoWarm';
import { releaseParkedStage } from '@/lib/babylon/core/parkedStage';
import { CLIP_FPS, askKey, clipKeys, framingOf, type ClipAsk } from '@/lib/motion-lesson/playback';

export type MotionStageState = 'loading' | 'ready' | 'failed';

export interface MotionStageProps {
  /** Changes when the lesson does: the stage forgets the last lesson's clips. */
  lessonId: string;
  keys: readonly PoseKey[];
  /** What to loop: the whole lesson or a phrase, mirrored or not. */
  ask: ClipAsk;
  /** 1 = as recorded. */
  speed: number;
  playing: boolean;
  onState?: (s: MotionStageState) => void;
  /** About ten times a second while it plays: seconds into the LESSON, and whether the body is on its way back to the
   *  clip's first pose (the loop's return, not part of the recording). */
  onTime?: (sec: number, returning: boolean) => void;
}

interface Host {
  bind(box: HTMLElement, p: MotionStageProps, onState: (s: MotionStageState) => void): void;
  show(p: MotionStageProps): void;
  dispose(): void;
}

const FRONT_ALPHA = Math.PI / 2;   // the body faces +z: a camera on +z sees its front
let clipSerial = 0;

async function buildStage(gone: () => boolean): Promise<Host | null> {
  releaseParkedStage();
  const body = warmDemoBody();
  let bodyIn = false;
  void body.then(() => { bodyIn = true; });
  const [
    { Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight, Vector3, Color3, Color4, MeshBuilder, StandardMaterial },
    { CharacterLibrary }, { DEFAULT_HERO_URL }, { reducedMotion }, { atBindPose, bindPoseDeviationDeg }, { buildPoseClip },
    { deviceTierDecision }, { installPhoneTextureCap },
  ] = await Promise.all([
    import('@babylonjs/core'),
    import('@/lib/babylon/core/CharacterLibrary'),
    import('@/lib/babylon/core/athleteRoster'),
    import('@/lib/a11y/reducedMotion'),
    import('@/lib/babylon/library/poseGuard'),
    import('@/lib/babylon/anim/poseClip'),
    import('@/lib/babylon/scene/tierRule'),
    import('@/lib/babylon/scene/phoneTextureCap'),
  ]);
  if (gone()) return null;

  const canvas = document.createElement('canvas');
  canvas.className = 'h-full w-full outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fel-cyan';
  canvas.style.touchAction = 'pan-y';
  canvas.setAttribute('data-testid', 'motion-stage');
  canvas.setAttribute('data-state', 'loading');
  canvas.setAttribute('aria-label', 'Your athlete doing this movement. Drag sideways to turn.');
  const engine = new Engine(canvas, true, { alpha: true, adaptToDeviceRatio: false, powerPreference: 'low-power', stencil: false, doNotHandleTouchAction: true, preserveDrawingBuffer: process.env.NODE_ENV === 'development' });
  engine.setHardwareScalingLevel(1 / Math.min(1.5, window.devicePixelRatio || 1));
  // Babylon gives its canvas tabindex 1, which pulls it ahead of the whole page in the tab order (the rig's audit: WCAG
  // 2.4.3, serious). 0 keeps it a keyboard stop in its place: the arrow keys turn the camera, and it shows a focus ring.
  engine.canvasTabIndex = 0;
  const scene = new Scene(engine);
  (scene.metadata ??= {}).felModeId = 'library';
  const tier = deviceTierDecision().tier;
  scene.metadata.felTier = tier;
  installPhoneTextureCap(engine, tier);
  const bodyUrl = warmedBodyUrl();
  if (bodyIn && bodyUrl) void CharacterLibrary.load(scene, unscaledBodyUrl(bodyUrl)).catch(() => undefined);
  scene.clearColor = new Color4(0, 0, 0, 0);
  scene.skipPointerMovePicking = true;
  const cam = new ArcRotateCamera('motionCam', FRONT_ALPHA - 0.5, 1.4, 2.55, new Vector3(0, 0.9, 0), scene);
  cam.minZ = 0.05;
  cam.lowerRadiusLimit = 2.2; cam.upperRadiusLimit = 6.5;
  cam.lowerBetaLimit = 0.6; cam.upperBetaLimit = 1.62;
  cam.panningSensibility = 0;
  cam.wheelPrecision = 60;
  cam.attachControl(canvas, true);
  canvas.tabIndex = 0;
  const fill = new HemisphericLight('fill', new Vector3(0, 1, 0), scene); fill.intensity = 0.9; fill.groundColor = new Color3(0.25, 0.25, 0.3);
  const key = new DirectionalLight('key', new Vector3(-0.4, -0.8, -0.5), scene); key.intensity = 1.0; key.diffuse = new Color3(1, 0.96, 0.9);
  const floor = MeshBuilder.CreateDisc('motionFloor', { radius: 1.3, tessellation: 48 }, scene);
  floor.rotation.x = Math.PI / 2; floor.position.y = 0.001; floor.isPickable = false;
  const floorMat = new StandardMaterial('motionFloorMat', scene);
  floorMat.diffuseColor = new Color3(0.12, 0.13, 0.17); floorMat.specularColor = Color3.Black(); floorMat.alpha = 0.9;
  floor.material = floorMat;

  await body;
  const hero = await CharacterLibrary.spawn(scene, DEFAULT_HERO_URL, { role: 'player', startClip: 'idle_stand', deferHeroCapture: true });
  if (gone()) { hero.dispose(); scene.dispose(); engine.dispose(); return null; }

  const still = reducedMotion();
  let target = { alpha: cam.alpha, beta: cam.beta, radius: cam.radius, y: 0.9 };
  let userTurned = false;
  let latest: MotionStageProps | null = null;
  let shownLesson: string | null = null;
  let shownAsk = '';
  let shownSpeed = 1;
  let shownPlaying = true;
  /** lesson + askKey → the built clip's name and its seconds of movement. Kept until the stage goes (the animator has no
   *  way to forget a clip, and a preview's lessons are a handful of short clips). */
  const clips = new Map<string, { name: string; movement: number }>();
  let current: { name: string; movement: number; from: number } | null = null;

  const clipFor = (p: MotionStageProps): { name: string; movement: number } | null => {
    const k = `${p.lessonId}|${askKey(p.ask)}`;
    const had = clips.get(k);
    if (had) return had;
    const c = clipKeys(p.keys, p.ask);
    if (!c) return null;
    const name = `ex_ml_${++clipSerial}`;
    // a capture: dense keys with the camera's jitter — the joint-space cubic, one [1 2 1] pass first (as the dunk captures)
    const g = buildPoseClip(scene, hero.skeleton, name, c.total, c.keys, { smooth: true, prefilter: 1 });
    if (!g) return null;
    hero.animator.register(g);
    const made = { name, movement: c.movement };
    clips.set(k, made);
    return made;
  };
  const show = (p: MotionStageProps) => {
    latest = p;
    if (p.lessonId !== shownLesson) {
      shownLesson = p.lessonId; shownAsk = ''; current = null;
      const f = framingOf(p.keys);
      target = { alpha: FRONT_ALPHA - 0.5, beta: 1.4, radius: f.radius, y: f.targetY };
      userTurned = false;
    }
    const k = `${p.lessonId}|${askKey(p.ask)}`;
    if (k !== shownAsk) {
      const c = clipFor(p);
      if (c) {
        const g = hero.animator.play(c.name, { loop: true, fadeSec: 0.25, restart: true, speedRatio: p.speed });
        current = g ? { ...c, from: p.ask.from } : null;
        hero.secondary?.setActivity(() => 1);   // a body doing a movement is busy: no idle breathing layered over it
        shownPlaying = true; shownSpeed = p.speed;
      }
      shownAsk = k;
      recheck(450);
    }
    if (p.playing !== shownPlaying && current) {
      const g = scene.getAnimationGroupByName(current.name);
      if (g) { if (p.playing) g.play(true); else g.pause(); }
      shownPlaying = p.playing;
    }
    // a speed change on the clip that is playing keeps its place in the loop (the animator's own setSpeed: no restart, so
    // no fade through the rest pose); while paused it waits for the resume
    if (p.speed !== shownSpeed && current && shownPlaying) {
      hero.animator.setSpeed(current.name, p.speed);
      shownSpeed = p.speed;
    }
  };

  // the body is shown from the first frame every mesh of it is ready to draw, never before (an empty floor)
  let drawn = false;
  let onDrawn: (() => void) | null = null;
  const drawnObs = scene.onAfterRenderObservable.add(() => {
    if (!drawn && hero.meshes.every((m) => !m.isEnabled() || !m.isVisible || m.isReady(true))) {
      drawn = true; scene.onAfterRenderObservable.remove(drawnObs);
      const f = onDrawn; onDrawn = null;
      if (f) setTimeout(f, 0);
    }
  });

  let report: (s: MotionStageState) => void = () => undefined;
  let state: MotionStageState = 'loading';
  const setState = (s: MotionStageState) => { state = s; canvas.setAttribute('data-state', s); report(s); };
  let retried = false;
  let poseTimer: ReturnType<typeof setTimeout> | null = null;
  let bound = false, disposed = false, boundAt = 0;
  const checkPose = () => {
    if (poseTimer) clearTimeout(poseTimer);
    poseTimer = null; onDrawn = null;
    if (disposed || !bound) return;
    if (!drawn && performance.now() - boundAt < 4000) { onDrawn = checkPose; poseTimer = setTimeout(checkPose, 250); return; }
    scene.render();
    if (!atBindPose(hero.skeleton)) { retried = false; if (state !== 'ready') setState('ready'); return; }
    console.error('[FEL-MOTION-LESSON] the body is at its bind pose', { clip: current?.name, deg: bindPoseDeviationDeg(hero.skeleton) });
    if (!retried) { retried = true; hero.animator.play('idle_stand', { loop: true }); current = null; shownAsk = ''; poseTimer = setTimeout(checkPose, 400); return; }
    setState('failed');
  };
  function recheck(ms: number) { if (poseTimer) clearTimeout(poseTimer); onDrawn = null; poseTimer = setTimeout(checkPose, ms); }

  // the camera eases to the lesson's framing until the student turns it; with reduced motion it jumps there instead
  let sinceTime = 0;
  scene.onBeforeRenderObservable.add(() => {
    const dt = engine.getDeltaTime();
    if (!userTurned) {
      const k = still ? 1 : Math.min(1, dt / 180);
      cam.alpha += (target.alpha - cam.alpha) * k; cam.beta += (target.beta - cam.beta) * k; cam.radius += (target.radius - cam.radius) * k;
      cam.target.y += (target.y - cam.target.y) * k;
    }
    sinceTime += dt;
    if (sinceTime >= 100 && current && latest?.onTime) {
      sinceTime = 0;
      const g = scene.getAnimationGroupByName(current.name);
      if (g) {
        const sec = Math.max(0, (hero.animator.currentFrame - g.from) / CLIP_FPS);
        latest.onTime(current.from + Math.min(sec, current.movement), sec > current.movement);
      }
    }
  });
  canvas.addEventListener('pointerdown', () => { userTurned = true; }, { passive: true });

  let visible = true, onScreen = true, running = false;
  const sync = () => {
    const want = bound && visible && onScreen;
    if (want && !running) { engine.runRenderLoop(() => scene.render()); running = true; }
    else if (!want && running) { engine.stopRenderLoop(); running = false; }
  };
  const onVis = () => { visible = !document.hidden; sync(); };
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((es) => { onScreen = es.some((e) => e.isIntersecting); sync(); }) : null;
  const onResize = () => engine.resize();

  return {
    bind(box, p, onState) {
      boundAt = performance.now();
      box.appendChild(canvas);
      engine.resize();
      bound = true;
      report = onState;
      visible = !document.hidden; onScreen = true;
      document.addEventListener('visibilitychange', onVis);
      window.addEventListener('resize', onResize);
      io?.observe(canvas);
      show(p);
      // no swoop on the first frame: the camera starts on the lesson's framing
      cam.alpha = target.alpha; cam.beta = target.beta; cam.radius = target.radius; cam.target.y = target.y;
      sync();
      recheck(0);
      // the rig's handle (scripts/probes/motion-lesson/rig.mts): the scene, the body and what is playing — development only
      if (process.env.NODE_ENV === 'development') (window as unknown as { __FEL_MOTION_STAGE__?: unknown }).__FEL_MOTION_STAGE__ = { engine, scene, hero, cam, current: () => current, clips: () => [...clips.entries()] };
    },
    show,
    dispose() {
      if (disposed) return;
      disposed = true; bound = false;
      if (poseTimer) clearTimeout(poseTimer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', onResize);
      io?.disconnect();
      engine.stopRenderLoop();
      canvas.remove();
      hero.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}

export default function MotionStage(props: MotionStageProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const live = useRef<Host | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [state, setState] = useState<MotionStageState>('loading');
  const onState = useRef(props.onState);
  onState.current = props.onState;

  useEffect(() => { onState.current?.(state); }, [state]);

  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const host = await buildStage(() => gone);
        if (!host) return;
        const box = boxRef.current;
        if (gone || !box) { host.dispose(); return; }
        live.current = host;
        host.bind(box, latest.current, (s) => { if (!gone) setState(s); });
      } catch (e) {
        console.error('[FEL-MOTION-LESSON] stage failed', e);
        if (!gone) setState('failed');
      }
    })();
    return () => { gone = true; live.current?.dispose(); live.current = null; };
  }, []);

  useEffect(() => { live.current?.show(latest.current); });

  return <div ref={boxRef} className="h-full w-full" />;
}
