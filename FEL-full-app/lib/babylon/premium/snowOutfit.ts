// snowOutfit — a snow jacket and snow pants for Gate Crasher's rider (GATE-CRASHER-POLISH-2, 2026-09-28, GC-8).
//
// The eye: "the default rider rides the snow in a T-shirt and shorts. There is no snow outfit for this mode." The kit body
// carries two tops, two shorts and two shoes (sportKitDefaults) and no garment with sleeves or legs, and a new kit pack is a
// Blender fit plus a Closet catalogue entry — clothing for the whole game, which this tip must not redesign. So the outfit is
// cut, at mount and in this mode only, FROM THE RIDER'S OWN SKINNED BODY:
//
//   · the body's triangles whose every vertex is carried by the torso / arm bones (the jacket, collar to wrist, over the
//     pelvis) or by the pelvis / leg bones (the pants, waist to ankle — the shoes keep the feet);
//   · each vertex pushed out along its normal (jacket 2.6 cm over pants 1.7 cm, so the jacket's hem laps the waistband);
//   · the SAME skeleton and the same four bone weights per vertex — so the garment bends exactly as the skin under it does,
//     in every clip, the wipeout and the grabs included (the one thing a pasted-on prop cannot do);
//   · a fabric: ripstop weave and down-baffle shading painted on a canvas, the jacket in the venue's accent, the pants
//     charcoal; cuffs, collar and hem a shade darker through vertex colour (by bone weight, so no axis is assumed).
//
// The tee, the shorts, the arm sleeves and the socks are hidden while the outfit is on (and kept hidden: the identity layer
// may touch visibility after mount). A body that is not the kit body (no `Body*` skinned mesh) keeps its own clothes: null.
import { Color3, DynamicTexture, Mesh, PBRMaterial, Texture, VertexBuffer } from '@babylonjs/core';
import type { AbstractMesh, Observer, Scene, TransformNode } from '@babylonjs/core';

export interface SnowOutfitHandle { readonly parts: number; dispose(): void }

const JACKET_BONES = new Set(['Spine', 'Spine1', 'Spine2', 'Neck', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'Hips']);
const PANTS_BONES = new Set(['Hips', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg']);
/** The jacket's darker trims: the cuffs (weight toward the hand), the collar (the neck), the hem (the pelvis). */
const TRIM_BONES = new Set(['Neck', 'Hips']);
const JACKET_OFFSET_M = 0.026, PANTS_OFFSET_M = 0.017;
/** What the outfit covers: the tee, the shorts, the arm sleeves and the socks (Kit_* garments, acc_* accessories). */
const COVERED = /^(Kit_tops_|Kit_shorts_)|armsleeve|_sock_/i;

function fabric(scene: Scene, name: string, base: string, baffles: boolean): DynamicTexture {
  const S = 256;
  const tex = new DynamicTexture(name, { width: S, height: S }, scene, true);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  let seed = 7;
  const r = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let y = 0; y < S; y += 2) { g.fillStyle = `rgba(255,255,255,${0.03 + r() * 0.03})`; g.fillRect(0, y, S, 1); }   // the weave
  for (let x = 0; x < S; x += 2) { g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.03})`; g.fillRect(x, 0, 1, S); }
  for (let y = 0; y < S; y += 16) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, y, S, 1); }                      // ripstop grid
  for (let x = 0; x < S; x += 16) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(x, 0, 1, S); }
  if (baffles) for (let y = 0; y < S; y += 32) {   // down baffles: a stitched seam and the puff between
    const gr = g.createLinearGradient(0, y, 0, y + 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.22)'); gr.addColorStop(0.12, 'rgba(255,255,255,0.06)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.12)'); gr.addColorStop(0.88, 'rgba(0,0,0,0.04)'); gr.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = gr; g.fillRect(0, y, S, 32);
  }
  for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.05})`; g.fillRect(r() * S, r() * S, 2, 2); }
  tex.update();
  tex.wrapU = Texture.WRAP_ADDRESSMODE; tex.wrapV = Texture.WRAP_ADDRESSMODE;
  return tex;
}

/** One garment cut from the body: the triangles whose three vertices' dominant bones are all in `bones`, pushed out `off`. */
function cut(scene: Scene, body: Mesh, name: string, bones: Set<string>, off: number, mat: PBRMaterial, trim: (boneName: string, handW: number) => number): Mesh | null {
  const pos = body.getVerticesData(VertexBuffer.PositionKind), nrm = body.getVerticesData(VertexBuffer.NormalKind);
  const uv = body.getVerticesData(VertexBuffer.UVKind), mi = body.getVerticesData(VertexBuffer.MatricesIndicesKind), mw = body.getVerticesData(VertexBuffer.MatricesWeightsKind);
  const idx = body.getIndices(), sk = body.skeleton;
  if (!pos || !nrm || !mi || !mw || !idx || !sk) return null;
  const n = pos.length / 3;
  const boneName = (v: number) => { let best = 0; for (let k = 1; k < 4; k++) if (mw[v * 4 + k] > mw[v * 4 + best]) best = k; return sk.bones[mi[v * 4 + best]]?.name ?? ''; };
  const handW = (v: number) => { let w = 0; for (let k = 0; k < 4; k++) if (/Hand$/.test(sk.bones[mi[v * 4 + k]]?.name ?? '')) w += mw[v * 4 + k]; return w; };
  const dom = new Array<string>(n); for (let v = 0; v < n; v++) dom[v] = boneName(v);
  const keep: number[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (bones.has(dom[a]) && bones.has(dom[b]) && bones.has(dom[c])) keep.push(a, b, c);
  }
  if (!keep.length) return null;
  // compact to the used vertices
  const remap = new Int32Array(n).fill(-1); const order: number[] = [];
  for (const v of keep) if (remap[v] < 0) { remap[v] = order.length; order.push(v); }
  const m = order.length;
  const P = new Float32Array(m * 3), N = new Float32Array(m * 3), U = new Float32Array(m * 2), I = new Float32Array(m * 4), W = new Float32Array(m * 4), C = new Float32Array(m * 4);
  order.forEach((v, j) => {
    const nx = nrm[v * 3], ny = nrm[v * 3 + 1], nz = nrm[v * 3 + 2];
    P[j * 3] = pos[v * 3] + nx * off; P[j * 3 + 1] = pos[v * 3 + 1] + ny * off; P[j * 3 + 2] = pos[v * 3 + 2] + nz * off;
    N[j * 3] = nx; N[j * 3 + 1] = ny; N[j * 3 + 2] = nz;
    if (uv) { U[j * 2] = uv[v * 2] * 3; U[j * 2 + 1] = uv[v * 2 + 1] * 3; }   // the atlas UVs, tiled: the weave at fabric scale
    for (let k = 0; k < 4; k++) { I[j * 4 + k] = mi[v * 4 + k]; W[j * 4 + k] = mw[v * 4 + k]; }
    const shade = trim(dom[v], handW(v));
    C[j * 4] = shade; C[j * 4 + 1] = shade; C[j * 4 + 2] = shade; C[j * 4 + 3] = 1;
  });
  const g = new Mesh(name, scene);
  g.setVerticesData(VertexBuffer.PositionKind, P, false);
  g.setVerticesData(VertexBuffer.NormalKind, N, false);
  g.setVerticesData(VertexBuffer.UVKind, U, false);
  g.setVerticesData(VertexBuffer.MatricesIndicesKind, I, false);
  g.setVerticesData(VertexBuffer.MatricesWeightsKind, W, false);
  g.setVerticesData(VertexBuffer.ColorKind, C, false);
  g.setIndices(keep.map((v) => remap[v]));
  g.skeleton = sk; g.numBoneInfluencers = 4;
  // the body's winding: the glTF loader marks its meshes counter-clockwise, and a fresh Mesh is clockwise — so the garment's
  // outside faced in, and AnimeInk's outline hull (drawn from the back faces) covered the whole jacket in ink (measured)
  g.sideOrientation = body.sideOrientation;
  g.parent = body.parent;
  g.position.copyFrom(body.position);
  if (body.rotationQuaternion) g.rotationQuaternion = body.rotationQuaternion.clone(); else g.rotation.copyFrom(body.rotation);
  g.scaling.copyFrom(body.scaling);
  g.material = mat;
  g.isPickable = false;
  g.alwaysSelectAsActiveMesh = true;   // a skinned shell's bind-pose box does not follow the clips; the rider is always on screen
  g.receiveShadows = true;
  return g;
}

/** Dress the rider under `root` for the snow. Null when the body is not the kit body (its own clothes stay on). */
export function dressSnowOutfit(scene: Scene, root: TransformNode, accent: string): SnowOutfitHandle | null {
  const meshes = root.getChildMeshes(false) as AbstractMesh[];
  const body = meshes.find((m) => /^Body/.test(m.name) && !!m.skeleton && m instanceof Mesh) as Mesh | undefined;
  if (!body) { console.info('[SNOW-OUTFIT] no kit body under the rider — its own clothes stay on'); return null; }
  const jacketHex = Color3.Lerp(Color3.FromHexString(accent), Color3.FromHexString('#1b2433'), 0.25).toHexString();
  const jacketM = new PBRMaterial('snowJacketM', scene);
  jacketM.albedoTexture = fabric(scene, 'snowJacketTex', jacketHex, true); jacketM.metallic = 0; jacketM.roughness = 0.62;   // (the trims are vertex colour, which the mesh's colour buffer turns on)
  const pantsM = new PBRMaterial('snowPantsM', scene);
  pantsM.albedoTexture = fabric(scene, 'snowPantsTex', '#27303d', false); pantsM.metallic = 0; pantsM.roughness = 0.78;
  const jacket = cut(scene, body, 'snow_jacket', JACKET_BONES, JACKET_OFFSET_M, jacketM, (b, hw) => (TRIM_BONES.has(b) || hw > 0.04 ? 0.62 : 1));
  const pants = cut(scene, body, 'snow_pants', PANTS_BONES, PANTS_OFFSET_M, pantsM, () => 1);
  const parts = (jacket ? 1 : 0) + (pants ? 1 : 0);
  const covered = meshes.filter((m) => COVERED.test(m.name));
  const hide = () => { for (const m of covered) if (m.isVisible) m.isVisible = false; };
  hide();
  const keep: Observer<Scene> | null = parts ? scene.onBeforeRenderObservable.add(hide) : null;
  console.info(`[SNOW-OUTFIT] jacket ${jacket?.getTotalVertices() ?? 0} verts, pants ${pants?.getTotalVertices() ?? 0} verts; covered ${covered.map((m) => m.name.replace(/_c\d+$/, '')).join(', ')}`);
  return {
    parts,
    dispose() {
      if (keep) scene.onBeforeRenderObservable.remove(keep);
      jacket?.dispose(); pants?.dispose();
      jacketM.dispose(true, true); pantsM.dispose(true, true);
    },
  };
}
