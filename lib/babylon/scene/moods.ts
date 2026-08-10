// Venue mood presets for LightRig. One place to tune every scene's look.

export type VenueMood = 'goldenHour' | 'daylight' | 'dojoWarm' | 'nightGame' | 'alpine';

export interface MoodDef {
  sky: string; ground: string; hemiIntensity: number;
  sun: string; sunIntensity: number; sunDir: [number, number, number];
  exposure: number; clearColor: string;
  // M44 visual pass — bloom + grade + vignette params folded into the same
  // pipeline mountLightRig already owns (no second competing pipeline).
  bloomThreshold: number; bloomWeight: number; bloomScale: number;   //TUNE(elijah)
  contrast: number;                                                  //TUNE(elijah)
  vignetteColor: [number, number, number, number]; vignetteWeight: number; //TUNE(elijah)
}

export const MOODS: Record<VenueMood, MoodDef> = {
  goldenHour: { sky: '#ffd9a0', ground: '#4a4038', hemiIntensity: 0.75, sun: '#ffb36b', sunIntensity: 2.4, sunDir: [-0.6, -1, -0.35], exposure: 1.12, clearColor: '#2a1e33', bloomThreshold: 0.65, bloomWeight: 0.35, bloomScale: 0.5, contrast: 1.12, vignetteColor: [0.25, 0.12, 0.05, 0], vignetteWeight: 1.4 },
  daylight:   { sky: '#cfe8ff', ground: '#5a5a52', hemiIntensity: 0.85, sun: '#ffffff', sunIntensity: 2.6, sunDir: [-0.5, -1, -0.3], exposure: 1.05, clearColor: '#87b7dd', bloomThreshold: 0.78, bloomWeight: 0.28, bloomScale: 0.5, contrast: 1.08, vignetteColor: [0.05, 0.08, 0.12, 0], vignetteWeight: 1.1 },
  dojoWarm:   { sky: '#ffcf9e', ground: '#3a2a22', hemiIntensity: 0.65, sun: '#ff9d5c', sunIntensity: 1.9, sunDir: [-0.3, -1, -0.5], exposure: 1.1,  clearColor: '#1d1210', bloomThreshold: 0.7, bloomWeight: 0.25, bloomScale: 0.4, contrast: 1.18, vignetteColor: [0.1, 0.04, 0.02, 0], vignetteWeight: 1.8 },
  nightGame:  { sky: '#9fb7ff', ground: '#22262e', hemiIntensity: 0.55, sun: '#e8f0ff', sunIntensity: 2.2, sunDir: [-0.35, -1, -0.2], exposure: 1.15, clearColor: '#0b0e16', bloomThreshold: 0.55, bloomWeight: 0.5, bloomScale: 0.6, contrast: 1.22, vignetteColor: [0, 0.02, 0.06, 0], vignetteWeight: 2.2 },
  alpine:     { sky: '#eaf4ff', ground: '#8fa0b5', hemiIntensity: 0.9,  sun: '#fff4e0', sunIntensity: 2.8, sunDir: [-0.45, -1, -0.25], exposure: 1.05, clearColor: '#b9d4ee', bloomThreshold: 0.78, bloomWeight: 0.3, bloomScale: 0.5, contrast: 1.08, vignetteColor: [0.05, 0.08, 0.12, 0], vignetteWeight: 1.1 },
};

/** Mode → mood mapping (README wiring step 4). */
export const MODE_MOODS: Record<string, VenueMood> = {
  dunk: 'goldenHour', h2h: 'goldenHour', threev3: 'goldenHour',
  skateboard: 'goldenHour', surf: 'goldenHour',
  tennis: 'daylight', golf: 'daylight', baseball: 'daylight', sprint: 'daylight',
  karate: 'dojoWarm', karate_versus: 'dojoWarm',
  football: 'nightGame', penalty: 'nightGame',
  snowboard_slalom: 'alpine', snowboard_bigair: 'alpine',
};
