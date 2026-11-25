// contactShadow — Pass 7 phase 8: a soft dark disc under every body. The light rig's shadow map grounds the athletes only
// where the sun reaches; under a bright dusk ambient the feet float. The disc rides the body's x/z on the floor it spawned
// on, fades as the body rises (a jump, a dunk hang) and re-anchors when the body has stayed at a new height for a while
// (a rider descending the piste). No texture: the soft edge is VERTEX alpha on a 24-slice disc (a textured plane never
// showed — the alpha-tested texture path drew nothing, measured 2026-09-06). One unlit material per body, no picking.
import { Color3, Matrix, Mesh, MeshBuilder, Quaternion, StandardMaterial, Vector3, VertexBuffer } from '@babylonjs/core';
import type { DirectionalLight, Observer, Scene, TransformNode } from '@babylonjs/core';
import { feel } from '@/lib/feel-panel/feel';
import { urlLook } from '../scene/QualityTier';   // depth pass: ?look.<knob>= for one load

export type ContactShadowOpts = { diameter?: number; strength?: number };

/** The disc's floor, frame to frame. Pure so the rule is testable (lib/babylon/visual/contactShadow.test.ts). */
export interface FloorState { floorY: number; awaySince: number }
/**
 * A body ABOVE its floor is jumping: the disc stays on the floor and fades; after 1.6 s at a new height it re-anchors (a
 * body that climbed onto a platform). A body BELOW its floor is on a floor that went down — a disc must never float over
 * the feet, so the floor follows it at once. GATE-CRASHER-MAJOR (2026-09-28): the snow rider descends the piste at
 * ~2.5 m/s of drop, so the 1.6 s rule hung his disc up to 4 m ABOVE him at full strength and popped it down every 1.6 s
 * — the "dark disc at head height" in every snowboard frame.
 */
export function followFloor(st: FloorState, y: number, t: number): void {
  const rise = y - st.floorY;
  if (rise < -0.02) { st.floorY = y; st.awaySince = -1; return; }
  if (Math.abs(rise) > 0.45) { if (st.awaySince < 0) st.awaySince = t; else if (t - st.awaySince > 1.6) { st.floorY = y; st.awaySince = -1; } }
  else { st.awaySince = -1; if (Math.abs(rise) < 0.12) st.floorY += (y - st.floorY) * 0.2; }   // ride the floor's small changes (steps, ramps)
}

// ── THE PHONE'S POOL (lane/owner-1016, 2026-10-16) ────────────────────────────────────────────────────────────────────────
// One disc per body is one active mesh, one draw and one material per body: karate's nine mooks and its hero were 10 of the
// phone's 89 active meshes (budget 77) and 10 draws. On the mobile tier every body's disc is an INSTANCE of one disc mesh
// (thin instances: one draw for all of them). The look is the same disc and the same rule per body (followFloor, the fade with
// height, the growth, the hide for a body still materialising); what moves out of the material is the per-body alpha, which
// rides each instance's colour (the instance colour multiplies the disc's vertex alpha, as the per-disc material alpha did).
// Desktop and high keep a disc and a material per body.
const POOL_START = 16;
interface Slot { root: TransformNode; st: FloorState; d: number; strength: number }
interface Pool {
  base: Mesh; mat: StandardMaterial; slots: Array<Slot | null>; matrices: Float32Array; colors: Float32Array; obs: Observer<Scene> | null;
  /** look.phoneFeetPool, read once when the pool is made (the next game load takes a new value); 0 = today's disc. */
  feet: number;
  /** The sun the pool leans away from (the rig's `fel_sun`), found on the first tick that has it. */
  sun: DirectionalLight | null;
}

// ── THE FEET POOL (depth pass phase 1, lane depth-light, 2026-11-25; docs/DEPTH-PASS-AUDIT.md finding 1) ───────────────────────────
// On a phone the players did not stand on the court: the disc above (strength 0.38, its alpha falling off as (1 - r)^1.5) averages
// to a few percent of darkening over a 0.9 m circle and does not read on a bright court, and the phone's one 512 px shadow map gives a
// body a few texels. `look.phoneFeetPool` (0 = today's disc exactly) turns the phone's pooled disc into a soft drop shadow: darker
// (the knob's value is the pool's centre darkness), a flatter core (POOL_PROFILE), and stretched and shifted along the sun's ground
// direction by how low the sun is (feetPoolShape), so it reads as the body's own shadow pooling at its feet. Same mesh, same one draw,
// same rule per body (followFloor, the fade with height, the growth, nothing for a body still materialising). Mobile tier only:
// desktop and high keep a disc per body as before (they draw cascades).
// THE STAR UNDER THE SHOES WAS THIS DISC (measured 2026-11-25, every tier): the Venice street court is painted on a plane at y 0.02
// (veniceBoardwalk.ts mountStreetCourt) and the disc lies at the floor + 0.02 — the same plane. Its 24 fan triangles fought the court
// for depth, and the ones that lost left dark wedges radiating from the feet (the audit's "four-pointed star", which it put down to
// the phone's shadow map: the high tier, with no phone map, draws it too). `look.discOverCourt` (0 = today) draws the disc with a
// polygon offset (DISC_Z_OFFSET, as the ground decals do), so it always lies over a floor it shares a plane with. Every tier.
/** look.discOverCourt's shipped value: 0 = today (the disc can z-fight a floor drawn in its plane). */
export const DISC_OVER_COURT = 0;
/** The disc's depth offset with look.discOverCourt on (Babylon material zOffset: polygon offset units, toward the camera). */
export const DISC_Z_OFFSET = -2;
const discOverCourt = (): boolean => (urlLook('look.discOverCourt') ?? feel('look.discOverCourt', DISC_OVER_COURT)) >= 0.5;

/** look.phoneFeetPool's shipped value: 0 = today's disc (see FEEL-PANEL.md for the measured candidate). */
export const PHONE_FEET_POOL = 0;
/** The pool's alpha profile across its radius r (0 centre .. 1 rim): (1 - r^2)^POOL_PROFILE — a flat core, a soft rim. */
export const POOL_PROFILE = 1.6;
/** The most the pool stretches along the sun (a grazing sun), and how far its centre leans away from the sun (× the stretch). */
export const POOL_MAX_STRETCH = 1.8, POOL_LEAN = 0.18;

/** Pure: the pool's shape for a sun travelling along `dir` — stretch along the ground direction (1 = round), the lean of its centre
 *  (metres per metre of disc diameter, along that direction) and the yaw that turns the disc's long axis onto it. */
export function feetPoolShape(dir: { x: number; y: number; z: number } | null): { stretch: number; leanX: number; leanZ: number; yaw: number } {
  if (!dir) return { stretch: 1, leanX: 0, leanZ: 0, yaw: 0 };
  const h = Math.hypot(dir.x, dir.z), v = Math.abs(dir.y);
  if (h < 1e-4) return { stretch: 1, leanX: 0, leanZ: 0, yaw: 0 };   // a sun straight overhead: a round pool
  const stretch = Math.min(POOL_MAX_STRETCH, 1 + 0.5 * h / Math.max(v, 1e-3));
  const gx = dir.x / h, gz = dir.z / h;
  const lean = POOL_LEAN * (stretch - 1) / (POOL_MAX_STRETCH - 1);
  return { stretch, leanX: gx * lean, leanZ: gz * lean, yaw: Math.atan2(-gz, gx) };
}
const pools = new WeakMap<Scene, Pool>();
const isMobile = (scene: Scene): boolean => (scene.metadata as { felTier?: string } | null)?.felTier === 'mobile';

/** The disc: unit diameter, lying flat (the rotation rides each instance), soft edge as vertex alpha. */
function discMesh(scene: Scene, name: string, r: number, pool = false): Mesh {
  const disc = MeshBuilder.CreateDisc(name, { radius: r, tessellation: 24, sideOrientation: Mesh.DOUBLESIDE }, scene);
  const pos = disc.getVerticesData(VertexBuffer.PositionKind)!;
  const colors = new Float32Array((pos.length / 3) * 4);
  for (let i = 0; i < pos.length / 3; i++) {
    const dist = Math.hypot(pos[i * 3], pos[i * 3 + 1]) / r;          // the disc lies in XY before the tilt
    const a = pool ? Math.max(0, 1 - dist * dist) ** POOL_PROFILE      // the feet pool: a flat core, a soft rim
      : Math.max(0, 1 - dist) ** 1.5;                                   // 1 at the centre, 0 at the rim, most of the disc already faint
    colors[i * 4] = 0; colors[i * 4 + 1] = 0; colors[i * 4 + 2] = 0; colors[i * 4 + 3] = a;
  }
  disc.setVerticesData(VertexBuffer.ColorKind, colors, false, 4);
  disc.hasVertexAlpha = true;
  disc.isPickable = false; disc.receiveShadows = false;
  return disc;
}

const _scale = new Vector3(), _pos = new Vector3(), _flat = Quaternion.RotationAxis(Vector3.Right(), Math.PI / 2), _m = new Matrix();
const _rot = new Quaternion(), _yaw = new Quaternion();

function poolFor(scene: Scene): Pool {
  let pool = pools.get(scene);
  if (pool) return pool;
  // (the name ends `_contact`: LightRig, GlossyFloor and VenueReflection keep a contact disc out of their lists by that suffix)
  const feet = Math.max(0, Math.min(1, urlLook('look.phoneFeetPool') ?? feel('look.phoneFeetPool', PHONE_FEET_POOL)));
  const base = discMesh(scene, 'fel_discs_contact', 0.5, feet > 0);
  const mat = new StandardMaterial('fel_discs_contact_m', scene);
  mat.disableLighting = true; mat.emissiveColor = Color3.Black(); mat.diffuseColor = Color3.Black(); mat.specularColor = Color3.Black();
  mat.backFaceCulling = false; mat.alpha = 1;      // the alpha is each instance's colour; the vertex alpha turns blending on
  if (discOverCourt()) mat.zOffset = DISC_Z_OFFSET;   // depth pass phase 1: over a court painted in its plane (no star)
  base.material = mat;
  base.alwaysSelectAsActiveMesh = true;            // its instances move every frame; its own bounds are the origin's
  const made: Pool = { base, mat, slots: [], matrices: new Float32Array(0), colors: new Float32Array(0), obs: null, feet, sun: null };
  growPool(made, POOL_START);
  made.obs = scene.onBeforeRenderObservable.add(() => tickPool(made));
  base.onDisposeObservable.add(() => { if (made.obs) scene.onBeforeRenderObservable.remove(made.obs); made.obs = null; pools.delete(scene); mat.dispose(); });
  pools.set(scene, made);
  return made;
}

function growPool(pool: Pool, cap: number): void {
  const m = new Float32Array(cap * 16), c = new Float32Array(cap * 4);
  m.set(pool.matrices); c.set(pool.colors);
  pool.matrices = m; pool.colors = c;
  while (pool.slots.length < cap) pool.slots.push(null);
  pool.base.thinInstanceSetBuffer('matrix', pool.matrices, 16, false);
  pool.base.thinInstanceSetBuffer('color', pool.colors, 4, false);
}

function tickPool(pool: Pool): void {
  const t = performance.now() / 1000;
  const { slots, matrices, colors } = pool;
  // the feet pool leans away from the sun: its shape once per frame (the sun is a mood's, fixed per load; a weather may turn it)
  let shape = null as ReturnType<typeof feetPoolShape> | null;
  if (pool.feet > 0) {
    if (!pool.sun || pool.sun.isDisposed()) pool.sun = (pool.base.getScene().getLightByName('fel_sun') as DirectionalLight | null) ?? null;
    shape = feetPoolShape(pool.sun?.direction ?? null);
    Quaternion.RotationAxisToRef(Vector3.Up(), shape.yaw, _yaw);
    _yaw.multiplyToRef(_flat, _rot);   // lie flat, then turn the long axis onto the sun's ground direction
  }
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s) continue;
    const p = s.root.position;
    followFloor(s.st, p.y, t);
    const floorY = s.st.floorY;
    const h = Math.max(0, p.y - floorY);
    const k = Math.max(0, 1 - h / 2.6);
    const shown = k > 0.02 && s.root.isEnabled() && s.root.scaling.x > 0.25;   // a body still materialising casts nothing
    const sc = shown ? s.d * (1 + h * 0.35) : 0;
    if (shape) {
      _scale.set(sc * shape.stretch, sc, sc); _pos.set(p.x + shape.leanX * sc, floorY + 0.02, p.z + shape.leanZ * sc);
      Matrix.ComposeToRef(_scale, _rot, _pos, _m);
    } else {
      _scale.set(sc, sc, sc); _pos.set(p.x, floorY + 0.02, p.z);
      Matrix.ComposeToRef(_scale, _flat, _pos, _m);
    }
    _m.copyToArray(matrices, i * 16);
    colors[i * 4 + 3] = shown ? (shape ? Math.max(s.strength, pool.feet) : s.strength) * k * k : 0;
  }
  pool.base.thinInstanceBufferUpdated('matrix');
  pool.base.thinInstanceBufferUpdated('color');
}

function attachPooled(scene: Scene, root: TransformNode, opts: ContactShadowOpts): Mesh {
  const pool = poolFor(scene);
  let i = pool.slots.indexOf(null);
  if (i < 0) { i = pool.slots.length; growPool(pool, pool.slots.length * 2); }
  pool.slots[i] = { root, st: { floorY: root.position.y, awaySince: -1 }, d: opts.diameter ?? 0.9, strength: opts.strength ?? 0.38 };
  pool.base.thinInstanceCount = pool.slots.length;
  root.onDisposeObservable.add(() => {
    pool.slots[i] = null;
    pool.matrices.fill(0, i * 16, i * 16 + 16); pool.colors[i * 4 + 3] = 0;   // a zero matrix draws nothing
  });
  return pool.base;
}

/** Test hook: each instance's alpha (the disc's strength × the fade with height squared; 0 for a hidden or free slot). */
export function contactPoolAlphas(scene: Scene): number[] { const p = pools.get(scene); return p ? p.slots.map((_, i) => p.colors[i * 4 + 3]) : []; }
/** Test hook: one instance's 4x4 matrix as the draw reads it. */
export function contactPoolMatrix(scene: Scene, i: number): Float32Array { const p = pools.get(scene); return p ? p.matrices.slice(i * 16, i * 16 + 16) : new Float32Array(16); }
/** Test hook: the feet-pool value this scene's pool was made with (0 = today's disc). */
export function contactPoolFeet(scene: Scene): number { return pools.get(scene)?.feet ?? 0; }
/** The pool's size on a scene (a test hook): how many bodies hold a slot. */
export function contactPoolBodies(scene: Scene): number { return pools.get(scene)?.slots.filter(Boolean).length ?? 0; }

/** Attach a contact disc to a body root; it disposes with the root. Returns the disc (on a phone, the one disc all bodies share). */
export function attachContactShadow(scene: Scene, root: TransformNode, opts: ContactShadowOpts = {}): Mesh {
  if (isMobile(scene)) return attachPooled(scene, root, opts);
  // EYE SORES (2026-09-17): at 1.2 m / 0.6 the discs under a crowd of fighters merged into one huge dark smudge — a tighter, lighter, softer disc
  const d = opts.diameter ?? 0.9, strength = opts.strength ?? 0.38;
  const r = d / 2;
  const disc = discMesh(scene, `${root.name}_contact`, r);
  disc.rotation.x = Math.PI / 2;
  const mat = new StandardMaterial(`${root.name}_contact_m`, scene);
  mat.disableLighting = true; mat.emissiveColor = Color3.Black(); mat.diffuseColor = Color3.Black(); mat.specularColor = Color3.Black();
  mat.backFaceCulling = false; mat.alpha = strength;
  if (discOverCourt()) mat.zOffset = DISC_Z_OFFSET;   // depth pass phase 1: over a court painted in its plane (no star)
  disc.material = mat;
  const st: FloorState = { floorY: root.position.y, awaySince: -1 };
  const obs = scene.onBeforeRenderObservable.add(() => {
    const p = root.position;
    followFloor(st, p.y, performance.now() / 1000);
    const floorY = st.floorY;
    const h = Math.max(0, p.y - floorY);
    const k = Math.max(0, 1 - h / 2.6);
    disc.position.set(p.x, floorY + 0.02, p.z);
    disc.scaling.setAll(1 + h * 0.35);
    mat.alpha = strength * k * k;
    disc.isVisible = k > 0.02 && root.isEnabled() && root.scaling.x > 0.25;   // a body still materialising (scaled to nothing) casts nothing — a lone disc read as an eye sore
  });
  root.onDisposeObservable.add(() => { scene.onBeforeRenderObservable.remove(obs); mat.dispose(); disc.dispose(); });
  return disc;
}
