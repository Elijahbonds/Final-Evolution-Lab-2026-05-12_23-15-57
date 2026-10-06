// HundredPacing — the pure rules behind The Hundred's (KarateEndlessMode) run shape. IMPROVE (2026-10-06): the owner's
// picks from docs/IMPROVEMENTS-2026-10-05.md (## karate). Headless, no Babylon; the mode renders them and
// HundredPacing.test.ts holds them.

// ── the live-body cap (phones) ────────────────────────────────────────────────────────────────────────────────────────
/**
 * How many horde bodies may be RIGGED at once (standing, sinking out, or loading). The perf-guard lane measured The
 * Hundred at 22 skinned bodies on a phone profile against a ceiling of 16 (2 fighters + 7 onlookers + a 12-body wave +
 * the bodies still sinking out). A phone keeps its 12-body wave — the rest wait in a queue and come in on a freed rig —
 * so the wave, the score and the bound in lib/arena-score-integrity are unchanged; only how many stand at once is.
 * 2 fighters + HUNDRED_PHONE_ONLOOKERS + this = 16. Desktop: no cap (its wave is 20, as before).
 */
export const HORDE_LIVE_CAP_MOBILE = 10;
export const HUNDRED_PHONE_ONLOOKERS = 4;
export function hordeLiveCap(tier: unknown): number {
  return tier === 'mobile' ? HORDE_LIVE_CAP_MOBILE : Infinity;
}
/** A queued body may come in: one is waiting and a rig is free under the cap. */
export function canTopUp(rigged: number, queued: number, cap: number): boolean {
  return queued > 0 && rigged < cap;
}
/** The wave is over only when nobody stands, nobody is still loading and nobody is waiting in the queue. */
export function waveDone(live: number, loading: number, queued: number): boolean {
  return live === 0 && loading === 0 && queued === 0;
}

// ── #16 the horde gets faster ─────────────────────────────────────────────────────────────────────────────────────────
/**
 * OnslaughtCore.waveSpec has always returned a speedMult (1 + 0.055 a wave, capped 1.75) and the mode only read the
 * count, so every wave chased at the fixed preset. TUNED, conservatively: the horde takes HALF that ramp, capped at
 * HORDE_SPEED_CAP — wave 1 ×1.03, wave 5 ×1.14, ×1.2 from wave 8 — so the fastest archetype (the rusher, 4.2 m/s) tops
 * out at 5.04, level with a QUICKSILVER hero (4.4 × 1.15) and the striker at 3.36. The hero's dash still outruns all of it.
 */
export const HORDE_SPEED_RAMP_SHARE = 0.5;
export const HORDE_SPEED_CAP = 1.2;
export function hordeSpeedMult(specSpeedMult: number): number {
  return Math.min(HORDE_SPEED_CAP, 1 + Math.max(0, specSpeedMult - 1) * HORDE_SPEED_RAMP_SHARE);
}

// ── #17 the warning before the 180 s cap ──────────────────────────────────────────────────────────────────────────────
export const CAP_WARN_SEC = [30, 10] as const;
/** The warning to call this frame (30 / 10), or null: the time left crossed it between the last frame and this one. */
export function capWarning(leftBefore: number, leftNow: number): number | null {
  for (const w of CAP_WARN_SEC) if (leftBefore > w && leftNow <= w) return w;
  return null;
}
/** m:ss for the bezel. */
export function clockText(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── #19 a few verbs a wave ────────────────────────────────────────────────────────────────────────────────────────────
/** The tutorial, staged: the first waves each teach a few verbs (the banner after `WAVE n`), instead of one 300-character
 *  hint naming every system at once. The full list stays the mode's static `hint`. */
export const WAVE_LESSONS: Readonly<Record<number, string>> = {
  1: 'A JAB · B KICK · Y HEAVY · TAP X TO DODGE',
  2: 'STRINGS · A A A UPPERCUT · A A B WHIRLWIND · A B Y HAMMER',
  3: 'L1 ON A STAGGERED BODY = GRAB · A SWING · Y THROW',
  4: 'TAP X LATE ON A WIND-UP = COUNTER · LAND 8 = TAKEDOWN (L1)',
  5: 'FULL CHI · R1 = CHI BURST · HOLD R2 = FOCUS',
};
export function waveLesson(wave: number): string | null {
  return WAVE_LESSONS[wave] ?? null;
}

// ── #13 the partner's swing ───────────────────────────────────────────────────────────────────────────────────────────
/** The ally's jab: it lands on the clip's contact beat (HordeDynamics' light hitAt, the hero's own), on the nearest body
 *  inside its reach AND its arc, measured from the PARTNER's facing. Reach is the old 1.8 m; the arc is the hero's jab's. */
export const PARTNER_STRIKE = { reach: 1.8, arcDeg: 100, hitAtSec: 0.08 } as const;
export interface P2 { x: number; z: number }
/** Index of the nearest body inside `reach` and the `arcDeg` cone about `yaw` (yaw 0 faces +z), or -1. */
export function partnerTarget(origin: P2, yaw: number, bodies: readonly P2[], reach: number = PARTNER_STRIKE.reach, arcDeg: number = PARTNER_STRIKE.arcDeg): number {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), cosHalf = Math.cos((arcDeg / 2) * Math.PI / 180);
  let best = -1, bd = Infinity;
  bodies.forEach((b, i) => {
    const dx = b.x - origin.x, dz = b.z - origin.z, d = Math.hypot(dx, dz);
    if (d > reach || d < 1e-3) return;
    if ((dx * fx + dz * fz) / d < cosHalf) return;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

// ── #15 the partner can go down ───────────────────────────────────────────────────────────────────────────────────────
/**
 * TUNED, conservatively: the ally has its own pool (the hero's base 100), takes PARTNER_HIT_MULT of an agent's strike (it
 * cannot block or dodge), and only every PARTNER_CHASE_EVERY-th body from wave 2 hunts it — the rest still come for you.
 * Down, it bleeds out on OnslaughtCore's clock unless you stand by it for the revive channel; out, your next knockdown is
 * the end of the run (nobody left to pick you up).
 */
export const PARTNER_MAX_HP = 100;
export const PARTNER_HIT_MULT = 0.6;
export const PARTNER_CHASE_EVERY = 4;
export function chasesPartner(i: number, wave: number): boolean {
  return wave >= 2 && i % PARTNER_CHASE_EVERY === PARTNER_CHASE_EVERY - 1;
}
export function partnerHitDamage(agentDamage: number): number {
  return Math.max(1, Math.round(agentDamage * PARTNER_HIT_MULT));
}
