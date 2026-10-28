// THE LOOK STACK — what every mode is drawn through, in one place (docs/NEXUS-STUDIO.md §4.1).
//
//   createEngine → applyCanvasFit → detectRenderTier → Scene (+ felTier, felModeId) → [onScene] → the camera → [onCamera] →
//   the mood (read once) → mountLightRig → mountSsao (when the tier asks) → mountBackdrop → autoInk → CameraDirector →
//   mountLetterbox
//
// Then the caller's load(), then the three after-load calls every caller makes itself: liftBlackMaterials → lights.adoptRest →
// lights.captureVenue (they sit in the caller's own load watchdog / re-realise paths, so they are not here).
//
// Two callers: ModeHarness.mountMode (every mode) and the Nexus Studio's editor stage (lib/nexus-studio/stage.ts). One function
// is what makes "the editor draws what the mode draws" true by construction rather than by a test that compares two copies.
// The order and the calls are exactly the harness's as they were before the extraction; the harness's own work that sat in
// between (the perf guard and the agent bridge after the scene; nothing between the camera and the rig) runs in the hooks at
// the same point. lookStack.test.ts holds the order.

import { releaseParkedStage } from './parkedStage';
import { Scene, TargetCamera, Vector3 } from '@babylonjs/core';
import type { AbstractEngine, Camera } from '@babylonjs/core';
import { createEngine } from './createEngine';
import { applyCanvasFit, type FitResult } from './canvasFit';
import { CameraDirector, type FOLLOW_PRESETS } from './CameraDirector';
import { detectRenderTier, mountSsao, tierRigSettings, type QualityTier, type SsaoHandle } from '../scene/QualityTier';
import { mountLightRig, type LightRigHandle } from '../scene/LightRig';
import type { VenueMood } from '../scene/moods';
import { mountBackdrop, MOOD_TO_FAMILY, type BackdropFamily } from '../visual/Backdrops';
import { autoInk, inkStyleFor } from '../visual/AnimeInk';
import { mountLetterbox } from '../visual/Letterbox';
import { installPhoneActiveTrim } from '../scene/phoneTrim';   // lane/owner-1016: a phone's active list leaves out the loaders' empty roots
import { installPhoneTextureCap } from '../scene/phoneTextureCap';   // phone-perf: model textures ≤ 1024² on a phone

export interface LookStackOpts {
  canvas: HTMLCanvasElement | null;
  /** An engine to build on (tests' NullEngine, a stage rebuilt on its engine): no canvas fit then. Else createEngine(canvas). */
  engine?: AbstractEngine;
  /** On the scene as `felModeId` (lookPolicy, kit defaults, the fixture / sky / decal gates) and the ink style's key. */
  modeId: string;
  /** A forced tier (the Studio's Phone switch). Else the device decides, as in a mode. */
  tier?: QualityTier;
  /** The mood, read ONCE after the camera — a mode's `mood` may be a per-venue getter and the harness resolves the place. */
  mood: () => VenueMood;
  /** The painted horizon's family; undefined = the mood's. Read once, at the backdrop. */
  backdrop?: () => BackdropFamily | undefined;
  camPreset: keyof typeof FOLLOW_PRESETS;
  /** Right after the scene exists and knows its tier and mode (the harness's perf guard and agent bridge ran here). */
  onScene?(scene: Scene, at: { engine: AbstractEngine; fit: FitResult | null; tier: QualityTier }): void;
  /** Right after the play camera ('cam'): make any other cameras here; return the one SSAO attaches to (default: 'cam'). */
  onCamera?(scene: Scene, camera: TargetCamera): Camera | void;
}

export interface LookStack {
  engine: AbstractEngine;
  fit: FitResult | null;
  tier: QualityTier;
  scene: Scene;
  /** The play camera ('cam'): the director drives it. */
  camera: TargetCamera;
  mood: VenueMood;
  lights: LightRigHandle;
  ssao: SsaoHandle | null;
  backdrop: ReturnType<typeof mountBackdrop>;
  unink: () => void;
  camDirector: CameraDirector;
  letterbox: ReturnType<typeof mountLetterbox>;
}

/** Mount the look stack. Each caller disposes the pieces in its own teardown order (the harness's is long and ordered). */
export async function mountLookStack(o: LookStackOpts): Promise<LookStack> {
  // DEMO-SPEED-2 (coordinator 2026-10-28): a parked exercise-demo stage gives its engine and body back before a mode builds
  releaseParkedStage();
  const engine = o.engine ?? await createEngine(o.canvas!);
  // M95 (Pass 2): cap DPR + backing pixels; Ship pass: the tier is decided once, from the same fill-rate signal
  const fit = o.engine || !o.canvas ? null : applyCanvasFit(engine, o.canvas);
  const tier: QualityTier = o.tier ?? (o.canvas && fit ? detectRenderTier(o.canvas, fit, engine) : 'desktop');
  const scene = new Scene(engine);
  (scene.metadata ??= {}).felTier = tier;   // read by CharacterLibrary for per-spawn quality
  // PHONE-PERF (2026-10-14): a phone uploads a glTF model's texture at 1024² at most (phoneTextureCap.ts); desktop untouched.
  // In the shared look stack so the Studio's phone preview counts the same texture memory a mode does.
  installPhoneTextureCap(engine, tier);
  installPhoneActiveTrim(scene, tier);   // lane/owner-1016 (2026-10-16): empty `__root__` meshes leave the active list on a phone; no pixel changes (phoneTrim.ts)
  scene.metadata.felModeId = o.modeId;      // read by kit.applyKit for the sport's default kit (owner decision 2026-09-05)
  o.onScene?.(scene, { engine, fit, tier });
  const camera = new TargetCamera('cam', new Vector3(0, 3, -8), scene);
  const ssaoCamera = o.onCamera?.(scene, camera) ?? camera;
  const mood = o.mood();
  const lights = mountLightRig(scene, mood, tier);
  // Desktop tier only: SSAO grounds feet and darkens the crease between close bodies.
  const ssao: SsaoHandle | null = tierRigSettings(tier, mood).ssao ? mountSsao(scene, ssaoCamera) : null;
  // M61: painted sky + horizon backdrop (2 meshes, unlit, auto-rotating)
  const backdrop = mountBackdrop(scene, o.backdrop?.() ?? MOOD_TO_FAMILY[mood] ?? 'park', mood);
  // M59 / A9.6: the ink outlines (the anime line for the party modes, a distance-true contour for the sports)
  const unink = autoInk(scene, inkStyleFor(o.modeId));
  const camDirector = new CameraDirector(scene, camera, o.camPreset);
  const letterbox = mountLetterbox(scene, o.canvas, () => camDirector.cinematic01);   // A9.12: the intro's and the replays' bars
  return { engine, fit, tier, scene, camera, mood, lights, ssao, backdrop, unink, camDirector, letterbox };
}
