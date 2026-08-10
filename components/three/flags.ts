// Feature flags for the 3D upgrade. Each game mode opts in individually so a
// broken 3D scene can NEVER take down the live 2D app — flip a mode back to
// false and it instantly falls back to the proven Canvas-2D implementation.
//
// Rollout is staged: Dunk Contest is the first vertical slice.

export type GameModeKey =
  | 'dunkContest' | 'hoops1v1' | 'streetball' | 'threePoint'
  | 'karate' | 'tennis' | 'skateboard' | 'soccer' | 'baseball'
  | 'golf' | 'gymnastics' | 'training' | 'carnival'
  | 'mixedcombat' | 'dunkduel';

// Modes rendered with the real-time 3D engine. Everything else stays 2D.
const THREE_D_MODES: Partial<Record<string, boolean>> = {
  dunkContest: true,
  hoops1v1: true,
  hoops3v3: true,
  threePoint: true,
  karateEndless: true,
  karateVersus: true,
  skateboard: true,
  surfing: true,
  snowboarding: true,
  bigAir: true,
  soccer: true,
  football: true,
  baseball: true,
  golf: true,
};

// Modes served by the NEW Babylon.js engine (M22–M27 rebuild). Staged rollout:
// dunk is the proof gate and ships first; other modes flip on here one at a time
// after they pass device playtest — the mode code already exists in the registry.
const BABYLON_MODES: Partial<Record<string, boolean>> = {
  dunkContest: true,
  // Rollout wave 1 — KO-gated karate + skinned-pursuit football on the shared
  // Babylon cores. Kill-switch NEXT_PUBLIC_DISABLE_3D=1 forces all back to 2D/3D.
  karateEndless: true,
  football: true,
  // Rollout wave 2 — board family (skateboard / snowboard slalom / surf) on the
  // shared BoardRunMode core. Same kill-switch fallback applies.
  skateboard: true,
  snowboard_slalom: true,
  surf: true,
  // Rollout wave 3 — timing family (tennis / home-run derby / penalty shootout /
  // golf) on the shared makeTimingSportMode core with swept-hit contact. The
  // route flag keys map to registry modes: baseball→derby, soccer→penalty.
  tennis: true,
  golf: true,
  baseball: true,
  soccer: true,
  // Rollout wave 4 — basketball simulator family (M48) on PlayerSlot +
  // BasketballCore. Route flag keys map to registry modes:
  // hoops1v1→onevone, hoops3v3→threevthree.
  hoops1v1: true,
  hoops3v3: true,
  // Rollout wave 5 — Court Carnival hub (M49). New Babylon-only hub mode.
  carnival: true,
  // Rollout wave 6 — combat/duel modes (M53/M56)
  karateVersus: true,
  mixedcombat: true,
  dunkduel: true,
};

export function isBabylon(mode: string): boolean {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DISABLE_3D === '1') return false;
  return BABYLON_MODES[mode] === true;
}

export function is3D(mode: string): boolean {
  // Global kill-switch via env — set NEXT_PUBLIC_DISABLE_3D=1 to force all modes
  // back to 2D instantly (e.g. if a device/GPU issue is reported in production).
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DISABLE_3D === '1') return false;
  return THREE_D_MODES[mode] === true;
}
