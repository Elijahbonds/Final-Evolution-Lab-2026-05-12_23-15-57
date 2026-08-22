/**
 * components/three/env-flags.ts — PROCEDURAL ENVIRONMENT FEATURE FLAG
 *
 * Mirrors the M105 character strategy (CharacterProvider). The Meshy-derived
 * environment GLBs render badly, so by default we render the procedural,
 * assetless <ProceduralMap> instead of loading the GLB.
 *
 * ROLLBACK: set NEXT_PUBLIC_PROCEDURAL_ENVIRONMENTS="false" in the environment
 * to instantly restore the original Meshy GLB loading path (the GLB files are
 * left untouched on disk for exactly this reason).
 */
export const PROCEDURAL_ENVIRONMENTS =
  !(typeof process !== 'undefined' &&
    process.env.NEXT_PUBLIC_PROCEDURAL_ENVIRONMENTS === 'false');
