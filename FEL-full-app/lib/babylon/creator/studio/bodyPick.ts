// DIRECT MANIPULATION ON THE REAL BODY (CREATOR-PLAN phase 4d, 2026-10-06): a ray from the pointer against the posed,
// skinned body and its garments (CPU-skinned once per gesture, pickMath.ts says why not scene.pick), and what the hit
// means to the doc — its atom and paint region, its rest-pose point on the chart (for a sticker), the bone that owns the
// skin there (for a part) — plus where the parts are on screen, for tapping one (parts are never pickable, by design).
//
// COSMETIC ONLY. Nothing here makes anything pickable, moves a bone or touches a mesh: it reads vertex buffers and
// matrices. The posed positions are cached per gesture (`invalidate()` when the pose moves on), and the rest data
// (atom weights, rest positions) per kit mesh, like the paint's surface maps.

import { Matrix, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Camera, Mesh, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { boneNode } from '../../anim/boneLookup';
import { bareBone, classify, type Atom, type BodyChart, type V3 } from '../paint/bodyChart';
import { chartForBody, geometryKey, isPaintBody, restSkin } from '../paint/surfaceMap';
import { rigFrames, type RigFrames } from '../parts/rigFrames';
import { nodeMatrix } from '../parts/placement';
import { atomAt, lerpAt, rayTriangles, type TriHit } from './pickMath';
import { boneSegments, dominantBone, framePos, nearestBone, SURFACE_LIFT } from '../../../creator/look/studio/snap';
import { PART_BONES, type CreatorPart, type PartBone, type Vec3 } from '../../../creator/look/doc';
import { renderList } from '../../../creator/look/parts';
import { rotatePart, viewAxisInRoot } from '../../../creator/look/studio/handles';

export interface PickBody { root: TransformNode; meshes: readonly AbstractMesh[]; skeleton?: Skeleton | null }

interface RestData { atomW: Float32Array; P: ArrayLike<number>; J: ArrayLike<number>; W: ArrayLike<number>; J2: ArrayLike<number> | null; W2: ArrayLike<number> | null; bones: readonly string[] }

const restCache = new Map<string, RestData | null>();

function restData(mesh: Mesh, chart: BodyChart, chartKey: string): RestData | null {
  const key = `${chartKey}>${geometryKey(mesh)}`;
  if (restCache.has(key)) return restCache.get(key) ?? null;
  const skin = restSkin(mesh);
  const out = skin ? { atomW: classify(chart, skin).atomW, P: skin.P, J: skin.J, W: skin.W, J2: skin.J2 ?? null, W2: skin.W2 ?? null, bones: skin.bones } : null;
  restCache.set(key, out);
  return out;
}

export interface BodyHit {
  mesh: AbstractMesh;
  /** on the visible (posed) surface, world space */
  point: Vector3;
  /** the surface's outward normal, world space (faces the ray) */
  normal: Vector3;
  dist: number;
  atom: Atom | null;
  /** the same spot at REST, in the skeleton space the paint chart is in (for a sticker's x, y) */
  rest: V3;
  /** the PART_BONE that owns the skin there (strongest interpolated weight) */
  bone: PartBone | null;
}

/** A skinned mesh the pointer can land on: the body and whatever it wears, visible and enabled; never a Creator part,
 *  an eye or the stage. */
export function isPickTarget(m: AbstractMesh): boolean {
  const md = m.metadata as { felCreatorPart?: boolean; felStudioStage?: boolean } | null | undefined;
  return !!m.skeleton && m.isEnabled() && m.isVisible && m.visibility > 0 && !md?.felCreatorPart && !md?.felStudioStage
    && !!(m as Mesh).getIndices?.()?.length && !/eye/i.test(m.name);
}

export class BodyPicker {
  private posed = new Map<AbstractMesh, Float32Array>();
  private chart: BodyChart | null = null;
  private chartKey = '';
  constructor(private body: PickBody) {
    const b = body.meshes.find((m) => isPaintBody(m.name)) as Mesh | undefined;
    if (b) { this.chart = chartForBody(b); this.chartKey = geometryKey(b); }
  }

  get bodyChart(): BodyChart | null { return this.chart; }

  /** The pose moved on: skin again at the next pick. */
  invalidate(): void { this.posed.clear(); }

  private posedOf(m: AbstractMesh): Float32Array | null {
    let p = this.posed.get(m);
    if (!p) {
      const d = (m as Mesh).getPositionData?.(true, true);
      if (!d) return null;
      p = d instanceof Float32Array ? d : Float32Array.from(d);
      this.posed.set(m, p);
    }
    return p;
  }

  /** The nearest hit of a world-space ray on the body or its garments, or null. */
  pick(origin: Vector3, dir: Vector3): BodyHit | null {
    let best: { m: AbstractMesh; hit: TriHit; pos: Float32Array; idx: ArrayLike<number>; world: Matrix } | null = null;
    let bestWorldDist = Infinity;
    for (const m of this.body.meshes) {
      if (!isPickTarget(m)) continue;
      const pos = this.posedOf(m);
      const idx = (m as Mesh).getIndices();
      if (!pos || !idx) continue;
      const world = m.computeWorldMatrix(true);
      const inv = world.clone().invert();
      const o = Vector3.TransformCoordinates(origin, inv);
      const far = Vector3.TransformCoordinates(origin.add(dir), inv);
      const d = far.subtract(o);
      const scale = d.length();
      if (scale < 1e-9) continue;
      d.scaleInPlace(1 / scale);
      const hit = rayTriangles([o.x, o.y, o.z], [d.x, d.y, d.z], pos, idx);
      if (!hit) continue;
      const wd = hit.dist / scale;   // back to world units
      if (wd < bestWorldDist) { bestWorldDist = wd; best = { m, hit, pos, idx, world }; }
    }
    if (!best) return null;
    const { m, hit, pos, idx, world } = best;
    const lp = lerpAt(pos, 3, idx, hit);
    const point = Vector3.TransformCoordinates(new Vector3(lp[0], lp[1], lp[2]), world);
    const a = idx[hit.tri * 3] * 3, b = idx[hit.tri * 3 + 1] * 3, c = idx[hit.tri * 3 + 2] * 3;
    const e1 = new Vector3(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]);
    const e2 = new Vector3(pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]);
    const normal = Vector3.TransformNormal(Vector3.Cross(e1, e2), world).normalize();
    if (Vector3.Dot(normal, dir) > 0) normal.scaleInPlace(-1);
    let atom: Atom | null = null, rest: V3 = [0, 0, 0], bone: PartBone | null = null;
    const R = this.chart ? restData(m as Mesh, this.chart, this.chartKey) : null;
    if (R) {
      atom = atomAt(R.atomW, idx, hit);
      const rp = lerpAt(R.P, 3, idx, hit);
      rest = [rp[0], rp[1], rp[2]];
      bone = dominantBone(weightsAt(R, idx, hit));
    }
    return { mesh: m, point, normal, dist: bestWorldDist, atom, rest, bone };
  }
}

/** The skin weights at a hit, by bare bone name. */
function weightsAt(R: RestData, idx: ArrayLike<number>, hit: TriHit): Map<string, number> {
  const out = new Map<string, number>();
  const bary = [1 - hit.u - hit.v, hit.u, hit.v];
  for (let k = 0; k < 3; k++) {
    const v = idx[hit.tri * 3 + k];
    for (let i = 0; i < 8; i++) {
      const w = i < 4 ? R.W[v * 4 + i] : R.W2 ? R.W2[v * 4 + i - 4] : 0;
      if (!w) continue;
      const j = i < 4 ? R.J[v * 4 + i] : R.J2![v * 4 + i - 4];
      const name = bareBone(R.bones[j] ?? '');
      out.set(name, (out.get(name) ?? 0) + w * bary[k]);
    }
  }
  return out;
}

/** The world ray under a canvas point (CSS px from the canvas's top-left). */
export function rayAt(scene: Scene, camera: Camera, x: number, y: number): { origin: Vector3; dir: Vector3 } {
  const engine = scene.getEngine();
  const k = engine.getHardwareScalingLevel();
  const r = scene.createPickingRay(x / k, y / k, Matrix.Identity(), camera);
  return { origin: r.origin, dir: r.direction };
}

/** World joint positions of the PART_BONES (posed), for the off-skin fallback. */
function worldJoints(sk: Skeleton): Partial<Record<PartBone, V3>> {
  const out: Partial<Record<PartBone, V3>> = {};
  for (const b of PART_BONES) {
    const n = boneNode(sk, b);
    if (!n) continue;
    const t = n.getAbsolutePosition();
    out[b] = [t.x, t.y, t.z];
  }
  return out;
}

/**
 * Where a part dropped at a hit lands: the bone that owns the skin there (or, off the skin, the nearest bone), and its
 * position in that bone's placement frame — the hit lifted SURFACE_LIFT off the surface, carried through the bone's
 * posed node back to the rest pose (world → node local → root space at rest), then measured in the frame. Null on a rig
 * without part frames.
 */
export function snapPlacement(body: PickBody, hit: { point: Vector3; normal?: Vector3 | null; bone?: PartBone | null }, scale = 1): { bone: PartBone; pos: Vec3 } | null {
  const sk = body.skeleton;
  if (!sk) return null;
  const frames = rigFrames(sk, body.root);
  if (!frames) return null;
  const p = hit.normal ? hit.point.add(hit.normal.scale(SURFACE_LIFT * scale)) : hit.point.clone();
  let bone = hit.bone ?? null;
  if (!bone) bone = nearestBone([p.x, p.y, p.z], boneSegments(worldJoints(sk)), scale)?.bone ?? null;
  if (!bone) return null;
  const node = boneNode(sk, bone);
  const restInv = frames.restInv.get(bone), frame = frames.frame.get(bone);
  if (!node || !restInv || !frame) return null;
  const local = Vector3.TransformCoordinates(p, node.computeWorldMatrix(true).clone().invert());
  const rest = Vector3.TransformCoordinates(local, restInv.clone().invert());
  return { bone, pos: framePos([rest.x, rest.y, rest.z], frame) };
}

export interface PartOnScreen { id: string; mirrored: boolean; x: number; y: number; r: number; world: Vector3; bone: PartBone }

/** Every rendered part's centre on screen (CSS px) and its rough on-screen radius — for tapping a part and for the knobs. */
export function partsOnScreen(body: PickBody, parts: readonly CreatorPart[], scene: Scene, camera: Camera, cssW: number, cssH: number): PartOnScreen[] {
  const sk = body.skeleton;
  const frames: RigFrames | null = sk ? rigFrames(sk, body.root) : null;
  if (!sk || !frames) return [];
  const vp = camera.viewport.toGlobal(cssW, cssH);
  const tm = camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true));
  const camPos = camera.globalPosition;
  const fov = (camera as { fov?: number }).fov ?? 0.8;
  const out: PartOnScreen[] = [];
  for (const { part, mirrored } of renderList(parts)) {
    const nm = nodeMatrix(part, frames, mirrored);
    const node = nm ? boneNode(sk, nm.bone) : null;
    if (!nm || !node) continue;
    const w = Vector3.TransformCoordinates(nm.m.getTranslation(), node.computeWorldMatrix(true));
    const s = Vector3.Project(w, Matrix.Identity(), tm, vp);
    if (!(s.z > 0 && s.z < 1)) continue;
    const dist = Vector3.Distance(w, camPos) || 1;
    const size = 0.06 * Math.max(...part.scale.map(Math.abs)) * Math.abs(body.root.scaling.y || 1);
    out.push({ id: part.id, mirrored, x: s.x, y: s.y, r: (size * cssH) / (2 * dist * Math.tan(fov / 2)), world: w, bone: nm.bone });
  }
  return out;
}

/** The part a tap at (x, y) lands on: the nearest projected centre within its radius (at least `minPx`). */
export function partAt(list: readonly PartOnScreen[], x: number, y: number, minPx = 22): PartOnScreen | null {
  let best: PartOnScreen | null = null, bd = Infinity;
  for (const p of list) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= Math.max(minPx, p.r) && d < bd) { bd = d; best = p; }
  }
  return best;
}

/** Tests and probes: forget the per-kit rest data. */
export function clearPickCache(): void { restCache.clear(); }

/**
 * The rotate knob: a part turned about the camera's line of sight by the angle the pointer swept round it on screen
 * (handles.sweptAngle: clockwise on screen positive). Babylon is left-handed with the line of sight pointing INTO the
 * screen, where a positive turn about it reads anticlockwise — so a clockwise sweep is a negative turn. The part follows
 * the pointer either way round (studio.render.test.ts checks it on screen).
 */
export function turnFromScreen(body: PickBody, part: Pick<CreatorPart, 'bone' | 'pos' | 'rot' | 'scale'>, camera: Camera, sweptDeg: number): { rot: Vec3; pos: Vec3 } | null {
  const sk = body.skeleton;
  const frames = sk ? rigFrames(sk, body.root) : null;
  const frame = frames?.frame.get(part.bone);
  if (!frame) return null;
  const view = camera.getForwardRay(1).direction;
  const axis = viewAxisInRoot([view.x, view.y, view.z], body.root.computeWorldMatrix(true));
  return rotatePart(part, frame, axis, -sweptDeg);
}
