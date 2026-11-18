// inseamShade — a darker inseam panel on the one-piece short (lane/kit-tight, 2026-11-18; the coordinator's option (a), taken as the
// reversible default and flagged to the owner).
//
// WHY. The one-piece short's cloth that joins the two legs stretches when the legs split (a stride, a kick): KIT-FIT-PLAN §12.3
// measured 300 torn edges over 10 poses, 298 of them on vertices that hang on BOTH thighs, and no weight rule, gusset depth or hem
// cut lowered it — with 22 bones and no cloth simulation, the joining cloth must stretch. Seen on the contact sheet as a fray at
// the inner thigh. A real athletic short has a gusset panel there, often in a darker cloth: the stretch then reads as that panel.
//
// WHAT. A small texture made from the short's OWN UVs, positions and skin weights, once per loaded body: dark on the inseam (the
// inner side of each leg, gusset to hem: joiningShare), white elsewhere; set as the short's
// material's albedo texture, which the Closet tint multiplies. No geometry, UV, bone or vertex-data change, so the body merge sees
// the same parts (bodyMerge groups by vertex-data kinds). A painted short (Creator paint) takes its paint instead.
// `kit.inseamShade`: the panel's darkness, 0 = no texture at all (today).
import { Constants, PBRMaterial, RawTexture } from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';
import { feel } from '../../feel-panel/feel';

/** kit.inseamShade: how much darker the inseam panel is (0 = off, today; 1 = black). NEW; the coordinator's reversible default. */
export const INSEAM_SHADE = 0.45;
/** Texture size (texels a side). */
const SIZE = 256;

export const inseamShade = (): number => Math.max(0, Math.min(1, feel('kit.inseamShade', INSEAM_SHADE)));

/** Pure: per vertex 0..1, how much it belongs to the inseam panel: the cloth on the inner side of each leg, from the gusset down
 *  to the hem, found in the garment's own bind space (any axes, any scale). The middle line lies half way between the left-leg
 *  and the right-leg cloth (each one's mean position, by its heaviest thigh); a vertex's "inner" is its distance from that
 *  line across, over half the two legs' separation (≈ 0 at the middle, ≈ 1 at a leg's centre line). The panel is full at
 *  inner ≤ PANEL_IN and gone by PANEL_OUT, and only on cloth that rides the thighs (≥ PANEL_LEGS of its weight), so the seat's
 *  centre seams, which ride the pelvis, stay plain. */
export const PANEL_IN = 0.3, PANEL_OUT = 0.5, PANEL_LEGS = 0.6;
export function joiningShare(joints: ArrayLike<number>, weights: ArrayLike<number>, jointNames: readonly string[], positions?: ArrayLike<number>): Float32Array {
  const L = jointNames.findIndex((n) => /(^|:)LeftUpLeg$/.test(n)), R = jointNames.findIndex((n) => /(^|:)RightUpLeg$/.test(n));
  const n = joints.length / 4, out = new Float32Array(n);
  if (L < 0 || R < 0) return out;
  const leg = (v: number) => { let l = 0, r = 0; for (let k = 0; k < 4; k++) { const j = joints[v * 4 + k], w = weights[v * 4 + k]; if (j === L) l += w; else if (j === R) r += w; } return [l, r]; };
  if (!positions) {   // no positions: the cloth that hangs on both thighs
    for (let v = 0; v < n; v++) { const [l, r] = leg(v); out[v] = l + r > 1e-6 ? Math.min(1, (2 * Math.min(l, r)) / (l + r)) : 0; }
    return out;
  }
  const mL = [0, 0, 0, 0], mR = [0, 0, 0, 0];
  for (let v = 0; v < n; v++) { const [l, r] = leg(v); const m = l > 0.6 ? mL : r > 0.6 ? mR : null; if (!m) continue; for (let a = 0; a < 3; a++) m[a] += positions[v * 3 + a]; m[3]++; }
  if (!mL[3] || !mR[3]) return out;
  const cl = [mL[0] / mL[3], mL[1] / mL[3], mL[2] / mL[3]], cr = [mR[0] / mR[3], mR[1] / mR[3], mR[2] / mR[3]];
  const ax = [cl[0] - cr[0], cl[1] - cr[1], cl[2] - cr[2]], half = Math.hypot(ax[0], ax[1], ax[2]) / 2;
  if (half < 1e-9) return out;
  const u = ax.map((x) => x / (2 * half)), mid = [(cl[0] + cr[0]) / 2, (cl[1] + cr[1]) / 2, (cl[2] + cr[2]) / 2];
  for (let v = 0; v < n; v++) {
    const [l, r] = leg(v); if (l + r < PANEL_LEGS) continue;
    const inner = Math.abs((positions[v * 3] - mid[0]) * u[0] + (positions[v * 3 + 1] - mid[1]) * u[1] + (positions[v * 3 + 2] - mid[2]) * u[2]) / half;
    const t = Math.min(1, Math.max(0, (PANEL_OUT - inner) / (PANEL_OUT - PANEL_IN)));
    out[v] = t * t * (3 - 2 * t);
  }
  return out;
}

/** Pure: the RGBA texels (SIZE², row 0 = v 0): 255 × (1 − dark × share) interpolated over each triangle in UV space, then
 *  grown 3 texels into the empty space round each island, so a seam never samples white. */
export function inseamTexels(uv: ArrayLike<number>, indices: ArrayLike<number>, share: ArrayLike<number>, dark: number, size = SIZE): Uint8Array {
  const val = new Float32Array(size * size).fill(-1);
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    const ax = uv[a * 2] * size, ay = uv[a * 2 + 1] * size, bx = uv[b * 2] * size, by = uv[b * 2 + 1] * size, cx = uv[c * 2] * size, cy = uv[c * 2 + 1] * size;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den, w2 = 1 - w0 - w1;
      if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
      const s = w0 * share[a] + w1 * share[b] + w2 * share[c];
      val[y * size + x] = Math.max(val[y * size + x], s);
    }
  }
  for (let pass = 0; pass < 3; pass++) {   // grow the islands into the empty texels
    const next = Float32Array.from(val);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (val[y * size + x] >= 0) continue;
      let s = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= size || Y >= size) continue; const q = val[Y * size + X]; if (q >= 0) { s += q; n++; } }
      if (n) next[y * size + x] = s / n;
    }
    val.set(next);
  }
  const px = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) { const g = Math.round(255 * (1 - dark * Math.max(0, val[i]))); px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = g; px[i * 4 + 3] = 255; }
  return px;
}

/** Give these short meshes (one shared material each) the inseam panel. Returns the materials changed (0 when off). */
export function applyInseamShade(meshes: readonly Mesh[], uv: ArrayLike<number> | null, indices: ArrayLike<number>, share: ArrayLike<number>, scene: Scene, dark = inseamShade()): number {
  if (!(dark > 0) || !uv) return 0;
  console.info(`[FEL-KIT] inseam panel: ${meshes.length} short meshes, materials ${meshes.map((m) => `${m.material?.getClassName() ?? 'none'}${(m.material as PBRMaterial | null)?.albedoTexture ? '+tex' : ''}`).join(',')}`);
  let tex: RawTexture | null = null, n = 0;
  const seen = new Set<unknown>();
  for (const m of meshes) {
    const mat = m.material;
    if (!(mat instanceof PBRMaterial) || seen.has(mat) || mat.albedoTexture) continue;   // a texture already there (paint) wins
    seen.add(mat);
    tex ??= RawTexture.CreateRGBATexture(inseamTexels(uv, indices, share, dark), SIZE, SIZE, scene, true, false, Constants.TEXTURE_TRILINEAR_SAMPLINGMODE);
    tex.name = 'fel_inseam_shade';
    tex.metadata = { felShareOnClone: true };   // playerIdentity.cloneForTint shares it (a deep copy of a url-less texture is blank)
    mat.albedoTexture = tex; n++;
  }
  return n;
}
