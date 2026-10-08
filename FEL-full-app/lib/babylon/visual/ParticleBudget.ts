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

type Md = { felTier?: string; felParticleScale?: number } | null | undefined;

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
  const base = t === 'mobile' || t === 'high' ? PARTICLE_BUDGET[t] : PARTICLE_BUDGET.desktop;
  return Math.round(base * particleBudgetScale(scene));
}

/** Particles in the air right now, over every system in the scene. */
export function liveParticles(scene: { particleSystems: ReadonlyArray<{ getActiveCount(): number }> }): number {
  let n = 0;
  for (const ps of scene.particleSystems) n += ps.getActiveCount();
  return n;
}

/**
 * Pure: how many particles a burst that wants `want` gets, with `live` in the air under `budget`, at scale `k`.
 * Whole when it fits; trimmed to the room left when it does not; never below MIN_BURST (or `want`, if smaller).
 */
export function fitBurst(want: number, live: number, budget: number, k = 1): number {
  const scaled = Math.max(1, Math.round(want * k));
  const floor = Math.min(MIN_BURST, scaled);
  const room = Math.max(0, budget - live);
  return Math.max(floor, Math.min(scaled, room));
}
