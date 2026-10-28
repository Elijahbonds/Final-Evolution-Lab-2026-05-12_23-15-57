'use client';

// ExerciseStage — the exercise library's 3D stage (LIBRARY-ANATOMY, 2026-10-25): the athlete's own avatar doing the
// exercise (the Demo tab) and the same body showing the muscles it works (the Muscles tab).
//
// One stage for both tabs, so switching costs nothing: the body is spawned once, through the door every mode uses
// (CharacterLibrary.spawn on the default hero, role 'player': the account's body and saved look), into a scene stamped
// felModeId 'library' — the clip scope that owns the exercise loops (clipScope.ts, the opt-in 'exercise' suite) and the
// hoops clips the basketball entries borrow. The Muscles tab hides the clothes and colours the skin
// (lib/babylon/library/anatomyLook.ts); the Demo tab gives the athlete back as they dressed.
//
// Phone care (the owner's lag report): loaded only when a tab that needs it is open (next/dynamic, ssr:false, from
// library-demo.tsx — Babylon and the body are megabytes a phone should not pay to read cues); the device pixel ratio is
// capped at 1.5; the render loop stops while the page is hidden or the stage is scrolled out of view; with reduced
// motion on, the camera never moves by itself. The canvas leaves vertical swipes to the page (touch-action: pan-y), so
// the sheet still scrolls on a phone; a sideways drag turns the camera.
//
// DEMO-SPEED (2026-10-27, owner: autoplay, no extra taps, never confusing; first moving frame ≤ 3 s warm). Measured on the
// slow-phone rig (scripts/probes/_library-anatomy.mts speed), the stage now:
//   · decides the device's quality tier the way a full-screen mode on this device would (tierRule deviceTierDecision —
//     the viewport, not the stage's small box) and stamps it on the scene, so on a phone CharacterLibrary loads the scan's
//     phone file (heroBody scanUrlForTier: 3.3 MB, 1K maps, the same 22 bones) and the phone texture cap applies, as in
//     every mode on that phone;
//   · starts fetching that body (lib/library/demoWarm.ts) the moment it mounts, alongside Babylon's download, and loads
//     its modules in parallel instead of one after another;
//   · shows the body on the first frame it is drawn and measured off its bind pose, not on a fixed timer;
//   · is PARKED when it unmounts: the canvas leaves the page with its engine, scene, body, built loops and compiled shaders
//     intact, and the next stage to mount (a route change and back, the next drill, the library sheet) takes it — no
//     download, parse, retarget or shader compile again. One is parked at most, for ten minutes; the page leaving
//     disposes it.
import { useEffect, useRef, useState } from 'react';
import type { AnatomyHandle } from '@/lib/babylon/library/anatomyLook';
import type { DemoProp } from '@/lib/library/demo';
import { unscaledBodyUrl, warmDemoBody, warmedBodyUrl } from '@/lib/library/demoWarm';

export type StageView = 'demo' | 'muscles';
export type StageSide = 'front' | 'back';

export interface ExerciseStageProps {
  view: StageView;
  /** the loop the Demo tab plays (lib/library/demo.ts demoFor); null: the stage stands still */
  clip: string | null;
  /** seconds into `clip` to hold still at (an isometric hold), or null to loop */
  hold?: number | null;
  /** anatomy keys (muscleMap) the Muscles tab colours */
  muscles: { primary: readonly string[]; secondary: readonly string[] };
  side: StageSide;
  onState?: (s: 'loading' | 'ready' | 'failed') => void;
}

type StageState = 'loading' | 'ready' | 'failed';

/** A built stage: its own canvas, engine, scene and body. Bound to one mounted ExerciseStage at a time. */
interface StageHost {
  readonly canvas: HTMLCanvasElement;
  /** Show it in `box` for this mount: the props to show, and where its state goes. */
  bind(box: HTMLElement, p: ExerciseStageProps, onState: (s: StageState) => void): void;
  setView(p: ExerciseStageProps): void;
  /** Stop drawing and take the canvas out of the page; everything built stays. */
  unbind(): void;
  /** Still the body this player should see (their saved look has not changed since it was spawned)? */
  fresh(): boolean;
  dispose(): void;
}

const FRONT_ALPHA = Math.PI / 2;   // the body faces +z: a camera on +z sees its front

// DEMO-SPEED: the stage's load, as User Timing marks (`fel-stage:<step>`), in every build — a phone's profile shows where its
// first moving frame went (the rig's speed job reads them)
function mark(k: string): void {
  try { performance.mark(`fel-stage:${k}`); } catch { /* no User Timing */ }
  if (process.env.NODE_ENV === 'development') ((window as unknown as { __FEL_STAGE_T__?: Record<string, number> }).__FEL_STAGE_T__ ??= {})[k] = performance.now();
}

// ── the parking slot (DEMO-SPEED) ──
const PARK_MS = 10 * 60_000;
let parked: { host: StageHost; timer: ReturnType<typeof setTimeout> } | null = null;
let pageHideHooked = false;
function takeParked(): StageHost | null {
  const p = parked;
  if (!p) return null;
  parked = null; clearTimeout(p.timer);
  if (!p.host.fresh()) { p.host.dispose(); return null; }   // the Closet saved a new look since: build it again
  return p.host;
}
function parkHost(host: StageHost): void {
  host.unbind();
  if (parked) { host.dispose(); return; }   // one parked at most: a phone keeps one body, not one per card it scrolled past
  parked = { host, timer: setTimeout(() => { if (parked?.host === host) { parked = null; host.dispose(); } }, PARK_MS) };
  if (!pageHideHooked && typeof window !== 'undefined') {
    pageHideHooked = true;
    window.addEventListener('pagehide', () => { const h = takeParked(); h?.dispose(); });
  }
}

/** Build a stage from nothing: Babylon, the scene, the body (the slow path; a parked stage skips all of it). */
async function buildStage(first: ExerciseStageProps, gone: () => boolean): Promise<StageHost | null> {
  // the body's file starts downloading now, while Babylon's chunks do (demoWarm: the same file the spawn below asks for)
  const body = warmDemoBody();
  let bodyIn = false;
  void body.then(() => { bodyIn = true; });
  const [
    { Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight, Vector3, Color3, Color4, MeshBuilder, StandardMaterial, Mesh },
    { CharacterLibrary }, { DEFAULT_HERO_URL }, { reducedMotion }, { atBindPose, bindPoseDeviationDeg }, { buildAuthoredClip },
    { FLOOR_CLIPS, SIDE_CLIPS, TRAVEL_CLIPS, DEMO_PROPS, PROP_SHAPES }, { deviceTierDecision }, { installPhoneTextureCap }, { cachedIdentity },
  ] = await Promise.all([
    import('@babylonjs/core'),
    import('@/lib/babylon/core/CharacterLibrary'),
    import('@/lib/babylon/core/athleteRoster'),
    import('@/lib/a11y/reducedMotion'),
    import('@/lib/babylon/library/poseGuard'),
    import('@/lib/babylon/anim/authored'),
    import('@/lib/library/demo'),
    import('@/lib/babylon/scene/tierRule'),
    import('@/lib/babylon/scene/phoneTextureCap'),
    import('@/lib/babylon/core/playerIdentity'),
  ]);
  // the Muscles view's module is needed only there: loaded up front when the stage opens on it, otherwise after the first frame
  let anatomyMod: typeof import('@/lib/babylon/library/anatomyLook') | null = null;
  const loadAnatomy = () => import('@/lib/babylon/library/anatomyLook').then((m) => { anatomyMod = m; return m; });
  const anatomyFirst = first.view === 'muscles' ? loadAnatomy() : null;
  if (gone()) return null;
  mark('imported');

  const canvas = document.createElement('canvas');
  canvas.className = 'h-full w-full outline-none';
  canvas.style.touchAction = 'pan-y';
  canvas.setAttribute('data-testid', 'exercise-stage');
  canvas.setAttribute('data-state', 'loading');
  const engine = new Engine(canvas, true, { alpha: true, adaptToDeviceRatio: false, powerPreference: 'low-power', stencil: false, doNotHandleTouchAction: true, preserveDrawingBuffer: process.env.NODE_ENV === 'development' });
  engine.setHardwareScalingLevel(1 / Math.min(1.5, window.devicePixelRatio || 1));
  const scene = new Scene(engine);
  (scene.metadata ??= {}).felModeId = 'library';
  // the tier a mode would get on this device (phone: the scan's phone file, the phone texture cap, the phone skin shading)
  const tier = deviceTierDecision().tier;
  scene.metadata.felTier = tier;
  installPhoneTextureCap(engine, tier);
  // the body's file is in already (a warm visit, or the early fetch beat Babylon): its container starts loading now, before
  // the camera, lights and floor are built — the spawn below picks up the same load (CharacterLibrary's per-scene cache)
  const bodyUrl = warmedBodyUrl();
  if (bodyIn && bodyUrl) void CharacterLibrary.load(scene, unscaledBodyUrl(bodyUrl)).catch(() => undefined);
  scene.clearColor = new Color4(0, 0, 0, 0);
  scene.skipPointerMovePicking = true;
  const cam = new ArcRotateCamera('libraryCam', FRONT_ALPHA - 0.45, 1.36, 3.5, new Vector3(0, 0.92, 0), scene);
  cam.minZ = 0.05;
  cam.lowerRadiusLimit = 2.2; cam.upperRadiusLimit = 5;
  cam.lowerBetaLimit = 0.6; cam.upperBetaLimit = 1.62;
  cam.panningSensibility = 0;
  cam.wheelPrecision = 60;
  cam.attachControl(canvas, true);
  const fill = new HemisphericLight('fill', new Vector3(0, 1, 0), scene); fill.intensity = 0.9; fill.groundColor = new Color3(0.25, 0.25, 0.3);
  const key = new DirectionalLight('key', new Vector3(-0.4, -0.8, -0.5), scene); key.intensity = 1.0; key.diffuse = new Color3(1, 0.96, 0.9);
  // a floor disc, so a squat sits on something and a push-up has a floor to be on
  const floor = MeshBuilder.CreateDisc('libraryFloor', { radius: 1.3, tessellation: 48 }, scene);
  floor.rotation.x = Math.PI / 2; floor.position.y = 0.001; floor.isPickable = false;
  const floorMat = new StandardMaterial('libraryFloorMat', scene);
  floorMat.diffuseColor = new Color3(0.12, 0.13, 0.17); floorMat.specularColor = Color3.Black(); floorMat.alpha = 0.9;
  floor.material = floorMat;

  // the bench a seated or lying loop needs (DEMO_PROPS): plain boxes, one material, hidden unless the clip asks.
  // LIBRARY-ANATOMY-2: every prop's boxes are data (demo.ts PROP_SHAPES), built the first time a loop asks for it
  const propMat = new StandardMaterial('libraryPropMat', scene);
  propMat.diffuseColor = new Color3(0.2, 0.21, 0.26); propMat.specularColor = new Color3(0.05, 0.05, 0.05);
  const props = new Map<string, InstanceType<typeof Mesh>[]>();
  const propMeshes = (k: DemoProp) => {
    let ms = props.get(k);
    if (!ms) {
      ms = PROP_SHAPES[k].map((b, i) => {
        // DEMO-LOOPS: a roller is a cylinder laid across the body (its axis along x)
        const m = b.cyl
          ? MeshBuilder.CreateCylinder(`libraryProp_${k}_${i}`, { height: b.w, diameter: b.h, tessellation: 20 }, scene)
          : MeshBuilder.CreateBox(`libraryProp_${k}_${i}`, { width: b.w, height: b.h, depth: b.d }, scene);
        // (the body's +x is the stage's −x: the spawned root carries the importer's mirror — measured on the live rig)
        m.position.set(-(b.x ?? 0), b.y, b.z); m.rotation.x = b.rx ?? 0; if (b.cyl) m.rotation.z = Math.PI / 2; m.material = propMat; m.isPickable = false;
        return m;
      });
      props.set(k, ms);
    }
    return ms;
  };
  const showProp = (clip: string | null) => { const want = clip ? DEMO_PROPS[clip] : undefined; if (want) propMeshes(want); for (const [k, ms] of props) for (const m of ms) m.setEnabled(k === want); };
  mark('scene');
  // the early fetch has the body in the HTTP cache (or failed: the loader then fetches it itself)
  await body;
  // the player's hoops captures are built the first time a clip that one can replace is played (play() below), not here
  const hero = await CharacterLibrary.spawn(scene, DEFAULT_HERO_URL, { role: 'player', startClip: 'idle_stand', deferHeroCapture: true });
  if (anatomyFirst) await anatomyFirst.catch(() => null);
  if (gone()) { hero.dispose(); scene.dispose(); engine.dispose(); return null; }
  mark('spawned');
  const lookAtSpawn = cachedIdentity();

  const still = reducedMotion();
  let anatomy: AnatomyHandle | null = null;
  let anatomyFailed = false;
  let target = { alpha: cam.alpha, beta: cam.beta, radius: cam.radius, y: 0.92 };
  let userTurned = false;
  let shownClip: string | null | undefined;
  let shownHold: number | null | undefined;
  let shownView: StageView | undefined;
  let shownSide: StageSide | undefined;
  let shownMuscles = '';
  let latest: ExerciseStageProps = first;

  const frame = (p: ExerciseStageProps) => {
    if (p.view === 'muscles') return { alpha: p.side === 'front' ? FRONT_ALPHA : -FRONT_ALPHA, beta: 1.47, radius: 2.5, y: 0.9 };
    if (p.clip && FLOOR_CLIPS.has(p.clip)) return { alpha: 0.3, beta: 1.25, radius: 2.3, y: 0.3 };
    // DEMO-LOOPS: a loop that travels is framed wide enough to keep the body in view the whole way
    const travel = p.clip ? TRAVEL_CLIPS[p.clip] : undefined;
    if (travel === 'forward') return { alpha: 0.12, beta: 1.38, radius: 3.9, y: 0.9 };
    if (travel === 'lateral') return { alpha: FRONT_ALPHA - 0.35, beta: 1.38, radius: 3.6, y: 0.9 };
    if (travel === 'both') return { alpha: FRONT_ALPHA - 0.8, beta: 1.2, radius: 4.2, y: 0.8 };
    if (p.clip && SIDE_CLIPS.has(p.clip)) return { alpha: 0.4, beta: 1.42, radius: 2.6, y: 0.85 };
    const prop = p.clip ? DEMO_PROPS[p.clip] : undefined;
    if (prop === 'bench' || prop === 'incline') return { alpha: 0.45, beta: 1.2, radius: 2.4, y: 0.62 };
    if (prop === 'seat' || prop === 'preacher') return { alpha: FRONT_ALPHA - 0.55, beta: 1.36, radius: 2.35, y: 0.7 };
    // LIBRARY-ANATOMY-2: hanging from the bar, the body is high; on the dip bars, high too; on a box, a step up; lying on
    // a bench or a pad, low and from the side
    if (prop === 'pullbar') return { alpha: FRONT_ALPHA - 0.5, beta: 1.5, radius: 3.6, y: 1.5 };
    if (prop === 'dipbars') return { alpha: FRONT_ALPHA - 0.7, beta: 1.45, radius: 3.0, y: 1.15 };
    if (prop === 'wall') return { alpha: 0.05, beta: 1.36, radius: 3.0, y: 0.9 };
    if (prop === 'box' || prop === 'boxside' || prop === 'stepbox' || prop === 'boxback' || prop === 'rearbench' || prop === 'wallback') return { alpha: 0.55, beta: 1.36, radius: 3.3, y: 1.0 };
    if (prop === 'calfstep') return { alpha: 0.6, beta: 1.4, radius: 2.7, y: 0.85 };
    if (prop) return { alpha: 0.45, beta: 1.22, radius: 2.6, y: 0.6 };
    // sitting on the floor (the Z press): low, the arms going overhead
    // DEMO-LOOPS: the overhead squat's hands are high; the box jump lands high
    if (p.clip === 'ex_overhead_squat') return { alpha: FRONT_ALPHA - 0.5, beta: 1.42, radius: 3.0, y: 1.0 };
    if (p.clip?.startsWith('ex_z_press')) return { alpha: FRONT_ALPHA - 0.6, beta: 1.32, radius: 2.5, y: 0.55 };
    return { alpha: FRONT_ALPHA - 0.5, beta: 1.4, radius: 2.55, y: 0.86 };
  };
  const play = (clip: string, hold: number | null | undefined) => {
    // DEMO-SPEED: a capture replaces only court and fight clips (opponentMotion OPPONENT_VARIANTS) — never the idle or an
    // ex_* loop — so they are built the first time anything else plays, exactly as spawn would have (same wrapper, outermost)
    if (clip !== 'idle_stand' && !clip.startsWith('ex_')) hero.installHeroCapture?.();
    // the library scope is lazy: an entry's loop is built the first time it is asked for (clipScope `lazy`)
    buildAuthoredClip(hero.animator, scene, hero.skeleton, clip);
    const g = hero.animator.play(clip, { loop: true, fadeSec: 0.25, restart: true });
    if (g && hold != null) {
      // an isometric hold: the rep's hardest point, held (CharacterAnimator keeps the group; pause it on that frame)
      g.goToFrame(g.from + hold * 30);
      g.pause();
    }
    // a body doing an exercise is busy: no idle breathing or weight shift layered over the loop
    hero.secondary?.setActivity(() => (clip === 'idle_stand' ? 0 : 1));
  };
  const setView = (p: ExerciseStageProps) => {
    latest = p;
    const musclesKey = `${p.muscles.primary.join(',')}|${p.muscles.secondary.join(',')}`;
    if (p.view === 'muscles' && !anatomyMod && !anatomyFailed) {
      // the Muscles module is still loading: show it when it lands (the body stands in its idle meanwhile)
      void loadAnatomy().then(() => { if (latest === p) setView(p); }, () => { anatomyFailed = true; });
    }
    if (p.view !== shownView || (p.view === 'demo' && (p.clip !== shownClip || p.hold !== shownHold))) {
      if (p.view === 'muscles') {
        play('idle_stand', null);
        showProp(null);
        if (!anatomy && !anatomyFailed && anatomyMod) {
          const t0 = performance.now();
          anatomy = anatomyMod.applyAnatomy(scene, hero, p.muscles); anatomyFailed = !anatomy; shownMuscles = musclesKey;
          if (process.env.NODE_ENV === 'development') (window as unknown as { __FEL_ANATOMY_MS__?: number }).__FEL_ANATOMY_MS__ = performance.now() - t0;
        }
      } else {
        anatomy?.restore(); anatomy = null;
        play(p.clip ?? 'idle_stand', p.clip ? p.hold : null);
        showProp(p.clip);
      }
    }
    if (p.view === 'muscles' && !anatomy && !anatomyFailed && anatomyMod) {
      // the module landed after this view was first shown
      anatomy = anatomyMod.applyAnatomy(scene, hero, p.muscles); anatomyFailed = !anatomy; shownMuscles = musclesKey;
    }
    if (p.view === 'muscles' && anatomy && musclesKey !== shownMuscles) { anatomy.show(p.muscles); shownMuscles = musclesKey; }
    if (p.view !== shownView || p.side !== shownSide || p.clip !== shownClip) { target = frame(p); userTurned = false; }
    shownView = p.view; shownClip = p.clip; shownHold = p.hold; shownSide = p.side;
    canvas.setAttribute('aria-label', p.view === 'muscles' ? 'The muscles this exercise works, on your athlete. Drag sideways to turn.' : 'Your athlete doing this exercise. Drag sideways to turn.');
  };

  // DEMO-SPEED: the first frame drawn (shaders compile here), and the first with every body mesh ready to draw — the body is
  // shown from that frame on, never before it (a canvas faded in before its body is drawn is an empty floor)
  let drawn = false, firstFrame = true;
  let onDrawn: (() => void) | null = null;
  const drawnObs = scene.onAfterRenderObservable.add(() => {
    if (firstFrame) { firstFrame = false; mark('first-frame'); }
    if (!drawn && hero.meshes.every((m) => !m.isEnabled() || !m.isVisible || m.isReady(true))) {
      drawn = true; mark('drawn'); scene.onAfterRenderObservable.remove(drawnObs);
      const f = onDrawn; onDrawn = null;
      if (f) setTimeout(f, 0);   // out of the render it was called from: the check draws a frame of its own
    }
  });

  // T-POSE (owner playtest 2026-10-27): the 3D is shown only once the body is measured OFF its bind pose (poseGuard),
  // and is measured again after every clip change. A body at bind (a clip that did not bind, did not build, or nothing
  // driving the bones) gets the idle once; still at bind, the stage reports 'failed' and the switcher keeps the cue
  // card up. A T-pose is never what the player is left looking at.
  let report: (s: StageState) => void = () => undefined;
  let state: StageState = 'loading';
  const setState = (s: StageState) => { state = s; canvas.setAttribute('data-state', s); report(s); };
  let retried = false;
  let poseTimer: ReturnType<typeof setTimeout> | null = null;
  let bound = false;
  let disposed = false;
  let boundAt = 0;
  const checkPose = () => {
    if (poseTimer) clearTimeout(poseTimer);
    poseTimer = null; onDrawn = null;
    if (disposed || !bound) return;
    // measured on a drawn frame: the first one the player could see (a body whose meshes never report ready is measured
    // anyway after 4 s, as the fixed timer did)
    if (!drawn && performance.now() - boundAt < 4000) { onDrawn = checkPose; poseTimer = setTimeout(checkPose, 250); return; }
    scene.render();
    if (!atBindPose(hero.skeleton)) {
      retried = false;
      if (state !== 'ready') { mark('ready'); setState('ready'); }
      if (!anatomyMod) void loadAnatomy().catch(() => undefined);   // the Muscles tab's module, now the demo moves
      return;
    }
    console.error('[FEL-LIBRARY] the body is at its bind pose', { clip: shownClip, view: shownView, deg: bindPoseDeviationDeg(hero.skeleton) });
    if (!retried) { retried = true; play('idle_stand', null); poseTimer = setTimeout(checkPose, 400); return; }
    setState('failed');
  };
  const recheck = (ms: number) => { if (poseTimer) clearTimeout(poseTimer); onDrawn = null; poseTimer = setTimeout(checkPose, ms); };

  // the camera eases to its framing (a tab, side or clip change) — until the player turns it themselves; with reduced
  // motion it jumps there instead of moving by itself
  scene.onBeforeRenderObservable.add(() => {
    if (userTurned) return;
    const k = still ? 1 : Math.min(1, engine.getDeltaTime() / 180);
    cam.alpha += (target.alpha - cam.alpha) * k; cam.beta += (target.beta - cam.beta) * k; cam.radius += (target.radius - cam.radius) * k;
    cam.target.y += (target.y - cam.target.y) * k;
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
  let uses = 0;

  const unbind = () => {
    bound = false;
    if (poseTimer) clearTimeout(poseTimer);
    poseTimer = null; onDrawn = null;
    report = () => undefined;
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('resize', onResize);
    io?.unobserve(canvas);
    sync();
    canvas.remove();
  };

  return {
    canvas,
    bind(box, p, onState) {
      uses++;
      boundAt = performance.now();
      box.appendChild(canvas);
      engine.resize();
      bound = true;
      report = onState;
      retried = false;
      visible = !document.hidden; onScreen = true;
      document.addEventListener('visibilitychange', onVis);
      window.addEventListener('resize', onResize);
      io?.observe(canvas);
      if (uses > 1) {
        // a parked stage, taken again: it was showing something else, so it is measured again before it is shown
        anatomy?.restore(); anatomy = null;
        shownView = undefined; shownClip = undefined; shownHold = undefined; shownSide = undefined;
        state = 'loading'; canvas.setAttribute('data-state', 'loading');
        setView(p);
        // no swoop from the last stage's framing: the camera starts where this one's framing puts it
        const t = frame(p); cam.alpha = t.alpha; cam.beta = t.beta; cam.radius = t.radius; cam.target.y = t.y; userTurned = false;
        mark('clip');
        sync();
        recheck(60);
      } else {
        setView(p);
        mark('clip');
        sync();
        recheck(0);
      }
      if (process.env.NODE_ENV === 'development') (window as unknown as { __FEL_LIBRARY_STAGE__?: unknown }).__FEL_LIBRARY_STAGE__ = { engine, scene, hero, cam, anatomy: () => anatomy };
    },
    setView(p) {
      const before = `${shownView}|${shownClip}|${shownHold}`;
      setView(p);
      if (`${shownView}|${shownClip}|${shownHold}` !== before) recheck(450);
    },
    fresh: () => !disposed && cachedIdentity() === lookAtSpawn,
    unbind,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (bound) unbind();
      io?.disconnect();
      engine.stopRenderLoop();
      anatomy?.restore();
      hero.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}

export default function ExerciseStage(props: ExerciseStageProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const live = useRef<StageHost | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [state, setState] = useState<StageState>('loading');
  const onState = useRef(props.onState);
  onState.current = props.onState;

  useEffect(() => { onState.current?.(state); }, [state]);

  useEffect(() => {
    let gone = false;
    mark('start');
    (async () => {
      try {
        const host = takeParked() ?? await buildStage(latest.current, () => gone);
        if (!host) return;
        const box = boxRef.current;
        if (gone || !box) { parkHost(host); return; }
        live.current = host;
        host.bind(box, latest.current, (s) => { if (!gone) setState(s); });
      } catch (e) {
        console.error('[FEL-LIBRARY] stage failed', e);
        if (!gone) setState('failed');
      }
    })();
    return () => {
      gone = true;
      const host = live.current;
      live.current = null;
      if (host) parkHost(host);
    };
  }, []);

  useEffect(() => { live.current?.setView(props); });

  return (
    <div className="relative h-full w-full">
      <div ref={boxRef} className="h-full w-full" />
      {state !== 'ready' && (
        <p className="absolute inset-0 flex items-center justify-center text-center text-[12px] text-white/50">
          {state === 'loading' ? 'Loading your athlete…' : 'Couldn’t load 3D on this device.'}
        </p>
      )}
    </div>
  );
}
