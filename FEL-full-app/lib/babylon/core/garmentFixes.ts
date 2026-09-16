// garmentFixes — runtime read fixes for kit garments (owner decision 2026-09-05, "Per-sport defaults" pass).
//
// The garments are fitted in the owner's MPFB pipeline and shipped as skinned meshes inside the hero GLB. Two of them
// read wrong under the venue grade and the owner ruled they be fixed with materials and transforms at runtime, never by
// editing GLB bytes. Measured 2026-09-05 on the karate harness (live pose; ankle joint = LeftFoot bone at world y
// 0.19, knee = LeftLeg at 0.51): `shoes_evo` (MakeHuman hero boots) stands 0.51 m from sole to top — a knee boot —
// while `shoes_flight` (MakeHuman shoes01) stands 0.22 m, a trainer already. Both wore roughness 0.45 with a faint
// emissive, the glossy read. (The audit had the boot down as `shoes_flight`: the harness shows the body's FIRST shoe,
// which is evo, while the Closet's default is flight.)
//
// What this does, on the SHOWN shoe clone only (kit.applyKit calls it):
//   1. Sneaker material: matte (roughness ≥ 0.85), metallic 0, no emissive, sheen off. The Closet tint still lands on
//      this material afterwards (playerIdentity.tintSlot clones it), so the upper keeps the player's colour. The light
//      rig's ambient floor (LightRig.liftBlackMaterials: emissive = 6 % of albedo on every material) applies after.
//   2. A boot — a shoe taller than BOOT_HEIGHT from sole to top — has its shaft folded down to a hi-top collar that
//      ends HI_TOP_CUT + COLLAR_HEIGHT above the sole. Not `scaling.y` on the mesh: a skinned mesh's scaling squashes
//      the ANIMATED result about the mesh origin, so a lifted foot would detach from the shin. Instead each vertex
//      above the cut is moved in bind space so that its rest-pose world height folds to the collar (skinning inverted
//      per vertex through Σ wᵢMᵢ), which keeps every weight and follows the shin bone like the rest of the shoe.
//      Heights are measured on the shoe itself (sole bottom up), not on a joint: the rest pose a spawn holds when
//      applyKit runs puts the ankle joint 10 cm lower than the live idle does, so a joint-relative cut moved with
//      the pose (measured: it folded the trainer on the skater). Only this clone's geometry changes
//      (makeGeometryUnique); the loaded container and the GLB are untouched.
//   3. Two-tone: the sole triangles (the bottom SOLE_THICKNESS of the shoe) move to a sibling mesh with a light matte
//      material whose names carry no `shoe`, so tintSlot leaves the sole light while the upper takes the tint.
// A spawn whose skeleton has not posed the shoe yet (parked rivals measure a 0.16 m boot) gets the geometry pass on
// its first rendered frame instead. Everything here is best-effort and never throws into the spawn: a fake mesh (unit
// tests), a mesh without a skeleton or without geometry gets the material pass or nothing.
import { Color3, Matrix, Mesh, PBRMaterial, Vector3, VertexBuffer } from '@babylonjs/core';
import type { AbstractMesh, FloatArray, IndicesArray, Skeleton } from '@babylonjs/core';
import type { KitSlot } from './kit';

export const SNEAKER_ROUGHNESS = 0.85;
/** A shoe taller than this (m, sole bottom to top, rest pose) is a boot and gets its shaft folded. */
export const BOOT_HEIGHT = 0.32;
/** The collar cut, above the sole bottom (a hi-top's collar sits just over the ankle)… */
export const HI_TOP_CUT = 0.16;
/** …and the folded shaft becomes a collar this tall. */
const COLLAR_HEIGHT = 0.035;
/** The bottom of the shoe that becomes the light sole. */
/**
 * THE SOLE IS THE ONLY THING THAT READS (appearance pass, 2026-09-16).
 *
 * A shoe is about twelve pixels tall at the distance these cameras sit at, and a 3 cm sole inside that is two of them:
 * cropped close on the dunker, both shoes were small red blobs with no sole visible at all, which is also how they
 * looked in motion. A real basketball shoe's midsole is 3–4 cm, but what makes a shoe legible from ten metres is the
 * LIGHT BAND under a dark upper — so the split runs up to where a midsole actually ends (5 cm) and the sole is a
 * proper off-white rather than a bone tint that disappears into a tanned ankle.
 */
const SOLE_THICKNESS = 0.05;
const SOLE_COLOR = '#F4F2EC';
/** A skinned shoe shorter than this has not been posed yet (a parked rival's skeleton at spawn, measured 0.16 m
 *  for a 0.5 m boot); its geometry pass waits for the first render. */
const MIN_POSED_SHOE_HEIGHT = 0.19;

const fixed = new WeakSet<AbstractMesh>();
const soleOf = new WeakMap<AbstractMesh, Mesh>();

/** Keep a garment's split-off sole showing exactly when the garment shows. Safe on any mesh. */
export function syncGarmentVisibility(mesh: AbstractMesh): void {
  const sole = soleOf.get(mesh);
  if (sole && !sole.isDisposed()) sole.isVisible = mesh.isVisible;
}

/** Apply the read fixes for a garment that applyKit just chose to show. Idempotent per mesh instance. */
export function fixGarment(mesh: AbstractMesh, slot: KitSlot, itemId: string): void {
  if (slot === 'tops' || slot === 'shorts') { liftOffBody(mesh, slot); return; }
  if (slot !== 'shoes') return;
  if (!(mesh instanceof Mesh) || fixed.has(mesh)) { syncGarmentVisibility(mesh); return; }
  fixed.add(mesh);
  let result = 'none';
  try {
    result = fixShoe(mesh, itemId);
  } catch (e) {
    result = 'failed';
    console.warn(`[FEL-KIT] shoe fix skipped on ${mesh.name}: ${String((e as Error)?.message ?? e).slice(0, 140)}`);
  }
  // a fresh metadata object: the loader's metadata may be shared with the container's source mesh
  mesh.metadata = { ...(mesh.metadata ?? {}), felGarmentFix: result };
  syncGarmentVisibility(mesh);
}

function fixShoe(mesh: Mesh, itemId: string): string {
  const notes: string[] = [];
  if (sneakerMaterial(mesh)) notes.push('matte');
  const skeleton = mesh.skeleton;
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = mesh.getIndices();
  if (!skeleton || !positions || !indices || !indices.length) return notes.join('+') || 'material-only';
  const geometry = fixShoeGeometry(mesh, itemId, skeleton, positions, indices);
  if (geometry === null) {
    // not posed yet: once, on the first frame this mesh actually renders (the skeleton is prepared by then)
    mesh.onBeforeRenderObservable.addOnce(() => {
      try {
        const late = fixShoeGeometry(mesh, itemId, skeleton, positions, indices) ?? 'unposed';
        mesh.metadata = { ...(mesh.metadata ?? {}), felGarmentFix: `${notes.join('+')}+late:${late}` };
      } catch (e) { console.warn(`[FEL-KIT] late shoe fix skipped on ${mesh.name}: ${String((e as Error)?.message ?? e).slice(0, 140)}`); }
    });
    notes.push('deferred');
    return notes.join('+');
  }
  notes.push(geometry);
  return notes.join('+');
}

/** The fold + sole split. Returns the note, or null when the skeleton has not posed the shoe yet. */
function fixShoeGeometry(mesh: Mesh, itemId: string, skeleton: Skeleton, positions: FloatArray, indices: IndicesArray): string | null {
  const notes: string[] = [];
  const skin = skinnedRest(mesh, skeleton, positions);
  if (!skin) return 'material-only';
  const { world, sums } = skin;
  const n = positions.length / 3;
  let minY = Infinity, maxY = -Infinity;
  for (let v = 0; v < n; v++) { const y = world[v * 3 + 1]; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const height = maxY - minY;
  if (height < MIN_POSED_SHOE_HEIGHT) return null;
  notes.push(`shoe ${height.toFixed(3)} tall`);

  // ── 2. fold a boot shaft to a hi-top collar
  let newPositions: Float32Array | null = null;
  let newSkin: { mi: Float32Array; mw: Float32Array } | null = null;
  if (height > BOOT_HEIGHT) {
    ({ positions: newPositions, skin: newSkin } = foldShaft(mesh, skeleton, positions, world, sums, minY + HI_TOP_CUT, maxY));
    notes.push(`folded to ${(HI_TOP_CUT + COLLAR_HEIGHT).toFixed(3)}`);
  }

  // ── 3. split the sole off
  const soleTop = minY + SOLE_THICKNESS;
  const sole: number[] = [], upper: number[] = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    const low = world[a * 3 + 1] < soleTop && world[b * 3 + 1] < soleTop && world[c * 3 + 1] < soleTop;
    (low ? sole : upper).push(a, b, c);
  }
  const splitSole = sole.length >= 12 && upper.length >= 12;

  if (!newPositions && !splitSole) return notes.join('+');
  mesh.makeGeometryUnique();   // this clone only — the container's source geometry stays as loaded
  if (newPositions) mesh.setVerticesData(VertexBuffer.PositionKind, newPositions, false);
  if (newSkin) { mesh.setVerticesData(VertexBuffer.MatricesIndicesKind, newSkin.mi, false); mesh.setVerticesData(VertexBuffer.MatricesWeightsKind, newSkin.mw, false); }
  if (splitSole) {
    const suffix = /_c\d+$/.exec(mesh.name)?.[0] ?? '';
    const short = itemId.replace(/^shoes_/, '');
    const soleMesh = mesh.clone(`KitSole_${short}${suffix}`, mesh.parent, true);
    soleMesh.makeGeometryUnique();
    soleMesh.setIndices(sole, null, false);
    soleMesh.material = soleMaterial(mesh, short);
    soleMesh.metadata = { felSoleOf: mesh.name };
    soleMesh.isVisible = mesh.isVisible;
    soleOf.set(mesh, soleMesh);
    mesh.setIndices(upper, null, false);
    notes.push('sole');
  }
  mesh.refreshBoundingInfo();
  return notes.join('+');
}

/** Matte, no glow: the sneaker read. Returns false when the material is not a PBR (procedural bodies). */
function sneakerMaterial(mesh: Mesh): boolean {
  const mat = mesh.material;
  if (!(mat instanceof PBRMaterial)) return false;
  mat.roughness = Math.max(SNEAKER_ROUGHNESS, mat.roughness ?? 0);
  mat.metallic = 0;
  mat.emissiveColor = Color3.Black();
  mat.emissiveTexture = null;
  mat.sheen.isEnabled = false;
  mat.clearCoat.isEnabled = false;
  (mat.metadata ??= {}).felShaded = true;
  return true;
}

function soleMaterial(mesh: Mesh, short: string): PBRMaterial {
  const scene = mesh.getScene();
  const name = `kitSole.${short}`;   // no `shoe` anywhere: tintSlot must not paint the sole
  const existing = scene.getMaterialByName(name);
  if (existing instanceof PBRMaterial) return existing;
  const mat = new PBRMaterial(name, scene);
  mat.albedoColor = Color3.FromHexString(SOLE_COLOR);
  mat.roughness = 0.9;
  mat.metallic = 0;
  mat.emissiveColor = Color3.Black();
  mat.metadata = { felShaded: true };
  return mat;
}

/**
 * CPU skinning of the rest pose: for every vertex the weighted bone matrix Σ wᵢMᵢ (column-major 4×4, 16 floats) and
 * the world position it produces — the same math the vertex shader runs (finalWorld = world · Σ wᵢ mBones[i]).
 */
function skinnedRest(mesh: Mesh, skeleton: Skeleton, positions: FloatArray): { world: Float32Array; sums: Float32Array } | null {
  const mats = skeleton.getTransformMatrices(mesh);
  const mi = mesh.getVerticesData(VertexBuffer.MatricesIndicesKind);
  const mw = mesh.getVerticesData(VertexBuffer.MatricesWeightsKind);
  if (!mats || !mi || !mw) return null;
  const mie = mesh.numBoneInfluencers > 4 ? mesh.getVerticesData(VertexBuffer.MatricesIndicesExtraKind) : null;
  const mwe = mesh.numBoneInfluencers > 4 ? mesh.getVerticesData(VertexBuffer.MatricesWeightsExtraKind) : null;
  const n = positions.length / 3;
  const sums = new Float32Array(n * 16);
  const world = new Float32Array(n * 3);
  const W = mesh.computeWorldMatrix(true);
  const tmp = new Vector3();
  for (let v = 0; v < n; v++) {
    const o = v * 16;
    const add = (idx: number, w: number) => { if (!(w > 0)) return; const b = idx * 16; for (let k = 0; k < 16; k++) sums[o + k] += w * mats[b + k]; };
    for (let k = 0; k < 4; k++) add(mi[v * 4 + k], mw[v * 4 + k]);
    if (mie && mwe) for (let k = 0; k < 4; k++) add(mie[v * 4 + k], mwe[v * 4 + k]);
    const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    tmp.set(
      sums[o] * x + sums[o + 4] * y + sums[o + 8] * z + sums[o + 12],
      sums[o + 1] * x + sums[o + 5] * y + sums[o + 9] * z + sums[o + 13],
      sums[o + 2] * x + sums[o + 6] * y + sums[o + 10] * z + sums[o + 14],
    );
    Vector3.TransformCoordinatesToRef(tmp, W, tmp);
    world[v * 3] = tmp.x; world[v * 3 + 1] = tmp.y; world[v * 3 + 2] = tmp.z;
  }
  return { world, sums };
}

/**
 * Fold every vertex above the collar cut down into a short collar, per foot: height compresses to COLLAR_HEIGHT and
 * the radius tightens from the calf to the shaft's radius at the cut, so the folded shaft does not flare. The new
 * rest-pose world position is mapped back to bind space through the inverse of that vertex's Σ wᵢMᵢ.
 */
function foldShaft(mesh: Mesh, skeleton: Skeleton, positions: FloatArray, world: Float32Array, sums: Float32Array, cut: number, top: number): { positions: Float32Array; skin: { mi: Float32Array; mw: Float32Array } | null } {
  const n = positions.length / 3;
  const mi = mesh.getVerticesData(VertexBuffer.MatricesIndicesKind)!;
  const mw = mesh.getVerticesData(VertexBuffer.MatricesWeightsKind)!;
  const mats = skeleton.getTransformMatrices(mesh);
  // which foot: the dominant bone's side
  const side = new Uint8Array(n);
  for (let v = 0; v < n; v++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) if (mw[v * 4 + k] > bw) { bw = mw[v * 4 + k]; best = mi[v * 4 + k]; }
    side[v] = /^Left/i.test(skeleton.bones[best]?.name ?? '') ? 0 : 1;
  }
  // the shaft's centre and radius at the cut, per side (a band ±2 cm around the cut)
  const band = [{ x: 0, z: 0, r: 0, c: 0 }, { x: 0, z: 0, r: 0, c: 0 }];
  for (let v = 0; v < n; v++) { const y = world[v * 3 + 1]; if (Math.abs(y - cut) < 0.02) { const b = band[side[v]]; b.x += world[v * 3]; b.z += world[v * 3 + 2]; b.c++; } }
  for (const b of band) if (b.c) { b.x /= b.c; b.z /= b.c; }
  for (let v = 0; v < n; v++) { const y = world[v * 3 + 1]; if (Math.abs(y - cut) < 0.02) { const b = band[side[v]]; b.r += Math.hypot(world[v * 3] - b.x, world[v * 3 + 2] - b.z); } }
  for (const b of band) if (b.c) b.r /= b.c;

  // CLOTHING-ALONE (2026-09-14): a folded vertex takes the skin weights of the shaft AT THE CUT (the nearest vertex around the
  // collar ring, same foot). The knee boot's upper shaft is weighted to UpLeg; folded to the ankle it kept the thigh, so every
  // knee bend swung the collar with the thigh — on a dunk's tuck the collar stood 13 cm off the shin (p95) and its edges
  // stretched 19 cm into a fin behind the heel (measured on the live rig, /dev/mode/dunk).
  const ring: number[][] = [[], []];
  for (let v = 0; v < n; v++) { const y = world[v * 3 + 1]; if (y <= cut && y > cut - 0.03) ring[side[v]].push(v); }
  const newMi = mats && (ring[0].length || ring[1].length) ? new Float32Array(mi) : null;
  const newMw = newMi ? new Float32Array(mw) : null;

  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i++) out[i] = positions[i];
  const Winv = mesh.computeWorldMatrix(true).clone(); Winv.invert();
  const S = Matrix.Identity(), Sinv = Matrix.Identity();
  const p = new Vector3();
  for (let v = 0; v < n; v++) {
    const y = world[v * 3 + 1];
    if (y <= cut) continue;
    const b = band[side[v]];
    if (newMi && newMw && mats && ring[side[v]].length) {
      const a0 = Math.atan2(world[v * 3 + 2] - b.z, world[v * 3] - b.x);
      let donor = -1, bestD = Infinity;
      for (const u of ring[side[v]]) { let d = Math.abs(Math.atan2(world[u * 3 + 2] - b.z, world[u * 3] - b.x) - a0); if (d > Math.PI) d = 2 * Math.PI - d; if (d < bestD) { bestD = d; donor = u; } }
      if (donor >= 0) {
        for (let k = 0; k < 4; k++) { newMi[v * 4 + k] = mi[donor * 4 + k]; newMw[v * 4 + k] = mw[donor * 4 + k]; }
        // the new weights' Σ wᵢMᵢ is what the fold inverts through
        for (let k = 0; k < 16; k++) sums[v * 16 + k] = 0;
        for (let k = 0; k < 4; k++) { const w = newMw[v * 4 + k]; if (!(w > 0)) continue; const bb = newMi[v * 4 + k] * 16; for (let j = 0; j < 16; j++) sums[v * 16 + j] += w * mats[bb + j]; }
      }
    }
    const t = (y - cut) / Math.max(1e-6, top - cut);
    let x = world[v * 3], z = world[v * 3 + 2];
    if (b.c) {
      const dx = x - b.x, dz = z - b.z, r = Math.hypot(dx, dz);
      if (r > 1e-5) { const r2 = b.r * (1 + 0.06 * t); x = b.x + dx / r * r2; z = b.z + dz / r * r2; }
    }
    p.set(x, cut + COLLAR_HEIGHT * t, z);
    Vector3.TransformCoordinatesToRef(p, Winv, p);        // world → skinned local
    Matrix.FromArrayToRef(sums, v * 16, S);
    S.invertToRef(Sinv);
    Vector3.TransformCoordinatesToRef(p, Sinv, p);        // skinned local → bind
    out[v * 3] = p.x; out[v * 3 + 1] = p.y; out[v * 3 + 2] = p.z;
  }
  return { positions: out, skin: newMi && newMw ? { mi: newMi, mw: newMw } : null };
}

/**
 * Tops and shorts sit a few millimetres over the skin, and where the two surfaces coincide the body wins the depth
 * test in patches — the "torn / stained" read on the tee and the court short (karate and tennis frames, 2026-09-05).
 * A polygon offset on the garment's material pulls it in front of the skin at the same depth; the geometry is untouched.
 */
export const GARMENT_Z_OFFSET = -4;
/** metres each garment surface moves out along its bind normals: the hips protrude furthest through the 188-vertex short;
 * the tee's hem and shoulder blades were still pierced at 8 mm (karate strip test, 2026-09-05) */
export const GARMENT_INFLATE: Record<'tops' | 'shorts', number> = { tops: 0.013, shorts: 0.02 };
const inflated = new WeakSet<AbstractMesh>();
export function liftOffBody(mesh: AbstractMesh, slot: 'tops' | 'shorts'): void {
  const mat = mesh.material;
  if (mat && mat.zOffset !== GARMENT_Z_OFFSET) mat.zOffset = GARMENT_Z_OFFSET;
  if (!(mesh instanceof Mesh) || inflated.has(mesh)) return;
  inflated.add(mesh);
  // the patches that survive the offset are the body protruding through the coarse garment (188-vertex short): the
  // garment moves out along its bind normals, and the skin transform carries the offset into every pose
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
  if (!positions || !normals || positions.length !== normals.length) return;
  try {
    mesh.makeGeometryUnique();
    const out = new Float32Array(positions.length);
    const d = GARMENT_INFLATE[slot];
    for (let i = 0; i < positions.length; i++) out[i] = positions[i] + normals[i] * d;
    mesh.setVerticesData(VertexBuffer.PositionKind, out, false);   // updateVerticesData is a silent no-op on the loader's non-updatable buffer
    mesh.refreshBoundingInfo();
  } catch (e) {
    console.warn(`[FEL-KIT] garment inflate skipped on ${mesh.name}: ${String((e as Error)?.message ?? e).slice(0, 120)}`);
  }
}
