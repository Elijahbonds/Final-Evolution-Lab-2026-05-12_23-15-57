// CharacterProvider — the single switch between the assetless procedural path
// and the legacy GLB path. Flag-gated + additive: flip PROCEDURAL_CHARACTERS to
// false to instantly restore the exact prior GLB behavior (zero mode changes).
//
// Default TRUE: the Meshy hero GLB is visually broken, so every mode now spawns
// clean procedural athletes. Optionally overridable at build time via
// NEXT_PUBLIC_PROCEDURAL_CHARACTERS="false".

const envFlag = process.env.NEXT_PUBLIC_PROCEDURAL_CHARACTERS;
export const PROCEDURAL_CHARACTERS: boolean = envFlag ? envFlag !== 'false' : true;
