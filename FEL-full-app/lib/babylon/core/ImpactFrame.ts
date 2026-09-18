// THE FRAME NEVER KNEW ANYTHING HAPPENED (2026-09-14).
//
// `LightRig` builds a real `DefaultRenderingPipeline` for every mode — ACES tone mapping, bloom, FXAA,
// sharpen and a mood-tinted vignette. It is configured once at mount and then never touched again. Audit:
// `rig.pipeline` is read by nobody outside LightRig, and `rig.flashBeat()` — the one runtime hook that
// exists — is called by exactly one mode in the game (ThreePointMode, on a made three).
//
// So twenty-one modes call `ctx.feel.impact(...)` on their biggest moments — a posterize, a tackle, a
// crash, a block — and the picture does not move. The body freezes, the camera shakes, the pad buzzes, a
// sound plays, and the FRAME is inert through all of it.
//
// WHY THIS GOES IN `impact()` AND NOT IN TWENTY-ONE MODES:
//
// gameFeel already made this argument once, in its own comment, when audio was added to `impact()`: "every
// hit-stop+shake moment now gets audio for free — no per-mode wiring." This is the same move. Twenty-one
// modes already report their heavy moments through one channel; the channel is where a new response
// belongs. A per-mode version would be twenty-one edits, twenty-one chances to break a game loop, and
// twenty-one slightly different numbers.
//
// THREE DECISIONS:
//
//   1. VIGNETTE AND EXPOSURE ONLY — NOT CHROMATIC ABERRATION. Aberration is the obvious pick and it is the
//      wrong one here: it is a separate post-process pass, so it costs fill rate on every frame once
//      enabled, and toggling it per-impact triggers a shader compile that stutters the exact frame you were
//      trying to make feel good. Vignette weight and exposure are `imageProcessing` parameters on a pass
//      that is ALREADY enabled and already running. They cost nothing, on every tier, forever.
//
//   2. THE FRAME DARKENS AND TIGHTENS, IT DOES NOT FLASH. A brighten reads as celebration — that is what
//      `flashBeat` is for, and ThreePointMode is right to use it on a made shot. An impact is contact, and
//      contact should read as the wind going out of the picture: the vignette closes in and the exposure
//      dips. Using the same brighten for both would make a block and a made three feel identical.
//
//   3. INSTANT ATTACK, TIMED DECAY. There is no rise ramp. A rise would delay the punch past the frames the
//      player is actually looking at — `hitStop` has no rise for the same reason. The decay is measured in
//      SECONDS and stepped by dt, so the pulse lasts as long in wall-clock time at 30 fps as at 144. A
//      per-frame multiply (`level *= 0.9`) would decay nearly five times faster on a 144 Hz monitor, which
//      is the bug that makes juice feel different on different machines.
//
// Pure: no Babylon, no pipeline, no scene. It decides HOW DARK; ModeHarness does the writing.

/** How long a full-strength pulse takes to fall back to nothing, in seconds. */
export const IMPACT_FALL_SEC = 0.26;
/** Vignette weight at full strength, as a multiple of the venue's own. Above ~2 it reads as a black iris. */
export const IMPACT_VIGNETTE_GAIN = 1.75;
/** Fraction of the venue's exposure removed at full strength. Small: this is a dip, not a blackout. */
export const IMPACT_EXPOSURE_DIP = 0.14;

export interface ImpactFrameState {
  /** 0 = the frame is at rest. 1 = the hardest hit this mode can report. */
  level: number;
}

export const IMPACT_FRAME_IDLE: ImpactFrameState = { level: 0 };

/**
 * Report a hit.
 *
 * `Math.max` rather than `+=`: two impacts in the same frame are ONE moment, not a double-dark frame. A
 * pile-up in a combat mode would otherwise iris the screen shut.
 */
export function kickImpactFrame(state: ImpactFrameState, strength: number): ImpactFrameState {
  const s = Math.max(0, Math.min(1, strength));
  return { level: Math.max(state.level, s) };
}

/** Step the pulse. Linear in SECONDS — see decision 3. */
export function decayImpactFrame(state: ImpactFrameState, dt: number): ImpactFrameState {
  if (state.level <= 0) return IMPACT_FRAME_IDLE;
  // a frame with no time in it must not advance the pulse
  if (!(dt > 0)) return state;
  return { level: Math.max(0, state.level - dt / IMPACT_FALL_SEC) };
}

export interface Grade {
  vignette: number;
  exposure: number;
}

/**
 * The grade this pulse level asks for, given the venue's resting grade.
 *
 * Takes the base rather than remembering it: the venue owns its own look (a night court and a bright gym
 * do not share an exposure), and a module that cached the base would fight the mood the LightRig picked.
 */
export function impactGrade(level: number, base: Grade): Grade {
  const k = Math.max(0, Math.min(1, level));
  if (k <= 0) return base;
  return {
    vignette: base.vignette * (1 + (IMPACT_VIGNETTE_GAIN - 1) * k),
    exposure: base.exposure * (1 - IMPACT_EXPOSURE_DIP * k),
  };
}
