'use client';

// The 3D athlete on the profile (PROFILE V2). Loaded ONLY when the player asks ("See in 3D"): the Babylon engine, the
// hero GLB and its skins are megabytes a phone should not pay to open a profile. It spawns the body every mode spawns,
// through the same door (CharacterLibrary.spawn on the default hero, role 'player': the account's body and saved look,
// lib/babylon/core/playerIdentity resolveIdentity), so what shows here is what plays.
//
// Phone care: the device pixel ratio is capped at 2, the loop stops while the page is hidden, and with reduced motion
// on (lib/a11y/reducedMotion) it does not turn by itself — a drag still turns it.
import { useEffect, useRef, useState } from 'react';

export default function Athlete3D({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      try {
        const { Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight, Vector3, Color4, Color3 } = await import('@babylonjs/core');
        const { CharacterLibrary } = await import('@/lib/babylon/core/CharacterLibrary');
        const { DEFAULT_HERO_URL } = await import('@/lib/babylon/core/athleteRoster');
        const { reducedMotion } = await import('@/lib/a11y/reducedMotion');
        const canvas = ref.current;
        if (disposed || !canvas) return;
        const engine = new Engine(canvas, false, { alpha: true, adaptToDeviceRatio: false, powerPreference: 'low-power' });
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        engine.setHardwareScalingLevel(1 / dpr);
        const scene = new Scene(engine);
        scene.clearColor = new Color4(0, 0, 0, 0);
        const cam = new ArcRotateCamera('profileCam', -Math.PI / 2, 1.25, 3.3, new Vector3(0, 0.95, 0), scene);
        cam.attachControl(canvas, true);
        cam.lowerRadiusLimit = 2.2; cam.upperRadiusLimit = 4.5;
        cam.lowerBetaLimit = 0.9; cam.upperBetaLimit = 1.6;
        cam.panningSensibility = 0;
        const fill = new HemisphericLight('fill', new Vector3(0, 1, 0), scene); fill.intensity = 0.85;
        const key = new DirectionalLight('key', new Vector3(-0.4, -0.8, 0.5), scene); key.intensity = 1.1; key.diffuse = new Color3(1, 0.94, 0.86);
        const hero = await CharacterLibrary.spawn(scene, DEFAULT_HERO_URL, { role: 'player' });
        if (disposed) { hero.dispose(); engine.dispose(); return; }
        const still = reducedMotion();
        scene.registerBeforeRender(() => { if (!still) hero.root.rotation.y += engine.getDeltaTime() * 0.00035; });
        const run = () => engine.runRenderLoop(() => scene.render());
        const onVis = () => { if (document.hidden) engine.stopRenderLoop(); else run(); };
        const onResize = () => engine.resize();
        document.addEventListener('visibilitychange', onVis);
        window.addEventListener('resize', onResize);
        run();
        setState('ready');
        cleanup = () => {
          document.removeEventListener('visibilitychange', onVis);
          window.removeEventListener('resize', onResize);
          engine.stopRenderLoop();
          hero.dispose();
          scene.dispose();
          engine.dispose();
        };
      } catch {
        if (!disposed) setState('failed');
      }
    })();
    return () => { disposed = true; cleanup?.(); };
  }, []);
  return (
    <div className="relative h-full w-full">
      <canvas ref={ref} className="h-full w-full touch-none rounded-2xl outline-none" aria-label="Your athlete in 3D. Drag to turn." />
      {state !== 'ready' && (
        <p className="absolute inset-0 flex items-center justify-center text-center text-[12px] text-white/50">
          {state === 'loading' ? 'Loading your athlete…' : 'Couldn’t load 3D on this device.'}
        </p>
      )}
      <button type="button" onClick={onClose} className="absolute right-2 top-2 rounded-full border border-white/15 bg-black/60 px-2.5 py-1 text-[12px] font-bold text-white/80">
        Close 3D
      </button>
    </div>
  );
}
