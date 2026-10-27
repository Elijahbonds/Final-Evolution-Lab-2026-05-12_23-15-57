'use client';

// The 3D athlete on the profile (PROFILE V2; lane/profile-character, owner 2026-10-27: "Make the profile show your actual
// character, not some stick figure"). It opens by itself — no "See in 3D" tap — once the stage is near the screen and the
// page has painted and gone idle (athlete-stage.tsx decides when). It spawns the body every mode spawns, through the same
// door (CharacterLibrary.spawn on the default hero, role 'player': the account's body and saved look, hair and clothes —
// lib/babylon/core/playerIdentity resolveIdentity), so what shows here is what plays.
//
// The first frame it is sure of (the scene ready, the body measured OFF its bind pose, so never a T-pose) is handed to the
// stage as a picture to keep on the device (lib/profile-v2/athletePoster.ts): the next visit paints that at once.
//
// Phone care (the owner's iPhone lag reports): the heavy steps yield to the page between them, so a tap is never stuck
// behind one long task; the device pixel ratio is capped at 2; the render loop stops while the page is hidden or the stage
// is scrolled off-screen; everything is disposed on unmount. It turns slowly by itself (not with reduced motion on —
// lib/a11y/reducedMotion), a sideways drag turns it, and a vertical swipe still scrolls the page (touch-action: pan-y).
import { useEffect, useRef } from 'react';
import { identityHash, posterCrop, snapshotScaling } from '@/lib/profile-v2/athletePoster';

export interface Athlete3DProps {
  /** the 3D is drawing the athlete; `idHash` is the identity it wears */
  onLive: (idHash: string) => void;
  onFailed: () => void;
  /** asked once, on the first sure frame: should the stage keep a picture of it? */
  wantSnapshot?: (idHash: string) => boolean;
  onSnapshot?: (shot: { blob: Blob; w: number; h: number; idHash: string }) => void;
  /** the canvas's accessible name */
  label: string;
}

const FRONT_ALPHA = Math.PI / 2;   // the body faces +z: a camera on +z sees its front (measured, exercise-stage.tsx)
/** The stage's camera: a three-quarter front view, the whole body in frame (athletePoster.POSTER_VERSION follows it). */
const PROFILE_CAM = { alpha: FRONT_ALPHA - 0.38, beta: 1.42, radius: 2.75, y: 0.9 } as const;
/** The slow turn, in radians a second (≈ one turn in 18 s, the speed the profile's 3D always turned at). */
const TURN_RAD_S = 0.35;

const yieldToPage = () => new Promise<void>((r) => setTimeout(r, 0));
const toBlob = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob | null>((r) => { try { c.toBlob((b) => r(b), type, q); } catch { r(null); } });

export default function Athlete3D(props: Athlete3DProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cb = useRef(props);
  cb.current = props;
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      try {
        const { Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight, Vector3, Color4, Color3 } = await import('@babylonjs/core');
        await yieldToPage();
        const [{ CharacterLibrary }, { DEFAULT_HERO_URL }, { resolveIdentity }, { atBindPose }, { reducedMotion }] = await Promise.all([
          import('@/lib/babylon/core/CharacterLibrary'),
          import('@/lib/babylon/core/athleteRoster'),
          import('@/lib/babylon/core/playerIdentity'),
          import('@/lib/babylon/library/poseGuard'),
          import('@/lib/a11y/reducedMotion'),
        ]);
        await yieldToPage();
        const canvas = ref.current;
        if (disposed || !canvas) return;
        const engine = new Engine(canvas, true, { alpha: true, adaptToDeviceRatio: false, powerPreference: 'low-power', stencil: false, doNotHandleTouchAction: true, loseContextOnDispose: true });
        const liveScale = 1 / Math.min(2, window.devicePixelRatio || 1);
        engine.setHardwareScalingLevel(liveScale);
        const scene = new Scene(engine);
        scene.clearColor = new Color4(0, 0, 0, 0);
        scene.skipPointerMovePicking = true;
        const cam = new ArcRotateCamera('profileCam', PROFILE_CAM.alpha, PROFILE_CAM.beta, PROFILE_CAM.radius, new Vector3(0, PROFILE_CAM.y, 0), scene);
        cam.minZ = 0.05;
        cam.lowerRadiusLimit = 2.2; cam.upperRadiusLimit = 3.6;
        cam.lowerBetaLimit = 1.2; cam.upperBetaLimit = 1.6;
        cam.panningSensibility = 0;
        cam.wheelPrecision = 60;
        cam.attachControl(canvas, true);
        const fill = new HemisphericLight('fill', new Vector3(0, 1, 0), scene); fill.intensity = 0.9; fill.groundColor = new Color3(0.25, 0.25, 0.3);
        const key = new DirectionalLight('key', new Vector3(-0.4, -0.8, -0.5), scene); key.intensity = 1.05; key.diffuse = new Color3(1, 0.95, 0.88);
        await yieldToPage();
        if (disposed) { scene.dispose(); engine.dispose(); return; }

        const hero = await CharacterLibrary.spawn(scene, DEFAULT_HERO_URL, { role: 'player', startClip: 'idle_stand' });
        const dispose = () => { engine.stopRenderLoop(); hero.dispose(); scene.dispose(); engine.dispose(); };
        if (disposed) { dispose(); return; }
        await yieldToPage();
        await scene.whenReadyAsync();
        if (disposed) { dispose(); return; }

        // T-POSE guard (owner playtest 2026-10-27): the athlete is shown only once measured off its bind pose; one retry
        // with the idle, then the stage keeps its silhouette (or the kept picture)
        scene.render();
        if (atBindPose(hero.skeleton)) {
          hero.animator.play('idle_stand', { loop: true, restart: true });
          await new Promise((r) => setTimeout(r, 400));
          if (disposed) { dispose(); return; }
          scene.render();
          if (atBindPose(hero.skeleton)) { console.error('[FEL-PROFILE] the athlete is at its bind pose'); dispose(); cb.current.onFailed(); return; }
        }
        const id = await resolveIdentity().catch(() => null);   // the one the spawn wore (cached: no second request)
        const idHash = identityHash(id);
        if (disposed) { dispose(); return; }

        // THE PICTURE (athletePoster.ts): this frame, the camera at its start, a 2:3 column at up to 400×600. Drawn in the
        // same task as the render (the WebGL buffer is still there before the page composites), so no preserveDrawingBuffer.
        let shot: HTMLCanvasElement | null = null;
        let shotSize = { w: 0, h: 0 };
        if (cb.current.wantSnapshot?.(idHash)) {
          try {
            const s = snapshotScaling(canvas.clientHeight, liveScale);
            if (s !== liveScale) engine.setHardwareScalingLevel(s);
            scene.render();
            const crop = posterCrop(engine.getRenderWidth(), engine.getRenderHeight());
            const c = document.createElement('canvas');
            c.width = crop.w; c.height = crop.h;
            c.getContext('2d')?.drawImage(canvas, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.w, crop.h);
            shot = c; shotSize = { w: crop.w, h: crop.h };
          } catch { shot = null; }
          if (engine.getHardwareScalingLevel() !== liveScale) engine.setHardwareScalingLevel(liveScale);
        }

        // the slow turn: Babylon's own idle rotation, which pauses while a finger turns the athlete and picks up after
        if (!reducedMotion()) {
          cam.useAutoRotationBehavior = true;
          const turn = cam.autoRotationBehavior;
          if (turn) { turn.idleRotationSpeed = TURN_RAD_S; turn.idleRotationWaitTime = 2500; turn.idleRotationSpinupTime = 1200; turn.zoomStopsAnimation = false; }
        }

        let visible = !document.hidden, onScreen = true, running = false;
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
        cleanup = () => {
          document.removeEventListener('visibilitychange', onVis);
          window.removeEventListener('resize', onResize);
          io?.disconnect();
          dispose();
        };
        cb.current.onLive(idHash);

        if (shot) {
          // webp where the browser encodes it; Safari answers a PNG for the same call, which keeps the transparency too
          const blob = await toBlob(shot, 'image/webp', 0.86);
          if (blob && blob.size > 0 && !disposed) cb.current.onSnapshot?.({ blob, ...shotSize, idHash });
        }
      } catch (e) {
        console.error('[FEL-PROFILE] athlete 3D failed', e);
        if (!disposed) cb.current.onFailed();
      }
    })();
    return () => { disposed = true; cleanup?.(); };
  }, []);
  return (
    <canvas ref={ref} role="img" aria-label={props.label} data-testid="athlete-3d"
      className="h-full w-full outline-none" style={{ touchAction: 'pan-y' }} />
  );
}
