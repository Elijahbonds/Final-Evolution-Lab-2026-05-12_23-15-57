// THE EDITOR'S STAGE (docs/NEXUS-STUDIO.md §4.1): the harness's look stack, in the harness's order, with the same calls —
// so what the viewport draws is what the mode draws. stage.order.test.ts reads ModeHarness.ts and fails when the
// harness's order or calls change, so the two cannot drift silently.
//
//   createEngine → applyCanvasFit → detectRenderTier → Scene (+ felTier, felModeId) → the camera → mountLightRig →
//   mountSsao (when the tier asks) → mountBackdrop → autoInk → CameraDirector → mountLetterbox →
//   load(): mountVenue(spec, { keepGameplayCamera, look }) + the Studio layers (runtime.ts, the mode's own call) →
//   liftBlackMaterials → lights.adoptRest → lights.captureVenue
//
// Not mounted, on purpose: the game session (READY gate, body seam, session store, results), the perf guard (adaptive
// quality would move the budget meter under the creator's feet) and the dev PerfMonitor overlay (the meter replaces it).

import { ArcRotateCamera, Scene, TargetCamera, TransformNode, UniversalCamera, Vector3 } from '@babylonjs/core';
import type { AbstractEngine } from '@babylonjs/core';
import { createEngine } from '../babylon/core/createEngine';
import { applyCanvasFit, type FitResult } from '../babylon/core/canvasFit';
import { detectRenderTier, mountSsao, tierRigSettings, type QualityTier, type SsaoHandle } from '../babylon/scene/QualityTier';
import { mountLightRig, liftBlackMaterials, type LightRigHandle } from '../babylon/scene/LightRig';
import { mountBackdrop, MOOD_TO_FAMILY } from '../babylon/visual/Backdrops';
import { autoInk, inkStyleFor } from '../babylon/visual/AnimeInk';
import { CameraDirector } from '../babylon/core/CameraDirector';
import { mountLetterbox } from '../babylon/visual/Letterbox';
import { mountVenue, type VenueHandle } from '../babylon/core/NexusVenue';
import type { StudioVenueExport } from './exportVenue';
import { targetOf } from './targets';
import {
  studioLook, mountMeshyLayer, mountFixtureLayer, mountDecalLayer, mountCrowdLayer, mountWeatherLayer, type Layer,
} from './runtime';

export type StageLayer = 'venue' | 'meshy' | 'fixtures' | 'decals' | 'crowd' | 'weather';
export const STAGE_LAYERS: readonly StageLayer[] = ['venue', 'meshy', 'fixtures', 'decals', 'crowd', 'weather'];

export interface StageOpts {
  canvas: HTMLCanvasElement | null;
  /** Tests (NullEngine) and a stage rebuilt on the same engine pass it; otherwise createEngine makes one. */
  engine?: AbstractEngine;
  exp: StudioVenueExport;
  /** The budget meter's Phone switch forces the mobile tier; otherwise the device decides, as in a mode. */
  tier?: QualityTier;
}

export interface Stage {
  readonly engine: AbstractEngine;
  readonly scene: Scene;
  readonly tier: QualityTier;
  readonly fit: FitResult | null;
  /** The mode's camera: the CameraDirector drives it (the intro and replay previews draw through it). */
  readonly shot: TargetCamera;
  readonly orbit: ArcRotateCamera;
  readonly fly: UniversalCamera;
  readonly lights: LightRigHandle;
  readonly camDirector: CameraDirector;
  readonly venue: VenueHandle | null;
  /** Where the play happens: the export's subject mark, else the target mode's hero spot. */
  subject(): Vector3;
  objective(): Vector3;
  /** Re-mount the named layers from a new export (the viewport diffs exports and names what changed). */
  realise(exp: StudioVenueExport, layers: Iterable<StageLayer>): void;
  dispose(opts?: { keepEngine?: boolean }): void;
}

export async function mountStage(opts: StageOpts): Promise<Stage> {
  const { canvas } = opts;
  let exp = opts.exp;
  const target = targetOf(exp.target);
  // 1–3: engine, canvas fit, tier (as ModeHarness.mountMode)
  const engine = opts.engine ?? await createEngine(canvas!);
  const fit = opts.engine || !canvas ? null : applyCanvasFit(engine, canvas);
  const tier: QualityTier = opts.tier ?? (canvas && fit ? detectRenderTier(canvas, fit, engine) : 'desktop');
  const scene = new Scene(engine);
  (scene.metadata ??= {}).felTier = tier;
  scene.metadata.felModeId = exp.target;   // lookPolicy, the fixture / sky / decal gates and the kit defaults see the target mode
  // the harness makes its camera before the rig, so the post pipeline attaches to it; the editor's cameras come first too
  const shot = new TargetCamera('cam', new Vector3(0, 3, -8), scene);
  const orbit = new ArcRotateCamera('studio_orbit', Math.PI / 2, 1.0, 38, new Vector3(0, 1, -2), scene);   // from the play camera's side (+z, looking −z)
  orbit.lowerRadiusLimit = 2; orbit.upperRadiusLimit = 260; orbit.upperBetaLimit = Math.PI / 2 - 0.02; orbit.minZ = 0.1; orbit.maxZ = 2000;
  orbit.wheelDeltaPercentage = 0.02; orbit.panningSensibility = 60;
  const fly = new UniversalCamera('studio_fly', new Vector3(0, 6, 28), scene);
  fly.minZ = 0.1; fly.maxZ = 2000; fly.speed = 0.6; fly.setTarget(new Vector3(0, 1, 0));
  fly.keysUp = [87]; fly.keysDown = [83]; fly.keysLeft = [65]; fly.keysRight = [68]; fly.keysUpward = [69]; fly.keysDownward = [81];
  scene.activeCamera = orbit;
  const mood = exp.mood;
  // 4: the rig (LightRig: hemi + sun + shadows + the post pipeline + IBL), then SSAO where the tier asks
  const lights = mountLightRig(scene, mood, tier);
  const ssao: SsaoHandle | null = tierRigSettings(tier, mood).ssao ? mountSsao(scene, orbit) : null;
  // 5: the painted backdrop and the ink, as the mode would get them (Tiebreak names no backdrop: the mood's family)
  const backdrop = mountBackdrop(scene, MOOD_TO_FAMILY[mood] ?? 'park', mood);
  const unink = autoInk(scene, inkStyleFor(exp.target));
  // 6: the director (the intro preview) on the mode's own preset, and its letterbox
  const camDirector = new CameraDirector(scene, shot, target?.camPreset ?? 'court');
  const letterbox = mountLetterbox(scene, canvas, () => camDirector.cinematic01);

  // 7: load() — the venue the mode mounts, with the Studio look, then the Studio's layers (runtime.ts: the mode's calls)
  const ctx = { scene, canvas: canvas ?? undefined, camDirector };
  let venue: VenueHandle | null = null;
  const layers: Partial<Record<Exclude<StageLayer, 'venue'>, Layer>> = {};
  const subject = (): Vector3 => Vector3.FromArray(exp.subject ?? target?.subject ?? [0, 0, 0]);
  const objective = (): Vector3 => Vector3.FromArray(target?.objective ?? [0, 0, -10]);
  const mountLayer = (name: StageLayer): void => {
    switch (name) {
      case 'venue': {
        venue?.dispose();
        const keep = scene.activeCamera;
        venue = mountVenue(ctx, exp.spec, { keepGameplayCamera: true, look: studioLook(exp) });
        venue?.hidePlaceholders();
        if (keep) scene.activeCamera = keep;
        return;
      }
      case 'meshy': layers.meshy?.dispose(); layers.meshy = mountMeshyLayer(scene, null, exp.meshy); return;
      case 'fixtures': layers.fixtures?.dispose(); layers.fixtures = mountFixtureLayer(scene, null, exp.fixtures); return;
      case 'decals': layers.decals?.dispose(); layers.decals = mountDecalLayer(scene, tier, exp.decals); return;
      case 'crowd': layers.crowd?.dispose(); layers.crowd = mountCrowdLayer({ scene }, exp.crowd); return;
      case 'weather': layers.weather?.dispose(); layers.weather = mountWeatherLayer(scene, lights, exp.weather, target?.weatherFamily ?? 'court', { tier, keepSky: !!exp.look.sky }); return;
    }
  };
  const meta = scene.metadata as Record<string, unknown>;
  const glossy = (): void => { if (exp.glossyFloor) meta.felStudioGround = 'court'; else delete meta.felStudioGround; };
  glossy();
  for (const l of STAGE_LAYERS) mountLayer(l);
  // 8: after load — the harness's three calls
  liftBlackMaterials(scene);
  lights.adoptRest();
  lights.captureVenue(subject());

  // an anchor at the subject, for the previews' and the gizmo's frames of reference
  const anchor = new TransformNode('__studio_subject', scene);
  anchor.position.copyFrom(subject());

  return {
    engine, scene, tier, fit, shot, orbit, fly, lights, camDirector,
    get venue() { return venue; },
    subject, objective,
    realise(next, which) {
      exp = next;
      glossy();
      const set = new Set(which);
      for (const l of STAGE_LAYERS) if (set.has(l)) mountLayer(l);
      if (set.has('venue')) liftBlackMaterials(scene);
      // FixtureLights, SkyDome, Atmosphere and GlossyFloor are mounted by captureVenue: a new venue or new fixtures re-run it
      if (set.has('venue') || set.has('fixtures')) lights.captureVenue(subject());
      anchor.position.copyFrom(subject());
    },
    dispose(o = {}) {
      for (const l of Object.values(layers)) l?.dispose();
      venue?.dispose(); venue = null;
      letterbox.dispose(); unink(); backdrop.dispose(); ssao?.dispose(); lights.dispose();
      scene.dispose();
      if (!o.keepEngine) engine.dispose();
    },
  };
}
