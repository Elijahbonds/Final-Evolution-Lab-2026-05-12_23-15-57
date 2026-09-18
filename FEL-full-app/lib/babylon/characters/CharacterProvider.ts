// CharacterProvider — the single switch between the assetless procedural path
// and the forge GLB path (public/models/fel-hero.glb + the athlete roster).
//
// Default FALSE since 2026-09-02 (owner decision, PHASE2_BENCHMARK_LOCKS.md
// "ship pass"): the forge hero replaced the broken Meshy GLB, so every mode
// spawns the real PBR avatar. The procedural athlete stays as an opt-in
// fallback — NEXT_PUBLIC_PROCEDURAL_CHARACTERS="true" restores it with zero
// mode changes.

const envFlag = process.env.NEXT_PUBLIC_PROCEDURAL_CHARACTERS;
export const PROCEDURAL_CHARACTERS: boolean = envFlag === 'true';
