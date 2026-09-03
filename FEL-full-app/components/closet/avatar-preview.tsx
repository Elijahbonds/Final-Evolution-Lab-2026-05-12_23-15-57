'use client';

// AvatarPreview — the Closet's live 3D preview: the FORGED hero
// (public/models/fel-hero.glb, scripts/avatar/forge.mts) wearing the draft
// look, so what the player designs here is the model they play with. The
// draft is applied through the SAME identity pipe the game uses
// (playerIdentity.applyIdentity), not a parallel preview-only mapping — a
// color that looks right here cannot look different in a mode.

import { useEffect, useRef } from 'react';
import type { FaceConfig, JerseyConfig } from '@/lib/closet/wearable-catalog';

export interface AvatarPreviewProps {
  face: FaceConfig;
  palette: { jersey: string; shorts: string; shoes: string; accent: string };
  jersey: JerseyConfig;
}

export default function AvatarPreview({ face, palette, jersey }: AvatarPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const applyRef = useRef<((p: AvatarPreviewProps) => void) | null>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      const { Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight, Vector3, Color4, Color3 } = await import('@babylonjs/core');
      const { CharacterLibrary } = await import('@/lib/babylon/core/CharacterLibrary');
      const { applyIdentity } = await import('@/lib/babylon/core/playerIdentity');
      if (disposed || !canvasRef.current) return;

      const engine = new Engine(canvasRef.current, true, { alpha: true });
      const scene = new Scene(engine);
      scene.clearColor = new Color4(0.03, 0.03, 0.05, 1);
      const cam = new ArcRotateCamera('closetCam', -Math.PI / 2, 1.25, 3.1, new Vector3(0, 0.95, 0), scene);
      cam.attachControl(canvasRef.current, true);
      cam.lowerRadiusLimit = 1.6;
      cam.upperRadiusLimit = 5;
      const fill = new HemisphericLight('fill', new Vector3(0, 1, 0), scene);
      fill.intensity = 0.9;
      const key = new DirectionalLight('key', new Vector3(-0.4, -0.8, 0.5), scene);
      key.intensity = 1.1;
      key.diffuse = new Color3(1, 0.92, 0.82);

      // identity:false — the DRAFT look is applied below, not the saved one.
      const spawned = await CharacterLibrary.spawn(scene, '/models/fel-hero.glb', { identity: false });
      if (disposed) { spawned.dispose(); engine.dispose(); return; }

      applyRef.current = (p: AvatarPreviewProps) => {
        applyIdentity(spawned, {
          proportions: null,
          face: p.face,
          palette: p.palette,
          jersey: p.jersey,
          custom: true,
        });
      };
      applyRef.current({ face, palette, jersey });

      // slow turntable so the back (jersey plate) is reachable
      scene.registerBeforeRender(() => {
        spawned.root.rotation.y += engine.getDeltaTime() * 0.0004;
      });
      engine.runRenderLoop(() => scene.render());
      cleanup = () => {
        engine.stopRenderLoop();
        spawned.dispose();
        scene.dispose();
        engine.dispose();
      };
    })().catch((e) => console.error('[closet] avatar preview failed', e));
    return () => { disposed = true; cleanup?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // re-apply the draft on every edit — same pipe, new values
  useEffect(() => {
    applyRef.current?.({ face, palette, jersey });
  }, [face, palette, jersey]);

  return (
    <canvas
      ref={canvasRef}
      className="mx-auto block w-full rounded-xl border border-white/10"
      style={{ height: 260, touchAction: 'none' }}
      aria-label="3D avatar preview"
    />
  );
}
