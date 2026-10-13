// UNLIT SURFACES THAT STAY WHAT THEY ARE (vis-board, visual wave 2, 2026-10-13).
//
// TWO TRAPS in writing a sign, a screen or a beam as a StandardMaterial:
//   1. THE EMISSIVE COLOUR IS ADDED TO THE EMISSIVE TEXTURE, NOT MULTIPLIED BY IT (the shader's `emissiveColor += texture * level`).
//      A panel written as `emissiveColor = (0.9, 0.95, 1)` plus a painted texture is a pale grey wash with the painting a ghost on
//      it — the Big Air LED's dark ground read as light fog, its gold text as a slightly different grey. (Measured on the rig:
//      the texture's own pixel was the right dark blue; emissive 0.1 rendered dark, 0.9 rendered 200/255.) With a texture, the
//      colour must be black: `settleEmissive`. A PBR material multiplies, so this is a StandardMaterial trap only.
//   2. LightRig.liftBlackMaterials runs once after load and lifts every texture-less material whose albedo is under 0.04 to
//      (0.22, 0.22, 0.25): a black diffuse written for an unlit beam becomes a grey one. A diffuse just over the threshold is left
//      alone (`unlitDiffuse`), and costs 4 % grey at most.
import { Color3 } from '@babylonjs/core';
import type { StandardMaterial } from '@babylonjs/core';

/** A StandardMaterial that carries an emissive TEXTURE shows only that texture: its emissive colour (added to it) goes to black. */
export function settleEmissive(m: StandardMaterial): StandardMaterial {
  if (m.emissiveTexture) m.emissiveColor = Color3.Black();
  return m;
}

/** Just over liftBlackMaterials' 0.04: dark enough to be "unlit black", too bright to be lifted. */
export const UNLIT_DIFFUSE_LEVEL = 0.041;
/** A fresh unlit-black diffuse colour (each material owns its own: Babylon mutates a material's colours in place). */
export function unlitDiffuse(): Color3 { return new Color3(UNLIT_DIFFUSE_LEVEL, UNLIT_DIFFUSE_LEVEL, UNLIT_DIFFUSE_LEVEL); }
