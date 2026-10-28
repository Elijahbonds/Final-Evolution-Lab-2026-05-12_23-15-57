// pbrUniform — a PBR scalar that animates every frame, without re-preparing the shader every frame (perf-lag, 2026-10-24).
//
// Babylon's PBRMaterial setters for its scalars (roughness, metallic, the intensities) are `expandToProperty` accessors: a
// new value is stored in the backing field (`_roughness`) and then EVERY submesh's defines are marked texture-dirty. The
// next draw then runs the material's whole _prepareDefines + _prepareEffect: the uniform and sampler lists rebuilt, the
// defines stringified, the effect looked up again. The value itself is a uniform, uploaded on every bind of a material
// that is not frozen, so the define pass changes nothing. Measured on the phone rig (onevone, Venice): the sea's shimmer
// (`vb_sea_mat.roughness = … sin(t)` every frame) was the ONLY material re-prepared every frame — 2 submeshes, ~2 ms of a
// ~93 ms busy frame at 4x throttle and 17 KB of the frame's garbage.
//
// Only a number-to-number change takes the short path: a null roughness means "no metallic workflow" (a define), so
// the first write, or a write of null, goes through the setter as before.
import type { PBRMaterial } from '@babylonjs/core';

/** Set `mat.roughness` for this frame. Same picture as the setter; no define pass when it was already a number. */
export function setPbrRoughnessUniform(mat: PBRMaterial, v: number): void {
  const m = mat as unknown as { _roughness?: number | null };
  if (typeof m._roughness !== 'number' || !Number.isFinite(v)) { mat.roughness = v; return; }
  m._roughness = v;
}
