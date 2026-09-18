'use client';
import type { Wardrobe } from '@/lib/babylon/core/kit';

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
  /** equipped wearable ids per kit slot (ship pass 3: the fitted garment library) */
  wardrobe?: Wardrobe;
}

export default function AvatarPreview({ face, palette, jersey, wardrobe }: AvatarPreviewProps) {
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
      // ship pass 3 rollout flag (dev only): ?hero=/models/candidates/<file>.glb previews a candidate body
      const heroParam = process.env.NODE_ENV === 'development' ? new URLSearchParams(window.location.search).get('hero') : null;
      if (heroParam) (scene.metadata ??= {}).felHeroOverride = heroParam;
      // EVERYONE-BODY-MOCAP-OPPONENTS (2026-09-14): the Closet dresses the body this player actually plays — the scan
      // for the owner's account, otherwise their kit body (heroBody.ts). A dev ?hero= override still wins.
      const { resolveIdentity } = await import('@/lib/babylon/core/playerIdentity');
      const { urlForHeroBody } = await import('@/lib/babylon/core/heroBody');
      const bodyKind = (await resolveIdentity().catch(() => null))?.body ?? 'kit-male';
      const spawned = await CharacterLibrary.spawn(scene, heroParam ? '/models/fel-hero.glb' : urlForHeroBody(bodyKind), { identity: false, role: 'player' });
      if (disposed) { spawned.dispose(); engine.dispose(); return; }
      // dev-only probe hook (scripts/_closet-scene-probe.mts): the preview is the
      // one place the identity pipe and the spawn layers meet without a login
      if (process.env.NODE_ENV === 'development') (window as unknown as { __FEL_PREVIEW__?: unknown }).__FEL_PREVIEW__ = { scene, spawned };

      // dev only: ?tone=8d5524 previews a skin tone without touching the draft (per-tone captures, ship pass 3 rung 2)
      const toneParam = process.env.NODE_ENV === 'development' ? new URLSearchParams(window.location.search).get('tone') : null;
      applyRef.current = (p: AvatarPreviewProps) => {
        applyIdentity(spawned, {
          proportions: null,
          face: toneParam ? { ...p.face, skinTone: `#${toneParam.replace(/^#/, '')}` } : p.face,
          palette: p.palette,
          jersey: p.jersey,
          wardrobe: p.wardrobe ?? {},
          custom: true,
          body: bodyKind,
        });
      };
      applyRef.current({ face, palette, jersey, wardrobe });

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
    applyRef.current?.({ face, palette, jersey, wardrobe });
  }, [face, palette, jersey, wardrobe]);

  return (
    <canvas
      ref={canvasRef}
      className="mx-auto block w-full rounded-xl border border-white/10"
      style={{ height: 260, touchAction: 'none' }}
      aria-label="3D avatar preview"
    />
  );
}
