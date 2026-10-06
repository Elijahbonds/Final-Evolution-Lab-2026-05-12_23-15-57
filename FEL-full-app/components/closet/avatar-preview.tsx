'use client';
import type { Wardrobe } from '@/lib/babylon/core/kit';
import type { AccessoryId } from '@/lib/babylon/core/accessories';
import type { CreatorDoc, CreatorPart, SlotFrame } from '@/lib/creator/look/doc';
import type { HeroBodyKind } from '@/lib/babylon/core/heroBody';

// AvatarPreview — the Closet's live 3D preview: the FORGED hero
// (public/models/fel-hero.glb, scripts/avatar/forge.mts) wearing the draft
// look, so what the player designs here is the model they play with. The
// draft is applied through the SAME identity pipe the game uses
// (playerIdentity.applyIdentity), not a parallel preview-only mapping — a
// color that looks right here cannot look different in a mode.

import { useEffect, useRef, useState } from 'react';
import type { FaceConfig, JerseyConfig } from '@/lib/closet/wearable-catalog';
import { poseLoops } from '@/lib/creator/editor/previewPose';
import { PreviewControls } from '@/components/creator/editor/preview-controls';

export interface AvatarPreviewProps {
  face: FaceConfig;
  palette: { jersey: string; shorts: string; shoes: string; accent: string };
  jersey: JerseyConfig;
  /** equipped wearable ids per kit slot (ship pass 3: the fitted garment library) */
  wardrobe?: Wardrobe;
  /** IMPROVE (2026-10-06): the accessories the equipped items render as, and the draft Creator doc — the same two
   *  fields resolveIdentity fills at spawn, so the preview shows what the game will. */
  accessories?: readonly AccessoryId[];
  creator?: CreatorDoc | null;
  /** CREATOR-PLAN phase 2: equipped items that render as parts (the Nexus Visor) — resolveIdentity's `wornParts`. */
  wornParts?: readonly CreatorPart[];
  /** CREATOR-PLAN phase 4a: the selected slot's body (the preview respawns when it changes; absent: the body this
   *  account plays, as before) and its height / build (cosmetic, clamped like every mode outside ranked). */
  body?: HeroBodyKind;
  frame?: SlotFrame | null;
  /** CREATOR-PLAN phase 4b: the slot's Studio size (owner decision 2026-10-06: giant and tiny builds show here and in
   *  photos only). Stamped on THIS scene's metadata and read back from it (shape/presentation.ts); never in a mode. */
  presentation?: number | null;
}

export default function AvatarPreview({ face, palette, jersey, wardrobe, accessories, creator, wornParts, body, frame, presentation }: AvatarPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const applyRef = useRef<((p: AvatarPreviewProps) => void) | null>(null);
  const playRef = useRef<(clip: string | null) => void>(() => {});
  const respawnRef = useRef<((kind: HeroBodyKind) => void) | null>(null);
  const bodyRef = useRef<HeroBodyKind | undefined>(body);
  bodyRef.current = body;
  const spinRef = useRef(true);
  const [spinning, setSpinning] = useState(true);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      const { Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight, Vector3, Color4, Color3 } = await import('@babylonjs/core');
      const { applyCanvasFit, fitCanvas } = await import('@/lib/babylon/core/canvasFit');
      const { detectQualityTier } = await import('@/lib/babylon/scene/QualityTier');
      const { CharacterLibrary } = await import('@/lib/babylon/core/CharacterLibrary');
      const { applyIdentity } = await import('@/lib/babylon/core/playerIdentity');
      const { applyPresentation, stampPresentation } = await import('@/lib/babylon/creator/shape/presentation');
      if (disposed || !canvasRef.current) return;

      const box = canvasRef.current;
      const fit0 = fitCanvas({ cssWidth: box.clientWidth || 260, cssHeight: box.clientHeight || 260, dpr: window.devicePixelRatio || 1 });
      const tier = detectQualityTier(box, fit0);
      const engine = new Engine(box, tier === 'desktop', { alpha: true, adaptToDeviceRatio: false });
      applyCanvasFit(engine, box);
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
      const { resolveIdentity, applyProportions } = await import('@/lib/babylon/core/playerIdentity');
      const { urlForHeroBody } = await import('@/lib/babylon/core/heroBody');
      // CREATOR-PLAN phase 4a: the SELECTED SLOT's body when the Closet names one (a scan owner's Gojo slot is a kit body)
      let bodyKind: HeroBodyKind = bodyRef.current ?? (await resolveIdentity().catch(() => null))?.body ?? 'kit-male';
      let spawned = await CharacterLibrary.spawn(scene, heroParam ? '/models/fel-hero.glb' : urlForHeroBody(bodyKind), { identity: false, role: 'player' });
      if (disposed) { spawned.dispose(); engine.dispose(); return; }
      let baseScale = spawned.root.scaling.clone();
      // dev-only probe hook (scripts/_closet-scene-probe.mts): the preview is the
      // one place the identity pipe and the spawn layers meet without a login
      if (process.env.NODE_ENV === 'development') (window as unknown as { __FEL_PREVIEW__?: unknown }).__FEL_PREVIEW__ = { scene, spawned };

      // dev only: ?tone=8d5524 previews a skin tone without touching the draft (per-tone captures, ship pass 3 rung 2)
      const toneParam = process.env.NODE_ENV === 'development' ? new URLSearchParams(window.location.search).get('tone') : null;
      applyRef.current = (p: AvatarPreviewProps) => {
        lastProps = p;
        applyIdentity(spawned, {
          proportions: null,
          face: toneParam ? { ...p.face, skinTone: `#${toneParam.replace(/^#/, '')}` } : p.face,
          palette: p.palette,
          jersey: p.jersey,
          wardrobe: p.wardrobe ?? {},
          custom: true,
          body: bodyKind,
          accessories: p.accessories ?? [],
          creator: p.creator ?? null,
          wornParts: p.wornParts ?? [],
        });
        // the slot's height and build, absolutely from the spawn's own scale (never compounding across edits)
        applyProportions(spawned, p.frame ? { heightScale: p.frame.heightScale, buildScale: p.frame.buildScale } : { heightScale: 1, buildScale: 1 }, baseScale);
        // CREATOR-PLAN phase 4b: this is the Studio, so its scene carries the slot's presentation size, applied on top of
        // the absolute scale just set (so it never compounds); the camera keeps a giant's head and a mascot in frame
        stampPresentation(scene, 'studio', p.presentation ?? null);
        const size = applyPresentation(spawned.root);
        if (Math.abs(cam.target.y - 0.95 * size) > 1e-6) cam.target = new Vector3(cam.target.x, 0.95 * size, cam.target.z);
        cam.radius = Math.max(cam.radius, 3.1 * Math.max(1, size));
      };
      let lastProps: AvatarPreviewProps = { face, palette, jersey, wardrobe, accessories, creator, wornParts, frame, presentation };
      applyRef.current(lastProps);
      // a slot with another body: the old one goes, the new one is spawned and dressed with the same draft
      let respawning: Promise<void> | null = null;
      respawnRef.current = (kind: HeroBodyKind) => {
        if (heroParam || kind === bodyKind) return;
        const run = async () => {
          bodyKind = kind;
          const next = await CharacterLibrary.spawn(scene, urlForHeroBody(kind), { identity: false, role: 'player' });
          if (disposed) { next.dispose(); return; }
          next.root.rotation.y = spawned.root.rotation.y;
          spawned.dispose();
          spawned = next;
          baseScale = spawned.root.scaling.clone();
          applyRef.current?.(lastProps);
          const { prewarmPaint: warm } = await import('@/lib/babylon/creator/paint/renderPaint');
          if (!disposed) warm(spawned);
        };
        respawning = (respawning ?? Promise.resolve()).then(run).catch((e) => console.error('[closet] preview respawn failed', e));
      };
      // CREATOR-PLAN phase 3: build the body's paint map in the background now, so the first paint shows at once
      const { prewarmPaint } = await import('@/lib/babylon/creator/paint/renderPaint');
      if (!disposed) prewarmPaint(spawned);

      playRef.current = (clip: string | null) => {
        if (!clip) return;
        spawned.animator.play(clip, { loop: poseLoops(clip), restart: true });
      };
      const onResize = () => { if (canvasRef.current) applyCanvasFit(engine, canvasRef.current); };
      window.addEventListener('resize', onResize);
      scene.registerBeforeRender(() => {
        if (spinRef.current) spawned.root.rotation.y += engine.getDeltaTime() * 0.0004;
      });
      engine.runRenderLoop(() => scene.render());
      cleanup = () => {
        window.removeEventListener('resize', onResize);
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
    applyRef.current?.({ face, palette, jersey, wardrobe, accessories, creator, wornParts, frame, presentation });
  }, [face, palette, jersey, wardrobe, accessories, creator, wornParts, frame, presentation]);
  // CREATOR-PLAN phase 4a: another slot's body
  useEffect(() => { if (body) respawnRef.current?.(body); }, [body]);

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="mx-auto block w-full rounded-xl border border-white/10"
        style={{ height: 260, touchAction: 'none' }}
        aria-label="3D avatar preview"
      />
      <PreviewControls spinning={spinning} onToggleSpin={() => { spinRef.current = !spinRef.current; setSpinning(spinRef.current); }} onPose={(clip) => playRef.current(clip)} />
    </div>
  );
}
