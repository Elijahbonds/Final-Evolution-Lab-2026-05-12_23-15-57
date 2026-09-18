/**
 * lib/camera-director.ts — M8.2 CameraDirector (shared viewport attention system)
 * ==============================================================================
 * Three behaviors, deterministic, no RNG, wired per mode:
 *  1. ApexFollow   — pans the viewport to keep airborne apex in frame
 *  2. ClutchTime   — tighter framing + world tint + rim glow when score thresholds hit
 *  3. DragonMoment — push-in + slow-mo + crimson flash on special strikes
 *
 * Canvas modes use the 2D helpers (apexOffset, clutchOverlay, dragonOverlay).
 * R3F modes use the 3D camera nudges + overlay state.
 *
 * All timings/magnitudes // TUNE(elijah).
 */

/* ── ApexFollow (2D canvas) ─────────────────────────── */

export interface ApexFollowState {
  /** Current vertical offset applied to the canvas (px, positive = camera panned UP = content shifts down). */
  offsetY: number;
  /** Target offset for smooth interpolation. */
  targetY: number;
  /** Is the subject currently airborne? */
  airborne: boolean;
}

export function createApexFollow(): ApexFollowState {
  return { offsetY: 0, targetY: 0, airborne: false };
}

// TUNE(elijah) — how aggressively the canvas pans up during a jump
const APEX_PAN_SCALE = 0.55;   // px of pan per px of player-above-ground
const APEX_PAN_MAX = 140;      // max upward pan (px)
const APEX_LERP_UP = 4.0;     // interpolation speed when rising
const APEX_LERP_DOWN = 2.0;   // interpolation speed when falling back
const APEX_SLAM_OVERSHOOT = -20; // brief downward nudge on the slam (px)
const APEX_SLAM_DUR = 0.18;   // duration of the slam overshoot (s)

let _slamT = 0;

/**
 * Call every frame. `playerYAboveGround` is the player's Y offset in canvas px
 * (positive = higher; 0 = standing). Returns the updated state.
 */
export function updateApexFollow(
  state: ApexFollowState,
  dt: number,
  playerYAboveGround: number,
  justLanded: boolean,
): ApexFollowState {
  if (playerYAboveGround > 5) {
    state.airborne = true;
    state.targetY = Math.min(playerYAboveGround * APEX_PAN_SCALE, APEX_PAN_MAX);
  } else if (state.airborne && playerYAboveGround <= 5) {
    state.airborne = false;
    _slamT = APEX_SLAM_DUR;
    state.targetY = APEX_SLAM_OVERSHOOT;
  }

  if (_slamT > 0) {
    _slamT -= dt;
    if (_slamT <= 0) state.targetY = 0;
  } else if (!state.airborne) {
    state.targetY = 0;
  }

  const lerpRate = state.targetY > state.offsetY ? APEX_LERP_UP : APEX_LERP_DOWN;
  state.offsetY += (state.targetY - state.offsetY) * Math.min(lerpRate * dt, 1);
  return state;
}

/**
 * Apply the apex follow offset to a canvas 2D context.
 * Call BEFORE drawing the scene; restore with `ctx.restore()` (caller should `ctx.save()` first).
 */
export function applyApexOffset(ctx: CanvasRenderingContext2D, state: ApexFollowState): void {
  if (Math.abs(state.offsetY) > 0.5) {
    ctx.translate(0, state.offsetY);
  }
}

/* ── ClutchTime (score-threshold world change) ──────── */

export interface ClutchTimeState {
  active: boolean;
  /** 0..1 ramp-in (smooth transition into clutch atmosphere). */
  intensity: number;
}

export function createClutchTime(): ClutchTimeState {
  return { active: false, intensity: 0 };
}

// TUNE(elijah)
const CLUTCH_RAMP_SPEED = 1.5;  // how fast clutch atmosphere ramps in/out

/**
 * Check whether clutch conditions are met and ramp the intensity.
 * For 1v1 (first to 11): clutch activates when either score ≥ 8.
 */
export function updateClutchTime(
  state: ClutchTimeState,
  dt: number,
  myScore: number,
  aiScore: number,
  clutchThreshold: number,
): ClutchTimeState {
  const shouldBeActive = myScore >= clutchThreshold || aiScore >= clutchThreshold;
  state.active = shouldBeActive;
  const targetIntensity = shouldBeActive ? 1 : 0;
  state.intensity += (targetIntensity - state.intensity) * Math.min(CLUTCH_RAMP_SPEED * dt, 1);
  return state;
}

/**
 * Draw the clutch-time overlay on a 2D canvas:
 *  - Court darkens (vignette)
 *  - Rim glow intensifies (caller handles 3D; this is for the 2D HUD tint)
 */
export function drawClutchOverlay(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  state: ClutchTimeState,
): void {
  if (state.intensity < 0.01) return;
  const alpha = state.intensity * 0.35; // TUNE(elijah) — max darkening
  // vignette
  const grad = ctx.createRadialGradient(W / 2, H / 2, W * 0.25, W / 2, H / 2, W * 0.7);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(1, `rgba(20,0,0,${alpha})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

/**
 * Returns clutch-time values for 3D modes:
 *  - fovNudge: narrow FOV for tighter framing
 *  - rimGlowColor: transition rim glow toward red
 *  - overlayAlpha: for a subtle screen tint
 */
export function clutchTime3DParams(state: ClutchTimeState): {
  fovNudge: number;
  overlayAlpha: number;
  rimTint: string;
} {
  const k = state.intensity;
  return {
    fovNudge: -4 * k,          // TUNE(elijah) — tighter framing
    overlayAlpha: 0.12 * k,     // TUNE(elijah)
    rimTint: k > 0.5 ? '#FF3366' : '#00E5FF',
  };
}

/* ── DragonMoment (karate special strike camera event) ─ */

export interface DragonMomentState {
  /** Is the dragon moment currently active? */
  active: boolean;
  /** Elapsed time since trigger. */
  t: number;
  /** Total duration (s). */
  duration: number;
  /** Time-scale multiplier (applies to the mode's dt). */
  timeScale: number;
  /** Crimson flash alpha (0..1). */
  flashAlpha: number;
  /** Camera zoom factor (1 = normal, >1 = push-in). */
  zoomFactor: number;
}

export function createDragonMoment(): DragonMomentState {
  return { active: false, t: 0, duration: 0, timeScale: 1, flashAlpha: 0, zoomFactor: 1 };
}

// TUNE(elijah)
const DRAGON_TOTAL_DUR = 0.65;    // total moment duration (s)
const DRAGON_SLOWMO_SCALE = 0.3;  // timescale during the slow-mo portion
const DRAGON_FLASH_DUR = 0.5;     // crimson flash duration (s)
const DRAGON_ZOOM_PEAK = 1.25;    // max push-in zoom
const DRAGON_ZOOM_RAMP = 0.15;    // time to reach peak zoom (s)
const DRAGON_ZOOM_PULL = 0.35;    // time to pull back from peak (s)

/** Trigger a dragon moment. Call when the Dragon Strike / special fires. */
export function triggerDragonMoment(state: DragonMomentState): void {
  state.active = true;
  state.t = 0;
  state.duration = DRAGON_TOTAL_DUR;
  state.flashAlpha = 1;
  state.zoomFactor = 1;
  state.timeScale = DRAGON_SLOWMO_SCALE;
}

/**
 * Update the dragon moment each frame. Uses REAL dt (not slow-mo'd dt).
 * Returns the state; caller uses `state.timeScale` to scale their game dt.
 */
export function updateDragonMoment(state: DragonMomentState, realDt: number): DragonMomentState {
  if (!state.active) {
    state.timeScale = 1;
    state.flashAlpha = 0;
    state.zoomFactor = 1;
    return state;
  }

  state.t += realDt;

  // Crimson flash: fade out over DRAGON_FLASH_DUR
  state.flashAlpha = Math.max(0, 1 - state.t / DRAGON_FLASH_DUR);

  // Zoom: ramp in, hold, pull back
  if (state.t < DRAGON_ZOOM_RAMP) {
    const k = state.t / DRAGON_ZOOM_RAMP;
    state.zoomFactor = 1 + (DRAGON_ZOOM_PEAK - 1) * k * k; // ease-in
  } else if (state.t < DRAGON_ZOOM_RAMP + DRAGON_ZOOM_PULL) {
    const k = (state.t - DRAGON_ZOOM_RAMP) / DRAGON_ZOOM_PULL;
    state.zoomFactor = DRAGON_ZOOM_PEAK - (DRAGON_ZOOM_PEAK - 1) * k; // ease-out
  } else {
    state.zoomFactor = 1;
  }

  // End condition
  if (state.t >= state.duration) {
    state.active = false;
    state.timeScale = 1;
    state.flashAlpha = 0;
    state.zoomFactor = 1;
  }

  return state;
}

/**
 * Draw the dragon moment overlay on a 2D canvas:
 *  - Crimson full-screen flash that fades
 *  - Optional zoom is handled by the caller via ctx.scale()
 */
export function drawDragonOverlay(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  state: DragonMomentState,
): void {
  if (state.flashAlpha <= 0.01) return;
  ctx.fillStyle = `rgba(180,20,20,${state.flashAlpha * 0.55})`; // TUNE(elijah)
  ctx.fillRect(0, 0, W, H);
}

/**
 * Apply dragon moment zoom to a 2D canvas context.
 * Call AFTER apexOffset, BEFORE drawing. Zooms toward center.
 */
export function applyDragonZoom(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  state: DragonMomentState,
): void {
  if (state.zoomFactor <= 1.001) return;
  const z = state.zoomFactor;
  ctx.translate(W / 2, H / 2);
  ctx.scale(z, z);
  ctx.translate(-W / 2, -H / 2);
}
