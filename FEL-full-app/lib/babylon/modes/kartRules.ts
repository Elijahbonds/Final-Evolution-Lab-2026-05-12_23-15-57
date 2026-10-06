// VELOCITY KART RULES — the pure pieces of the owner-picked improvements (IMPROVE 2026-10-06, docs/IMPROVEMENTS-2026-10-05.md
// § velocitykart). Arithmetic only, so each rule is pinned by kartRules.test.ts without a scene; VelocityKartMode wires
// them in. The pieces Aero Aces already built and tested are reused from aeroAcesRules, not copied:
//
//   #4  kartScore           what a race is worth: the clock, as before, plus the place it finished in
//   #6  kartThreatWords     the shell coming for you: seconds out, then HOP NOW
//   #7  the hop             a drift-start hop the shells and mines pass under
//   #8  looseSlip           the shortcut's sand path slides when the kart turns on it
//   #3  kartGhostKey        each GP / mirror variant keeps its own best race
//   #3  ghostYaw            a ghost recorded before yaw was stored still faces the way it went
//   #11 BannerSlot, #5 racerPlace, #6 incomingThreat, #9 mapFrame/mapPath/mapDots/toMap, #17 hudDue — aeroAcesRules

import { AERO_PLACE_PTS, type Threat } from './aeroAcesRules';

// ── #4 THE SCORE ────────────────────────────────────────────────────────────────────────────────────────────

/** The place table both racing modes pay (1st … 8th). */
export const KART_PLACE_PTS: readonly number[] = AERO_PLACE_PTS;
/** The clock's part was `(2 × gold − time) × 10` and stays exactly that, capped here so the whole race has a ceiling. */
export const KART_CLOCK_CAP = 2000;
/** The most one race can pay. The server's measured row (lib/sessions/modeScoreRules.ts velocityKart 1345 × 4 = 5,380)
 *  sits above it. Its pace check (1345 / 123.1 s × 6 ≈ 65/s) sits above the fastest race the karts can drive: a 30 m/s
 *  average (past top speed on boost) round the shortest course, ROOFTOP's 1,556 m, is 52 s for ≈ 2,320 — about 45/s,
 *  before the server's own clock adds the load and the countdown (kartRules.test pins it on every course). */
export const KART_SCORE_MAX = KART_CLOCK_CAP + KART_PLACE_PTS[1];

export interface KartScoreIn { finished: boolean; place: number; timeSec: number; goldSec: number }
export interface KartScoreOut { total: number; clockPts: number; placePts: number }

/**
 * What a race is worth. The score was the clock alone, so 1st and 8th on the same time scored the same. The place is
 * now paid on top. A DNF still scores nothing (racing pass phase 10: a kart that never left the grid was paid 1,274).
 */
export function kartScore(r: KartScoreIn): KartScoreOut {
  if (!r.finished || !Number.isFinite(r.timeSec) || !Number.isFinite(r.goldSec)) return { total: 0, clockPts: 0, placePts: 0 };
  const clockPts = Math.min(KART_CLOCK_CAP, Math.round(Math.max(0, r.goldSec * 2 - r.timeSec) * 10));
  const placePts = KART_PLACE_PTS[Math.max(0, Math.floor(r.place) || 0)] ?? 0;
  return { total: clockPts + placePts, clockPts, placePts };
}

// ── #7 THE HOP ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A press of drift (X) on the ground starts with a hop, as a kart's drift does in Mario Kart. While the wheels are up
 * a shell or a mine passes UNDER the kart instead of spinning it — a skill answer to an item, where the only one was
 * holding a shield. One hop per press, and a cooldown after it, so the button cannot be held as an immunity.
 */
export const HOP = {
  /** Seconds the wheels are off the road. */
  sec: 0.32,
  /** Peak height, metres (visual — the handling does not leave the road). */
  height: 0.34,
  /** Seconds after landing before the next hop. */
  cooldown: 0.45,
  /** Below this speed a press is a plain drift press, not a hop. */
  minSpeed: 4,
  /** How far the kart's hit point is lifted while it hops: above a shell's (3.2 m) and a mine's (3.6 m) hit radius. */
  clearLift: 4.5,
} as const;

export interface HopState { t: number; cool: number }
export function newHop(): HopState { return { t: 0, cool: 0 }; }

/** A drift press. Returns whether a hop started. */
export function tryHop(h: HopState, grounded: boolean, speed: number): boolean {
  if (!grounded || h.t > 0 || h.cool > 0 || !(speed >= HOP.minSpeed)) return false;
  h.t = HOP.sec;
  return true;
}

/** One frame: the hop's height this frame (0 on the ground). Landing starts the cooldown. */
export function stepHop(h: HopState, dt: number): number {
  if (h.t > 0) {
    h.t = Math.max(0, h.t - dt);
    if (h.t === 0) { h.cool = HOP.cooldown; return 0; }
    const u = 1 - h.t / HOP.sec;
    return 4 * HOP.height * u * (1 - u);
  }
  h.cool = Math.max(0, h.cool - dt);
  return 0;
}

/** Wheels up: a projectile passes under. */
export function hopClear(h: HopState): boolean { return h.t > 0; }

// ── #6 THE SHELL WARNING ────────────────────────────────────────────────────────────────────────────────────

/** A shell nearer than this many seconds lights HOP NOW: the hop's air time plus a thumb's reaction. */
export const HOP_CUE_SEC = 0.45;

/** The HUD words for the shell coming at you (aeroAcesRules.incomingThreat): "SHELL 1.4s", then "HOP NOW". */
export function kartThreatWords(t: Threat | null): string {
  if (!t) return '';
  return t.tti <= HOP_CUE_SEC ? 'HOP NOW' : `SHELL ${t.tti.toFixed(1)}s`;
}
export function hopNow(t: Threat | null): boolean { return !!t && t.tti <= HOP_CUE_SEC; }

// ── #8 THE SHORTCUT'S SAND ──────────────────────────────────────────────────────────────────────────────────

/** The sand path's grip, against the road's 1 (a puddle is 0.55, gravel 0.4). */
export const SHORTCUT_GRIP = 0.6;
/** Slip the sand adds this frame — only while the kart turns on it, so the straight run is fast and the kinks slide. */
export function looseSlip(steerAt: number, dt: number, grip = SHORTCUT_GRIP): number {
  return (1 - grip) * dt * 2.2 * Math.min(1, Math.abs(steerAt) * 1.5);
}

// ── #3 THE GHOST ────────────────────────────────────────────────────────────────────────────────────────────

/** The standard race keeps the key it always had (the course id), so a PB set before this pass still counts. A GP or a
 *  mirrored race is a different race and keeps its own. */
export function kartGhostKey(courseId: string, variantKey: string): string {
  return variantKey ? `${courseId}~${variantKey}` : courseId;
}

/** The yaw a ghost faces when its samples carry none (recorded before yaw was stored): the way it last moved. */
export function ghostYaw(prev: { x: number; z: number } | null, now: { x: number; z: number }, fallback: number): number {
  if (!prev) return fallback;
  const dx = now.x - prev.x, dz = now.z - prev.z;
  return dx * dx + dz * dz > 1e-4 ? Math.atan2(dx, dz) : fallback;
}
