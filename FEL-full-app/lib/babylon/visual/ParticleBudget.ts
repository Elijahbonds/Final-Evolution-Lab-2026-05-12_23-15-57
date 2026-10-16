// ParticleBudget — one ceiling for every burst in a scene (visual-foundation A9.8, 2026-10-06; owner: "Cool + smooth").
//
// WHY. EffectsKit.burst is called from 37 files — scuffs on every planted cut, sparks on every grind tick, confetti on
// every make — and nothing added them up. A grind held for two seconds at 10 bursts/s, a dunk's net splash and a crowd
// confetti on one frame each asked for their full count no matter what was already in the air. On a phone that is
// fill (every particle is an alpha-blended quad) at exactly the moment the frame is busiest.
//
// WHAT. A per-tier ceiling on LIVE particles (the ones in the air right now, summed over the scene's systems). A burst
// that fits is fired whole; one that does not is trimmed to the room that is left, never below a readable minimum —
// a hit must still answer. And a scene-wide scale (`setParticleBudgetScale`) that a performance governor can turn: it
// multiplies every burst and the ceiling with it. Default 1, so nothing changes until someone turns it.
//
// PERF-GUARD (lane/perf-guard, not merged) scales emit rates and a burst's manualEmitCount itself, once per new system.
// This does not fight it: EffectsKit still makes a new system per burst (so that path keeps working), and this scale
// stays at 1 unless a caller sets it — use one or the other, not both, or a burst is trimmed twice.

import type { Scene } from '@babylonjs/core';

/** Live particles a scene may hold before bursts are trimmed. Mobile sits under perf-guard's 1500 phone ceiling with
 *  room for the ambient systems (snow 400 + the ball trail 120) that are not bursts. */
export const PARTICLE_BUDGET: Record<'mobile' | 'desktop' | 'high', number> = { mobile: 900, desktop: 3000, high: 4000 };
/** The fewest particles a burst is trimmed to: below this a hit stops reading as a hit. */
export const MIN_BURST = 4;

/**
 * A PHONE'S CEILING FOR ONE MODE (lane/owner-1016, 2026-10-16; owner: "bring Dunk and Karate under their phone budgets").
 * The live-particle rows of mobileBudget.json are small on purpose (a mode's phone budget is what it measured plus headroom)
 * and PR #281 found dunk at 29 live against a row of 12 and karate at 29 against 24: the ball trail and a spark burst in the
 * dunk, the dojo's drifting petals and three hits' stars and streaks in karate. The tier's 900 never binds at those sizes, so a
 * mode on this list gets its own ceiling on a PHONE only: bursts are trimmed to the room under it (never below MIN_BURST), and
 * the mode's steady systems (the ball trail, the dojo's petals) are sized to a share of it (`phoneSystemCap`), so the sum
 * stays inside the row whatever the clock. A ceiling is never above the row's budget (particleBudget.test.ts reads the table).
 */
export const PHONE_MODE_CEILING: Readonly<Record<string, number>> = {
  dunk: 8, karate: 12,
  // lane/kvs-skin (2026-10-16; owner: "TRIM to the budget, phone-only, do not raise the row"): Karate VS reads 18-26 live (55 over 12 s) against a row of 5.
  // Keyed by the harness's modeId ('karate-vs'); the table's row is `karate_vs` (the registry key). 5 holds ONE hit at its readable minimum
  // (a star, two streaks, a ring) beside a single petal; see PHONE_STEADY_CAP for what gives way and docs/VISUAL-PASS-PLAN.md for the measured minimum.
  'karate-vs': 5,
};

/**
 * Steady systems that give way, by NAME, in a mode whose ceiling is too tight for a share of it (lane/kvs-skin). `phoneSystemCap` sizes a
 * steady system to a share of the ceiling with a floor of 3; at a ceiling of 5 that floor is more than half of it, so Karate VS pins its
 * two steady systems here instead: ONE dojo petal in the air, and NO chi-aura motes (the aura keeps its column, its light pool and its
 * lit edge; the motes were the only particles in it). Everything here is phone-only and per mode; a mode not listed keeps its own cap.
 */
export const PHONE_STEADY_CAP: Readonly<Record<string, Readonly<Record<string, number>>>> = { 'karate-vs': { petals: 1, motes: 0 } };

/** The capacity of the steady system `kind` on this scene: the mode's pinned cap on a phone, `otherwise` everywhere else. */
export function phoneSteadyCap(scene: { metadata?: unknown }, kind: string, otherwise: number): number {
  const md = (scene.metadata as Md);
  if (md?.felTier !== 'mobile' || !md.felModeId) return otherwise;
  const pinned = PHONE_STEADY_CAP[md.felModeId]?.[kind];
  return pinned === undefined ? otherwise : Math.min(otherwise, pinned);
}
/**
 * A CEILING THAT HOLDS ONE HIT (lane/kvs-combo; owner 2026-10-16: "Second hit drops streaks"). At Karate VS's 5 one hit fills the room
 * (a star, two or three streaks, a ring, beside the one petal), so two hits whose lives overlapped peaked at 9 and three at 13 for ~0.3 s.
 * On a phone in a mode listed here:
 *  - a hit that lands while an earlier hit's burst is still live (in the air, or queued this frame) shows only its CORE flash (its star,
 *    and its ring where its kind has one) and gives up its streaks; when even that core finds no room, the earlier hits' streaks give way
 *    for it, oldest first, and only then (a fourth blow inside ~0.3 s) the oldest earlier hit's ring, then its star, so the newest blow
 *    always flashes its star. A later hit's ring is drawn only when room is left; it never takes an earlier hit's core (combat/combatFx.ts).
 *  - a steady stream (a started system with an emit rate: the dojo's one petal) is counted at its CAPACITY, not at what is in the air.
 *    The petal is between lives about 1% of the time (it dies, the next is born ~0.2 s later); a hit landing in that gap took the petal's
 *    room as streaks, the petal came back, and the scene held 6 against 5 (combatFx.test.ts's staged sweep found it). Reserved, a hit is
 *    the same with the petal up or between lives.
 * Karate (endless, 12) and dunk (8) are not listed: their ceilings hold more than one hit, and they keep exactly what they had.
 */
export const PHONE_ONE_HIT_MODES: ReadonlySet<string> = new Set(['karate-vs']);

/** True on a phone in a mode whose ceiling holds one hit (PHONE_ONE_HIT_MODES). */
export function oneHitCeiling(scene: { metadata?: unknown }): boolean {
  const id = (scene.metadata as Md)?.felModeId;
  return !!id && phoneModeCeiling(scene) !== null && PHONE_ONE_HIT_MODES.has(id);
}

/** The fewest particles a burst is trimmed to under a phone mode ceiling (the tier's MIN_BURST is 4): four hits landing at once must not each keep four. */
export const PHONE_BURST_FLOOR = 2;

type Md = { felTier?: string; felModeId?: string; felParticleScale?: number } | null | undefined;

/** The phone ceiling for the scene's mode, or null (another tier, or a mode without one). */
export function phoneModeCeiling(scene: { metadata?: unknown }): number | null {
  const md = scene.metadata as Md;
  if (md?.felTier !== 'mobile' || !md.felModeId) return null;
  return PHONE_MODE_CEILING[md.felModeId] ?? null;
}

/**
 * A steady system's capacity (the most it can hold alive at once): `desktopCap` everywhere, except on a phone in a mode with a
 * ceiling, where it is `share` of that ceiling (at least 3). Capacity bounds live particles whatever the emit rate or clock.
 */
export function phoneSystemCap(scene: { metadata?: unknown }, desktopCap: number, share: number): number {
  const c = phoneModeCeiling(scene);
  return c === null ? desktopCap : Math.min(desktopCap, Math.max(3, Math.floor(c * share)));
}

/** The governor's lever: every burst and the ceiling × k (0.2..1). */
export function setParticleBudgetScale(scene: Scene, k: number): void {
  (scene.metadata ??= {}).felParticleScale = Math.max(0.2, Math.min(1, Number.isFinite(k) ? k : 1));
}
export function particleBudgetScale(scene: { metadata?: unknown }): number {
  const k = (scene.metadata as Md)?.felParticleScale;
  return typeof k === 'number' && k > 0 ? k : 1;
}

/** The scene's ceiling, from the tier the harness recorded (desktop when there is none: a test scene, the Closet). */
export function particleBudget(scene: { metadata?: unknown }): number {
  const t = (scene.metadata as Md)?.felTier;
  const tier = t === 'mobile' || t === 'high' ? PARTICLE_BUDGET[t] : PARTICLE_BUDGET.desktop;
  const base = Math.min(tier, phoneModeCeiling(scene) ?? Infinity);   // a phone's mode ceiling (above): only ever lowers the tier's
  return Math.round(base * particleBudgetScale(scene));
}

/** The fewest a burst keeps in this scene: MIN_BURST, or PHONE_BURST_FLOOR on a phone in a mode with its own ceiling. */
export function burstFloor(scene: { metadata?: unknown }): number {
  return phoneModeCeiling(scene) === null ? MIN_BURST : PHONE_BURST_FLOOR;
}

/** Particles in the air right now, over every system in the scene. */
export function liveParticles(scene: { particleSystems: ReadonlyArray<{ getActiveCount(): number }> }): number {
  let n = 0;
  for (const ps of scene.particleSystems) n += ps.getActiveCount();
  return n;
}

/**
 * What is spoken for in the scene: the particles in the air plus those queued to be emitted on the next update (`manualEmitCount`).
 * A burst fired this frame is not in the air until the system updates, so a second burst in the same frame (a hit's star, then its
 * streaks, then a glitch beside it) read the same empty room and each took all of it. Only a phone in a mode with its own ceiling
 * counts them (`roomUsed`): every other scene keeps the plain live count it always had.
 */
export function committedParticles(scene: { particleSystems: ReadonlyArray<{ getActiveCount(): number; manualEmitCount?: number }> }): number {
  let n = 0;
  for (const ps of scene.particleSystems) n += ps.getActiveCount() + Math.max(0, ps.manualEmitCount ?? 0);
  return n;
}

/** A system that refills itself (started, fed by an emit rate rather than a one-shot count): what it will hold again, however few are up now. */
type Sys = { getActiveCount(): number; manualEmitCount?: number; emitRate?: number; getCapacity?(): number; isStarted?(): boolean };
function isStream(ps: Sys): boolean {
  return (ps.manualEmitCount ?? -1) < 0 && (ps.emitRate ?? 0) > 0 && typeof ps.getCapacity === 'function' && (ps.isStarted?.() ?? false);
}

/** `committedParticles`, with every steady stream counted at its capacity (a mode whose ceiling holds one hit: PHONE_ONE_HIT_MODES). */
export function reservedParticles(scene: { particleSystems: ReadonlyArray<Sys> }): number {
  let n = 0;
  for (const ps of scene.particleSystems) {
    const held = ps.getActiveCount() + Math.max(0, ps.manualEmitCount ?? 0);
    n += isStream(ps) ? Math.max(held, ps.getCapacity?.() ?? 0) : held;
  }
  return n;
}

/** The count a burst measures its room against: reserved in a one-hit ceiling mode, committed in any other phone ceiling mode, live everywhere else. */
export function roomUsed(scene: { metadata?: unknown; particleSystems: ReadonlyArray<Sys> }): number {
  if (phoneModeCeiling(scene) === null) return liveParticles(scene);
  return oneHitCeiling(scene) ? reservedParticles(scene) : committedParticles(scene);
}

/**
 * Pure: how many particles a burst that wants `want` gets, with `live` in the air under `budget`, at scale `k`.
 * Whole when it fits; trimmed to the room left when it does not; never below MIN_BURST (or `want`, if smaller).
 */
export function fitBurst(want: number, live: number, budget: number, k = 1, minBurst = MIN_BURST): number {
  const scaled = Math.max(1, Math.round(want * k));
  const floor = Math.min(minBurst, scaled);
  const room = Math.max(0, budget - live);
  return Math.max(floor, Math.min(scaled, room));
}
