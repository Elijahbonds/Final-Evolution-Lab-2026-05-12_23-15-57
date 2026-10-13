// AERIAL PERSPECTIVE FOR THE PROCEDURAL WORLDS (vis-foundation-2 A9.11, 2026-10-13).
//
// The audit (A3): the rig forces FOGMODE_NONE ("fog was blacking out high cameras" — a dark fog colour on a high camera),
// the spec venues turn EXP2 back on for themselves, and so the procedural worlds — the track, the boards' runs, the
// karts' circuits, freerun's rooftops — have no air at all: a prop 200 m away is as crisp and saturated as one at 5 m,
// and the world ends at the sky dome like a stage flat. Real air hazes distance toward the colour of the horizon.
//
// This puts a gentle EXP2 haze on exactly those worlds, in a per-mood HORIZON colour (never dark at day; a deep blue at
// night, where a dark haze is right), thin enough that the play area is untouched: ~3 % at 50 m, ~20 % at 150 m, half at
// ~250 m. Mounted once after load(); only when nothing else owns the fog (a spec venue's EXP2 or a weather's fog are left
// exactly as they are). The sky domes carry applyFog = false; their horizon band (SkyDome.ts) uses this same colour,
// so the world and the sky meet in one haze. Every tier: fog is one define on materials already compiled at load.

import { Color3, Scene } from '@babylonjs/core';
import type { VenueMood } from './moods';
import { sceneModeId, wave2Look } from './lookPolicy';

/** The colour of the air at the horizon, per mood. */
export const HAZE: Record<VenueMood, string> = {
  goldenHour: '#d8a982', daylight: '#bcd2e8', dojoWarm: '#9c7a62', nightGame: '#26304a', alpine: '#cddcee', overcast: '#bcc6d1', dusk: '#86638c', indoorArena: '#5a5f6a',
};
/** EXP2 density per mood (half visibility at ln2^0.5 / density ≈ 0.83 / density metres). Indoors: none. */
export const HAZE_DENSITY: Record<VenueMood, number> = {
  goldenHour: 0.0034, daylight: 0.0028, dojoWarm: 0.004, nightGame: 0.0036, alpine: 0.0024, overcast: 0.0042, dusk: 0.0038, indoorArena: 0,
};

export function hazeColor(mood: VenueMood): string { return HAZE[mood] ?? '#bcc6d1'; }

/** Pure: the fraction of a surface's colour the haze replaces at `metres` (EXP2). */
export function hazeAt(mood: VenueMood, metres: number): number {
  const d = HAZE_DENSITY[mood] ?? 0;
  return 1 - Math.exp(-(d * metres) * (d * metres));
}

/** Pure: should this scene get the haze? Only a world nobody else fogs: no spec venue sky, fog still off, a mode the
 *  wave-2 look reaches, a mood with air. */
export function atmosphereWanted(o: { fogMode: number; hasVenueSky: boolean; modeId: string | null; mood: VenueMood; off?: boolean }): boolean {
  return !o.off && o.fogMode === Scene.FOGMODE_NONE && !o.hasVenueSky && wave2Look(o.modeId) && (HAZE_DENSITY[o.mood] ?? 0) > 0;
}

export interface AtmosphereHandle { dispose(): void }

export function mountAtmosphere(scene: Scene, mood: VenueMood, off = false): AtmosphereHandle | null {
  if (!atmosphereWanted({ fogMode: scene.fogMode, hasVenueSky: !!scene.getMeshByName('nexus_sky'), modeId: sceneModeId(scene), mood, off })) return null;
  const prev = { mode: scene.fogMode, density: scene.fogDensity, color: scene.fogColor.clone() };
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = HAZE_DENSITY[mood];
  scene.fogColor = Color3.FromHexString(hazeColor(mood));
  // the backdrop's painted horizon ring is far scenery too — it takes the haze (the dome itself never does)
  console.info(`[FEL-AIR] ${mood} haze, EXP2 ${HAZE_DENSITY[mood]} (half at ${Math.round(0.83 / HAZE_DENSITY[mood])} m)`);
  return {
    dispose() {
      if (scene.isDisposed) return;
      scene.fogMode = prev.mode; scene.fogDensity = prev.density; scene.fogColor = prev.color;
    },
  };
}
