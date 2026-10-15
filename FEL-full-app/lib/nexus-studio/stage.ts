// THE EDITOR'S STAGE (docs/NEXUS-STUDIO.md §4.1): the harness's look stack through the harness's own function
// (lib/babylon/core/lookStack.ts mountLookStack, which ModeHarness.mountMode calls) — so what the viewport draws is what the
// mode draws, by construction. stage.order.test.ts holds both callers to it.
//
//   mountLookStack (createEngine → applyCanvasFit → detectRenderTier → Scene (+ felTier, felModeId) → the camera →
//   mountLightRig → mountSsao (when the tier asks) → mountBackdrop → autoInk → CameraDirector → mountLetterbox) →
//   load(): mountVenue(spec, { keepGameplayCamera, look }) + the Studio layers (runtime.ts, the mode's own call) →
//   liftBlackMaterials → lights.adoptRest → lights.captureVenue
//
// Not mounted, on purpose: the game session (READY gate, body seam, session store, results), the perf guard (adaptive
// quality would move the budget meter under the creator's feet) and the dev PerfMonitor overlay (the meter replaces it).

import { ArcRotateCamera, TransformNode, UniversalCamera, Vector3 } from '@babylonjs/core';
import type { AbstractEngine, Scene, TargetCamera } from '@babylonjs/core';
import { mountLookStack } from '../babylon/core/lookStack';
import type { FitResult } from '../babylon/core/canvasFit';
import type { QualityTier } from '../babylon/scene/QualityTier';
import { liftBlackMaterials, type LightRigHandle } from '../babylon/scene/LightRig';
import type { CameraDirector } from '../babylon/core/CameraDirector';
import { mountVenue, type VenueHandle } from '../babylon/core/NexusVenue';
import type { StudioVenueExport } from './exportVenue';
import { castFrameFor, targetOf } from './targets';
import {
  studioLook, mountMeshyLayer, mountFixtureLayer, mountDecalLayer, mountCrowdLayer, mountWeatherLayer, type Layer,
} from './runtime';
import { mountCastLayer, type CastLayer } from './castLayer';

export type StageLayer = 'venue' | 'meshy' | 'fixtures' | 'decals' | 'crowd' | 'weather' | 'cast';
export const STAGE_LAYERS: readonly StageLayer[] = ['venue', 'meshy', 'fixtures', 'decals', 'crowd', 'weather', 'cast'];

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
  // 1–6: the look stack — the SAME function ModeHarness.mountMode calls (lib/babylon/core/lookStack.ts): engine, canvas fit,
  // tier, the scene marked with the target mode (lookPolicy, the fixture / sky / decal gates and the kit defaults see it),
  // the play camera, the rig, SSAO by tier, the backdrop, the ink, the director on the mode's preset and its letterbox.
  // The editor's own cameras are made in the camera hook, before the rig, so the post pipeline and SSAO attach to the orbit.
  let orbit!: ArcRotateCamera;
  let fly!: UniversalCamera;
  const look = await mountLookStack({
    canvas, engine: opts.engine, tier: opts.tier,
    modeId: exp.target,
    camPreset: target?.camPreset ?? 'court',
    mood: () => exp.mood,
    onCamera: (scene) => {
      orbit = new ArcRotateCamera('studio_orbit', Math.PI / 2, 1.0, 38, new Vector3(0, 1, -2), scene);   // from the play camera's side (+z, looking −z)
      orbit.lowerRadiusLimit = 2; orbit.upperRadiusLimit = 260; orbit.upperBetaLimit = Math.PI / 2 - 0.02; orbit.minZ = 0.1; orbit.maxZ = 2000;
      orbit.wheelDeltaPercentage = 0.02; orbit.panningSensibility = 60;
      fly = new UniversalCamera('studio_fly', new Vector3(0, 6, 28), scene);
      fly.minZ = 0.1; fly.maxZ = 2000; fly.speed = 0.6; fly.setTarget(new Vector3(0, 1, 0));
      fly.keysUp = [87]; fly.keysDown = [83]; fly.keysLeft = [65]; fly.keysRight = [68]; fly.keysUpward = [69]; fly.keysDownward = [81];
      scene.activeCamera = orbit;
      return orbit;
    },
  });
  const { engine, fit, tier, scene, lights, ssao, backdrop, unink, camDirector, letterbox } = look;
  const shot = look.camera;

  // 7: load() — the venue the mode mounts, with the Studio look, then the Studio's layers (runtime.ts: the mode's calls)
  const ctx = { scene, canvas: canvas ?? undefined, camDirector };
  let venue: VenueHandle | null = null;
  const layers: Partial<Record<Exclude<StageLayer, 'venue' | 'cast'>, Layer>> & { cast?: CastLayer } = {};
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
      // track 3: the cast character on the mode's own hero spot, on the real rig (castLayer.ts) — RIG-ADJACENT
      case 'cast': layers.cast?.dispose(); layers.cast = mountCastLayer(scene, exp.cast?.player, target?.subject ?? [0, 0, 0], target?.subjectYaw ?? 0, castFrameFor(exp.target)); return;
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
