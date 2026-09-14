'use client';

// THE LIVE PREVIEW (2026-09-14). Spec §10 step 6: "the preview is a CONSUMER of the resolved build."
//
// It spawns the forged hero once and re-applies the draft through `applyIdentity` — the same pipe the
// Closet preview and every game mode use — so a colour that looks right here cannot look different in a
// mode. The mapping from rows to that pipe's shape is `previewBinding`, which is pure and tested; this
// file is only the canvas and the lifetime.
//
// WHAT THIS HERO CAN AND CANNOT SHOW — MEASURED, 2026-09-14, and it is an OWNER DECISION, not a bug here.
//
// It asks for the forge hero and gets the owner's scan body: `normalizeHeroUrl` maps FORGE_HERO_URL to
// DEFAULT_HERO_URL ("the forge hero means the hero"), which is Ship Pass 6's decision that the scan is the
// body every mode spawns. Measured on the running page: the GLB fetched is /models/elijah-meshy.glb, the
// spawn is ONE mesh called Body on a 22-bone rig, and `applyKit` returns 0 immediately because the body
// carries no `Kit_*` meshes at all. It is not naked — it is a scan of a DRESSED person, jacket, shorts,
// shoes and hair baked into that one mesh, which is precisely why none of it can be swapped.
//
// So on today's hero the preview shows skin tone and the three proportions, and CANNOT show garments,
// hair or the kit tints — there is nothing in the scene for `applyKit`, `applyHairStyle` or the palette
// tints to act on. The forge body on disk (fel-hero.glb) does carry all of them: Kit_tops_top_lab,
// Kit_shoes_shoes_evo, six Hair_* meshes. The Closet's preview has exactly the same gap, for the same
// reason, and predates this file.
//
// It is deliberately NOT worked around by spawning the forge body here. That would make the creator show
// a player a body the game will not give them, which is a worse lie than "your jersey choice is saved but
// not previewable yet". Which body the creator previews is the owner's call, and it is one line.
//
// WHY IT APPLIES THE THREE SCALES ITSELF INSTEAD OF HANDING THEM TO applyIdentity.
//
// `applyIdentity` scales the root with `scaleInPlace` — CUMULATIVE. That is correct where it is called:
// once, on a hero that has just spawned. A creator re-applies on every keypress, and the Closet never hit
// this only because its preview passes `proportions: null`. Ten presses of ▶ on Height would have
// multiplied the hero by 1.01 ten times instead of showing 110%, and the bug would have looked like a
// runaway animation rather than an arithmetic one. So the root is set ABSOLUTELY here, from the scale the
// spawn arrived with, and the bones — which `scaleBones` already sets absolutely — are driven off the very
// same TORSO_BONES / ARM_BONES lists that file exports, so there is no second opinion about what "build"
// and "reach" mean.

import { useEffect, useRef } from 'react';
import type { PreviewBinding } from '@/lib/creator/editor/previewBinding';

export interface CreatorPreviewProps {
  binding: PreviewBinding;
  /** Rendered height in px. The editor pane is narrow, so this is not the Closet's number. */
  height?: number;
}

export default function CreatorPreview({ binding, height = 420 }: CreatorPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const applyRef = useRef<((b: PreviewBinding) => void) | null>(null);
  const pending = useRef<PreviewBinding>(binding);
  pending.current = binding;

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      const { Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight, Vector3, Color4, Color3 } = await import('@babylonjs/core');
      const { CharacterLibrary } = await import('@/lib/babylon/core/CharacterLibrary');
      const { applyIdentity, TORSO_BONES, ARM_BONES } = await import('@/lib/babylon/core/playerIdentity');
      const { boneNode } = await import('@/lib/babylon/anim/boneLookup');
      if (disposed || !canvasRef.current) return;

      const engine = new Engine(canvasRef.current, true, { alpha: true });
      const scene = new Scene(engine);
      scene.clearColor = new Color4(0.02, 0.02, 0.03, 1);
      const cam = new ArcRotateCamera('creatorCam', -Math.PI / 2, 1.2, 3.4, new Vector3(0, 1, 0), scene);
      cam.attachControl(canvasRef.current, true);
      cam.lowerRadiusLimit = 1.6;
      cam.upperRadiusLimit = 6;
      const fill = new HemisphericLight('fill', new Vector3(0, 1, 0), scene);
      fill.intensity = 0.85;
      const key = new DirectionalLight('key', new Vector3(-0.4, -0.8, 0.5), scene);
      key.intensity = 1.15;
      key.diffuse = new Color3(1, 0.93, 0.84);

      const spawned = await CharacterLibrary.spawn(scene, '/models/fel-hero.glb', { identity: false });
      if (disposed) { spawned.dispose(); engine.dispose(); return; }
      // The scale the hero arrived with. Every later apply is measured from THIS, never from the last one.
      const baseScale = spawned.root.scaling.clone();

      applyRef.current = (b: PreviewBinding) => {
        applyIdentity(spawned, {
          proportions: null,          // applied below, absolutely — see the header
          face: b.face, palette: b.palette, jersey: b.jersey, wardrobe: b.wardrobe, custom: true,
        });
        const p = b.proportions;
        spawned.root.scaling.copyFrom(baseScale).scaleInPlace(p.heightScale || 1);
        for (const n of TORSO_BONES) boneNode(spawned.skeleton, n)?.scaling.setAll(p.buildScale || 1);
        for (const n of ARM_BONES) boneNode(spawned.skeleton, n)?.scaling.setAll(p.reachScale || 1);
      };
      applyRef.current(pending.current);

      scene.registerBeforeRender(() => { spawned.root.rotation.y += engine.getDeltaTime() * 0.0004; });
      engine.runRenderLoop(() => scene.render());
      // dev-only hook, the same one the Closet preview exposes: this is where the schema and the rig meet
      // without a login, which is the only place a probe can check they agree.
      if (process.env.NODE_ENV === 'development') {
        (window as unknown as { __FEL_CREATOR_PREVIEW__?: unknown }).__FEL_CREATOR_PREVIEW__ = {
          scene, spawned, baseScale, get binding() { return pending.current; },
        };
      }
      cleanup = () => {
        engine.stopRenderLoop();
        spawned.dispose();
        scene.dispose();
        engine.dispose();
      };
    })().catch((e) => console.error('[creator] preview failed', e));
    return () => { disposed = true; cleanup?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { applyRef.current?.(binding); }, [binding]);

  return (
    <canvas ref={canvasRef} className="block h-full w-full rounded-xl" style={{ height, touchAction: 'none' }}
      aria-label="Live athlete preview" />
  );
}
