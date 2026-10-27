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
// FITNESS-TPOSE (2026-10-26): a phone gets the phone body (scene.metadata.felTier, as the Closet sets it; without it
// CharacterLibrary loaded the 8.6 MB scan on every phone). A loop that will not build or play is said in the console and
// the stage reports 'failed', so the caller shows its cue card — the body is never left standing in its bind pose.
import { useEffect, useRef, useState } from 'react';
import type { AnatomyHandle } from '@/lib/babylon/library/anatomyLook';

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

interface Live {
  setView(p: ExerciseStageProps): void;
}

const FRONT_ALPHA = Math.PI / 2;   // the body faces +z: a camera on +z sees its front

export default function ExerciseStage(props: ExerciseStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef<Live | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const onState = useRef(props.onState);
  onState.current = props.onState;

  useEffect(() => { onState.current?.(state); }, [state]);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      try {
        const { Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight, Vector3, Color3, Color4, MeshBuilder, StandardMaterial, TransformNode } = await import('@babylonjs/core');
        const { boneNode } = await import('@/lib/babylon/anim/boneLookup');
        const { CharacterLibrary } = await import('@/lib/babylon/core/CharacterLibrary');
        const { DEFAULT_HERO_URL } = await import('@/lib/babylon/core/athleteRoster');
        const { reducedMotion } = await import('@/lib/a11y/reducedMotion');
        const { applyAnatomy } = await import('@/lib/babylon/library/anatomyLook');
        const { buildAuthoredClip } = await import('@/lib/babylon/anim/authored');
        const { FLOOR_CLIPS, SIDE_CLIPS, DEMO_PROPS, DEMO_ARROWS } = await import('@/lib/library/demo');
        const { fitCanvas } = await import('@/lib/babylon/core/canvasFit');
        const { detectQualityTier } = await import('@/lib/babylon/scene/QualityTier');
        const canvas = canvasRef.current;
        if (disposed || !canvas) return;
        const mark = (k: string) => { if (process.env.NODE_ENV === 'development') ((window as unknown as { __FEL_STAGE_T__?: Record<string, number> }).__FEL_STAGE_T__ ??= {})[k] = performance.now(); };
        mark('imported');

        const engine = new Engine(canvas, true, { alpha: true, adaptToDeviceRatio: false, powerPreference: 'low-power', stencil: false, doNotHandleTouchAction: true, preserveDrawingBuffer: process.env.NODE_ENV === 'development' });
        engine.setHardwareScalingLevel(1 / Math.min(1.5, window.devicePixelRatio || 1));
        const scene = new Scene(engine);
        (scene.metadata ??= {}).felModeId = 'library';
        // the tier the body is chosen by (CharacterLibrary heroUrlForTier): a phone gets the phone file
        scene.metadata.felTier = detectQualityTier(canvas, fitCanvas({ cssWidth: canvas.clientWidth || 360, cssHeight: canvas.clientHeight || 270, dpr: window.devicePixelRatio || 1 }));
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

        // the bench a seated or lying loop needs (DEMO_PROPS): plain boxes, one material, hidden unless the clip asks
        const propMat = new StandardMaterial('libraryPropMat', scene);
        propMat.diffuseColor = new Color3(0.2, 0.21, 0.26); propMat.specularColor = new Color3(0.05, 0.05, 0.05);
        const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0) => {
          const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
          m.position.set(x, y, z); m.rotation.x = rx; m.material = propMat; m.isPickable = false; m.setEnabled(false);
          return m;
        };
        const props = {
          seat: [box('benchSeat', 0.34, 0.44, 0.42, 0, 0.22, -0.02)],
          bench: [box('benchFlat', 0.30, 0.44, 1.30, 0, 0.22, -0.52)],
          incline: [box('benchInclineSeat', 0.34, 0.44, 0.42, 0, 0.22, 0.02), box('benchInclineBack', 0.34, 0.08, 0.95, 0, 0.79, -0.43, -Math.PI / 4)],
        } as const;
        const showProp = (clip: string | null) => { const want = clip ? DEMO_PROPS[clip] : undefined; for (const [k, ms] of Object.entries(props)) for (const m of ms) m.setEnabled(k === want); };

        const hero = await CharacterLibrary.spawn(scene, DEFAULT_HERO_URL, { role: 'player', startClip: 'idle_stand' });
        if (disposed) { hero.dispose(); scene.dispose(); engine.dispose(); return; }
        mark('spawned');

        // the way a ball-sport loop travels (demo.ts DEMO_ARROWS), flat on the floor in the FEL volt: the loop stays on its
        // spot, so the arrow is the drive, the closeout, the pass. Laid out in the athlete's own frame (x to their right, z
        // ahead), read off the hips once at spawn. FITNESS-TPOSE batchC1 (2026-10-26)
        const arrowMat = new StandardMaterial('libraryArrowMat', scene);
        arrowMat.emissiveColor = Color3.FromHexString('#FFE600'); arrowMat.diffuseColor = Color3.Black(); arrowMat.specularColor = Color3.Black(); arrowMat.disableLighting = true;
        const hipL = boneNode(hero.skeleton, 'LeftUpLeg'), hipR = boneNode(hero.skeleton, 'RightUpLeg');
        hipL?.computeWorldMatrix(true); hipR?.computeWorldMatrix(true);
        const across = hipL && hipR ? hipR.getAbsolutePosition().subtract(hipL.getAbsolutePosition()) : new Vector3(1, 0, 0);
        const centre = hipL && hipR ? hipR.getAbsolutePosition().add(hipL.getAbsolutePosition()).scale(0.5) : Vector3.Zero();
        across.y = 0; if (across.lengthSquared() < 1e-6) across.set(1, 0, 0); across.normalize();
        const ahead = new Vector3(across.z, 0, -across.x);
        let arrows: InstanceType<typeof TransformNode>[] = [];
        const showArrows = (clip: string | null) => {
          for (const a of arrows) a.dispose();
          arrows = [];
          (clip ? DEMO_ARROWS[clip] ?? [] : []).forEach((a, i) => {
            const len = a.len ?? 0.4;
            const d = across.scale(a.dx).addInPlace(ahead.scale(a.dz)).normalize();
            const node = new TransformNode(`libraryArrow${i}`, scene);
            node.position = across.scale(a.x).addInPlace(ahead.scale(a.z)).addInPlace(new Vector3(centre.x, 0, centre.z));
            node.position.y = 0.006;
            node.rotation.y = Math.atan2(-d.z, d.x);
            const shaft = MeshBuilder.CreateBox(`libraryArrowShaft${i}`, { width: len, height: 0.004, depth: 0.04 }, scene);
            shaft.position.x = len / 2;
            const head = MeshBuilder.CreateDisc(`libraryArrowHead${i}`, { radius: 0.08, tessellation: 3, sideOrientation: 2 }, scene);
            head.rotation.x = Math.PI / 2; head.position.x = len;
            for (const m of [shaft, head]) { m.parent = node; m.material = arrowMat; m.isPickable = false; }
            arrows.push(node);
          });
        };


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

        const frame = (p: ExerciseStageProps) => {
          if (p.view === 'muscles') return { alpha: p.side === 'front' ? FRONT_ALPHA : -FRONT_ALPHA, beta: 1.47, radius: 2.5, y: 0.9 };
          if (p.clip && FLOOR_CLIPS.has(p.clip)) return { alpha: 0.3, beta: 1.25, radius: 2.3, y: 0.3 };
          if (p.clip && SIDE_CLIPS.has(p.clip)) return { alpha: 0.4, beta: 1.42, radius: 2.6, y: 0.85 };
          const prop = p.clip ? DEMO_PROPS[p.clip] : undefined;
          if (prop === 'bench' || prop === 'incline') return { alpha: 0.45, beta: 1.2, radius: 2.4, y: 0.62 };
          if (prop === 'seat') return { alpha: FRONT_ALPHA - 0.55, beta: 1.36, radius: 2.35, y: 0.7 };
          return { alpha: FRONT_ALPHA - 0.5, beta: 1.4, radius: 2.55, y: 0.86 };
        };
        let loopFailed = false;
        const play = (clip: string, hold: number | null | undefined): boolean => {
          // the library scope is lazy: an entry's loop is built the first time it is asked for (clipScope `lazy`)
          const built = buildAuthoredClip(hero.animator, scene, hero.skeleton, clip);
          const g = hero.animator.play(clip, { loop: true, fadeSec: 0.25, restart: true });
          if (!built || !g) {
            console.warn('[FEL-LIBRARY] no loop', clip, { built, played: !!g });
            return false;
          }
          if (g && hold != null) {
            // an isometric hold: the rep's hardest point, held (CharacterAnimator keeps the group; pause it on that frame)
            g.goToFrame(g.from + hold * 30);
            g.pause();
          }
          // a body doing an exercise is busy: no idle breathing or weight shift layered over the loop
          hero.secondary?.setActivity(() => (clip === 'idle_stand' ? 0 : 1));
          return true;
        };
        const setView = (p: ExerciseStageProps) => {
          const musclesKey = `${p.muscles.primary.join(',')}|${p.muscles.secondary.join(',')}`;
          if (p.view !== shownView || (p.view === 'demo' && (p.clip !== shownClip || p.hold !== shownHold))) {
            if (p.view === 'muscles') {
              play('idle_stand', null);
              showProp(null);
              showArrows(null);
              if (!anatomy && !anatomyFailed) {
                const t0 = performance.now();
                anatomy = applyAnatomy(scene, hero, p.muscles); anatomyFailed = !anatomy; shownMuscles = musclesKey;
                if (process.env.NODE_ENV === 'development') (window as unknown as { __FEL_ANATOMY_MS__?: number }).__FEL_ANATOMY_MS__ = performance.now() - t0;
              }
            } else {
              anatomy?.restore(); anatomy = null;
              loopFailed = !play(p.clip ?? 'idle_stand', p.clip ? p.hold : null);
              showProp(p.clip);
              showArrows(p.clip);
              if (ready) setState(loopFailed ? 'failed' : 'ready');
            }
          }
          if (p.view === 'muscles' && anatomy && musclesKey !== shownMuscles) { anatomy.show(p.muscles); shownMuscles = musclesKey; }
          if (p.view !== shownView || p.side !== shownSide || p.clip !== shownClip) { target = frame(p); userTurned = false; }
          shownView = p.view; shownClip = p.clip; shownHold = p.hold; shownSide = p.side;
        };
        let ready = false;
        live.current = { setView };
        setView(latest.current);
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
          const want = visible && onScreen;
          if (want && !running) { engine.runRenderLoop(() => scene.render()); running = true; }
          else if (!want && running) { engine.stopRenderLoop(); running = false; }
        };
        const onVis = () => { visible = !document.hidden; sync(); };
        const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((es) => { onScreen = es.some((e) => e.isIntersecting); sync(); }) : null;
        io?.observe(canvas);
        const onResize = () => engine.resize();
        document.addEventListener('visibilitychange', onVis);
        window.addEventListener('resize', onResize);
        sync();
        ready = true;
        setState(loopFailed ? 'failed' : 'ready');
        if (process.env.NODE_ENV === 'development') (window as unknown as { __FEL_LIBRARY_STAGE__?: unknown }).__FEL_LIBRARY_STAGE__ = { engine, scene, hero, cam, anatomy: () => anatomy };
        cleanup = () => {
          document.removeEventListener('visibilitychange', onVis);
          window.removeEventListener('resize', onResize);
          io?.disconnect();
          engine.stopRenderLoop();
          anatomy?.restore();
          hero.dispose();
          scene.dispose();
          engine.dispose();
          live.current = null;
        };
      } catch (e) {
        console.error('[FEL-LIBRARY] stage failed', e);
        if (!disposed) setState('failed');
      }
    })();
    return () => { disposed = true; cleanup?.(); };
  }, []);

  useEffect(() => { live.current?.setView(props); });

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full outline-none" style={{ touchAction: 'pan-y', visibility: state === 'failed' ? 'hidden' : undefined }} aria-label={props.view === 'muscles' ? 'The muscles this exercise works, on your athlete. Drag sideways to turn.' : 'Your athlete doing this exercise. Drag sideways to turn.'} data-testid="exercise-stage" data-state={state} />
      {state !== 'ready' && (
        <p className="absolute inset-0 flex items-center justify-center text-center text-[12px] text-white/50">
          {state === 'loading' ? 'Loading your athlete…' : 'Couldn’t load 3D on this device.'}
        </p>
      )}
    </div>
  );
}
