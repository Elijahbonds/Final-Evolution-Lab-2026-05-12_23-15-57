// Venue mood presets for LightRig. One place to tune every scene's look.

export type VenueMood = 'goldenHour' | 'daylight' | 'dojoWarm' | 'nightGame' | 'alpine' | 'overcast' | 'dusk' | 'indoorArena';

export interface MoodDef {
  sky: string; ground: string; hemiIntensity: number;
  sun: string; sunIntensity: number; sunDir: [number, number, number];
  exposure: number; clearColor: string;
  // M44 visual pass — bloom + grade + vignette params folded into the same
  // pipeline mountLightRig already owns (no second competing pipeline).
  bloomThreshold: number; bloomWeight: number; bloomScale: number;   //TUNE(elijah)
  contrast: number;                                                  //TUNE(elijah)
  vignetteColor: [number, number, number, number]; vignetteWeight: number; //TUNE(elijah)
  /**
   * How far the painted backdrop is washed toward this mood's own sky colour, 0..1.
   *
   * The baked domes (public/backdrops/baked) are single photographs: ocean.jpg is a sunset, mountains.jpg a
   * blue day. A mood that contradicts the photograph puts two different times of day in one frame — THE REEF
   * ran flat overcast light (sun 0.9, hemi 0.95) under a burning orange sky. This is how much of the sky the
   * mood is allowed to take back. 0 leaves the photograph exactly as shot, which is right for the moods the
   * bakes were chosen for.
   */
  skyWash: number;
  /**
   * The colour grade (A9.3, visual-foundation 2026-10-06): Babylon ColorCurves on the pipeline's image-processing pass —
   * a split tone (highlights pushed one way, shadows the other) plus a global saturation. Code-only, LUT-quality, and
   * one shader define on a pass that already runs, so every tier gets it. Hues in degrees; density/saturation in
   * Babylon's -100..100 where 0 is "no change". Kept gentle: this is the grade a broadcast camera bakes in, not a filter.
   */
  curves: MoodCurves;
  /** Shadow darkness override (0 = black, 1 = none); the rig's 0.35 when absent. Overcast light casts weak shadows. */
  shadowDarkness?: number;
}

export interface MoodCurves {
  globalSat: number;
  highlightsHue: number; highlightsDensity: number; highlightsSat: number;
  shadowsHue: number; shadowsDensity: number; shadowsSat: number;
}

/** Warm highlights against cool shadows is the look every sunset broadcast has; each mood picks its own pair. */
const curves = (globalSat: number, hHue: number, hDen: number, sHue: number, sDen: number, hSat = 0, sSat = 0): MoodCurves =>
  ({ globalSat, highlightsHue: hHue, highlightsDensity: hDen, highlightsSat: hSat, shadowsHue: sHue, shadowsDensity: sDen, shadowsSat: sSat });

export const MOODS: Record<VenueMood, MoodDef> = {
  goldenHour: { sky: '#ffd9a0', ground: '#4a4038', hemiIntensity: 0.75, sun: '#ffb36b', sunIntensity: 2.4, sunDir: [-0.6, -1, -0.35], exposure: 1.12, clearColor: '#2a1e33', bloomThreshold: 0.65, bloomWeight: 0.35, bloomScale: 0.5, contrast: 1.12, vignetteColor: [0.25, 0.12, 0.05, 0], vignetteWeight: 1.4, skyWash: 0, curves: curves(8, 38, 22, 250, 18, 6) },
  daylight:   { sky: '#cfe8ff', ground: '#5a5a52', hemiIntensity: 0.85, sun: '#ffffff', sunIntensity: 2.6, sunDir: [-0.5, -1, -0.3], exposure: 1.05, clearColor: '#87b7dd', bloomThreshold: 0.78, bloomWeight: 0.28, bloomScale: 0.5, contrast: 1.08, vignetteColor: [0.05, 0.08, 0.12, 0], vignetteWeight: 1.1, skyWash: 0, curves: curves(10, 48, 8, 210, 12) },
  dojoWarm:   { sky: '#ffcf9e', ground: '#3a2a22', hemiIntensity: 0.65, sun: '#ff9d5c', sunIntensity: 1.9, sunDir: [-0.3, -1, -0.5], exposure: 1.1,  clearColor: '#1d1210', bloomThreshold: 0.7, bloomWeight: 0.25, bloomScale: 0.4, contrast: 1.18, vignetteColor: [0.1, 0.04, 0.02, 0], vignetteWeight: 1.8, skyWash: 0, curves: curves(4, 32, 18, 20, 14) },
  nightGame:  { sky: '#9fb7ff', ground: '#22262e', hemiIntensity: 0.55, sun: '#e8f0ff', sunIntensity: 2.2, sunDir: [-0.35, -1, -0.2], exposure: 1.15, clearColor: '#0b0e16', bloomThreshold: 0.55, bloomWeight: 0.5, bloomScale: 0.6, contrast: 1.22, vignetteColor: [0, 0.02, 0.06, 0], vignetteWeight: 2.2, skyWash: 0.45, curves: curves(6, 205, 10, 230, 26, 0, 4) },
  // Pass 5 phase 7: sun 2.8 + hemi 0.9 + exposure 1.05 + bloom from 0.78 on near-white snow read as a 211–221 mean-
  // luminance whiteout in slalom frames (piste band 236). Cooler sky, a real sun/shade ratio, bloom only on true highlights.
  // BOARD VENUES (2026-09-12): the glacier and the reef are both FLAT-LIGHT places, and neither of the four
  // existing moods can be one — goldenHour, daylight and nightGame all throw a 2.2+ directional sun, which is
  // exactly what an overcast sky does not have. So the sun drops to 0.9 and the HEMI carries the scene (0.95):
  // that inversion of the usual ratio is what overcast light physically is, and it is why the shadows go soft
  // and the colour goes out of the place without the whole frame going dark. Bloom is effectively off (0.95
  // threshold) because there is no highlight to bloom, and contrast stays near 1 so it reads grey rather than
  // moody — a flat day, not a night.
  overcast:   { sky: '#d8dee6', ground: '#6e747c', hemiIntensity: 0.95, sun: '#e9edf2', sunIntensity: 0.9, sunDir: [-0.25, -1, -0.15], exposure: 1.0, clearColor: '#bcc6d1', bloomThreshold: 0.95, bloomWeight: 0.18, bloomScale: 0.4, contrast: 1.02, vignetteColor: [0.08, 0.1, 0.12, 0], vignetteWeight: 1.3, skyWash: 0.6, curves: curves(-6, 205, 6, 205, 10), shadowDarkness: 0.55 },
  alpine:     { sky: '#cfe0f4', ground: '#7d90a8', hemiIntensity: 0.55, sun: '#fff1dc', sunIntensity: 1.6, sunDir: [-0.45, -1, -0.25], exposure: 0.92, clearColor: '#a9c7e8', bloomThreshold: 0.92, bloomWeight: 0.22, bloomScale: 0.5, contrast: 1.14, vignetteColor: [0.05, 0.08, 0.12, 0], vignetteWeight: 1.1, skyWash: 0, curves: curves(4, 42, 10, 215, 24) },
  // A9.4 (visual-foundation, 2026-10-06): two places no mood could be. DUSK is the blue hour after the sun has gone: a
  // low deep-orange key under a violet sky, long shadows, the warmest highlights against the coolest shadows in the
  // game (the Pit's dusk sky, the Foundry's and Rooftop Dusk's ember). INDOOR ARENA is a lit hall: the key is the
  // ceiling rig straight overhead (shadows pool under the feet, not across the floor), the bounce off a bright ceiling
  // carries the fill, and nothing out there needs a sky (the volleyball gym, the daytime TV studio).
  dusk:        { sky: '#c49ad0', ground: '#3a2b36', hemiIntensity: 0.6, sun: '#ff8f4a', sunIntensity: 2.0, sunDir: [-0.7, -0.62, -0.3], exposure: 1.08, clearColor: '#2b1c3d', bloomThreshold: 0.6, bloomWeight: 0.42, bloomScale: 0.55, contrast: 1.16, vignetteColor: [0.14, 0.05, 0.14, 0], vignetteWeight: 1.7, skyWash: 0.35, curves: curves(10, 28, 26, 265, 28, 6, 6) },
  indoorArena: { sky: '#e8ebf0', ground: '#5a4f46', hemiIntensity: 0.8, sun: '#fff4e2', sunIntensity: 2.1, sunDir: [-0.12, -1, -0.1], exposure: 1.06, clearColor: '#15171c', bloomThreshold: 0.82, bloomWeight: 0.26, bloomScale: 0.45, contrast: 1.12, vignetteColor: [0.03, 0.03, 0.05, 0], vignetteWeight: 1.6, skyWash: 0, curves: curves(6, 45, 10, 220, 12) },
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
