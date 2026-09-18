// LightRig v2 — REPLACES the M44 file. THE ANIME LIGHTING PASS, applied to
// every mood (the art-direction request: anime-ish lighting/color across
// all modes). What actually makes light read "anime" — and what this
// changes, mood by mood:
//   1. FLATTER SHADING — anime shades in bands, not smooth photoreal
//      falloff. The fill (hemispheric) intensity comes UP relative to the
//      key, so faces hold one bright tone with a soft shadow side instead
//      of a long gradient.
//   2. THE RIM LIGHT — the signature anime backlight halo: a second
//      directional light from behind/above, opposite the key, tinted a
//      complementary color per mood. Characters pop off the background the
//      way cel characters pop off painted backdrops.
//   3. COLORED SHADOW SIDE — ground bounce tints go bolder (warm scenes get
//      cool shadow tints and vice versa), the classic complementary-shadow
//      anime palette.
// Same class, same constructor, same auto-classification and wiring as M44
// — drop-in, zero mode-file changes. Pairs with RenderPipeline v2's
// saturation grade and AnimeInk's outline pass (both in this batch).

import {
  Color3, DirectionalLight, HemisphericLight, ShadowGenerator, Vector3,
} from '@babylonjs/core';
import type { AbstractMesh, Scene } from '@babylonjs/core';

export interface MoodLight {
  keyDir: Vector3;          // direction the key light travels (normalized)
  keyColor: Color3;
  keyIntensity: number;
  fillColor: Color3;        // hemispheric ambient
  fillIntensity: number;
  groundColor: Color3;      // hemispheric "bounce" tint from below
  rimColor: Color3;         // the anime backlight
  rimIntensity: number;
}

export const MOOD_LIGHT: Record<string, MoodLight> = {
  goldenHour: {
    keyDir: new Vector3(-0.55, -0.65, 0.35), keyColor: new Color3(1, 0.76, 0.5), keyIntensity: 1.0,
    fillColor: new Color3(0.62, 0.66, 0.82), fillIntensity: 0.68, groundColor: new Color3(0.3, 0.22, 0.38),
    rimColor: new Color3(0.5, 0.83, 1), rimIntensity: 0.8,            // cool cyan halo vs warm key
  },
  dojoWarm: {
    keyDir: new Vector3(-0.3, -0.8, -0.2), keyColor: new Color3(1, 0.84, 0.6), keyIntensity: 0.85,
    fillColor: new Color3(0.58, 0.46, 0.4), fillIntensity: 0.72, groundColor: new Color3(0.28, 0.16, 0.3),
    rimColor: new Color3(1, 0.45, 0.35), rimIntensity: 0.7,           // ember-orange edge
  },
  alpineNoon: {
    keyDir: new Vector3(-0.4, -0.9, 0.2), keyColor: new Color3(1, 1, 0.97), keyIntensity: 1.1,
    fillColor: new Color3(0.78, 0.85, 1), fillIntensity: 0.85, groundColor: new Color3(0.68, 0.76, 0.95),
    rimColor: new Color3(0.75, 0.9, 1), rimIntensity: 0.9,            // ice-blue crest
  },
  stadiumNight: {
    keyDir: new Vector3(-0.35, -0.85, -0.4), keyColor: new Color3(0.85, 0.9, 1), keyIntensity: 1.2,
    fillColor: new Color3(0.3, 0.32, 0.5), fillIntensity: 0.55, groundColor: new Color3(0.12, 0.08, 0.2),
    rimColor: new Color3(1, 0.35, 0.75), rimIntensity: 1.0,           // neon magenta floodlight edge
  },
  default: {
    keyDir: new Vector3(-0.4, -0.8, 0.3), keyColor: new Color3(1, 0.98, 0.95), keyIntensity: 1.0,
    fillColor: new Color3(0.62, 0.64, 0.75), fillIntensity: 0.7, groundColor: new Color3(0.26, 0.24, 0.34),
    rimColor: new Color3(0.55, 0.8, 1), rimIntensity: 0.75,
  },
};

/** Names that read as ground/floor — auto-receivers, never auto-casters. */
const RECEIVER_HINTS = /floor|ground|piste|water|court|pitch|green|plate|mound|shore|park_floor/i;

export class LightRig {
  private key: DirectionalLight;
  private fill: HemisphericLight;
  private rim: DirectionalLight;
  private shadows: ShadowGenerator;
  private autoObserver: ReturnType<Scene['onNewMeshAddedObservable']['add']> | null = null;

  constructor(private scene: Scene, mood: keyof typeof MOOD_LIGHT | string = 'default') {
    const cfg = MOOD_LIGHT[mood] ?? MOOD_LIGHT.default;

    this.fill = new HemisphericLight('fillLight', new Vector3(0, 1, 0), scene);
    this.fill.diffuse = cfg.fillColor;
    this.fill.groundColor = cfg.groundColor;
    this.fill.intensity = cfg.fillIntensity;

    this.key = new DirectionalLight('keyLight', cfg.keyDir, scene);
    this.key.diffuse = cfg.keyColor;
    this.key.intensity = cfg.keyIntensity;
    this.key.position = cfg.keyDir.scale(-40);

    // the anime backlight: opposite the key on the horizontal, always from
    // above; specular ON (it's an edge glint by design), diffuse tinted
    const rimDir = new Vector3(-cfg.keyDir.x, -0.35, -cfg.keyDir.z).normalize();
    this.rim = new DirectionalLight('rimLight', rimDir, scene);
    this.rim.diffuse = cfg.rimColor;
    this.rim.specular = cfg.rimColor;
    this.rim.intensity = cfg.rimIntensity;
    this.rim.position = rimDir.scale(-40);

    // soft, cheap shadows — 1024 map + blur, good enough at arcade camera
    // distances without the cost of PCSS/cascade shadow maps
    this.shadows = new ShadowGenerator(1024, this.key);
    this.shadows.useBlurExponentialShadowMap = true;
    this.shadows.blurKernel = 24;
    this.shadows.darkness = 0.35;             // shadows read, never go pitch black

    this.classifyExisting();
    this.autoObserver = scene.onNewMeshAddedObservable.add((m) => this.classify(m));
  }

  private classify(mesh: AbstractMesh): void {
    if (!mesh.name || mesh.name.startsWith('__')) return;
    if (RECEIVER_HINTS.test(mesh.name)) {
      mesh.receiveShadows = true;
    } else {
      this.shadows.addShadowCaster(mesh, true);
    }
  }
  private classifyExisting(): void {
    for (const m of this.scene.meshes) this.classify(m);
  }

  /** Escape hatch for a mode that wants precise control instead of the
   *  name-heuristic (e.g. a mesh named oddly, or one that should be both). */
  registerCaster(mesh: AbstractMesh): void { this.shadows.addShadowCaster(mesh, true); }
  registerReceiver(mesh: AbstractMesh): void { mesh.receiveShadows = true; }

  setMood(mood: keyof typeof MOOD_LIGHT | string): void {
    const cfg = MOOD_LIGHT[mood] ?? MOOD_LIGHT.default;
    this.key.direction = cfg.keyDir;
    this.key.diffuse = cfg.keyColor;
    this.key.intensity = cfg.keyIntensity;
    this.key.position = cfg.keyDir.scale(-40);
    this.fill.diffuse = cfg.fillColor;
    this.fill.groundColor = cfg.groundColor;
    this.fill.intensity = cfg.fillIntensity;
    const rimDir = new Vector3(-cfg.keyDir.x, -0.35, -cfg.keyDir.z).normalize();
    this.rim.direction = rimDir;
    this.rim.diffuse = cfg.rimColor;
    this.rim.specular = cfg.rimColor;
    this.rim.intensity = cfg.rimIntensity;
    this.rim.position = rimDir.scale(-40);
  }

  dispose(): void {
    if (this.autoObserver) this.scene.onNewMeshAddedObservable.remove(this.autoObserver);
    this.shadows.dispose();
    this.key.dispose();
    this.fill.dispose();
    this.rim.dispose();
  }
}

// WIRING — identical to M44 (constructor/dispose unchanged):
//   const lightRig = new LightRig(scene, modeConfig.mood);
//   ... on mode dispose: lightRig.dispose();
// No mode files change. The rim light and rebalanced fills apply everywhere
// LightRig already mounts.
