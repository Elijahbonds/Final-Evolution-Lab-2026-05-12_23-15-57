// THE STUDIO STAGE (CREATOR-PLAN phase 4d, 2026-10-06): studio light, the environment map, the turntable plinth, the
// camera moves between the full body, the bust and the face, the turntable itself, poses and venue light, and the
// render-on-demand gate — everything the Closet preview's scene needs to be the Studio, in one object the preview owns.
//
// LIGHT. A warm key from the front-left above, a cool rim from behind, a COLOURED back light behind the body (the game's
// cyan in the Studio, the venue's sky under a venue light) and a low hemispheric fill: four lights, the PBR default
// maximum, so no material recompiles for a fifth. The environment map is the repo's procedural IBL (scene/EnvironmentIBL,
// built from a mood's palette — no new art, nothing fetched), so metal parts and glow paint read as they will in a mode.
// A device that cannot build the float cube (a NullEngine, an old phone) just goes without it.
//
// THE FRAME. The scene clears to transparent: the dark, clean frame and the back glow are the page's CSS behind the
// canvas (no backdrop mesh, no texture, no draw call). The plinth is two meshes (a disc and a thin glowing ring): +2
// draws, never pickable.
//
// RENDER ON DEMAND. The preview's loop asks `due()` each frame and draws only when the gate says so (renderGate.ts): the
// camera easing, the turntable turning, a pose playing, paint compositing, a drag — or a short while after any edit.

import { Color3, Color4, DirectionalLight, HemisphericLight, MeshBuilder, SpotLight, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { ArcRotateCamera, Mesh, Scene, TransformNode } from '@babylonjs/core';
import {
  AUTO_SPIN, BODY_HEIGHT, SPIN_PER_PX, approach, approachAngle, clampTilt, clampZoom, decaySpin, frameShot, settled,
  type CameraPose, type Framing, type StudioShot,
} from '../../../creator/look/studio/framing';
import { RenderGate } from '../../../creator/look/studio/renderGate';
import type { StudioPose, StudioVenue } from '../../../creator/look/studio/poses';
import { MOODS, type VenueMood } from '../../scene/moods';

export type StudioTier = 'desktop' | 'mobile';

/** The camera's azimuth that looks at the body's FRONT at turntable yaw 0. Measured on the kit as CharacterLibrary.spawn
 *  leaves it (root rotation (0, 0, 0), unit scale): the body faces +z, so the camera stands at +z (alpha π/2). The
 *  Closet preview's camera stood at −z (alpha −π/2) and saw the back at yaw 0 — the turntable hid it. */
export const FRONT_ALPHA = Math.PI / 2;

export interface LightSpec { key: string; keyI: number; rim: string; rimI: number; back: string; backI: number; sky: string; ground: string; fillI: number; env: VenueMood }

/** The Studio's own light. TUNED (phase 4d — never seen on screen): a warm key, a cool rim, the game's cyan behind. */
export const STUDIO_LIGHT: LightSpec = {
  key: '#FFF1E0', keyI: 1.25, rim: '#D8ECFF', rimI: 1.1, back: '#00E5FF', backI: 2.2, sky: '#8C9BB0', ground: '#0C0C11', fillI: 0.45, env: 'nightGame',
};

/** A venue's light, from its mood (scene/moods.ts): the key is the mood's sun, the fill its sky and ground, the back
 *  light its sky; the environment map is built from the same mood. */
export function lightFor(venue: StudioVenue['id']): LightSpec {
  if (venue === 'studio') return STUDIO_LIGHT;
  const m = MOODS[venue];
  return {
    key: m.sun, keyI: Math.min(1.6, m.sunIntensity * 0.55), rim: m.sky, rimI: 0.9, back: m.sky, backI: 1.6,
    sky: m.sky, ground: m.ground, fillI: m.hemiIntensity * 0.6, env: venue,
  };
}

/** The page's backdrop for a venue lives with the venue list (poses.ts), so the Closet reads it without Babylon. */
export { backdropFor } from '../../../creator/look/studio/poses';

export interface StageBody { root: TransformNode; animator?: { play(name: string, o?: { loop?: boolean; restart?: boolean; onEnd?: () => void; fadeSec?: number }): unknown; freezeAtEnd?(name: string): void } }

export class StudioStage {
  readonly gate: RenderGate;
  readonly lights: { key: DirectionalLight; rim: DirectionalLight; back: SpotLight; fill: HemisphericLight };
  readonly plinth: Mesh[] = [];
  /** the framing the editor asked for */
  shot: StudioShot = 'full';
  facing: number | null = null;
  /** the player's own offsets on top of the shot (pinch / wheel / triggers, tilt, orbit) */
  zoom = 1;
  tilt = 0;
  orbit = 0;
  autoSpin = true;
  spinVelocity = 0;
  venue: StudioVenue['id'] = 'studio';
  height = BODY_HEIGHT;
  presentation = 1;
  private cam: CameraPose;
  private body: StageBody | null = null;
  private disposeEnv: (() => void) | null = null;
  private envOk: boolean;
  private poseClip: string | null = null;

  constructor(private scene: Scene, private camera: ArcRotateCamera, private opts: { tier: StudioTier; env?: boolean; now?: () => number }) {
    this.gate = new RenderGate(opts.now);
    this.envOk = opts.env !== false;
    scene.clearColor = new Color4(0, 0, 0, 0);
    const key = new DirectionalLight('studioKey', new Vector3(0.45, -0.75, 0.6), scene);
    const rim = new DirectionalLight('studioRim', new Vector3(-0.35, -0.35, -0.85), scene);
    const back = new SpotLight('studioBack', new Vector3(0, 1.4, 1.6), new Vector3(0, -0.15, -1), Math.PI / 2.2, 2, scene);
    const fill = new HemisphericLight('studioFill', new Vector3(0, 1, 0), scene);
    this.lights = { key, rim, back, fill };
    this.buildPlinth();
    this.setVenue('studio');
    this.cam = this.target();
    this.applyCamera(this.cam);
  }

  private buildPlinth(): void {
    const disc = MeshBuilder.CreateDisc('studioPlinth', { radius: 0.62, tessellation: this.opts.tier === 'mobile' ? 48 : 96 }, this.scene);
    disc.rotation.x = Math.PI / 2;
    disc.position.y = 0.002;
    const dm = new StandardMaterial('studioPlinthMat', this.scene);
    dm.diffuseColor = Color3.FromHexString('#11151C');
    dm.specularColor = new Color3(0.08, 0.08, 0.1);
    disc.material = dm;
    const ring = MeshBuilder.CreateTorus('studioRing', { diameter: 1.26, thickness: 0.012, tessellation: this.opts.tier === 'mobile' ? 48 : 96 }, this.scene);
    ring.position.y = 0.004;
    const rm = new StandardMaterial('studioRingMat', this.scene);
    rm.disableLighting = true;
    rm.emissiveColor = Color3.FromHexString('#00E5FF');
    ring.material = rm;
    for (const m of [disc, ring]) { m.isPickable = false; m.checkCollisions = false; m.metadata = { felStudioStage: true }; this.plinth.push(m); }
  }

  /** The venue's light (read-only for the look). */
  setVenue(venue: StudioVenue['id']): void {
    this.venue = venue;
    const L = lightFor(venue);
    const { key, rim, back, fill } = this.lights;
    key.diffuse = Color3.FromHexString(L.key); key.intensity = L.keyI;
    key.specular = key.diffuse.scale(0.6);
    rim.diffuse = Color3.FromHexString(L.rim); rim.intensity = L.rimI;
    back.diffuse = Color3.FromHexString(L.back); back.intensity = L.backI;
    back.specular = back.diffuse.scale(0.4);
    fill.diffuse = Color3.FromHexString(L.sky); fill.groundColor = Color3.FromHexString(L.ground); fill.intensity = L.fillI;
    const ring = this.plinth[1]?.material as StandardMaterial | undefined;
    if (ring) ring.emissiveColor = Color3.FromHexString(venue === 'studio' ? '#00E5FF' : L.back);
    this.mountEnv(L.env);
    this.gate.kick();
  }

  private mountEnv(mood: VenueMood): void {
    this.disposeEnv?.();
    this.disposeEnv = null;
    if (!this.envOk) return;
    // a float cube map: a NullEngine or a device without float textures throws — the Studio goes without reflections
    import('../../scene/EnvironmentIBL').then(({ mountEnvironmentIBL }) => {
      if (lightFor(this.venue).env !== mood) return;   // a later venue won
      try { this.disposeEnv = mountEnvironmentIBL(this.scene, mood); this.scene.environmentIntensity = 0.7; this.gate.kick(); }
      catch { this.envOk = false; }
    }).catch(() => { this.envOk = false; });
  }

  /** The body the stage turns and frames (a respawn hands over the new one). */
  setBody(body: StageBody | null, height?: number): void {
    this.body = body;
    if (height && height > 0.3) this.height = height;
    this.poseClip = null;
    this.gate.kick();
  }

  /** The body's standing height as shown (m: its frame and Studio size included) — the shots are in body heights. */
  setHeight(h: number): void {
    if (!(h > 0.3) || Math.abs(h - this.height) < 1e-4) return;
    this.height = h;
    this.gate.hold('camera');
  }

  /** A pad's sticks and triggers this frame (input.padAxes): spin the turntable, orbit, tilt and zoom the camera. */
  padMove(a: { spin: number; orbit: number; tilt: number; zoom: number }, dt: number): void {
    if (!a.spin && !a.orbit && !a.tilt && !a.zoom) { this.gate.hold('pad', false); return; }
    this.gate.hold('pad');
    if (a.spin && this.body) { this.facing = null; this.autoSpin = false; this.body.root.rotation.y += a.spin * dt; }
    this.orbit += a.orbit * dt;
    this.tilt = clampTilt(this.tilt + a.tilt * dt);
    if (a.zoom) this.zoom = clampZoom(this.zoom * (1 - a.zoom * dt));
  }

  setPresentation(p: number): void {
    if (Math.abs(p - this.presentation) < 1e-6) return;
    this.presentation = p;
    this.gate.hold('camera');
  }

  /** Move to the framing the editor wants (a tab or a selection). Resets the player's zoom and tilt; a facing turns the
   *  turntable to show that side and stops the auto spin. */
  frame(f: Framing): void {
    if (f.shot === this.shot && f.facing === this.facing) return;
    this.shot = f.shot;
    this.facing = f.facing;
    this.zoom = 1; this.tilt = 0;
    if (f.facing != null) { this.autoSpin = false; this.spinVelocity = 0; }
    this.gate.hold('camera');
  }

  setShot(shot: StudioShot): void { this.frame({ shot, facing: null }); }

  setAutoSpin(on: boolean): void {
    this.autoSpin = on;
    if (on) this.facing = null;
    this.gate.hold('turntable', on);
  }

  /** A one-finger / left-button drag on the stage: turn the turntable (CSS px). */
  spinBy(dxPx: number): void {
    if (!this.body) return;
    this.facing = null;
    this.body.root.rotation.y -= dxPx * SPIN_PER_PX;
    this.gate.touch();
  }
  /** Let go of a spin with this velocity (CSS px / s): it carries on and slows down. */
  fling(vxPxPerS: number): void {
    this.spinVelocity = -vxPxPerS * SPIN_PER_PX;
    if (this.spinVelocity) this.gate.hold('spin');
  }
  /** Two fingers / right button: orbit the camera (px) — sideways round the body, up and down as a tilt. */
  orbitBy(dxPx: number, dyPx: number): void {
    this.orbit += dxPx * 0.006;
    this.tilt = clampTilt(this.tilt - dyPx * 0.004);
    this.gate.hold('camera');
  }
  /** Pinch / wheel / triggers: > 1 brings the camera closer. */
  zoomBy(factor: number): void {
    if (!(factor > 0)) return;
    this.zoom = clampZoom(this.zoom / factor);
    this.gate.hold('camera');
  }

  /** Play a pose (read-only for the look). A held pose plays once and freezes on its last frame. */
  playPose(p: StudioPose): void {
    const a = this.body?.animator;
    if (!a) return;
    const clip = p.clip ?? 'idle_stand';
    this.poseClip = clip;
    this.gate.hold('pose');
    a.play(clip, {
      loop: !p.hold, restart: true, fadeSec: 0.25,
      onEnd: p.hold ? () => { if (this.poseClip === clip) { a.freezeAtEnd?.(clip); this.gate.hold('pose', false); } } : undefined,
    });
    if (!p.hold) { this.gate.hold('pose', false); this.gate.touch(); }
  }

  /** The camera pose the framing and the player's offsets ask for. */
  target(): CameraPose {
    const s = frameShot(this.shot, this.height, this.presentation);
    return { targetY: s.targetY, radius: s.radius * this.zoom, beta: s.beta + this.tilt };
  }

  private applyCamera(c: CameraPose): void {
    const cam = this.camera;
    cam.target = new Vector3(0, c.targetY, 0);
    cam.radius = c.radius;
    cam.beta = c.beta;
    cam.alpha = FRONT_ALPHA + this.orbit;
  }

  /** One frame (dt in seconds): ease the camera, turn the turntable. Call before the render. */
  update(dt: number): void {
    const t = this.target();
    const cur = this.cam;
    const next = { targetY: approach(cur.targetY, t.targetY, dt, 0.09), radius: approach(cur.radius, t.radius, dt, 0.09), beta: approach(cur.beta, t.beta, dt, 0.09) };
    const done = settled(next, t, 1e-3) && Math.abs(this.camera.alpha - (FRONT_ALPHA + this.orbit)) < 1e-6;
    this.cam = done ? t : next;
    this.applyCamera(this.cam);
    if (done && this.gate.holding('camera')) this.gate.hold('camera', false);
    const root = this.body?.root;
    if (!root) return;
    if (this.facing != null) {
      root.rotation.y = approachAngle(root.rotation.y, this.facing, dt, 0.12);
      if (Math.abs(root.rotation.y - this.facing) < 1e-3) { root.rotation.y = this.facing; }
      else this.gate.kick(200);
    } else if (this.spinVelocity) {
      root.rotation.y += this.spinVelocity * dt;
      this.spinVelocity = decaySpin(this.spinVelocity, dt);
      if (!this.spinVelocity) this.gate.hold('spin', false);
    } else if (this.autoSpin) {
      root.rotation.y += AUTO_SPIN * dt;
    }
    this.gate.hold('turntable', this.autoSpin && this.facing == null);
  }

  /** The current camera numbers (tests, the photo's framing). */
  get cameraPose(): CameraPose { return { ...this.cam }; }

  /** Keep drawing while a paint composite or a bendable part still has frames of work. */
  busy(reason: 'paint', on: boolean): void { this.gate.hold(reason, on); }

  dispose(): void {
    this.disposeEnv?.();
    for (const m of this.plinth) { m.material?.dispose(); m.dispose(); }
    for (const l of Object.values(this.lights)) l.dispose();
  }
}

/** Ease a value toward its target: re-exported for the preview's own smoothing (the knob overlay). */
export { approach };
