// ─────────────────────────────────────────────────────────────────────────────
// M14 §2 "lighting floor" — PURE decision core (NO three/react/DOM imports).
//
// The spec rule: "no surface may render black — ambient minimum on all materials."
// The concrete regression this fixes: our low-poly NPC rigs (e.g. the football
// defenders) ship as GLBs with ZERO authored materials, so three.js assigns its
// default MeshStandardMaterial (metalness = 1, roughness = 1). A fully-metallic
// surface with no environment map reflects nothing and renders SOLID BLACK in a
// dark scene — the defenders become invisible.
//
// This module decides, from a plain description of a material, whether that
// material is the render-black "default metal" case and what corrected PBR values
// to apply. Keeping the decision pure lets the headless suite verify it without a
// GPU, and lets <Avatar> stay a thin consumer.
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal, framework-free description of a material's lighting-relevant props. */
export interface MaterialProbe {
  /** True only for MeshStandardMaterial / MeshPhysicalMaterial (PBR, lit). */
  isPhysical: boolean;
  metalness: number;
  roughness: number;
  hasColorMap: boolean;
  hasEnvMap: boolean;
}

/** The corrected PBR values to apply when a material would render black. */
export interface LightingFloorPatch {
  metalness: number;
  roughness: number;
  /** Scalar applied to the material's own colour to derive an emissive floor. */
  emissiveScale: number;
}

// Tuned so a defender reads as a lit, matte-metal jersey — never black, but not
// glowing. All feel numbers owned by the character pass.
export const FLOOR_METALNESS = 0.2;   // TUNE(elijah)
export const FLOOR_ROUGHNESS = 0.72;  // TUNE(elijah)
export const FLOOR_EMISSIVE = 0.16;   // TUNE(elijah)

/**
 * Detect three.js's default material precisely: fully metallic + fully rough +
 * no texture + no env map. Well-authored materials (the hero avatar) never match
 * because they carry authored metalness/roughness or maps, so they are untouched.
 */
export function needsLightingFloor(p: MaterialProbe): boolean {
  return (
    p.isPhysical === true &&
    Number.isFinite(p.metalness) && p.metalness >= 0.99 &&
    Number.isFinite(p.roughness) && p.roughness >= 0.99 &&
    !p.hasColorMap &&
    !p.hasEnvMap
  );
}

/** Deterministic corrected values for a render-black material. */
export function lightingFloorPatch(): LightingFloorPatch {
  return {
    metalness: FLOOR_METALNESS,
    roughness: FLOOR_ROUGHNESS,
    emissiveScale: FLOOR_EMISSIVE,
  };
}
