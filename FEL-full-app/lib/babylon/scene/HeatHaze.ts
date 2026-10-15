// HEAT HAZE (w3-atmos, wave 3) - the air over a fire pit and a lava lake shimmers. Part B: "Foundry: fire-pit flames, embers,
// heat haze" (karate) and "lava glow with heat distortion at Ember Caldera" (aero).
//
// A refraction-like post, kept cheap: ONE full-screen pass, mounted once after load() and never toggled, whose fragment
// early-outs for every pixel outside a heat source's column (a single texture fetch; no blur, no extra target of its own).
// The distortion is a slow vertical ripple that pushes the picture sideways a few pixels - what warm air does to whatever is
// behind it - strongest at the middle of the column, nothing at its edge.
//
// SOURCES, not modes: whoever makes heat registers a column in `scene.metadata.felHeat` (a pit's flames, the lava) and keeps
// its `strength` up to date; the pass reads the registry every frame. A source is a column in the world (its base, half width
// and height), projected to the screen each frame by `projectColumn` (pure), so the haze stands over the pit from every angle
// and is dropped when the pit is behind the camera or off the frame.
//
// WHERE IT RUNS: desktop and high (a phone has no fill to spare), and not under reduced motion (a shimmer is motion, and
// without the motion it is only a blur). It is attached AFTER the light rig's pipeline - the rig mounts it from captureVenue,
// once load() is done - because the pipeline rebuilds its own chain whenever it enables a pass (the replay's depth of field)
// and a pass attached before that would end up in front of the pipeline's MSAA target. GLSL only (WebGPU is opt-in and blocked).
//
// Not a gameplay thing: nothing reads it, nothing is scored or timed by it.

import { Constants, Matrix, PostProcess, ShaderStore, Texture, Vector3 } from '@babylonjs/core';
import type { Camera, Observer, Scene } from '@babylonjs/core';
import { motionPolicy } from '../../a11y/reducedMotion';
import { lookFeatureOff } from './graphicsSetting';
import type { QualityTier } from './QualityTier';

/** A rising column of hot air. `strength` 0..1 (0 = none now); everything else is in metres, world space. */
export interface HeatSource { x: number; y: number; z: number; halfWidth: number; height: number; strength: number }
export interface HeatRegistry { sources: HeatSource[] }

/** At most this many columns are drawn (the shader's loop bound; the nearest to the middle of the frame win). */
export const HEAT_MAX = 3;
/** The shimmer's reach at full strength, as a fraction of the frame's height (4.1 px at 1080p, whatever the width). */
export const HEAT_AMP = 0.0038;

export function heatRegistry(scene: Scene): HeatRegistry {
  const md = (scene.metadata ??= {}) as { felHeat?: HeatRegistry };
  return (md.felHeat ??= { sources: [] });
}

/** Register a source; returns its remover. */
export function addHeatSource(scene: Scene, src: HeatSource): () => void {
  const reg = heatRegistry(scene);
  reg.sources.push(src);
  return () => { const i = reg.sources.indexOf(src); if (i >= 0) reg.sources.splice(i, 1); };
}

export interface HeatColumn { cx: number; cy: number; rx: number; ry: number; k: number }

/**
 * Pure: a source's column on the screen, in texture uv (origin bottom-left, as the post sees it): the centre, the ellipse's
 * half-extents in uv, and a 0..1 weight that fades the column toward the edges of the frame and with distance.
 * `viewProj` is the camera's view * projection; `eye` its position. Null when the column is behind the camera, entirely off the
 * frame, or too far to read.
 */
export function projectColumn(src: HeatSource, viewProj: Matrix, eye: { x: number; y: number; z: number }, far = 220): HeatColumn | null {
  const mid = new Vector3(src.x, src.y + src.height * 0.5, src.z);
  const dist = Math.hypot(mid.x - eye.x, mid.y - eye.y, mid.z - eye.z);
  if (!(dist > 0.5) || dist > far) return null;
  const p = (v: Vector3): { x: number; y: number; w: number } => {
    const x = v.x * viewProj.m[0] + v.y * viewProj.m[4] + v.z * viewProj.m[8] + viewProj.m[12];
    const y = v.x * viewProj.m[1] + v.y * viewProj.m[5] + v.z * viewProj.m[9] + viewProj.m[13];
    const w = v.x * viewProj.m[3] + v.y * viewProj.m[7] + v.z * viewProj.m[11] + viewProj.m[15];
    return { x, y, w };
  };
  const c = p(mid);
  if (!(c.w > 0.2)) return null;   // behind (or in the plane of) the camera
  const cx = (c.x / c.w) * 0.5 + 0.5, cy = (c.y / c.w) * 0.5 + 0.5;
  // the column's half extents on the screen: half its height straight up, half its width along the camera's right
  const top = p(new Vector3(src.x, src.y + src.height, src.z));
  const ry = top.w > 0.2 ? Math.abs((top.y / top.w) * 0.5 + 0.5 - cy) : 0.5;
  // the camera's right vector in world space is the first column of the view matrix; viewProj mixes in the projection, so the
  // width is taken from a point half-a-width away along the screen's x axis: the same distance, sideways, at the column's depth
  const right = new Vector3(viewProj.m[0], viewProj.m[4], viewProj.m[8]);
  const rl = right.length();
  const side = p(new Vector3(mid.x + (right.x / (rl || 1)) * src.halfWidth, mid.y + (right.y / (rl || 1)) * src.halfWidth, mid.z + (right.z / (rl || 1)) * src.halfWidth));
  const rx = side.w > 0.2 ? Math.abs((side.x / side.w) * 0.5 + 0.5 - cx) : 0.5;
  if (rx < 0.004 || ry < 0.004) return null;   // too small to see
  if (cx + rx < 0 || cx - rx > 1 || cy + ry < 0 || cy - ry > 1) return null;   // wholly off the frame
  const edge = Math.min(1, Math.min(cx, 1 - cx, cy, 1 - cy) / 0.12 + 0.35);   // easing out toward the frame's edge
  const far01 = 1 - Math.max(0, (dist - far * 0.6) / (far * 0.4));
  const close01 = Math.max(0, Math.min(1, (dist - 1.5) / 3.5));   // a camera in the hot air has no haze to look through
  return { cx, cy, rx: Math.min(rx, 0.6), ry: Math.min(ry, 0.8), k: Math.max(0, Math.min(1, edge * far01 * close01)) * Math.max(0, Math.min(1, src.strength)) };
}

/** Pure: the nearest-to-frame-centre `HEAT_MAX` live columns of a registry, as the shader's uniform arrays (4 floats a column: the ellipse; the amplitude apart). */
export function packColumns(cols: readonly HeatColumn[]): { ellipse: number[]; amp: number[] } {
  const live = cols.filter((c) => c.k > 0.001).sort((a, b) => Math.hypot(a.cx - 0.5, a.cy - 0.5) - Math.hypot(b.cx - 0.5, b.cy - 0.5)).slice(0, HEAT_MAX);
  const ellipse: number[] = new Array<number>(HEAT_MAX * 4).fill(0), amp: number[] = new Array<number>(HEAT_MAX * 4).fill(0);
  const put = (a: number[], i: number, v: number[]): void => { for (let k = 0; k < 4; k++) a[i * 4 + k] = v[k]; };
  live.forEach((c, i) => { put(ellipse, i, [c.cx, c.cy, c.rx, c.ry]); amp[i * 4] = HEAT_AMP * c.k; });
  for (let i = live.length; i < HEAT_MAX; i++) put(ellipse, i, [0.5, 0.5, 1e-4, 1e-4]);   // an empty slot: a pixel-sized column nothing falls in
  return { ellipse, amp };
}

const FRAGMENT = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec4 hEllipse[${HEAT_MAX}];
uniform vec4 hAmp[${HEAT_MAX}];
uniform float hTime;
uniform float hAspect;   // height / width: the amplitude is a share of the frame's HEIGHT, so a sideways push is that many PIXELS on any screen
void main(void) {
  vec2 off = vec2(0.0);
  for (int i = 0; i < ${HEAT_MAX}; i++) {
    vec4 e = hEllipse[i];
    vec2 q = (vUV - e.xy) / e.zw;
    float d = dot(q, q);
    if (d < 1.0) {
      float f = 1.0 - d; f *= f;
      float w1 = sin(q.y * 9.0 - hTime * 5.0 + sin(q.x * 3.0 + hTime) * 2.0);
      float w2 = sin(q.y * 17.0 - hTime * 7.3 + 1.3);
      off += vec2((w1 * 0.7 + w2 * 0.3) * hAspect, w2 * 0.12) * hAmp[i].x * f;
    }
  }
  gl_FragColor = texture2D(textureSampler, vUV + off);
}`;

/**
 * The pass must be the LAST in the camera's chain (it reads the finished picture). The light rig mounts it after load, when the
 * pipeline has stopped rebuilding itself - but a rebuild after that (a pass enabled late: a mode's replay depth of field) detaches
 * the pipeline's passes and attaches them again BEHIND this one, which would hand the pipeline an LDR input and lose its MSAA
 * target. If that ever happens this puts the pass back at the end (a one-off chain change on an already-rebuilt chain).
 */
export function keepLast(cam: Camera, post: PostProcess): boolean {
  const list = (cam as unknown as { _postProcesses?: Array<PostProcess | null> })._postProcesses;
  if (!list) return false;
  let last: PostProcess | null = null;
  for (let i = list.length - 1; i >= 0; i--) if (list[i]) { last = list[i]; break; }
  if (last === post || last === null) return false;
  try { cam.detachPostProcess(post); cam.attachPostProcess(post); } catch { return false; }
  return true;
}

export interface HeatHazeHandle {
  readonly post: PostProcess;
  /** The columns drawn last frame (a probe's view). */
  readonly drawn: number;
  dispose(): void;
}

/** Whether this tier and motion setting get the haze at all. Pure. */
export function heatHazeWanted(tier: QualityTier, reducedMotion: boolean, off = false): boolean {
  return tier !== 'mobile' && !reducedMotion && !off;
}

/**
 * Mount the pass if a source exists in the registry (or may appear: `force`), on a desktop/high tier without reduced motion.
 * Called once by the light rig after load(). Returns null when it is not wanted - the scene then has no extra pass at all.
 */
export function mountHeatHaze(scene: Scene, tier: QualityTier, camera?: Camera | null, force = false): HeatHazeHandle | null {
  const reg = heatRegistry(scene);
  if (!heatHazeWanted(tier, !motionPolicy().flash, lookFeatureOff('heat'))) return null;
  if (!force && !reg.sources.length) return null;
  const cam = camera ?? scene.activeCamera ?? scene.cameras[0];
  if (!cam) return null;
  const engine = scene.getEngine();
  ShaderStore.ShadersStore['felHeatHazeFragmentShader'] = FRAGMENT;
  let post: PostProcess;
  try {
    post = new PostProcess('fel_heat_haze', 'felHeatHaze', ['hEllipse', 'hAmp', 'hTime', 'hAspect'], null, 1.0, cam, Texture.BILINEAR_SAMPLINGMODE, engine, false, undefined, Constants.TEXTURETYPE_UNSIGNED_BYTE);
  } catch (e) {
    console.warn('[FEL-HEAT] the haze pass is unavailable, continuing without it:', e);
    return null;
  }
  let t = 0, drawn = 0;
  const vp = new Matrix();
  const cols: HeatColumn[] = [];
  let packed = packColumns([]);
  const obs: Observer<Scene> = scene.onBeforeRenderObservable.add(() => {
    t += Math.min(0.1, engine.getDeltaTime() / 1000);
    keepLast(cam, post);
    cam.getViewMatrix().multiplyToRef(cam.getProjectionMatrix(), vp);
    const eye = cam.globalPosition;
    cols.length = 0;
    for (const s of reg.sources) { if (s.strength <= 0.001) continue; const c = projectColumn(s, vp, eye); if (c) cols.push(c); }
    packed = packColumns(cols); drawn = cols.length;
  });
  post.onApply = (effect) => {
    effect.setArray4('hEllipse', packed.ellipse);
    effect.setArray4('hAmp', packed.amp);
    effect.setFloat('hTime', t);
    effect.setFloat('hAspect', engine.getRenderHeight() / Math.max(1, engine.getRenderWidth()));
  };
  console.info('[FEL-HEAT] heat haze mounted (' + reg.sources.length + ' source' + (reg.sources.length === 1 ? '' : 's') + ')');
  return {
    post,
    get drawn() { return drawn; },
    dispose() { scene.onBeforeRenderObservable.remove(obs); try { post.dispose(cam); } catch { /* the camera went first */ } },
  };
}
